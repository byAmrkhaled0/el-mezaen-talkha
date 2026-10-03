// Shared role contract used by callable authorization and the admin permission picker.
export const ALL_PERMISSIONS = ["dashboard", "pos", "bookings", "attendance", "tasks", "teamOperations", "revenue", "refundTransactions", "expenses", "inventory", "drinks", "payroll", "services", "packages", "offers", "coupons", "staff", "customers", "rewards", "campaigns", "reviews", "schedule", "gallery", "results", "hairMedia", "celebrities", "posts", "faqs", "settings", "activity", "users"];
export const ROLE_CAPABILITY_CEILINGS = Object.freeze({
  admin: ALL_PERMISSIONS,
  manager: ["dashboard", "pos", "bookings", "attendance", "tasks", "revenue", "expenses", "inventory", "drinks", "payroll", "services", "packages", "offers", "coupons", "staff", "customers", "rewards", "campaigns", "reviews", "schedule", "gallery", "results", "hairMedia", "celebrities", "posts", "faqs"],
  cashier: ["dashboard", "pos", "bookings", "teamOperations", "expenses", "refundTransactions", "offers", "campaigns", "gallery", "results", "hairMedia", "celebrities", "posts"],
  worker: ["attendance", "tasks"]
});
export const ROLE_DEFAULT_PERMISSIONS = Object.freeze({
  manager: ROLE_CAPABILITY_CEILINGS.manager.filter(value => value !== "campaigns"),
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
