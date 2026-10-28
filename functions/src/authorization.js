// Shared role contract used by callable authorization and the admin permission picker.
export const ALL_PERMISSIONS = ["dashboard", "pos", "bookings", "attendance", "tasks", "teamOperations", "revenue", "refundTransactions", "expenses", "inventory", "drinks", "payroll", "services", "packages", "offers", "coupons", "staff", "customers", "rewards", "campaigns", "reviews", "schedule", "gallery", "results", "hairMedia", "celebrities", "posts", "faqs", "settings", "activity", "users", "sharedCatalog", "siteMedia"];
export const BRANCH_OPERATION_PERMISSIONS=Object.freeze(["dashboard","pos","bookings","attendance","tasks","teamOperations","revenue","refundTransactions","expenses","inventory","drinks","payroll","staff","customers","rewards","schedule"]);
export const MEDIA_PERMISSIONS=Object.freeze(["siteMedia","offers","campaigns","gallery","results","hairMedia","celebrities","posts","faqs","reviews"]);
export function canManageSharedCatalog(role,permissions,collection){return ['services','packages'].includes(collection)&&(role==='admin'||role==='manager'&&(permissions instanceof Set?permissions.has('sharedCatalog'):permissions?.includes('sharedCatalog')));}
export const ROLE_CAPABILITY_CEILINGS = Object.freeze({
  admin: ALL_PERMISSIONS,
  manager: ["sharedCatalog", "teamOperations", "refundTransactions", "dashboard", "pos", "bookings", "attendance", "tasks", "revenue", "expenses", "inventory", "drinks", "payroll", "services", "packages", "offers", "coupons", "staff", "customers", "rewards", "campaigns", "reviews", "schedule", "gallery", "results", "hairMedia", "celebrities", "posts", "faqs"],
  cashier: ["dashboard", "pos", "bookings", "teamOperations", "expenses", "refundTransactions", "offers", "campaigns", "gallery", "results", "hairMedia", "celebrities", "posts"],
  media: MEDIA_PERMISSIONS,
  worker: ["attendance", "tasks"]
});
export const ROLE_DEFAULT_PERMISSIONS = Object.freeze({
  manager: BRANCH_OPERATION_PERMISSIONS,
  media: MEDIA_PERMISSIONS,
  cashier: ["dashboard", "pos", "bookings", "teamOperations"],
  worker: ROLE_CAPABILITY_CEILINGS.worker
});
export function effectivePermissions(role, claimed) {
  const ceiling = ROLE_CAPABILITY_CEILINGS[role] || [];
  if (role === "admin") return new Set(ceiling);
  const values = Array.isArray(claimed) ? claimed : ROLE_DEFAULT_PERMISSIONS[role] || [];
  const permissions = new Set(values.filter(value => ceiling.includes(value)));
  // Existing cashier claims inherit the operational team baseline, never admin attendance/tasks.
  if (role === "cashier") permissions.add("teamOperations");
  return permissions;
}
export function branchAllowed(role, branchIds, resourceBranchId) {
  return role === "admin" || Boolean(resourceBranchId && Array.isArray(branchIds) && branchIds.includes(resourceBranchId));
}
export function allResourceBranchesAllowed(role, branchIds, resource) {
  if (role === "admin") return true;
  const ids = [...new Set([...(Array.isArray(resource?.branchIds) ? resource.branchIds : []), resource?.branchId].filter(Boolean))];
  return ids.length > 0 && ids.every(id => branchAllowed(role, branchIds, id));
}
