import { readFile } from "node:fs/promises";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { newMashayaPackages } from "../../src/package-definitions.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
let failing = false;
const failCleanly = error => {
  if (failing) return;
  failing = true;
  console.error(JSON.stringify({ ok: false, mode: apply ? "APPLY" : "DRY_RUN", status: "EXTERNAL_ACTION_REQUIRED", message: "تعذر الاتصال بـ Firestore. شغّل السكربت من بيئة Firebase موثقة عبر GOOGLE_APPLICATION_CREDENTIALS أو gcloud ADC.", code: error?.code || "FIREBASE_CREDENTIALS_OR_NETWORK_UNAVAILABLE" }, null, 2));
  process.exit(2);
};
process.on("uncaughtException", failCleanly);
process.on("unhandledRejection", failCleanly);
const valueFor = name => {
  const inline = args.find(value => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
};
const projectId = valueFor("--project") || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "el-mezaen-talkha";
const branchMapPath = valueFor("--branch-map");
const validBranches = new Set(["talkha", "mashaya"]);
const verifiedBranchGeofences = {
  talkha: { latitude: 31.0520115, longitude: 31.3815616, attendanceRadiusMeters: 100, source: "verified-existing-google-maps-pin" },
  mashaya: { latitude: 31.0456639, longitude: 31.3670561, attendanceRadiusMeters: 100, source: "verified-existing-google-maps-pin" }
};

const normalizedName = value => String(value || "").trim().replace(/^ال/, "").replace(/\s+/g, " ").toLowerCase();
const cleanBranches = value => [...new Set((Array.isArray(value) ? value : []).map(item => String(item || "").trim().toLowerCase()).filter(item => validBranches.has(item)))];
const docs = snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() }));

let branchMap = { staff: {}, content: {} };
if (branchMapPath) {
  branchMap = JSON.parse(await readFile(branchMapPath, "utf8"));
  branchMap.staff ||= {};
  branchMap.content ||= {};
}
for (const [collection, entries] of Object.entries(branchMap)) {
  if (!['staff', 'content'].includes(collection) || !entries || typeof entries !== "object" || Array.isArray(entries)) throw new Error("INVALID_BRANCH_MAP");
  for (const [id, branchIds] of Object.entries(entries)) {
    if (!Array.isArray(branchIds)) throw new Error(`INVALID_BRANCH_MAP_ENTRY:${collection}/${id}`);
    const normalized = cleanBranches(branchIds);
    if (!id || !normalized.length || normalized.length !== new Set(branchIds).size) throw new Error(`INVALID_BRANCH_MAP_ENTRY:${collection}/${id}`);
  }
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const [staffSnapshot, contentSnapshot, servicesSnapshot, packagesSnapshot, branchesSnapshot] = await Promise.all([
  db.collection("staff").limit(500).get(),
  db.collection("content").limit(1000).get(),
  db.collection("services").limit(1000).get(),
  db.collection("packages").limit(500).get(),
  db.collection("branches").limit(20).get()
]);
const staff = docs(staffSnapshot);
const content = docs(contentSnapshot);
const services = docs(servicesSnapshot);
const packages = docs(packagesSnapshot);
const branches = docs(branchesSnapshot);
const servicesById = new Map(services.map(item => [item.id, item]));
const packageReferenceReport = newMashayaPackages.map(definition => {
  const requiredIds = [...new Set([
    ...(definition.includedServiceIds || []),
    ...(definition.choiceGroups || []).flatMap(group => group.options || []).map(option => option.serviceId)
  ])];
  const unresolved = requiredIds.filter(id => !servicesById.has(id) || servicesById.get(id)?.active === false);
  return { id: definition.id, requiredServiceIds: requiredIds, unresolved };
});
const resolvablePackageIds = new Set(packageReferenceReport.filter(item => !item.unresolved.length).map(item => item.id));
const requiredContractKeys = ["price", "originalPrice", "branchIds", "includedServiceIds", "includedItemsAr", "includedItemsEn", "choiceGroups", "termsAr", "promotionMode", "maximumAutomaticApplications", "phone", "status", "active"];
const packageDiff = (existing, definition) => requiredContractKeys.flatMap(field => JSON.stringify(existing?.[field] ?? null) === JSON.stringify(definition[field] ?? null) ? [] : [{ field, current: existing?.[field] ?? null, required: definition[field] ?? null }]);
const existingByCollection = { staff: new Set(staff.map(item => item.id)), content: new Set(content.map(item => item.id)) };
for (const [collection, entries] of Object.entries(branchMap)) for (const id of Object.keys(entries)) if (!existingByCollection[collection].has(id)) throw new Error(`UNKNOWN_BRANCH_MAP_ID:${collection}/${id}`);

const duplicateGroups = [...services.reduce((groups, item) => {
  const key = `${normalizedName(item.nameAr)}|${item.categoryId || ""}|${cleanBranches(item.branchIds).sort().join(",") || "legacy-all"}`;
  groups.set(key, [...(groups.get(key) || []), item]);
  return groups;
}, new Map()).values()].filter(group => group.length > 1).map(group => group.map(item => ({ id: item.id, nameAr: item.nameAr, price: item.price, categoryId: item.categoryId })));

const safeContentBranchUpdates = content.filter(item => !cleanBranches(item.branchIds).length && validBranches.has(String(item.branchId || "").toLowerCase())).map(item => ({ id: item.id, branchIds: [String(item.branchId).toLowerCase()], source: "existing-branchId" }));
const unresolvedContent = content.filter(item => !cleanBranches(item.branchIds).length && !validBranches.has(String(item.branchId || "").toLowerCase())).map(item => ({ id: item.id, type: item.type || "unknown", titleAr: item.titleAr || "", status: "needs-branch-decision" }));
const workerReport = staff.map(item => ({ id: item.id, nameAr: item.nameAr || "", branchIds: cleanBranches(item.branchIds), mappedBranchIds: cleanBranches(branchMap.staff?.[item.id]), status: cleanBranches(branchMap.staff?.[item.id]).length ? "mapped" : cleanBranches(item.branchIds).length ? "current-value-needs-owner-confirmation" : "needs-branch-decision" }));

const servicePatches = {
  "hair-005": { nameAr: "استشوار شعر (يبدأ من)", descriptionAr: "استشوار للشعر الطبيعي؛ السعر يبدأ من القيمة الظاهرة حسب الطول والكثافة." },
  "service-006": { nameAr: "استشوار شبكية – سيرفيس", descriptionAr: "استشوار مخصص للشبكية ضمن خدمات السيرفيس." },
  "service-007": { nameAr: "تركيب جديد – فئة 4900", descriptionAr: "تركيب جديد بسعر الفئة المسجلة 4900 جنيه." },
  "service-012": { nameAr: "تركيب جديد – فئة 3450", descriptionAr: "تركيب جديد بسعر الفئة المسجلة 3450 جنيه." },
  "service-013": { nameAr: "تركيب جديد – فئة 3500", descriptionAr: "تركيب جديد بسعر الفئة المسجلة 3500 جنيه." },
  "service-016": { nameAr: "تركيب جديد – فئة 7500", descriptionAr: "تركيب جديد بسعر الفئة المسجلة 7500 جنيه." },
  "service-017": { nameAr: "تركيب جديد – فئة 2850", descriptionAr: "تركيب جديد بسعر الفئة المسجلة 2850 جنيه." }
};

const report = {
  mode: apply ? "APPLY" : "DRY_RUN",
  projectId,
  counts: { staff: staff.length, content: content.length, services: services.length, packagesBefore: packages.length, branches: branches.length },
  branchGeofences: Object.entries(verifiedBranchGeofences).map(([id, geofence]) => {
    const current = branches.find(item => item.id === id) || {};
    const hasValidCoordinates = Number.isFinite(Number(current.latitude)) && Number.isFinite(Number(current.longitude)) && Math.abs(Number(current.latitude)) <= 90 && Math.abs(Number(current.longitude)) <= 180 && (Math.abs(Number(current.latitude)) > 0.001 || Math.abs(Number(current.longitude)) > 0.001);
    return { id, action: hasValidCoordinates ? "preserve-existing-valid-coordinates" : "add-verified-coordinates", ...geofence };
  }),
  packages: newMashayaPackages.map(item => {
    const existing = packages.find(value => value.id === item.id);
    const referenceState = packageReferenceReport.find(value => value.id === item.id);
    const differences = existing ? packageDiff(existing, item) : [];
    return {
      id: item.id,
      action: referenceState.unresolved.length ? "skip-unresolved-services" : !existing ? "create" : differences.length ? "merge-required-contract-preserve-admin-name-image-duration" : "preserve-existing-complete",
      branchIds: item.branchIds,
      price: item.price,
      originalPrice: item.originalPrice,
      differences,
      unresolvedServiceIds: referenceState.unresolved
    };
  }),
  workers: workerReport,
  content: { safeUpdates: safeContentBranchUpdates, mappedUpdates: Object.keys(branchMap.content || {}), unresolved: unresolvedContent },
  duplicateServices: duplicateGroups,
  safeServicePatches: Object.keys(servicePatches).filter(id => services.some(item => item.id === id)),
  warnings: [
    "No worker branch is guessed; provide --branch-map with owner-approved assignments.",
    "Content without branchIds or a valid existing branchId remains unchanged and is reported for review.",
    "No records are deleted and no booking, ledger, customer or historical receipt collection is touched."
  ]
};

if (apply) {
  const batch = db.batch();
  const existingPackages = new Map(packages.map(item => [item.id, item]));
  for (const definition of newMashayaPackages) {
    if (!resolvablePackageIds.has(definition.id)) continue;
    const existing = existingPackages.get(definition.id) || {};
    batch.set(db.doc(`packages/${definition.id}`), {
      ...definition,
      nameAr: existing.nameAr || definition.nameAr,
      nameEn: existing.nameEn || definition.nameEn,
      descriptionAr: existing.descriptionAr || definition.descriptionAr,
      descriptionEn: existing.descriptionEn || definition.descriptionEn,
      imageUrl: existing.imageUrl || definition.imageUrl,
      duration: Number(existing.duration) > 0 ? Number(existing.duration) : definition.duration,
      createdAt: existing.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  for (const [id, geofence] of Object.entries(verifiedBranchGeofences)) {
    const current = branches.find(item => item.id === id) || {};
    const hasValidCoordinates = Number.isFinite(Number(current.latitude)) && Number.isFinite(Number(current.longitude)) && Math.abs(Number(current.latitude)) <= 90 && Math.abs(Number(current.longitude)) <= 180 && (Math.abs(Number(current.latitude)) > 0.001 || Math.abs(Number(current.longitude)) > 0.001);
    batch.set(db.doc(`branches/${id}`), hasValidCoordinates ? {
      attendanceRadiusMeters: Number(current.attendanceRadiusMeters) >= 25 && Number(current.attendanceRadiusMeters) <= 1000 ? Number(current.attendanceRadiusMeters) : geofence.attendanceRadiusMeters,
      updatedAt: FieldValue.serverTimestamp()
    } : {
      latitude: geofence.latitude,
      longitude: geofence.longitude,
      attendanceRadiusMeters: geofence.attendanceRadiusMeters,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  for (const update of safeContentBranchUpdates) batch.set(db.doc(`content/${update.id}`), { branchIds: update.branchIds, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  for (const [collection, entries] of Object.entries(branchMap)) for (const [id, branchIds] of Object.entries(entries)) batch.set(db.doc(`${collection}/${id}`), { branchIds: cleanBranches(branchIds), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  for (const [id, patch] of Object.entries(servicePatches)) {
    const existing = services.find(item => item.id === id);
    if (!existing) continue;
    batch.set(db.doc(`services/${id}`), {
      ...(normalizedName(existing.nameAr) === normalizedName("تركيب جديد") || id === "hair-005" || id === "service-006" ? { nameAr: patch.nameAr, nameEn: existing.nameEn || patch.nameAr } : {}),
      descriptionAr: existing.descriptionAr || patch.descriptionAr,
      descriptionEn: existing.descriptionEn || existing.nameEn || patch.descriptionAr,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  if (services.some(item => item.id === "hair-028")) batch.set(db.doc("services/hair-028"), { duplicateOf: "hair-010", catalogVisible: false, descriptionAr: "سجل قديم مطابق لخدمة كيرلي كريم؛ محفوظ للتوافق مع الحجوزات السابقة ولا يظهر ككارت جديد.", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(db.doc("categories/beard"), { nameAr: "حلاقة الدقن", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(db.collection("activityLogs").doc(), { action: "safe-catalog-migration", mode: "idempotent", projectId, packageIds: newMashayaPackages.map(item => item.id), appliedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  report.applied = true;
}

console.log(JSON.stringify(report, null, 2));
