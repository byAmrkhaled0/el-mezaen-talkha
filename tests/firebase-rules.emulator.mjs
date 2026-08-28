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

const PROJECT_ID = "el-mezaen-rules-test";
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

test("Storage permits authorized manager and admin media uploads", async () => {
  const manager = auth("manager-1", { role: "manager", permissions: ["gallery"] }).storage();
  const resultsManager = auth("manager-results", { role: "manager", permissions: ["results"] }).storage();
  const hairManager = auth("manager-hair", { role: "manager", permissions: ["hairMedia"] }).storage();
  const admin = auth("admin-1", { role: "admin" }).storage();
  await assertSucceeds(uploadBytes(ref(manager, "public/manager.webp"), image(), { contentType: "image/webp" }));
  await assertSucceeds(uploadBytes(ref(resultsManager, "public/results/before-after.webp"), image(), { contentType: "image/webp" }));
  await assertSucceeds(uploadBytes(ref(hairManager, "public/hair/video.mp4"), image(), { contentType: "video/mp4" }));
  await assertSucceeds(uploadBytes(ref(admin, "public/admin.mp4"), image(), { contentType: "video/mp4" }));
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
