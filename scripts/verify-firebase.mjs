import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [firebaseJson, firestoreRules, storageRules, config, functionsSource, envExample] = await Promise.all([
  readFile("firebase.json", "utf8"),
  readFile("firestore.rules", "utf8"),
  readFile("storage.rules", "utf8"),
  readFile("public/firebase-config.js", "utf8"),
  readFile("functions/src/index.js", "utf8"),
  readFile("functions/.env.example", "utf8")
]);

const firebase = JSON.parse(firebaseJson);
assert.equal(firebase.functions[0].source, "functions");
assert.equal(firebase.firestore.rules, "firestore.rules");
assert.equal(firebase.firestore.indexes, "firestore.indexes.json");
assert.equal(firebase.storage.rules, "storage.rules");
assert.match(config, /projectId:\s*"el-mezaen-talkha"/);
assert.match(config, /__SITE_URL__\s*=\s*"https:\/\/el-mezaen-talkha\.vercel\.app"/);
assert.match(firestoreRules, /match \/\{document=\*\*\}/);
assert.doesNotMatch(firestoreRules, /allow\s+(?:read|write)(?:,\s*(?:read|write))*:\s*if\s+true/);
assert.match(storageRules, /request\.auth\.token\.role in \['admin', 'manager'\]/);
assert.match(storageRules, /request\.resource\.contentType\.matches/);
for (const name of ["getCatalog", "createBooking", "validateCoupon", "getAdminDashboard", "getBusinessDashboard", "recordExpense", "createPosOrder", "updateBooking", "adminUpsert", "adminDelete", "adminSecureDelete", "submitReview", "registerPushToken", "createAdminUser", "setUserRole", "notifyAdminsOnBooking"]) {
  assert.match(functionsSource, new RegExp(`export const ${name}\\b`), `Missing Firebase Function: ${name}`);
}
assert.match(envExample, /ENFORCE_APP_CHECK=false/);

const warnings = [];
if (/__VAPID_KEY__\s*=\s*""/.test(config)) warnings.push("VAPID Key ما زال فارغًا: إشعارات المتصفح لن تعمل قبل إضافته.");
if (/__APP_CHECK_SITE_KEY__\s*=\s*""/.test(config)) warnings.push("App Check Site Key ما زال فارغًا: لا تفعّل ENFORCE_APP_CHECK قبل إضافته واختباره.");

console.log("Firebase readiness passed: project config, Functions, Firestore Rules, Storage Rules and indexes are wired.");
warnings.forEach(message => console.warn(`تنبيه: ${message}`));
