import test, { after, before } from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
} from "firebase/storage";

const PROJECT_ID = "demo-el-mezaen-rules";
if (!PROJECT_ID.startsWith("demo-") || (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT_ID) || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error("Rules tests require the exact demo project and local Firestore/Storage emulators");
}
let rules;

const auth = (uid, claims = {}) => rules.authenticatedContext(uid, claims);
const image = (size = 16) => new Uint8Array(size);

before(async () => {
  rules = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: await readFile("firestore.rules", "utf8") },
    storage: { rules: await readFile("storage.rules", "utf8") },
  });

  await rules.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/customer-1"), {
      name: "عميل الاختبار",
    });
    await setDoc(doc(context.firestore(), "users/customer-2"), { name: "عميل آخر" });
    for (const branchId of ["talkha", "mashaya"]) {
      await setDoc(doc(context.firestore(), `bookings/${branchId}-booking`), { branchId, phoneHash: "customer-1" });
      await setDoc(doc(context.firestore(), `cashShifts/${branchId}-shift`), { branchId, status: "OPEN" });
      await setDoc(doc(context.firestore(), `revenueLedger/${branchId}-revenue`), { branchId, amount: 100 });
      await setDoc(doc(context.firestore(), `expenses/${branchId}-expense`), { branchId, amount: 10 });
      await setDoc(doc(context.firestore(), `branches/${branchId}`), { branchId, monthlyRevenueTargets: { "2026-09": { targetAmount: 100 } } });
    }
    await setDoc(doc(context.firestore(), "bookings/legacy-no-branch"), { phoneHash: "customer-1" });
    await uploadBytes(
      ref(context.storage(), "public/existing.webp"),
      image(),
      { contentType: "image/webp" },
    );
    await uploadBytes(
      ref(context.storage(), "private/secret.webp"),
      image(),
      { contentType: "image/webp" },
    );
  });
});

after(async () => {
  await rules?.cleanup();
});

test("Firestore lets customers read only their own profile", async () => {
  const customerDb = auth("customer-1", { role: "customer" }).firestore();
  await assertSucceeds(getDoc(doc(customerDb, "users/customer-1")));
  await assertFails(getDoc(doc(customerDb, "users/customer-2")));
  await assertFails(getDocs(collection(customerDb, "users")));
});

test("Firestore denies direct writes to customer and financial data", async () => {
  const customerDb = auth("customer-1", { role: "customer" }).firestore();
  const adminDb = auth("admin-1", { role: "admin" }).firestore();
  await assertFails(updateDoc(doc(customerDb, "users/customer-1"), { points: 999 }));
  await assertFails(setDoc(doc(adminDb, "walletTransactions/tx-1"), { amount: 999 }));
  await assertFails(setDoc(doc(adminDb, "orders/order-1"), { total: 1 }));
  await assertFails(setDoc(doc(adminDb, "serviceTargets/2026-08_mashaya_service_hair-001"), { targetCount: 1_000_000, achievedCount: 1_000_000 }));
  await assertFails(setDoc(doc(adminDb, "attendanceDays/2026-08-27_worker-1"), { status: "PRESENT" }));
  await assertFails(setDoc(doc(adminDb, "workerTasks/task-1"), { status: "DONE" }));
  await assertFails(setDoc(doc(adminDb, "workerNotifications/notice-1"), { read: true }));
});

for (const [role, branchId] of [["cashier", "talkha"], ["cashier", "mashaya"], ["manager", "talkha"], ["manager", "mashaya"], ["worker", "talkha"], ["worker", "mashaya"]]) {
  test(`Firestore direct access denies ${role} ${branchId} operational reads and writes`, async () => {
    const direct = auth(`${role}-${branchId}`, { role, branchIds: [branchId], permissions: ["dashboard", "pos", "bookings", "customers", "users"] }).firestore();
    const other = branchId === "talkha" ? "mashaya" : "talkha";
    for (const collectionName of ["bookings", "cashShifts", "revenueLedger", "expenses"]) {
      const suffix = { bookings: "booking", cashShifts: "shift", revenueLedger: "revenue", expenses: "expense" }[collectionName];
      await assertFails(getDoc(doc(direct, `${collectionName}/${branchId}-${suffix}`)));
      await assertFails(getDoc(doc(direct, `${collectionName}/${other}-${suffix}`)));
      await assertFails(setDoc(doc(direct, `${collectionName}/${other}-new`), { branchId: other }));
    }
    await assertFails(getDoc(doc(direct, `branches/${other}`)));
    await assertFails(getDoc(doc(direct, "bookings/legacy-no-branch")));
  });
}

test("Customer and admin cannot bypass protected direct document rules", async () => {
  for (const context of [auth("customer-1", { role: "customer" }), auth("customer-2", { role: "customer" }), auth("admin-1", { role: "admin" })]) {
    const direct = context.firestore();
    await assertFails(getDoc(doc(direct, "bookings/talkha-booking")));
    await assertFails(getDoc(doc(direct, "bookings/mashaya-booking")));
    await assertFails(getDoc(doc(direct, "bookings/legacy-no-branch")));
    await assertFails(setDoc(doc(direct, "bookings/direct-write"), { branchId: "talkha" }));
  }
  await assertSucceeds(getDoc(doc(auth("customer-2", { role: "customer" }).firestore(), "users/customer-2")));
  await assertFails(getDoc(doc(auth("customer-2", { role: "customer" }).firestore(), "users/customer-1")));
});

test("V7 report and audit documents stay server-only for every role", async () => {
  for (const role of ["admin", "manager", "cashier", "worker", "customer"]) {
    const direct = auth(`v7-${role}`, { role, branchIds: ["talkha"] }).firestore();
    for (const path of ["businessReports/daily_talkha_2026-09-27", "cashShifts/talkha-shift", "activityLogs/event-1"]) {
      await assertFails(getDoc(doc(direct, path)));
      await assertFails(setDoc(doc(direct, path), { branchId: "talkha", totals: { netRevenue: 999 } }));
    }
  }
});

test("Storage public media is readable but private files are denied", async () => {
  const storage = rules.unauthenticatedContext().storage();
  await assertSucceeds(getBytes(ref(storage, "public/existing.webp")));
  await assertFails(getBytes(ref(storage, "private/secret.webp")));
});

test("Storage denies anonymous and cashier uploads", async () => {
  const anonymous = rules.unauthenticatedContext().storage();
  const cashier = auth("cashier-1", { role: "cashier" }).storage();
  await assertFails(uploadBytes(ref(anonymous, "public/anonymous.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(cashier, "public/cashier.webp"), image(), { contentType: "image/webp" }));
});

test("Storage restricts generic paths and staff media to admin, with scoped content grants", async () => {
  const manager = auth("manager-1", { role: "manager", permissions: ["gallery"], branchIds: ["talkha"] }).storage();
  const resultsManager = auth("manager-results", { role: "manager", permissions: ["results"], branchIds: ["talkha"] }).storage();
  const hairManager = auth("manager-hair", { role: "manager", permissions: ["hairMedia"], branchIds: ["mashaya"] }).storage();
  const cashier = auth("cashier-gallery", { role: "cashier", permissions: ["gallery"], branchIds: ["talkha"] }).storage();
  const admin = auth("admin-1", { role: "admin" }).storage();
  await assertFails(uploadBytes(ref(manager, "public/manager.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(manager, "public/random-folder/photo.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(cashier, "public/random-folder/photo.webp"), image(), { contentType: "image/webp" }));
  await assertSucceeds(uploadBytes(ref(admin, "public/staff/worker-1/profile.webp"), image(), { contentType: "image/webp" }));
  await assertSucceeds(uploadBytes(ref(admin, "public/content/gallery/mashaya/photo.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(manager, "public/staff/worker-1/profile.webp"), image(), { contentType: "image/webp" }));
  await assertFails(deleteObject(ref(manager, "public/staff/worker-1/profile.webp")));
  await assertFails(uploadBytes(ref(manager, "public/content/gallery/mashaya/photo.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(cashier, "public/content/gallery/mashaya/photo.webp"), image(), { contentType: "image/webp" }));
  await assertSucceeds(uploadBytes(ref(manager, "public/content/gallery/talkha/photo.webp"), image(), { contentType: "image/webp" }));
  await assertFails(deleteObject(ref(cashier, "public/content/gallery/mashaya/photo.webp")));
  await assertFails(deleteObject(ref(manager, "public/content/gallery/mashaya/photo.webp")));
  await assertSucceeds(uploadBytes(ref(resultsManager, "public/content/result/talkha/before-after.webp"), image(), { contentType: "image/webp" }));
  await assertSucceeds(uploadBytes(ref(hairManager, "public/content/hair-system/mashaya/videos/video.mp4"), image(), { contentType: "video/mp4" }));
  await assertSucceeds(uploadBytes(ref(admin, "public/admin.mp4"), image(), { contentType: "video/mp4" }));
});

test("V8 optional offer images are limited to granted role and allowed branch", async () => {
  const cashier = auth("cashier-offers", { role: "cashier", permissions: ["offers"], branchIds: ["mashaya"] }).storage();
  const withoutGrant = auth("cashier-no-offers", { role: "cashier", permissions: ["pos"], branchIds: ["mashaya"] }).storage();
  const mediaManager = auth("gallery-no-offers", { role: "manager", permissions: ["gallery"], branchIds: ["mashaya"] }).storage();
  const admin = auth("offer-admin", { role: "admin" }).storage();
  await assertSucceeds(uploadBytes(ref(cashier, "public/offers/mashaya/offer.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(cashier, "public/offers/talkha/offer.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(withoutGrant, "public/offers/mashaya/offer.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(cashier, "public/offers/mashaya/script.svg"), image(), { contentType: "image/svg+xml" }));
  await assertFails(uploadBytes(ref(mediaManager, "public/offers/talkha/bypass.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(admin, "public/offers/all/video.mp4"), image(), { contentType: "video/mp4" }));
});

test("V9.4 content uploads require matching content grant and branch, including videos", async () => {
  const cashier = auth("content-cashier", { role: "cashier", permissions: ["gallery"], branchIds: ["talkha"] }).storage();
  const manager = auth("content-manager", { role: "manager", permissions: ["hairMedia"], branchIds: ["mashaya"] }).storage();
  const ordinary = auth("ordinary-cashier", { role: "cashier", permissions: ["pos"], branchIds: ["talkha"] }).storage();
  const admin = auth("content-admin", { role: "admin" }).storage();
  await assertSucceeds(uploadBytes(ref(cashier, "public/content/gallery/talkha/photo.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(cashier, "public/content/gallery/mashaya/photo.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(cashier, "public/content/result/talkha/photo.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(cashier, "public/content/gallery/all/photo.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(cashier, "public/content/legacy.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(ordinary, "public/content/gallery/talkha/photo.webp"), image(), { contentType: "image/webp" }));
  await assertSucceeds(uploadBytes(ref(manager, "public/content/hair-system/mashaya/videos/clip.mp4"), image(), { contentType: "video/mp4" }));
  await assertFails(uploadBytes(ref(manager, "public/content/hair-system/talkha/videos/clip.mp4"), image(), { contentType: "video/mp4" }));
  await assertFails(uploadBytes(ref(manager, "public/content/hair-system/mashaya/photo.mp4"), image(), { contentType: "video/mp4" }));
  await assertFails(uploadBytes(ref(manager, "public/content/hair-system/mashaya/videos/photo.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(manager, "public/content/hair-system/mashaya/videos/large.mp4"), image(30 * 1024 * 1024), { contentType: "video/mp4" }));
  await assertSucceeds(uploadBytes(ref(admin, "public/content/result/talkha/after.webp"), image(), { contentType: "image/webp" }));
});

test("Storage permits a worker to update only their own validated profile photo", async () => {
  const worker = auth("worker-uid", { role: "worker", staffId: "worker-1" }).storage();
  await assertSucceeds(uploadBytes(ref(worker, "public/staff/worker-1/profile.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(worker, "public/staff/worker-2/profile.webp"), image(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(worker, "public/staff/worker-1/profile.html"), image(), { contentType: "text/html" }));
  await assertFails(deleteObject(ref(worker, "public/staff/worker-1/profile.webp")));
});

test("Storage rejects invalid MIME and oversized images", async () => {
  const admin = auth("admin-1", { role: "admin" }).storage();
  await assertFails(uploadBytes(ref(admin, "public/script.html"), image(), { contentType: "text/html" }));
  await assertFails(uploadBytes(ref(admin, "public/large.webp"), image(5 * 1024 * 1024), { contentType: "image/webp" }));
});

test("Storage allows authorized delete and denies cashier delete", async () => {
  const admin = auth("admin-1", { role: "admin" }).storage();
  const cashier = auth("cashier-1", { role: "cashier" }).storage();
  await assertFails(deleteObject(ref(cashier, "public/existing.webp")));
  await assertSucceeds(deleteObject(ref(admin, "public/existing.webp")));
});
