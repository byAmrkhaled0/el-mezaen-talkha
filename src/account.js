import { safeMediaUrl } from "./media.js";
import "./account.css";
import "./account-favorite.css";
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { browserLocalPersistence, getAuth, onAuthStateChanged, RecaptchaVerifier, setPersistence, signInWithPhoneNumber, signOut } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import QRCode from "qrcode";
import { normalizePhone } from "../functions/src/core.js";
import { bindSafeBack } from "./navigation.js";
import { availableAtBranch } from "./branch-availability.js";

bindSafeBack();
const config = globalThis.__FIREBASE_CONFIG__ || {};
const configured = Boolean(config.projectId && !String(config.projectId).includes("YOUR_"));
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const money = value => `${Number(value || 0).toFixed(2)} ج.م`;
const dateKey = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (key, days) => { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
let auth, functions, confirmation, portalData, catalog, unsubscribe, loginBusy = false, actionBusy = false, loadSequence = 0, selectedBooking = null, availableSlots = [];
function message(value, error = false, target = "#loginMessage") { $(target).textContent = value; $(target).style.color = error ? "#ff8d8d" : "#74e6b0"; }
function friendly(error) {
  console.error("Customer account operation failed", error);
  const code = String(error?.code || "").replace(/^(auth|functions)\//, "");
  if (error?.message && /[\u0600-\u06ff]/.test(error.message) && !/^Firebase:/.test(error.message)) return error.message;
  return ({ "invalid-phone-number": "اكتب رقم موبايل مصري صحيح", "invalid-verification-code": "رمز التحقق غير صحيح", "code-expired": "انتهت صلاحية الرمز؛ أعد إرساله", "invalid-verification-id": "انتهت صلاحية الرمز؛ أعد إرساله", "too-many-requests": "محاولات كثيرة؛ انتظر قليلًا ثم حاول مرة أخرى", "captcha-check-failed": "تعذر التحقق؛ أعد اختبار الحماية", "missing-app-credential": "أكمل اختبار الحماية ثم حاول مرة أخرى", "network-request-failed": "تحقق من اتصال الإنترنت ثم حاول مرة أخرى", unauthenticated: "سجّل الدخول من جديد", "permission-denied": "تعذر التحقق من صلاحية الطلب", "failed-precondition": "تغيرت حالة الحجز أو الموعد؛ حدّث البيانات وحاول مجددًا", "not-found": "لم نجد حجزًا تابعًا لحسابك", "already-exists": "تم تنفيذ هذا الطلب من قبل", "resource-exhausted": "محاولات كثيرة؛ انتظر قليلًا", internal: "حدث خطأ مؤقت؛ حاول لاحقًا" })[code] || (error?.message === "INVALID_PHONE" ? "اكتب رقم موبايل مصري صحيح" : "تعذر إتمام الطلب؛ حاول مرة أخرى");
}
function phoneE164(value) { return `+2${normalizePhone(value)}`; }
async function call(name, data = {}) { return (await httpsCallable(functions, name, { timeout: 30000 })(data)).data; }
function statusLabel(status) { return ({ pending: "جديد", confirmed: "مؤكد", arrived: "وصل", completed: "مكتمل", cancelled: "ملغي", rejected: "مرفوض", no_show: "عدم حضور", void: "ملغي" })[status] || status || "—"; }
function bookingCard(item, actions = false) {
  const cancellable = ["pending", "confirmed"].includes(item.status) && item.paymentStatus !== "paid";
  const names = item.serviceNamesAr?.length ? item.serviceNamesAr : (item.items || []).map(line => line.nameAr || line.id);
  return `<div class="booking-card"><b>${esc(item.code || item.id)}</b><span>${esc(statusLabel(item.status))}</span><small>الفرع: ${esc(item.branchNameAr || item.branchId || "—")}</small><small>${esc(names.join(" + ") || "لا توجد خدمات")}</small><small>المتخصص: ${esc(item.staffNameAr || "—")}</small><small>الموعد: ${esc(item.bookingDate || "طلب منتجات")} ${esc(item.bookingTime || "")}</small><small>الفرعي: ${money(item.subtotal)} • الخصم: ${money(item.discountAmount)}${item.couponCode ? ` • كوبون ${esc(item.couponCode)}` : ""}${item.walletRedemptionAmount ? ` • من المحفظة: ${money(item.walletRedemptionAmount)}` : ""}</small><strong>الإجمالي: ${money(item.total)}</strong>${["pending", "confirmed"].includes(item.status) && item.paymentStatus === "paid" ? "<small>الإلغاء بعد الدفع يحتاج التواصل مع الفرع لمعالجة الاسترداد.</small>" : ""}${actions ? `<div class="booking-actions">${cancellable ? `<button type="button" data-cancel="${esc(item.id)}">إلغاء</button>` : ""}${["pending", "confirmed"].includes(item.status) && !item.productOnly ? `<button type="button" data-reschedule="${esc(item.id)}">تغيير الموعد</button>` : ""}<button type="button" data-repeat="${esc(item.id)}">كرر الحجز</button></div>` : ""}</div>`;
}
function renderFavorite() {
  const item = catalog?.staff?.find(value => value.id === $("#favoriteStaff").value);
  const target = $("#favoriteDetails");
  target.hidden = !item; $("#bookFavorite").hidden = !item;
  if (item) target.innerHTML = `${item.imageUrl ? `<img src="${esc(safeMediaUrl(item.imageUrl))}" alt="${esc(item.nameAr)}" width="72" height="72">` : ""}<div><b>${esc(item.nameAr)}</b><span>${esc(item.specialtyAr || "حلاق مزين مصر")}</span><small>${(item.branchIds || []).map(id => esc(catalog.branches.find(branch => branch.id === id)?.nameAr || id)).join(" • ")}</small><small>المواعيد المتاحة تظهر بعد اختيار الخدمة والتاريخ.</small></div>`;
}
async function loadPortal() {
  const sequence = ++loadSequence;
  const [data, nextCatalog] = await Promise.all([call("getCustomerPortal"), call("getCatalog")]);
  if (sequence !== loadSequence || !auth.currentUser) return;
  portalData = data; catalog = nextCatalog;
  const c = data.customer;
  $("#customerName").textContent = `${c.firstName || ""} ${c.lastName || ""}`.trim() || "عميل مزين مصر";
  $("#customerPhoneDisplay").textContent = c.phone || "";
  $("#whatsappMarketingConsent").checked = c.whatsappOptIn === true;
  $("#points").textContent = Number(c.pointsBalance || 0);
  $("#cashback").textContent = money(c.cashbackBalance);
  const visits = Number(c.bookingCount || data.bookingHistory?.length || 0);
  const tier = visits >= 10 ? { name: "عميل مميز", from: 10, to: 20 } : visits >= 5 ? { name: "عميل دائم", from: 5, to: 10 } : { name: "عضو مزين", from: 0, to: 5 };
  const progress = Math.min(100, Math.round((visits - tier.from) / (tier.to - tier.from) * 100));
  $("#memberTier").textContent = tier.name; $("#tierProgressValue").textContent = `${progress}%`;
  $("#tierProgressBar").style.width = `${progress}%`;
  $("#tierProgressLabel").textContent = visits >= 20 ? "وصلت لأعلى مستوى حاليًا" : `متبقي ${Math.max(0, tier.to - visits)} زيارة للمستوى التالي`;
  if (c.qrToken) await QRCode.toCanvas($("#customerQr"), c.qrToken, { width: 220, margin: 1, errorCorrectionLevel: "M" });
  $("#upcoming").innerHTML = data.upcomingBookings.map(item => bookingCard(item, true)).join("") || "<div>لا توجد حجوزات قادمة.</div>";
  $("#bookingHistory").innerHTML = data.bookingHistory.map(item => bookingCard(item, true)).join("") || "<div>لا يوجد سجل حجوزات بعد.</div>";
  $("#walletActivity").innerHTML = data.walletActivity.map(item => `<div><b>${esc(item.type)}</b><br>${Number(item.points || 0)} نقطة • ${money(item.cashback)}</div>`).join("") || "<div>لا توجد حركات بعد.</div>";
  $("#lastBooking").innerHTML = data.lastBooking ? bookingCard(data.lastBooking) : "لا يوجد حجز سابق.";
  $("#repeatBooking").hidden = !data.lastBooking;
  $("#favoriteStaff").innerHTML = '<option value="">اختر الحلاق</option>' + catalog.staff.map(item => `<option value="${esc(item.id)}" ${item.id === c.favoriteStaffId ? "selected" : ""}>${esc(item.nameAr)} • ${esc(item.specialtyAr || "")}</option>`).join("");
  renderFavorite(); $("#loginCard").hidden = true; $("#portal").hidden = false; $("#logout").hidden = false;
}
function findBooking(id) { return portalData?.bookingHistory?.find(item => item.id === id); }
function repeatBooking(item) {
  const branch = catalog?.branches?.find(value => value.id === item.branchId && value.active !== false);
  if (!branch) { message("فرع هذا الحجز لم يعد متاحًا؛ اختر فرعًا وخدمات جديدة.", true, "#accountMessage"); return; }
  const lines = (item.items || []).map(line => ({ id: line.id, kind: line.kind, qty: line.qty || 1, option: line.option || "", choices: Array.isArray(line.choices) ? Object.fromEntries(line.choices.map(choice => [choice.groupId, choice.optionId])) : line.choices || {} }));
  const index = new Map([...catalog.services, ...catalog.packages, ...catalog.offers, ...(catalog.products || []), ...(catalog.drinks || []).map(entry => ({ ...entry, kind: "drink" }))].map(entry => [entry.id, entry]));
  const valid = lines.filter(line => { const entry = index.get(line.id); return entry && entry.active !== false && entry.status !== "expired" && entry.status !== "stopped" && availableAtBranch(entry, branch.id, entry.kind === "drink"); });
  if (!valid.length) { message("خدمات هذا الحجز لم تعد متاحة في الفرع؛ اختر بدائل من القائمة.", true, "#accountMessage"); return; }
  sessionStorage.setItem("mz-repeat-booking", JSON.stringify({ branchId: branch.id, staffId: item.staffId, items: valid }));
  if (valid.length < lines.length) sessionStorage.setItem("mz-repeat-notice", "بعض خدمات الحجز السابق لم تعد متاحة؛ راجع الاختيارات واختر موعدًا جديدًا.");
  location.href = "/?repeat=1#services";
}
function rescheduleLines(item) { return (item.items || []).filter(line => ["service", "package", "offer", "product"].includes(line.kind)).map(line => ({ id: line.id, kind: line.kind, qty: line.qty || 1, choices: Array.isArray(line.choices) ? Object.fromEntries(line.choices.map(choice => [choice.groupId, choice.optionId])) : line.choices || {} })); }
async function refreshSlots() {
  const booking = selectedBooking, date = $("#rescheduleDate").value;
  const select = $("#rescheduleSlot"); select.disabled = true; select.innerHTML = '<option value="">جاري تحميل المواعيد…</option>';
  availableSlots = [];
  if (!booking || !date) { select.innerHTML = '<option value="">اختر التاريخ أولًا</option>'; return; }
  try {
    const result = await call("getAvailableSlots", { branchId: booking.branchId, bookingDate: date, staffId: "any", items: rescheduleLines(booking), excludeBookingId: booking.id });
    if (selectedBooking?.id !== booking.id || $("#rescheduleDate").value !== date) return;
    availableSlots = (result.slots || []).flatMap(time => (result.staffBySlot?.[time] || []).map(staff => ({ time, staffId: staff.id, staffNameAr: staff.nameAr })));
    select.innerHTML = availableSlots.length ? '<option value="">اختر الموعد المتاح</option>' + availableSlots.map((slot, index) => `<option value="${index}">${esc(slot.time)} • ${esc(slot.staffNameAr)}</option>`).join("") : '<option value="">لا توجد مواعيد متاحة؛ جرّب تاريخًا آخر</option>';
    select.disabled = !availableSlots.length;
    message(availableSlots.length ? "اختر موعدًا جديدًا." : "لا توجد مواعيد متاحة لهذا التاريخ.", !availableSlots.length, "#rescheduleMessage");
  } catch (error) { select.innerHTML = '<option value="">تعذر تحميل المواعيد</option>'; message(friendly(error), true, "#rescheduleMessage"); }
}
function openReschedule(item) {
  if (actionBusy || !item || !["pending", "confirmed"].includes(item.status)) return;
  selectedBooking = item; $("#rescheduleDescription").textContent = `${item.branchNameAr || item.branchId} • ${item.code} • ${item.bookingDate} ${item.bookingTime}`;
  $("#rescheduleDate").min = dateKey(); $("#rescheduleDate").max = addDays(dateKey(), 60); $("#rescheduleDate").value = "";
  $("#rescheduleSlot").innerHTML = '<option value="">اختر التاريخ أولًا</option>'; $("#rescheduleSlot").disabled = true;
  message("", false, "#rescheduleMessage"); $("#reschedulePanel").hidden = false; $("#reschedulePanel").scrollIntoView({ behavior: "smooth", block: "start" });
}
if (!configured) message("إعداد Firebase غير مكتمل.", true);
else {
  const app = initializeApp(config);
  if (globalThis.__APP_CHECK_SITE_KEY__) initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(globalThis.__APP_CHECK_SITE_KEY__), isTokenAutoRefreshEnabled: true });
  auth = getAuth(app); functions = getFunctions(app, "europe-west1");
  setPersistence(auth, browserLocalPersistence).then(() => {
    unsubscribe = onAuthStateChanged(auth, user => {
      if (user) loadPortal().catch(error => message(friendly(error), true));
      else { ++loadSequence; portalData = null; selectedBooking = null; $("#loginCard").hidden = false; $("#portal").hidden = true; $("#logout").hidden = true; $("#phoneForm").hidden = false; $("#codeForm").hidden = true; }
    }, error => message(friendly(error), true));
  }).catch(error => message(friendly(error), true));
  window.addEventListener("pagehide", () => unsubscribe?.());
}
async function sendCode() {
  if (loginBusy || !auth) return;
  loginBusy = true; const button = $("#sendCode"); button.disabled = true; $("#retryCode").disabled = true; button.textContent = "جاري إرسال الرمز…";
  try {
    const phone = phoneE164($("#phone").value);
    if (!globalThis.recaptchaVerifier) globalThis.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha", { size: "normal" });
    confirmation = await signInWithPhoneNumber(auth, phone, globalThis.recaptchaVerifier);
    $("#phoneForm").hidden = true; $("#codeForm").hidden = false; message("تم إرسال رمز التحقق.");
  } catch (error) { message(friendly(error), true); try { globalThis.recaptchaVerifier?.clear(); } catch {} globalThis.recaptchaVerifier = null; }
  finally { loginBusy = false; button.disabled = false; $("#retryCode").disabled = false; button.textContent = "إرسال رمز التحقق"; }
}
$("#phoneForm").addEventListener("submit", event => { event.preventDefault(); void sendCode(); });
$("#retryCode").addEventListener("click", async () => { if (loginBusy) return; try { const widgetId = await globalThis.recaptchaVerifier?.render(); if (widgetId != null) globalThis.grecaptcha?.reset(widgetId); } catch {} void sendCode(); });
$("#changePhone").addEventListener("click", () => { if (loginBusy) return; confirmation = null; $("#codeForm").hidden = true; $("#phoneForm").hidden = false; message(""); });
$("#codeForm").addEventListener("submit", async event => {
  event.preventDefault(); if (loginBusy || !confirmation) return;
  loginBusy = true; const button = $("#verifyCode"); button.disabled = true; $("#retryCode").disabled = true; button.textContent = "جاري التحقق…";
  try { await confirmation.confirm($("#code").value.trim()); confirmation = null; message("تم تسجيل الدخول."); }
  catch (error) { message(friendly(error), true); }
  finally { loginBusy = false; button.disabled = false; $("#retryCode").disabled = false; button.textContent = "تأكيد الدخول"; }
});
$("#logout").addEventListener("click", async event => { const button = event.currentTarget; if (button.disabled) return; button.disabled = true; button.textContent = "جاري الخروج…"; try { await signOut(auth); message("تم تسجيل الخروج."); } catch (error) { message(friendly(error), true, "#accountMessage"); } finally { button.disabled = false; button.textContent = "خروج"; } });
$("#saveFavorite").addEventListener("click", async event => { const staffId = $("#favoriteStaff").value, button = event.currentTarget; if (!staffId || button.disabled) return; button.disabled = true; button.textContent = "جاري الحفظ…"; try { await call("saveFavoriteBarber", { staffId }); portalData.customer.favoriteStaffId = staffId; message("تم حفظ الحلاق المفضل.", false, "#accountMessage"); } catch (error) { message(friendly(error), true, "#accountMessage"); } finally { button.disabled = false; button.textContent = "حفظ الاختيار"; } });
$("#saveWhatsappConsent").addEventListener("click", async event => {
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true; button.textContent = "جارٍ الحفظ…";
  try {
    const optedIn = $("#whatsappMarketingConsent").checked;
    await call("updateOwnWhatsappConsent", { optedIn });
    portalData.customer.whatsappOptIn = optedIn;
    message(optedIn ? "تم تسجيل موافقتك على رسائل العروض." : "تم إلغاء موافقتك على رسائل العروض.", false, "#accountMessage");
  } catch (error) {
    $("#whatsappMarketingConsent").checked = portalData.customer.whatsappOptIn === true;
    message(friendly(error), true, "#accountMessage");
  } finally { button.disabled = false; button.textContent = "حفظ التفضيلات"; }
});
$("#repeatBooking").addEventListener("click", () => { if (portalData?.lastBooking) repeatBooking(portalData.lastBooking); });
$("#favoriteStaff").addEventListener("change", renderFavorite);
$("#bookFavorite").addEventListener("click", () => { const worker = catalog?.staff?.find(item => item.id === $("#favoriteStaff").value); if (!worker) return; const branchId = portalData.customer.lastBranchId && worker.branchIds?.includes(portalData.customer.lastBranchId) ? portalData.customer.lastBranchId : (worker.branchIds || []).find(id => catalog.branches.some(branch => branch.id === id && branch.active !== false)); if (!branchId) { message("هذا الحلاق غير متاح في الفروع الحالية؛ اختر حلاقًا آخر.", true, "#accountMessage"); return; } sessionStorage.setItem("mz-favorite-booking", JSON.stringify({ staffId: worker.id, branchId })); location.href = "/?favorite=1#services"; });
$("#portal").addEventListener("click", async event => {
  const cancel = event.target.closest("[data-cancel]"), reschedule = event.target.closest("[data-reschedule]"), repeat = event.target.closest("[data-repeat]");
  if (repeat) { const item = findBooking(repeat.dataset.repeat); if (item) repeatBooking(item); return; }
  if (reschedule) { openReschedule(findBooking(reschedule.dataset.reschedule)); return; }
  if (!cancel || actionBusy) return;
  const item = findBooking(cancel.dataset.cancel);
  if (!item || !["pending", "confirmed"].includes(item.status) || item.paymentStatus === "paid" || !confirm("هل تريد إلغاء الحجز؟")) return;
  actionBusy = true; cancel.disabled = true; cancel.textContent = "جاري الإلغاء…";
  try { await call("cancelCustomerBooking", { code: item.code, requestId: crypto.randomUUID() }); await loadPortal(); message("تم إلغاء الحجز وتحديث المواعيد.", false, "#accountMessage"); }
  catch (error) { message(friendly(error), true, "#accountMessage"); }
  finally { actionBusy = false; if (cancel.isConnected) { cancel.disabled = false; cancel.textContent = "إلغاء"; } }
});
$("#rescheduleDate").addEventListener("change", () => { void refreshSlots(); });
$("#closeReschedule").addEventListener("click", () => { if (actionBusy) return; selectedBooking = null; $("#reschedulePanel").hidden = true; });
$("#rescheduleForm").addEventListener("submit", async event => {
  event.preventDefault(); if (actionBusy || !selectedBooking) return;
  const slot = availableSlots[Number($("#rescheduleSlot").value)];
  if (!slot) { message("اختر موعدًا متاحًا.", true, "#rescheduleMessage"); return; }
  const staffId = slot.staffId;
  if (!staffId || staffId === "any" || staffId === "none") { message("اختر موعدًا مع متخصص متاح.", true, "#rescheduleMessage"); return; }
  actionBusy = true; const button = $("#confirmReschedule"); button.disabled = true; button.textContent = "جاري تغيير الموعد…";
  try { await call("rescheduleBooking", { id: selectedBooking.id, date: $("#rescheduleDate").value, time: slot.time, staffId, requestId: crypto.randomUUID() }); await loadPortal(); selectedBooking = null; $("#reschedulePanel").hidden = true; message("تم تحديث الموعد بنجاح.", false, "#accountMessage"); }
  catch (error) { message(friendly(error), true, "#rescheduleMessage"); void refreshSlots(); }
  finally { actionBusy = false; button.disabled = false; button.textContent = "تأكيد إعادة الجدولة"; }
});
