import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { collectionsForSeed, seedCatalog } from "../src/seed-data.js";

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("Set FIREBASE_PROJECT_ID or GCLOUD_PROJECT first.");
initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { credential: applicationDefault(), projectId });
const db = getFirestore();

let writes = [];
for (const [collection, items] of Object.entries(collectionsForSeed)) {
  for (const item of items) {
    const { id, ...data } = item;
    writes.push({ ref: db.collection(collection).doc(id), data });
  }
}
writes.push({ ref: db.doc("settings/public"), data: seedCatalog.settings });

for (let index = 0; index < writes.length; index += 400) {
  const batch = db.batch();
  writes.slice(index, index + 400).forEach(({ ref, data }) => batch.set(ref, { ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
  await batch.commit();
}
console.log(`Seeded ${writes.length} documents with merge mode; no existing documents were deleted.`);
