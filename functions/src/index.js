import { createHash, randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { calculateCoupon, createSlotKeys, minutes, normalizePhone, paymentTransition, priceItems, validateAppointment } from "./core.js";

initializeApp();
const db = getFirestore();
const region = "europe-west1";
const PUBLIC_COLLECTIONS = ["categories", "services", "packages", "staff", "offers", "content", "translations"];
const ADMIN_COLLECTIONS = ["categories", "services", "packages", "staff", "offers", "coupons", "content", "holidays", "translations", "settings"];
const ADMIN_ROLES = ["admin", "manager", "receptionist", "accountant"];

const cleanDoc = snapshot => ({ id: snapshot.id, ...snapshot.data(), startAt: toIso(snapshot.data().startAt), endAt: toIso(snapshot.data().endAt), createdAt: toIso(snapshot.data().createdAt), updatedAt: toIso(snapshot.data().updatedAt) });
const toIso = value => value?.toDate ? value.toDate().toISOString() : value || null;
const hash = value => createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
const bookingCode = () => `MZ-TK-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;

function requireRole(request, roles = ADMIN_ROLES) {
  const role = request.auth?.token?.role;
  if (!request.auth || !roles.includes(role)) throw new HttpsError("permission-denied", "غير مصرح بالدخول");
  return role;
}

function sanitizeText(value, max = 200) { return String(value || "").trim().slice(0, max); }

async function readSettings() {
  const snapshot = await db.doc("settings/public").get();
  return snapshot.exists ? snapshot.data() : { openingTime: "11:00", closingTime: "23:00", slotMinutes: 15, phone: "01093008896", whatsapp: "201093008896" };
}

export const getCatalog = onCall({ region, cors: true, enforceAppCheck: false }, async () => {
  const results = await Promise.all(PUBLIC_COLLECTIONS.map(name => db.collection(name).where("active", "==", true).limit(500).get()));
  const payload = Object.fromEntries(PUBLIC_COLLECTIONS.map((name, index) => [name, results[index].docs.map(cleanDoc).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))]));
  payload.settings = await readSettings();
  return payload;
});

async function fetchPricedItems(lines) {
  const refs = lines.map(line => {
    const collection = line.kind === "package" ? "packages" : line.kind === "offer" ? "offers" : "services";
    return db.collection(collection).doc(String(line.id));
  });
  const snapshots = await db.getAll(...refs);
  const map = new Map(snapshots.filter(item => item.exists).map((item, index) => {
    const requestedKind = lines[index].kind;
    const data = item.data();
    return [item.id, { ...data, id: item.id, kind: requestedKind === "product" ? "product" : requestedKind }];
  }));
  return priceItems(lines, map);
}

export const validateCoupon = onCall({ region, cors: true, enforceAppCheck: false }, async request => {
  const code = sanitizeText(request.data?.code, 30).toUpperCase();
  const phone = request.data?.phone ? normalizePhone(request.data.phone) : "01000000000";
  const itemIds = Array.isArray(request.data?.itemIds) ? request.data.itemIds.map(String).slice(0, 30) : [];
  if (!code || !itemIds.length) return { valid: false };
  const [couponSnap, usageSnap] = await Promise.all([db.doc(`coupons/${code}`).get(), db.doc(`couponUsage/${code}_${hash(phone)}`).get()]);
  if (!couponSnap.exists) return { valid: false };
  const coupon = couponSnap.data();
  const prices = await fetchPricedItems(itemIds.map(id => {
    const prefix = id.split("-")[0];
    return { id, kind: prefix === "package" ? "package" : prefix === "offer" ? "offer" : prefix === "product" ? "product" : "service", qty: 1 };
  }));
  const result = calculateCoupon(coupon, prices, { usageCount: Number(coupon.usageCount || 0), phoneUsageCount: Number(usageSnap.data()?.count || 0) });
  return result.valid ? { valid: true, code, discountType: coupon.type, discountValue: coupon.value, discountAmount: result.discountAmount, discountPercent: result.discountPercent } : { valid: false };
});

export const createBooking = onCall({ region, cors: true, enforceAppCheck: false, timeoutSeconds: 30 }, async request => {
  const data = request.data || {};
  const customer = {
    firstName: sanitizeText(data.customer?.firstName, 50),
    lastName: sanitizeText(data.customer?.lastName, 50),
    phone: normalizePhone(data.customer?.phone),
    note: sanitizeText(data.customer?.note, 500)
  };
  if (!customer.firstName || !customer.lastName) throw new HttpsError("invalid-argument", "بيانات العميل غير مكتملة");
  const clientRequestId = sanitizeText(data.clientRequestId, 80);
  if (!clientRequestId) throw new HttpsError("invalid-argument", "معرف الطلب مفقود");
  let pricedItems;
  try { pricedItems = await fetchPricedItems(data.items); }
  catch (error) { throw new HttpsError("failed-precondition", error.message); }
  const appointmentItems = pricedItems.filter(item => item.staffRequired);
  const duration = appointmentItems.reduce((sum, item) => sum + item.duration, 0);
  const productOnly = appointmentItems.length === 0;
  const settings = await readSettings();
  if (!productOnly) {
    try { validateAppointment({ date: data.bookingDate, time: data.bookingTime, duration, openingTime: settings.openingTime, closingTime: settings.closingTime }); }
    catch (error) { throw new HttpsError("failed-precondition", error.message); }
    const holiday = await db.doc(`holidays/${data.bookingDate}`).get();
    if (holiday.exists && holiday.data()?.closed !== false) throw new HttpsError("failed-precondition", "الفرع مغلق في هذا اليوم");
  }
  const requestedStaffId = productOnly ? "none" : sanitizeText(data.staffId || "any", 80);
  let candidates = [];
  if (!productOnly) {
    if (requestedStaffId === "any") {
      const maxCandidates = Math.max(1, Math.min(21, Math.floor(450 / Math.ceil(Math.max(5, duration) / 5))));
      const snapshot = await db.collection("staff").where("active", "==", true).limit(50).get();
      candidates = snapshot.docs.map(cleanDoc).filter(member => member.available !== false).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)).slice(0, maxCandidates);
    } else {
      const snapshot = await db.doc(`staff/${requestedStaffId}`).get();
      if (snapshot.exists && snapshot.data().active !== false && snapshot.data().available !== false) candidates = [cleanDoc(snapshot)];
    }
    const day = new Date(`${data.bookingDate}T12:00:00`).getDay();
    const appointmentStart = minutes(data.bookingTime);
    const appointmentEnd = appointmentStart + duration;
    const requestedServiceIds = appointmentItems.map(item => item.id);
    candidates = candidates.filter(member => {
      if (Array.isArray(member.workDays) && !member.workDays.map(Number).includes(day)) return false;
      if (Array.isArray(member.serviceIds) && member.serviceIds.length && !requestedServiceIds.every(id => member.serviceIds.includes(id))) return false;
      if (appointmentStart < minutes(member.shiftStart || settings.openingTime) || appointmentEnd > minutes(member.shiftEnd || settings.closingTime)) return false;
      return !(member.breaks || []).some(value => {
        const [from, to] = String(value).split("-");
        if (!from || !to) return false;
        return appointmentStart < minutes(to) && appointmentEnd > minutes(from);
      });
    });
    if (!candidates.length) throw new HttpsError("failed-precondition", "لا يوجد عضو فريق متاح");
  }
  const code = bookingCode();
  const bookingRef = db.doc(`bookings/${code}`);
  const requestGuardRef = db.doc(`requestGuards/${hash(clientRequestId)}`);
  const duplicateRef = db.doc(`bookingGuards/${hash(`${customer.phone}|${data.bookingDate || "product"}|${data.bookingTime || clientRequestId}`)}`);
  const customerRef = db.doc(`customers/${hash(customer.phone)}`);
  const couponCode = sanitizeText(data.couponCode, 30).toUpperCase();
  const couponRef = couponCode ? db.doc(`coupons/${couponCode}`) : null;
  const couponUsageRef = couponCode ? db.doc(`couponUsage/${couponCode}_${hash(customer.phone)}`) : null;

  try {
    return await db.runTransaction(async transaction => {
      const baseReads = await Promise.all([transaction.get(requestGuardRef), transaction.get(duplicateRef), couponRef ? transaction.get(couponRef) : null, couponUsageRef ? transaction.get(couponUsageRef) : null]);
      if (baseReads[0].exists) throw new Error("DUPLICATE_REQUEST");
      if (baseReads[1].exists) throw new Error("DUPLICATE_BOOKING");
      let assigned = null;
      let assignedLockRefs = [];
      if (!productOnly) {
        for (const member of candidates) {
          const keys = createSlotKeys(member.id, data.bookingDate, data.bookingTime, duration);
          const refs = keys.map(key => db.doc(`appointmentLocks/${key}`));
          const locks = [];
          for (const ref of refs) locks.push(await transaction.get(ref));
          if (locks.every(lock => !lock.exists)) { assigned = member; assignedLockRefs = refs; break; }
        }
        if (!assigned) throw new Error("SLOT_UNAVAILABLE");
      }
      const coupon = baseReads[2]?.exists ? baseReads[2].data() : null;
      const couponResult = calculateCoupon(coupon, pricedItems, { usageCount: Number(coupon?.usageCount || 0), phoneUsageCount: Number(baseReads[3]?.data()?.count || 0) });
      const subtotal = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const discount = couponResult.valid ? couponResult.discountAmount : 0;
      const total = Math.max(0, subtotal - discount);
      const now = FieldValue.serverTimestamp();
      const record = {
        code,
        customer,
        customerName: `${customer.firstName} ${customer.lastName}`,
        partySize: Math.max(1, Math.min(10, Number(data.partySize || 1))),
        phone: customer.phone,
        phoneHash: hash(customer.phone),
        items: pricedItems,
        itemIds: pricedItems.map(item => item.id),
        serviceNamesAr: pricedItems.map(item => item.nameAr),
        staffId: assigned?.id || "none",
        staffNameAr: assigned?.nameAr || "لا يحتاج عضو فريق",
        staffNameEn: assigned?.nameEn || "No staff required",
        bookingDate: productOnly ? null : data.bookingDate,
        bookingTime: productOnly ? null : data.bookingTime,
        duration,
        productOnly,
        subtotal,
        couponCode: couponResult.valid ? couponCode : null,
        discountPercent: couponResult.valid ? couponResult.discountPercent : 0,
        discountAmount: discount,
        total,
        status: "pending",
        paymentStatus: "unpaid",
        paymentMethod: null,
        source: "website",
        locale: data.locale === "en" ? "en" : "ar",
        duplicateGuardId: duplicateRef.id,
        lockIds: assignedLockRefs.map(ref => ref.id),
        createdAt: now,
        updatedAt: now
      };
      transaction.create(bookingRef, record);
      transaction.create(requestGuardRef, { bookingId: code, createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000) });
      transaction.create(duplicateRef, { bookingId: code, createdAt: now });
      transaction.set(customerRef, { firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone, lastBookingAt: now, bookingCount: FieldValue.increment(1) }, { merge: true });
      if (assigned?.id) transaction.update(db.doc(`staff/${assigned.id}`), { bookingCount: FieldValue.increment(1), updatedAt: now });
      assignedLockRefs.forEach(ref => transaction.create(ref, { bookingId: code, staffId: assigned.id, date: data.bookingDate, time: data.bookingTime, createdAt: now }));
      if (couponResult.valid) {
        transaction.update(couponRef, { usageCount: FieldValue.increment(1), discountTotal: FieldValue.increment(discount), updatedAt: now });
        transaction.set(couponUsageRef, { code: couponCode, phoneHash: hash(customer.phone), count: FieldValue.increment(1), discountTotal: FieldValue.increment(discount), updatedAt: now }, { merge: true });
      }
      return { ok: true, bookingCode: code, subtotal, discountAmount: discount, discountPercent: couponResult.discountPercent || 0, total, staffId: assigned?.id || null, staffNameAr: assigned?.nameAr || null };
    });
  } catch (error) {
    const messages = { DUPLICATE_REQUEST: "تم إرسال هذا الطلب من قبل", DUPLICATE_BOOKING: "يوجد حجز مطابق لهذا الرقم والموعد", SLOT_UNAVAILABLE: "الموعد غير متاح، اختر وقتًا آخر" };
    throw new HttpsError("already-exists", messages[error.message] || "تعذر إنشاء الحجز");
  }
});

export const submitReview = onCall({ region, cors: true }, async request => {
  const name = sanitizeText(request.data?.name, 60);
  const comment = sanitizeText(request.data?.comment, 500);
  const bookingCodeValue = sanitizeText(request.data?.bookingCode, 40).toUpperCase();
  const rating = Math.max(1, Math.min(5, Math.round(Number(request.data?.rating || 5))));
  if (!name || !comment) throw new HttpsError("invalid-argument", "بيانات التقييم غير مكتملة");
  if (bookingCodeValue) {
    const booking = await db.doc(`bookings/${bookingCodeValue}`).get();
    if (!booking.exists) throw new HttpsError("not-found", "كود الحجز غير صحيح");
  }
  const ref = db.collection("reviews").doc();
  await ref.set({ name, comment, rating, bookingCode: bookingCodeValue || null, status: "pending", active: false, createdAt: FieldValue.serverTimestamp() });
  return { ok: true, id: ref.id };
});

export const getAdminDashboard = onCall({ region }, async request => {
  requireRole(request);
  const [bookingsSnap, ledgerSnap] = await Promise.all([
    db.collection("bookings").orderBy("createdAt", "desc").limit(500).get(),
    db.collection("revenueLedger").orderBy("createdAt", "desc").limit(1000).get()
  ]);
  const bookings = bookingsSnap.docs.map(cleanDoc);
  const ledger = ledgerSnap.docs.map(cleanDoc);
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const revenue = period => ledger.filter(item => !period || String(item.dateKey || "").startsWith(period)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return {
    bookings,
    ledger,
    stats: {
      bookingCount: bookings.length,
      todayBookings: bookings.filter(item => item.bookingDate === today).length,
      unpaidCount: bookings.filter(item => item.paymentStatus === "unpaid").length,
      paidCount: bookings.filter(item => item.paymentStatus === "paid").length,
      todayRevenue: revenue(today),
      monthRevenue: revenue(month),
      totalRevenue: revenue(),
      lastCollected: ledger.find(item => item.type === "payment")?.amount || 0
    }
  };
});

export const getAdminCollection = onCall({ region }, async request => {
  const role = requireRole(request);
  const collection = sanitizeText(request.data?.collection, 40);
  const allowed = [...ADMIN_COLLECTIONS, "customers", "activityLogs", "users", "revenueLedger"];
  if (!allowed.includes(collection)) throw new HttpsError("invalid-argument", "قسم غير صالح");
  if (collection === "users" && role !== "admin") throw new HttpsError("permission-denied", "صلاحية المدير مطلوبة");
  if (collection === "settings") {
    const snapshot = await db.doc("settings/public").get();
    return { items: snapshot.exists ? [cleanDoc(snapshot)] : [] };
  }
  const snapshot = await db.collection(collection).limit(Math.min(500, Number(request.data?.limit || 200))).get();
  return { items: snapshot.docs.map(cleanDoc) };
});

function normalizeAdminPayload(collection, raw) {
  const payload = { ...raw };
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;
  ["price", "originalPrice", "oldPrice", "newPrice", "duration", "sortOrder", "value", "maxDiscount", "minSubtotal", "totalUsageLimit", "perPhoneLimit"].forEach(key => { if (key in payload) payload[key] = Number(payload[key] || 0); });
  ["active", "available", "showCountdown", "startsFrom", "closed"].forEach(key => { if (key in payload) payload[key] = payload[key] === true || payload[key] === "true" || payload[key] === 1 || payload[key] === "1"; });
  ["serviceIds", "includedServiceIds", "applicableItemIds", "workDays", "breaks"].forEach(key => { if (typeof payload[key] === "string") payload[key] = payload[key].split(",").map(item => item.trim()).filter(Boolean); });
  if (Array.isArray(payload.workDays)) payload.workDays = payload.workDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
  ["startAt", "endAt"].forEach(key => { if (payload[key]) payload[key] = Timestamp.fromDate(new Date(payload[key])); else if (key in payload) payload[key] = null; });
  if (collection === "coupons") payload.code = sanitizeText(payload.code || raw.id, 30).toUpperCase();
  return payload;
}

export const adminUpsert = onCall({ region }, async request => {
  requireRole(request, ["admin", "manager"]);
  const collection = sanitizeText(request.data?.collection, 40);
  if (!ADMIN_COLLECTIONS.includes(collection)) throw new HttpsError("invalid-argument", "قسم غير صالح");
  const raw = request.data?.data || {};
  let id = sanitizeText(request.data?.id || raw.id, 100);
  if (collection === "settings") id = "public";
  if (collection === "coupons") id = sanitizeText(raw.code || id, 30).toUpperCase();
  if (!id) id = db.collection(collection).doc().id;
  const ref = db.collection(collection).doc(id);
  const before = await ref.get();
  const payload = normalizeAdminPayload(collection, raw);
  await ref.set({ ...payload, updatedAt: FieldValue.serverTimestamp(), ...(before.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
  await db.collection("activityLogs").add({ action: before.exists ? "update" : "create", collection, entityId: id, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
  return { ok: true, id };
});

export const adminDelete = onCall({ region }, async request => {
  requireRole(request, ["admin", "manager"]);
  const collection = sanitizeText(request.data?.collection, 40);
  const id = sanitizeText(request.data?.id, 100);
  if (!ADMIN_COLLECTIONS.includes(collection) || collection === "settings" || !id) throw new HttpsError("invalid-argument", "طلب حذف غير صالح");
  await db.collection(collection).doc(id).delete();
  await db.collection("activityLogs").add({ action: "delete", collection, entityId: id, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

export const updateBooking = onCall({ region }, async request => {
  const role = requireRole(request);
  const id = sanitizeText(request.data?.id, 100);
  const action = sanitizeText(request.data?.action, 30);
  const ref = db.doc(`bookings/${id}`);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "الحجز غير موجود");
    const booking = snapshot.data();
    const now = FieldValue.serverTimestamp();
    if (["pending", "confirmed", "rejected", "cancelled", "completed"].includes(action)) {
      if (!["admin", "manager", "receptionist"].includes(role)) throw new HttpsError("permission-denied", "لا تملك صلاحية تعديل حالة الحجز");
      if (["rejected", "cancelled"].includes(action)) {
        (booking.lockIds || []).forEach(lockId => transaction.delete(db.doc(`appointmentLocks/${lockId}`)));
        if (booking.duplicateGuardId) transaction.delete(db.doc(`bookingGuards/${booking.duplicateGuardId}`));
      }
      transaction.update(ref, { status: action, updatedAt: now });
      return { ok: true, status: action };
    }
    let transition;
    if (!["admin", "manager", "accountant"].includes(role)) throw new HttpsError("permission-denied", "لا تملك صلاحية تعديل الدفع");
    try { transition = paymentTransition(booking, action, request.data?.paymentMethod || booking.paymentMethod || "cash"); }
    catch (error) { throw new HttpsError("failed-precondition", error.message); }
    if (!transition.changed) return { ok: true, idempotent: true, paymentStatus: transition.status };
    const ledgerId = `${transition.ledgerType}_${id}`;
    const ledgerRef = db.doc(`revenueLedger/${ledgerId}`);
    const ledger = await transaction.get(ledgerRef);
    if (ledger.exists) return { ok: true, idempotent: true, paymentStatus: transition.status };
    const dateKey = new Date().toISOString().slice(0, 10);
    transaction.create(ledgerRef, { bookingId: id, bookingCode: booking.code, amount: transition.ledgerAmount, type: transition.ledgerType, paymentMethod: transition.method, staffId: booking.staffId, itemIds: booking.itemIds || [], dateKey, createdAt: now, createdBy: request.auth.uid });
    transaction.update(ref, { paymentStatus: transition.status, paymentMethod: transition.method, paidAt: action === "markPaid" ? now : booking.paidAt || null, refundedAt: action === "refund" ? now : null, updatedAt: now });
    if (booking.staffId && booking.staffId !== "none") transaction.update(db.doc(`staff/${booking.staffId}`), { revenueTotal: FieldValue.increment(transition.ledgerAmount), updatedAt: now });
    if (booking.phoneHash) transaction.update(db.doc(`customers/${booking.phoneHash}`), { totalSpent: FieldValue.increment(transition.ledgerAmount), updatedAt: now });
    return { ok: true, paymentStatus: transition.status };
  });
});

export const registerPushToken = onCall({ region }, async request => {
  requireRole(request);
  const token = sanitizeText(request.data?.token, 4096);
  if (!token) throw new HttpsError("invalid-argument", "Token required");
  await db.doc(`pushTokens/${hash(token)}`).set({ token, uid: request.auth.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

export const setUserRole = onCall({ region }, async request => {
  requireRole(request, ["admin"]);
  const uid = sanitizeText(request.data?.uid, 128);
  const role = sanitizeText(request.data?.role, 30);
  if (!uid || !ADMIN_ROLES.includes(role)) throw new HttpsError("invalid-argument", "بيانات الصلاحية غير صحيحة");
  const { getAuth } = await import("firebase-admin/auth");
  await getAuth().setCustomUserClaims(uid, { role });
  await db.doc(`users/${uid}`).set({ role, email: sanitizeText(request.data?.email, 200), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

export const notifyAdminsOnBooking = onDocumentCreated({ region, document: "bookings/{bookingId}" }, async event => {
  const booking = event.data?.data();
  if (!booking) return;
  const snapshot = await db.collection("pushTokens").limit(500).get();
  const tokens = snapshot.docs.map(doc => doc.data().token).filter(Boolean);
  if (!tokens.length) return;
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: "حجز جديد في مزين مصر", body: `${booking.customerName} • ${booking.bookingDate || "طلب منتجات"} ${booking.bookingTime || ""}`.trim() },
    webpush: { fcmOptions: { link: "/admin/" }, notification: { icon: "/assets/el-mezaen-logo.jpeg", badge: "/assets/el-mezaen-logo.jpeg", requireInteraction: true, tag: booking.code } },
    data: { bookingId: event.params.bookingId, type: "new_booking" }
  });
  const deletes = [];
  response.responses.forEach((result, index) => { if (!result.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(result.error?.code)) deletes.push(db.doc(`pushTokens/${hash(tokens[index])}`).delete()); });
  await Promise.all(deletes);
});
