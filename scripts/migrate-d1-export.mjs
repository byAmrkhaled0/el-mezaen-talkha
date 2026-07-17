import { readFile } from "node:fs/promises";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const input = process.argv[2];
const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
if (!input || !projectId) throw new Error("Usage: FIREBASE_PROJECT_ID=... node scripts/migrate-d1-export.mjs d1-export.json");
const source = JSON.parse(await readFile(input, "utf8"));
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const mappings = {
  services: row => ({ id: row.id, data: { nameAr: row.name, nameEn: row.name_en || row.name, categoryId: row.category_id || row.category || "uncategorized", duration: Number(row.duration || 0), price: Number(row.price || 0), startsFrom: Boolean(row.starts_from), type: row.type || "service", active: row.active !== 0, sortOrder: Number(row.sort_order || 0) } }),
  packages: row => ({ id: row.id, data: { nameAr: row.name, nameEn: row.name_en || row.name, descriptionAr: row.description || "", descriptionEn: row.description_en || "", duration: Number(row.duration || 0), price: Number(row.price || 0), originalPrice: Number(row.original_price || row.price || 0), active: row.active !== 0, status: row.status || "active" } }),
  staff: row => ({ id: row.id, data: { nameAr: row.name, nameEn: row.name_en || row.name, specialtyAr: row.role || "", specialtyEn: row.role_en || "", imageUrl: row.image_url || "", active: row.active !== 0, available: row.available !== 0 } }),
  bookings: row => ({ id: row.code || String(row.id), data: { code: row.code, customerName: row.customer_name, phone: row.phone, serviceNamesAr: String(row.service_name || "").split(" + "), staffNameAr: row.staff_name, bookingDate: row.booking_date, bookingTime: row.booking_time, total: Number(row.total || 0), status: row.status || "pending", paymentStatus: row.payment_status || "unpaid", note: row.notes || "", migratedFrom: "cloudflare-d1" } })
};

const writes = [];
for (const [collection, mapper] of Object.entries(mappings)) for (const row of source[collection] || []) {
  const mapped = mapper(row);
  if (mapped.id) writes.push({ ref: db.collection(collection).doc(String(mapped.id)), data: mapped.data });
}
for (let index = 0; index < writes.length; index += 400) {
  const batch = db.batch();
  writes.slice(index, index + 400).forEach(({ ref, data }) => batch.set(ref, { ...data, migratedAt: FieldValue.serverTimestamp() }, { merge: true }));
  await batch.commit();
}
console.log(`Migrated ${writes.length} D1 records in merge mode. Existing Firestore documents were not deleted.`);
