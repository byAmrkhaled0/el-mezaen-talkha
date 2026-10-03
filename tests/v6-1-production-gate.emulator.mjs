import test, { before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

// Run only under `firebase emulators:exec` with a demo- project. Never seed a live project.
const projectId = "demo-el-mezaen-gate";
assert.ok(projectId.startsWith("demo-"));
const environmentProject = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (environmentProject) assert.equal(environmentProject, projectId);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
process.env.GCLOUD_PROJECT = projectId;
const requireFunctions = createRequire(new URL("../functions/package.json", import.meta.url));
const { getApp } = requireFunctions("firebase-admin/app");
const { getFirestore, Timestamp } = requireFunctions("firebase-admin/firestore");
const { getAuth } = requireFunctions("firebase-admin/auth");
// This tests production handlers with verified emulator tokens and Firestore data.
// HTTP transport still requires the Functions emulator, which needs Unix sockets.
const handlers = await import("../functions/src/index.js");
assert.equal(getApp().options.projectId || projectId, projectId);
const db = getFirestore();
const auth = getAuth();
const tokens = {};
const hash = value => createHash("sha256").update(value).digest("hex").slice(0, 32);
const code = { talkha: "MZ-TAL-20260928-A1", mashaya: "MZ-MAS-20260928-B2", legacy: "MZ-LEG-20260928-C3" };
const phone = { A: "01012345678", B: "01012345679" };
const customerId = { A: hash(phone.A), B: hash(phone.B) };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const month = today.slice(0, 7);
const futureDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 3 * 86400000));
const password = "EmulatorOnlyTestPassword!39";

async function callable(name, actor, data = {}) {
  const token = tokens[actor];
  try {
    const result = await handlers[name].run({ data, ...(token ? { auth: { uid: token.uid, token } } : {}), rawRequest: { ip: "127.0.0.1", headers: {} } });
    return { status: 200, data: result };
  } catch (error) {
    return { status: 403, error: { status: String(error.code || "internal").toUpperCase().replaceAll("-", "_"), message: error.message } };
  }
}
async function allowed(name, actor, data) {
  const result = await callable(name, actor, data);
  assert.equal(result.status, 200, `${actor} ${name}: ${JSON.stringify(result)}`);
  return result.data;
}
async function denied(name, actor, data, expected = "PERMISSION_DENIED") {
  const result = await callable(name, actor, data);
  assert.equal(result.error?.status, expected, `${actor} ${name}: ${JSON.stringify(result)}`);
}
async function user(key, role, branchIds, permissions, phoneNumber) {
  const email = `${key}@emulator.invalid`;
  await auth.createUser({ uid: key, email, password, ...(phoneNumber ? { phoneNumber: `+2${phoneNumber}` } : {}) });
  if (role) await auth.setCustomUserClaims(key, { role, branchIds, permissions });
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-emulator`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const signed = await response.json();
  assert.equal(response.status, 200, JSON.stringify(signed));
  tokens[key] = await auth.verifyIdToken(signed.idToken);
}

before(async () => {
  await Promise.all([
    user("admin", "admin", [], []),
    user("managerTalkha", "manager", ["talkha"], ["dashboard", "bookings", "pos", "revenue", "expenses", "customers"]),
    user("managerMashaya", "manager", ["mashaya"], ["dashboard", "bookings", "pos", "revenue", "expenses", "customers"]),
    user("managerBoth", "manager", ["talkha", "mashaya"], ["dashboard", "bookings", "pos", "revenue", "expenses"]),
    user("cashierTalkha", "cashier", ["talkha"], ["dashboard", "bookings", "pos", "expenses"]),
    user("cashierMashaya", "cashier", ["mashaya"], ["dashboard", "bookings", "pos", "expenses"]),
    user("cashierRefundMashaya", "cashier", ["mashaya"], ["dashboard", "bookings", "pos", "refundTransactions"]),
    user("cashierOld", "cashier", ["mashaya"], ["dashboard", "bookings", "pos", "customers", "attendance", "tasks", "users", "settings", "campaigns"]),
    user("cashierMarketingMashaya", "cashier", ["mashaya"], ["pos", "bookings", "offers", "campaigns"]),
    user("managerMarketingTalkha", "manager", ["talkha"], ["offers", "campaigns"]),
    user("workerTalkha", "worker", ["talkha"], ["attendance", "tasks"]),
    user("workerMashaya", "worker", ["mashaya"], ["attendance", "tasks"]),
    user("customerA", null, [], [], phone.A),
    user("customerB", null, [], [], phone.B)
  ]);
  const timestamp = Timestamp.now();
  const batch = db.batch();
  batch.set(db.doc("users/cashierMarketingMashaya"), { role: "cashier", branchIds: ["mashaya"], permissions: ["pos", "bookings", "offers", "campaigns"] });
  batch.set(db.doc("users/managerMarketingTalkha"), { role: "manager", branchIds: ["talkha"], permissions: ["offers", "campaigns"] });
  for (const branchId of ["talkha", "mashaya"]) {
    batch.set(db.doc(`branches/${branchId}`), { active: true, code: branchId.slice(0, 3).toUpperCase(), nameAr: branchId, nameEn: branchId, phone: "01000000000", whatsapp: "01000000000", openingTime: "09:00", closingTime: "21:00", monthlyRevenueTargets: { [month]: { targetAmount: branchId === "talkha" ? 1000 : 2000 } } });
    batch.set(db.doc(`staff/${branchId}-staff`), { active: true, available: true, nameAr: branchId, nameEn: branchId, branchIds: [branchId], serviceIds: [`${branchId}-service`, "shared-service"], workDays: [0, 1, 2, 3, 4, 5, 6], shiftStart: "09:00", shiftEnd: "21:00" });
    for (const kind of ["service", "package", "offer"]) {
      const collection = `${kind}s`;
      batch.set(db.doc(`${collection}/${branchId}-${kind}`), { active: true, catalogVisible: true, branchIds: [branchId], nameAr: kind, nameEn: kind, price: 100, duration: 30, ...(kind === "service" ? {} : { includedServiceIds: [`${branchId}-service`] }) });
    }
    batch.set(db.doc(`revenueLedger/${branchId}-payment`), { branchId, dateKey: today, amount: branchId === "talkha" ? 100 : 200, type: "payment", paymentMethod: "cash", createdAt: timestamp });
    batch.set(db.doc(`expenses/${branchId}-expense`), { branchId, dateKey: today, amount: 10, category: "other", createdAt: timestamp });
  }
  batch.set(db.doc("services/shared-service"), { active: true, catalogVisible: true, branchIds: ["talkha", "mashaya"], nameAr: "Shared", nameEn: "Shared", price: 75, duration: 30 });
  for (const [name, branchId, owner] of [["talkha", "talkha", "A"], ["mashaya", "mashaya", "A"], ["legacy", null, "B"]]) {
    batch.set(db.doc(`bookings/${code[name]}`), { ...(branchId ? { branchId } : {}), code: code[name], phoneHash: customerId[owner], phone: phone[owner], bookingDate: today, bookingTime: "12:00", status: "pending", paymentStatus: "unpaid", total: 100, staffId: `${branchId || "talkha"}-staff`, createdAt: timestamp, lockIds: [] });
  }
  batch.set(db.doc(`customers/${customerId.A}`), { firstName: "Customer", lastName: "A", phone: phone.A, lastBranchId: "mashaya" });
  batch.set(db.doc(`customers/${customerId.B}`), { firstName: "Customer", lastName: "B", phone: phone.B });
  await batch.commit();
});

test("V8 optional marketing permission and campaign branch identity are enforced by handlers", async () => {
  await db.doc("settings/public").set({ whatsappCampaignsEnabled: false, whatsappMarketingTemplates: [{ name: "offer_text_ar", languageCode: "ar", headerType: "none", bodyVariables: ["offerName"] }] }, { merge: true });
  await db.doc("offers/mashaya-offer").set({ active: true, status: "active", branchIds: ["mashaya"], nameAr: "عرض المشاية", oldPrice: 150, newPrice: 100 }, { merge: true });
  await denied("getWhatsappCampaignOptions", "cashierMashaya", {});
  await denied("getWhatsappCampaignOptions", "cashierOld", {}); // Old unrelated claims do not grant campaigns.
  assert.deepEqual((await allowed("getOwnMarketingGrants", "cashierOld")).grants, []);
  assert.deepEqual((await allowed("getOwnMarketingGrants", "cashierMarketingMashaya")).grants, ["offers", "campaigns"]);
  const options = await allowed("getWhatsappCampaignOptions", "cashierMarketingMashaya");
  assert.deepEqual(options.branchIds, ["mashaya"]);
  assert.ok(options.offers.some(offer => offer.id === "mashaya-offer"));
  assert.ok(!options.offers.some(offer => offer.id === "talkha-offer"));
  await denied("previewWhatsappCampaign", "cashierMarketingMashaya", { offerId: "mashaya-offer", templateName: "offer_text_ar", branchId: "all" });
  await denied("previewWhatsappCampaign", "cashierMarketingMashaya", { offerId: "mashaya-offer", templateName: "offer_text_ar", branchId: "talkha" });
  await denied("previewWhatsappCampaign", "cashierMarketingMashaya", { offerId: "talkha-offer", templateName: "offer_text_ar", branchId: "mashaya" }, "FAILED_PRECONDITION");
  await denied("previewWhatsappCampaign", "admin", { offerId: "mashaya-offer", templateName: "offer_text_ar", branchId: "all" }, "FAILED_PRECONDITION");
  const preview = await allowed("previewWhatsappCampaign", "cashierMarketingMashaya", { offerId: "mashaya-offer", templateName: "offer_text_ar", branchId: "mashaya", testMode: false, recipientCap: 1 });
  assert.equal(preview.eligibleCount, 0);
  await denied("createWhatsappCampaign", "cashierMarketingMashaya", { name: "حملة اختبار", offerId: "mashaya-offer", templateName: "offer_text_ar", branchId: "all", recipientCap: 1, idempotencyKey: "emulator-campaign-unique-0001" });
  await denied("previewWhatsappCampaign", "managerMarketingTalkha", { offerId: "mashaya-offer", templateName: "offer_text_ar", branchId: "mashaya" });
});

test("POS offers are sellable within the actor branch without offers management grants", async () => {
  await db.doc("offers/v91-talkha-sale").set({ active: true, status: "active", branchIds: ["talkha"], nameAr: "عرض طلخا", newPrice: 50 });
  await db.doc("offers/v91-mashaya-sale").set({ active: true, status: "active", branchIds: ["mashaya"], nameAr: "عرض المشاية", newPrice: 70 });
  await db.doc("offers/v91-stopped").set({ active: true, status: "stopped", branchIds: ["mashaya"], nameAr: "عرض موقوف", newPrice: 40 });
  const mashaya = await allowed("getPosOffers", "cashierMashaya", { branchId: "mashaya" });
  assert.ok(mashaya.items.some(item => item.id === "v91-mashaya-sale"));
  assert.ok(!mashaya.items.some(item => ["v91-talkha-sale", "v91-stopped"].includes(item.id)));
  assert.ok(mashaya.items.every(item => !Object.hasOwn(item, "oldPrice")));
  const talkha = await allowed("getPosOffers", "cashierTalkha", { branchId: "talkha" });
  assert.ok(talkha.items.some(item => item.id === "v91-talkha-sale"));
  assert.ok(!talkha.items.some(item => item.id === "v91-mashaya-sale"));
  await denied("getPosOffers", "cashierMashaya", { branchId: "talkha" });
  await denied("getPosOffers", "cashierTalkha", { branchId: "mashaya" });
  await denied("getAdminCollection", "cashierMashaya", { collection: "offers" });
  const admin = await allowed("getPosOffers", "admin", { branchId: "talkha" });
  assert.ok(admin.items.some(item => item.id === "v91-talkha-sale"));
  await denied("getCashierSnapshot", "cashierMashaya", { branchId: "talkha" });
  const ownSnapshot = await allowed("getCashierSnapshot", "cashierMashaya", { branchId: "mashaya" });
  assert.ok(ownSnapshot.bookings.every(item => item.branchId === "mashaya"));
});

test("V8 campaign direct ID state and recipient access deny the other branch", async () => {
  await db.doc("campaigns/v8_talkha_test").set({ branchId: "talkha", offerId: "talkha-offer", state: "PAUSED", recipientCap: 1, testMode: true });
  await denied("updateWhatsappCampaignState", "cashierMarketingMashaya", { campaignId: "v8_talkha_test", action: "CANCEL" });
  await denied("getWhatsappCampaignRecipients", "cashierMarketingMashaya", { campaignId: "v8_talkha_test" });
  await denied("getWhatsappCampaignStats", "cashierMarketingMashaya", { campaignId: "v8_talkha_test" });
  const recipientPage = await allowed("getWhatsappCampaignRecipients", "admin", { campaignId: "v8_talkha_test" });
  assert.equal(recipientPage.items.length, 0);
  assert.equal((await allowed("getWhatsappCampaignStats", "admin", { campaignId: "v8_talkha_test" })).targeted, 0);
});

test("V8 offer creation validates prices, dates and service/package branch scope", async () => {
  const data = { nameAr: "عرض جديد", oldPrice: 150, newPrice: 100, branchIds: ["mashaya"], active: true, status: "active", includedServiceIds: ["mashaya-service"], linkedPackageIds: ["mashaya-package"] };
  await denied("adminUpsert", "cashierMashaya", { collection: "offers", data });
  const created = await allowed("adminUpsert", "cashierMarketingMashaya", { collection: "offers", data });
  await allowed("adminUpsert", "cashierMarketingMashaya", { collection: "offers", id: created.id, data: { active: false } });
  assert.equal((await db.doc(`offers/${created.id}`).get()).data().active, false);
  await denied("adminUpsert", "cashierMarketingMashaya", { collection: "offers", data: { ...data, branchIds: ["talkha"] } });
  await denied("adminUpsert", "cashierMarketingMashaya", { collection: "offers", data: { ...data, includedServiceIds: ["talkha-service"] } }, "FAILED_PRECONDITION");
  await denied("adminUpsert", "cashierMarketingMashaya", { collection: "offers", data: { ...data, linkedPackageIds: ["talkha-package"] } }, "FAILED_PRECONDITION");
  await denied("adminUpsert", "cashierMarketingMashaya", { collection: "offers", data: { ...data, newPrice: 200 } }, "INVALID_ARGUMENT");
  await denied("adminUpsert", "cashierMarketingMashaya", { collection: "offers", data: { ...data, startAt: "2026-10-02", endAt: "2026-10-01" } }, "INVALID_ARGUMENT");
});

test("V8 customer can opt in and out only on owned identity with consent history", async () => {
  const ref = db.doc(`customers/${customerId.A}`);
  await ref.set({ authUid: "customerA" }, { merge: true });
  await allowed("updateOwnWhatsappConsent", "customerA", { optedIn: true });
  assert.equal((await ref.get()).data().whatsappOptIn, true);
  const consented = await allowed("previewWhatsappCampaign", "cashierMarketingMashaya", { offerId: "mashaya-offer", templateName: "offer_text_ar", branchId: "mashaya", testMode: false, recipientCap: 1 });
  assert.equal(consented.eligibleCount, 1);
  assert.equal(consented.recipientCapValid, true);
  assert.equal((await allowed("previewWhatsappCampaign", "cashierMarketingMashaya", { offerId: "mashaya-offer", templateName: "offer_text_ar", branchId: "mashaya", testMode: false, recipientCap: 25 })).recipientCapValid, false);
  await denied("updateOwnWhatsappConsent", "customerB", { optedIn: false });
  await allowed("updateOwnWhatsappConsent", "customerA", { optedIn: false });
  assert.equal((await ref.get()).data().whatsappOptIn, false);
  assert.equal((await allowed("previewWhatsappCampaign", "cashierMarketingMashaya", { offerId: "mashaya-offer", templateName: "offer_text_ar", branchId: "mashaya", testMode: false, recipientCap: 1 })).eligibleCount, 0);
  const history = await db.collection("whatsappConsentHistory").where("customerId", "==", customerId.A).get();
  assert.equal(history.size, 2);
  assert.ok(history.docs.every(doc => doc.data().source === "customer_account"));
});

test("admin sees both branches, selected branch, monthly targets, and can edit a target", async () => {
  const both = await allowed("getAdminDashboard", "admin", { branchId: "all" });
  assert.equal(both.stats.bookingCount, 3); // Includes legacy only for global admin.
  assert.equal(both.stats.monthlyRevenueTarget, 3000);
  const talkha = await allowed("getAdminDashboard", "admin", { branchId: "talkha" });
  const mashaya = await allowed("getAdminDashboard", "admin", { branchId: "mashaya" });
  assert.equal(talkha.stats.bookingCount, 1);
  assert.equal(mashaya.stats.bookingCount, 1);
  assert.notEqual(talkha.stats.todayRevenue, mashaya.stats.todayRevenue);
  await allowed("setBranchMonthlyTarget", "admin", { branchId: "talkha", month, targetAmount: 1100 });
  assert.equal((await allowed("getAdminDashboard", "admin", { branchId: "talkha" })).stats.monthlyRevenueTarget, 1100);
});

for (const [role, own, other] of [["cashierMashaya", "mashaya", "talkha"], ["cashierTalkha", "talkha", "mashaya"], ["managerMashaya", "mashaya", "talkha"], ["managerTalkha", "talkha", "mashaya"]]) {
  test(`${role}: own booking visible; other and legacy absent; cross-branch mutation denied`, async () => {
    const snapshot = await allowed("getCashierSnapshot", role);
    assert.ok(snapshot.bookings.some(item => item.id === code[own]));
    assert.ok(!snapshot.bookings.some(item => item.id === code[other]));
    assert.ok(!snapshot.bookings.some(item => item.id === code.legacy));
    await denied("updateBooking", role, { id: code[other], action: "confirm" });
    await denied("rescheduleBooking", role, { id: code[other], date: today, time: "13:00", staffId: `${other}-staff`, requestId: "request_resched_123456" });
    await denied("updateBooking", role, { id: code[other], action: "checkout", paymentMethod: "cash" });
    await denied("updateBooking", role, { id: code.legacy, action: "confirm" });
  });
  test(`${role}: calendar, financial reads and writes reject other branch`, async () => {
    const calendar = await allowed("getBookingCalendar", role, { branchId: own, from: today, to: today });
    assert.ok(calendar.bookings.some(item => item.id === code[own]));
    assert.ok(!calendar.bookings.some(item => item.id === code[other]));
    const dashboard = await allowed("getAdminDashboard", role, { branchId: own });
    assert.equal(dashboard.stats.bookingCount, 1);
    assert.ok(await allowed("getCashOperations", role, { branchId: own }));
    await denied("getBookingCalendar", role, { branchId: other, from: today, to: today });
    await denied("getAdminDashboard", role, { branchId: other });
    await denied("getCashOperations", role, { branchId: other });
    await denied("openCashShift", role, { branchId: other, openingCash: 0, idempotencyKey: "open_cross_12345678" });
    await denied("addCashMovement", role, { branchId: other, type: "CASH_OUT", amount: 1, reason: "test", idempotencyKey: "movement_cross_12345678" });
    await denied("recordExpense", role, { branchId: other, amount: 10, category: "other", description: "test", paymentMethod: "cash", idempotencyKey: "expense_cross_12345678" });
    await denied("setBranchMonthlyTarget", role, { branchId: other, month, targetAmount: 1 });
    if (role.startsWith("manager")) await denied("closeBusinessDay", role, { branchId: other, businessDate: today, actualCash: 0, idempotencyKey: "close_cross_12345678" });
  });
}

test("manager with two explicit branches can see both and not legacy", async () => {
  const snapshot = await allowed("getCashierSnapshot", "managerBoth");
  assert.ok(snapshot.bookings.some(item => item.id === code.talkha));
  assert.ok(snapshot.bookings.some(item => item.id === code.mashaya));
  assert.ok(!snapshot.bookings.some(item => item.id === code.legacy));
});

test("manager revenue and expense views are scoped before return", async () => {
  for (const [actor, own, other, expectedRevenue] of [["managerTalkha", "talkha", "mashaya", 100], ["managerMashaya", "mashaya", "talkha", 200]]) {
    const business = await allowed("getBusinessDashboard", actor, { month });
    assert.equal(business.stats.grossRevenue, expectedRevenue);
    assert.ok(business.expenses.some(item => item.branchId === own));
    assert.ok(!business.expenses.some(item => item.branchId === other));
    const ledger = await allowed("getAdminCollection", actor, { collection: "revenueLedger" });
    assert.ok(ledger.items.length > 0);
    assert.ok(ledger.items.every(item => item.branchId === own));
    await denied("getAdminCollection", actor, { collection: "users" });
  }
});

test("old cashier claims cannot unlock customer, attendance, users or settings APIs", async () => {
  await denied("getCustomer360", "cashierOld", { customerId: customerId.A });
  await allowed("getAttendanceDashboard", "cashierOld", { branchId: "mashaya" });
  await denied("getAttendanceDashboard", "cashierOld", { branchId: "talkha" });
  await denied("recordWorkerAttendance", "cashierOld", { branchId: "mashaya", action: "checkIn" });
  await denied("getAdminCollection", "cashierOld", { collection: "users" });
  await denied("getAdminCollection", "cashierOld", { collection: "settings" });
  const lookup = await allowed("findCustomerByPhone", "cashierMashaya", { phone: phone.A });
  assert.equal(lookup.customer?.id, customerId.A);
});

test("manager customer history contains only own branch and cashier has no customer admin access", async () => {
  const detail = await allowed("getCustomer360", "managerMashaya", { customerId: customerId.A });
  assert.ok(detail.bookingHistory.some(item => item.id === code.mashaya));
  assert.ok(!detail.bookingHistory.some(item => item.id === code.talkha));
  await denied("getCustomer360", "cashierMashaya", { customerId: customerId.A });
  await denied("getCustomer360", "managerTalkha", { customerId: customerId.B });
});

test("customer B cannot read or cancel customer A booking and direct Firestore is blocked", async () => {
  await denied("getCustomerBooking", "customerB", { code: code.talkha }, "NOT_FOUND");
  await denied("cancelCustomerBooking", "customerB", { code: code.mashaya }, "NOT_FOUND");
  const own = await allowed("getCustomerBooking", "customerA", { code: code.mashaya });
  assert.equal(own.booking.branchId, "mashaya");
});

for (const [branchId, other] of [["talkha", "mashaya"], ["mashaya", "talkha"]]) {
  for (const kind of ["service", "package", "offer"]) {
    test(`website ${branchId} rejects ${other}-only ${kind} at createBooking`, async () => {
      const uniquePhone = `0101234568${["talkha", "mashaya"].indexOf(branchId) * 3 + ["service", "package", "offer"].indexOf(kind)}`;
      const result = await callable("createBooking", null, { branchId, items: [{ kind, id: `${other}-${kind}` }], customer: { firstName: "Test", lastName: "Only", phone: uniquePhone }, clientRequestId: `${branchId}-${kind}-request` });
      assert.equal(result.error?.status, "FAILED_PRECONDITION", JSON.stringify(result));
    });
  }
  test(`website ${branchId} rejects ${other}-only staff on valid own-branch service`, async () => {
    const result = await callable("createBooking", null, { branchId, bookingDate: futureDate, bookingTime: "10:00", staffId: `${other}-staff`, items: [{ kind: "service", id: `${branchId}-service` }], customer: { firstName: "Cross", lastName: "Staff", phone: branchId === "talkha" ? "01012345686" : "01012345687" }, clientRequestId: `${branchId}-cross-staff` });
    assert.equal(result.error?.status, "FAILED_PRECONDITION", JSON.stringify(result));
  });
}

test("shared service creates one canonical booking visible to same-branch cashier, calendar and owner", async () => {
  const booking = await allowed("createBooking", "customerB", { branchId: "talkha", bookingDate: futureDate, bookingTime: "11:00", staffId: "talkha-staff", items: [{ kind: "service", id: "shared-service" }], customer: { firstName: "Customer", lastName: "B", phone: phone.B }, clientRequestId: "v61_shared_booking_request_12345" });
  assert.equal(booking.branchId, "talkha");
  const id = booking.bookingCode;
  assert.equal((await db.collection("bookings").where("code", "==", id).get()).size, 1);
  assert.ok((await allowed("getCashierSnapshot", "cashierTalkha")).bookings.some(item => item.id === id));
  assert.ok(!(await allowed("getCashierSnapshot", "cashierMashaya")).bookings.some(item => item.id === id));
  assert.ok((await allowed("getBookingCalendar", "cashierTalkha", { branchId: "talkha", from: futureDate, to: futureDate })).bookings.some(item => item.id === id));
  assert.equal((await allowed("getCustomerBooking", "customerB", { code: id })).booking.code, id);
});

test("worker endpoints are branch locked and staff cannot read admin finance", async () => {
  await denied("getCashOperations", "workerTalkha", { branchId: "mashaya" });
  await denied("getCashOperations", "workerMashaya", { branchId: "talkha" });
  await denied("getAdminDashboard", "workerTalkha", { branchId: "talkha" });
});

test("V7 shift report is immutable, idempotent, branch-locked and backed by ledger", async () => {
  const opened = await allowed("openCashShift", "cashierTalkha", { branchId: "talkha", openingCash: 25, idempotencyKey: "v7_open_shift_123456789" });
  assert.equal(opened.shift.branchId, "talkha");
  await db.doc("revenueLedger/v7-shift-card").set({ branchId: "talkha", dateKey: today, amount: 30, type: "payment", paymentMethod: "card", createdAt: Timestamp.now() });
  const closed = await allowed("closeCashShift", "cashierTalkha", { branchId: "talkha", actualCash: 25, idempotencyKey: "v7_close_shift_123456789" });
  assert.equal(closed.report.shiftId, opened.shiftId);
  assert.equal(closed.report.branchId, "talkha");
  assert.equal(closed.report.card, 30);
  assert.equal(closed.report.attributionMode, "legacy");
  assert.equal(closed.report.legacyTimeAttributed, 1);
  assert.equal(closed.report.expectedCash, 25);
  const repeated = await allowed("closeCashShift", "cashierTalkha", { branchId: "talkha", actualCash: 25, idempotencyKey: "v7_close_shift_123456789" });
  assert.equal(repeated.report.shiftId, closed.report.shiftId);
  assert.equal((await db.doc(`cashShifts/${opened.shiftId}`).get()).data().report.card, 30);
  const own = await allowed("getBusinessReport", "cashierTalkha", { type: "shift", shiftId: opened.shiftId });
  assert.equal(own.report.cashierUid, "cashierTalkha");
  await denied("getBusinessReport", "cashierMashaya", { type: "shift", shiftId: opened.shiftId });
  await denied("getBusinessReport", "managerMashaya", { type: "shift", shiftId: opened.shiftId });
  await denied("getBusinessReport", "workerTalkha", { type: "shift", shiftId: opened.shiftId });
  await allowed("getBusinessReport", "admin", { type: "shift", shiftId: opened.shiftId });
  const closeEvents = await db.collection("activityLogs").where("action", "==", "close-cash-shift").get();
  assert.equal(closeEvents.docs.filter(item => item.data().targetId === opened.shiftId).length, 1);
});

test("V7.1 writes one branch-owned shiftId on POS cash/transfers and booking checkout; old rows remain separate", async () => {
  await db.doc("settings/public").set({ cashDrawerEnabled: true }, { merge: true });
  const opened = await allowed("openCashShift", "cashierMashaya", { branchId: "mashaya", openingCash: 0, idempotencyKey: "v71_mashaya_first_shift_12345" });
  await denied("createPosOrder", "cashierMashaya", {
    branchId: "talkha", shiftId: opened.shiftId, customer: { firstName: "Cross", phone: "01012345609" },
    items: [{ kind: "service", id: "talkha-service" }], paid: true, paymentMethod: "card",
    idempotencyKey: "v71_cross_branch_pos_123456789"
  });
  const sale = async (method, suffix) => allowed("createPosOrder", "cashierMashaya", {
    branchId: "mashaya", shiftId: "v7_closed_talkha_shift",
    customer: { firstName: "Test", lastName: suffix, phone: `01012345${suffix}` },
    items: [{ kind: "service", id: "mashaya-service", workerId: "mashaya-staff", qty: 1 }],
    paymentMethod: method, paid: true, idempotencyKey: `v71_sale_${suffix}_123456789`
  });
  const methods = [["cash", "601"], ["instapay", "602"], ["vodafone_cash", "603"], ["other", "604"], ["card", "605"]];
  const orders = [];
  for (const [method, suffix] of methods) {
    const receipt = await sale(method, suffix);
    orders.push(receipt.bookingCode);
    const ledger = await db.doc(`revenueLedger/payment_${receipt.bookingCode}`).get();
    assert.equal(ledger.data().shiftId, opened.shiftId);
    assert.equal(ledger.data().branchId, "mashaya");
  }
  const repeated = await sale("cash", "601");
  assert.equal(repeated.bookingCode, orders[0]);
  assert.equal((await db.collection("revenueLedger").where("bookingId", "==", orders[0]).get()).size, 1);
  const checkout = await allowed("updateBooking", "cashierMashaya", { id: code.mashaya, action: "checkout", paymentMethod: "cash", shiftId: "talkha" });
  assert.equal(checkout.paymentStatus, "paid");
  assert.equal((await db.doc(`revenueLedger/payment_${code.mashaya}`).get()).data().shiftId, opened.shiftId);
  await db.doc("revenueLedger/v71-legacy-window").set({ branchId: "mashaya", amount: 7, type: "payment", paymentMethod: "card", createdAt: Timestamp.now() });
  await db.doc("revenueLedger/v71-other-shift-window").set({ branchId: "mashaya", shiftId: "wrong-shift", amount: 999, type: "payment", paymentMethod: "card", createdAt: Timestamp.now() });
  const closed = await allowed("closeCashShift", "cashierMashaya", { branchId: "mashaya", actualCash: 200, idempotencyKey: "v71_mashaya_close_123456789" });
  assert.equal(closed.report.cash, 200);
  assert.equal(closed.report.transfer, 200);
  assert.equal(closed.report.card, 107);
  assert.equal(closed.report.netCollected, 607);
  assert.equal(closed.report.directShiftAttributed, 6);
  assert.equal(closed.report.legacyTimeAttributed, 1);
  assert.equal(closed.report.attributionMode, "mixed");
  assert.equal((await allowed("closeCashShift", "cashierMashaya", { branchId: "mashaya", actualCash: 200, idempotencyKey: "v71_mashaya_close_123456789" })).report.netCollected, 607);
  await denied("createPosOrder", "cashierMashaya", {
    branchId: "mashaya", customer: { firstName: "After", phone: "01012345606" },
    items: [{ kind: "service", id: "mashaya-service" }], paymentMethod: "cash", paid: true,
    shiftId: opened.shiftId, idempotencyKey: "v71_closed_sale_123456789"
  }, "FAILED_PRECONDITION");
});

test("V7.1 refund belongs to execution shift, cross-branch and stale client shiftId cannot override it", async () => {
  const opened = await allowed("openCashShift", "managerMashaya", { branchId: "mashaya", openingCash: 0, idempotencyKey: "v71_refund_shift_123456789" });
  await denied("getCashOperations", "cashierTalkha", { branchId: "mashaya" });
  const sale = (await db.collection("bookings").where("source", "==", "pos").where("branchId", "==", "mashaya").get()).docs.find(item => item.data().paymentMethod === "card" && item.data().paymentStatus === "paid");
  assert.ok(sale, "A paid card sale is required for the non-cash refund shift test");
  const result = await allowed("updateBooking", "managerMashaya", { id: sale.id, action: "refund", paymentMethod: "instapay", reason: "اختبار الاسترداد", idempotencyKey: "v71_refund_request_123456789", shiftId: "wrong-shift" });
  assert.equal(result.paymentStatus, "refunded");
  const refund = (await db.doc(`revenueLedger/refund_${sale.id}`).get()).data();
  assert.equal(refund.shiftId, opened.shiftId);
  assert.equal(refund.branchId, "mashaya");
  assert.notEqual(refund.shiftId, (await db.doc(`revenueLedger/payment_${sale.id}`).get()).data().shiftId);
  await denied("updateBooking", "managerTalkha", { id: sale.id, action: "refund", paymentMethod: "instapay", reason: "فرع آخر", idempotencyKey: "v71_cross_refund_123456789" });
  const closed = await allowed("closeCashShift", "managerMashaya", { branchId: "mashaya", actualCash: 0, idempotencyKey: "v71_refund_close_123456789" });
  assert.equal(closed.report.netCollected, -100);
  assert.equal(closed.report.refunds, 100);
  assert.equal(closed.report.attributionMode, "direct");
});

test("V7.1 invoice payment after an unpaid POS order uses the current shift", async () => {
  const opened = await allowed("openCashShift", "managerMashaya", { branchId: "mashaya", openingCash: 0, idempotencyKey: "v71_invoice_open_123456789" });
  const unpaid = await allowed("createPosOrder", "cashierMashaya", {
    branchId: "mashaya", customer: { firstName: "Invoice", phone: "01012345610" },
    items: [{ kind: "service", id: "mashaya-service", workerId: "mashaya-staff" }],
    paid: false, idempotencyKey: "v71_unpaid_invoice_123456789"
  });
  assert.equal((await db.doc(`revenueLedger/payment_${unpaid.bookingCode}`).get()).exists, false);
  await allowed("updateBooking", "managerMashaya", { id: unpaid.bookingCode, action: "markPaid", paymentMethod: "card", shiftId: "wrong-shift" });
  const row = (await db.doc(`revenueLedger/payment_${unpaid.bookingCode}`).get()).data();
  assert.equal(row.shiftId, opened.shiftId);
  assert.equal(row.paymentMethod, "card");
  const closed = await allowed("closeCashShift", "managerMashaya", { branchId: "mashaya", actualCash: 0, idempotencyKey: "v71_invoice_close_123456789" });
  assert.equal(closed.report.card, 100);
  assert.equal(closed.report.netCollected, 100);
});

test("V7.1 simultaneous transfer and close never assigns a ledger row to a closed shift without reporting it", async () => {
  const opened = await allowed("openCashShift", "cashierTalkha", { branchId: "talkha", openingCash: 0, idempotencyKey: "v71_race_open_123456789" });
  const payload = { branchId: "talkha", shiftId: "wrong-shift", customer: { firstName: "Race", phone: "01012345607" }, items: [{ kind: "service", id: "talkha-service", workerId: "talkha-staff" }], paid: true, paymentMethod: "instapay", idempotencyKey: "v71_race_sale_123456789" };
  const [payment, closing] = await Promise.all([
    callable("createPosOrder", "cashierTalkha", payload),
    callable("closeCashShift", "cashierTalkha", { branchId: "talkha", actualCash: 0, idempotencyKey: "v71_race_close_123456789" })
  ]);
  assert.equal(closing.status, 200, JSON.stringify(closing));
  const report = closing.data.report;
  assert.equal(report.shiftId, opened.shiftId);
  if (payment.status === 200) {
    const ledger = (await db.doc(`revenueLedger/payment_${payment.data.bookingCode}`).get()).data();
    assert.equal(ledger.branchId, "talkha");
    if (ledger.shiftId === opened.shiftId) {
      assert.equal(report.netCollected, 100);
      assert.equal(report.directShiftAttributed, 1);
    } else {
      assert.equal(ledger.shiftId, undefined);
      assert.equal(report.netCollected, 0);
    }
  } else {
    assert.equal(payment.error?.status, "FAILED_PRECONDITION");
    assert.equal(report.netCollected, 0);
  }
  assert.equal((await db.doc(`cashShifts/${opened.shiftId}`).get()).data().status, "CLOSED");
});

test("V7.1 an interrupted seal rejects new payments and the same closer can finish it", async () => {
  const opened = await allowed("openCashShift", "cashierTalkha", { branchId: "talkha", openingCash: 0, idempotencyKey: "v71_recovery_open_123456789" });
  const key = "v71_recovery_close_123456789";
  await db.doc(`cashShifts/${opened.shiftId}`).update({ status: "CLOSING", closingBy: "cashierTalkha", closingRequestId: key, closingActualCash: 0, closingReason: "", closingCutoff: Timestamp.now() });
  await db.doc("cashShiftState/talkha").update({ status: "CLOSING" });
  await denied("createPosOrder", "cashierTalkha", {
    branchId: "talkha", customer: { firstName: "Blocked", phone: "01012345608" },
    items: [{ kind: "service", id: "talkha-service" }], paid: true, paymentMethod: "card",
    idempotencyKey: "v71_blocked_during_close_12345"
  }, "FAILED_PRECONDITION");
  const closed = await allowed("closeCashShift", "cashierTalkha", { branchId: "talkha", actualCash: 0, idempotencyKey: key });
  assert.equal(closed.report.shiftId, opened.shiftId);
  assert.equal(closed.report.netCollected, 0);
  assert.equal((await allowed("closeCashShift", "cashierTalkha", { branchId: "talkha", actualCash: 0, idempotencyKey: key })).idempotent, true);
});

test("V7 daily snapshots use canonical branch ledger and reject cross-branch reads", async () => {
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateKey = yesterday.toISOString().slice(0, 10);
  const batch = db.batch();
  for (const [branchId, amount] of [["talkha", 120], ["mashaya", 340]]) {
    batch.set(db.doc(`revenueLedger/v7-daily-${branchId}`), { branchId, dateKey, amount, type: "payment", paymentMethod: "cash", createdAt: Timestamp.now() });
    batch.set(db.doc(`expenses/v7-daily-${branchId}`), { branchId, dateKey, amount: 10, paymentMethod: "cash", createdAt: Timestamp.now() });
  }
  await batch.commit();
  const talkha = await allowed("rebuildBusinessReport", "admin", { type: "daily", branchId: "talkha", periodKey: dateKey });
  const mashaya = await allowed("rebuildBusinessReport", "admin", { type: "daily", branchId: "mashaya", periodKey: dateKey });
  assert.equal(talkha.report.totals.netRevenue, 120);
  assert.equal(mashaya.report.totals.netRevenue, 340);
  const same = await allowed("getBusinessReport", "admin", { type: "daily", branchId: "all", periodKey: dateKey });
  assert.equal(same.reports.length, 2);
  assert.equal((await allowed("getBusinessReport", "managerTalkha", { type: "daily", branchId: "talkha", periodKey: dateKey })).reports[0].totals.netRevenue, 120);
  await denied("getBusinessReport", "managerTalkha", { type: "daily", branchId: "mashaya", periodKey: dateKey });
  await denied("getBusinessReport", "cashierTalkha", { type: "daily", branchId: "mashaya", periodKey: dateKey });
  await denied("rebuildBusinessReport", "cashierTalkha", { type: "daily", branchId: "talkha", periodKey: dateKey });
  assert.equal((await db.collection("businessReports").where("periodKey", "==", dateKey).get()).docs.filter(item => item.data().type === "daily").length, 2);
  const generatedAt = (await db.doc(`businessReports/daily_talkha_${dateKey}`).get()).data().generatedAt.toMillis();
  await handlers.scheduledBusinessReports.run({});
  assert.equal((await db.doc(`businessReports/daily_talkha_${dateKey}`).get()).data().generatedAt.toMillis(), generatedAt);
});

test("V7 weekly/monthly rollups isolate branch targets and audit access stays admin-only", async () => {
  const days = Array.from({ length: 31 }, (_, index) => `2026-01-${String(index + 1).padStart(2, "0")}`);
  const batch = db.batch();
  for (const branchId of ["talkha", "mashaya"]) {
    for (const day of days) batch.set(db.doc(`businessReports/daily_${branchId}_${day}`), { type: "daily", branchId, periodKey: day, totals: { grossRevenue: branchId === "talkha" ? 10 : 20, netRevenue: branchId === "talkha" ? 10 : 20, transactions: 1, bookings: 1 } });
    batch.update(db.doc(`branches/${branchId}`), { [`monthlyRevenueTargets.2026-01`]: { targetAmount: branchId === "talkha" ? 1000 : 2000 } });
  }
  await batch.commit();
  const weekly = await allowed("rebuildBusinessReport", "admin", { type: "weekly", branchId: "talkha", periodKey: "2026-01-05" });
  assert.equal(weekly.report.totals.netRevenue, 70);
  assert.equal(weekly.report.days.length, 7);
  const talkha = await allowed("rebuildBusinessReport", "admin", { type: "monthly", branchId: "talkha", periodKey: "2026-01" });
  const mashaya = await allowed("rebuildBusinessReport", "admin", { type: "monthly", branchId: "mashaya", periodKey: "2026-01" });
  assert.equal(talkha.report.target.amount, 1000);
  assert.equal(mashaya.report.target.amount, 2000);
  assert.equal(talkha.report.totals.netRevenue, 310);
  assert.equal(mashaya.report.totals.netRevenue, 620);
  await denied("getBusinessReport", "managerMashaya", { type: "monthly", branchId: "talkha", periodKey: "2026-01" });
  const audit = await allowed("getAuditEvents", "admin", { branchId: "talkha", limit: 50 });
  assert.ok(audit.items.some(item => item.action === "report-rebuilt" && item.branchId === "talkha"));
  await denied("getAuditEvents", "cashierTalkha", { branchId: "talkha" });
  await denied("getAuditEvents", "managerTalkha", { branchId: "talkha" });
});

test("V7 legacy report without canonical branch never inherits a requested branch", async () => {
  await db.doc("businessReports/daily_talkha_2026-02-02").set({ type: "daily", periodKey: "2026-02-02", totals: { netRevenue: 999 } });
  await denied("getBusinessReport", "cashierTalkha", { type: "daily", branchId: "talkha", periodKey: "2026-02-02" });
  const admin = await allowed("getBusinessReport", "admin", { type: "daily", branchId: "talkha", periodKey: "2026-02-02" });
  assert.deepEqual(admin.reports, []);
  assert.deepEqual(admin.missingBranches, ["talkha"]);
});

test("V9.2 live shift aggregates all ledger rows, records one classified advance and rejects the other branch", async () => {
  await db.doc("settings/public").set({ cashDrawerEnabled: true }, { merge: true });
  const opened = await allowed("openCashShift", "cashierTalkha", { branchId: "talkha", openingCash: 1000, idempotencyKey: "v92_live_open_123456789" });
  const sale = async (name, method, phone) => allowed("createPosOrder", "cashierTalkha", {
    branchId: "talkha", customer: { firstName: name, phone },
    items: [{ kind: "service", id: "talkha-service", workerId: "talkha-staff" }],
    paid: true, paymentMethod: method, idempotencyKey: `v92_live_${name}_123456789`
  });
  const cash = await sale("cash", "cash", "01012345801");
  const card = await sale("card", "card", "01012345802");
  await sale("transfer", "instapay", "01012345803");
  await denied("addCashMovement", "cashierTalkha", { type: "CASH_OUT", branchId: "mashaya", category: "advance", staffId: "mashaya-staff", reason: "سلفة", amount: 20, idempotencyKey: "v92_cross_advance_123456789" });
  await denied("addCashMovement", "cashierTalkha", { type: "CASH_OUT", branchId: "talkha", category: "advance", staffId: "mashaya-staff", reason: "سلفة", amount: 20, idempotencyKey: "v92_wrong_staff_123456789" }, "FAILED_PRECONDITION");
  const advanceData = { type: "CASH_OUT", branchId: "talkha", category: "advance", staffId: "talkha-staff", reason: "سلفة نقدية", amount: 20, idempotencyKey: "v92_advance_once_123456789" };
  const advance = await allowed("addCashMovement", "cashierTalkha", advanceData);
  assert.equal((await allowed("addCashMovement", "cashierTalkha", advanceData)).idempotent, true);
  const movement = (await db.doc(`cashMovements/${advance.movementId}`).get()).data();
  assert.equal(movement.shiftId, opened.shiftId);
  assert.equal(movement.staffId, "talkha-staff");
  assert.equal(movement.category, "advance");
  assert.equal((await db.collection("expenses").where("staffId", "==", "talkha-staff").get()).size, 0);
  const expense = await allowed("recordExpense", "cashierTalkha", { kind: "expense", branchId: "talkha", dateKey: today, category: "other", description: "مستلزمات", amount: 30, paymentMethod: "cash", idempotencyKey: "v92_expense_once_123456789" });
  assert.equal((await db.doc(`expenses/${expense.id}`).get()).data().shiftId, opened.shiftId);
  await allowed("updateBooking", "managerTalkha", { id: card.bookingCode, action: "refund", reason: "استرداد تجريبي", paymentMethod: "card", idempotencyKey: "v92_card_refund_123456789" });
  const twice = await allowed("updateBooking", "managerTalkha", { id: cash.bookingCode, action: "markPaid", paymentMethod: "cash" });
  assert.equal(twice.idempotent, true);
  assert.equal((await db.collection("revenueLedger").where("bookingId", "==", cash.bookingCode).get()).size, 1);
  const { snapshot } = await allowed("getCashOperations", "cashierTalkha", { branchId: "talkha" });
  assert.equal(snapshot.shiftId, opened.shiftId);
  assert.equal(snapshot.grossRevenue, 300);
  assert.equal(snapshot.netRevenue, 200);
  assert.equal(snapshot.transactionsCount, 4);
  assert.equal(snapshot.cashSales, 100);
  assert.equal(snapshot.cardSales, 0);
  assert.equal(snapshot.transferSales, 100);
  assert.equal(snapshot.expenses, 30);
  assert.equal(snapshot.advances, 20);
  assert.equal(snapshot.refunds, 100);
  assert.equal(snapshot.cashOut, 50);
  assert.equal(snapshot.expectedCash, 1050);
  assert.equal(snapshot.averageTicket, 100);
  await denied("getCashOperations", "cashierMashaya", { branchId: "talkha" });
  await db.doc("revenueLedger/v92-legacy-card").set({ branchId: "talkha", amount: 50, type: "payment", paymentMethod: "card", dateKey: today, createdAt: Timestamp.now() });
  const mixed = (await allowed("getCashOperations", "cashierTalkha", { branchId: "talkha" })).snapshot;
  assert.equal(mixed.netRevenue, 250);
  assert.equal(mixed.cardSales, 50);
  assert.equal(mixed.transactionsCount, 5);
  assert.equal(mixed.attributionMode, "mixed");
  const closed = await allowed("closeCashShift", "cashierTalkha", { branchId: "talkha", actualCash: 1050, idempotencyKey: "v92_live_close_123456789" });
  assert.equal(closed.report.advances, 20);
  assert.equal(closed.report.expenses, 30);
  assert.equal(closed.report.cashOut, 50);
  assert.equal(closed.report.netCollected, mixed.netRevenue);
});

test("V9.2 addendum optional refund is branch locked and uses the server payment method", async () => {
  const id = "MZ-MAS-REFUND-ADDENDUM";
  await db.doc(`bookings/${id}`).set({ code: id, branchId: "mashaya", source: "pos", status: "completed", paymentStatus: "paid", paymentMethod: "card", total: 37, items: [], itemIds: [], createdAt: Timestamp.now() });
  const request = { id, action: "refund", paymentMethod: "cash", reason: "مراجعة معاملة بطاقة", idempotencyKey: "v92_addendum_refund_123456789" };
  await denied("updateBooking", "cashierMashaya", request);
  await denied("updateBooking", "cashierTalkha", request);
  const result = await allowed("updateBooking", "cashierRefundMashaya", request);
  assert.equal(result.paymentStatus, "refunded");
  const ledger = (await db.doc(`revenueLedger/refund_${id}`).get()).data();
  assert.equal(ledger.branchId, "mashaya");
  assert.equal(ledger.paymentMethod, "card");
  assert.equal(ledger.amount, -37);
  assert.equal(Object.hasOwn(ledger, "staffId"), false);
  assert.equal((await allowed("updateBooking", "cashierRefundMashaya", request)).idempotent, true);
  assert.equal((await db.collection("revenueLedger").where("bookingId", "==", id).get()).size, 1);
  assert.equal((await db.doc(`cashMovements/refund_${id}`).get()).exists, false);
});

test("V9.5.1 checkout and invoice payment omit absent staffId and preserve a real worker", async () => {
  const checkoutId = "MZ-MAS-NO-STAFF-CHECKOUT";
  await db.doc(`bookings/${checkoutId}`).set({ code: checkoutId, branchId: "mashaya", source: "website", status: "confirmed", paymentStatus: "unpaid", total: 41, items: [], itemIds: [], createdAt: Timestamp.now() });
  const checkout = await allowed("updateBooking", "cashierMashaya", { id: checkoutId, action: "checkout", paymentMethod: "card" });
  assert.equal(checkout.paymentStatus, "paid");
  const checkoutLedger = (await db.doc(`revenueLedger/payment_${checkoutId}`).get()).data();
  assert.equal(checkoutLedger.branchId, "mashaya");
  assert.equal(checkoutLedger.amount, 41);
  assert.equal(Object.hasOwn(checkoutLedger, "staffId"), false);
  assert.equal((await allowed("updateBooking", "cashierMashaya", { id: checkoutId, action: "checkout", paymentMethod: "card" })).idempotent, true);
  assert.equal((await db.collection("revenueLedger").where("bookingId", "==", checkoutId).get()).size, 1);

  const invoiceId = "MZ-MAS-NO-STAFF-INVOICE";
  await db.doc(`bookings/${invoiceId}`).set({ code: invoiceId, branchId: "mashaya", source: "pos", status: "completed", paymentStatus: "unpaid", total: 43, items: [], itemIds: [], createdAt: Timestamp.now() });
  await allowed("updateBooking", "managerMashaya", { id: invoiceId, action: "markPaid", paymentMethod: "instapay" });
  const invoiceLedger = (await db.doc(`revenueLedger/payment_${invoiceId}`).get()).data();
  assert.equal(invoiceLedger.amount, 43);
  assert.equal(invoiceLedger.paymentMethod, "instapay");
  assert.equal(Object.hasOwn(invoiceLedger, "staffId"), false);

  const staffedId = "MZ-MAS-STAFF-INVOICE";
  await db.doc(`bookings/${staffedId}`).set({ code: staffedId, branchId: "mashaya", staffId: "mashaya-staff", source: "pos", status: "completed", paymentStatus: "unpaid", total: 47, items: [], itemIds: [], createdAt: Timestamp.now() });
  await allowed("updateBooking", "managerMashaya", { id: staffedId, action: "markPaid", paymentMethod: "card" });
  assert.equal((await db.doc(`revenueLedger/payment_${staffedId}`).get()).data().staffId, "mashaya-staff");
});

test("V9.2 addendum cashier reports are read only and previous shift list is self-scoped", async () => {
  const own = await allowed("getCashOperations", "cashierTalkha", { branchId: "talkha", includeReports: true });
  assert.ok(own.recentReports.some(item => item.shiftId === own.state.lastClosedShiftId));
  assert.ok(own.recentReports.every(item => item.branchId === "talkha"));
  await denied("getCashOperations", "cashierMashaya", { branchId: "talkha", includeReports: true });
  await denied("getBusinessReport", "cashierTalkha", { type: "daily", branchId: "mashaya", periodKey: today });
  await denied("rebuildBusinessReport", "cashierTalkha", { type: "daily", branchId: "talkha", periodKey: today });
});

test("V9.2 addendum password audit acknowledges only the authenticated self", async () => {
  await allowed("recordPasswordChange", "cashierTalkha", { uid: "cashierMashaya", password: "ignored" });
  const events = await db.collection("activityLogs").where("actorUid", "==", "cashierTalkha").get();
  const event = events.docs.map(item => item.data()).find(item => item.action === "password-change-client-confirmed");
  assert.equal(event.entityId, "cashierTalkha");
  assert.equal(event.branchId, "talkha");
  assert.equal(JSON.stringify(event).includes(password), false);
  await denied("getAuditEvents", "cashierTalkha", { actorUid: "cashierMashaya" });
});
