import { availableAtBranch } from "./branch-availability.js";

export const activeBranch = (catalog, id) => (catalog.branches || []).find(branch => branch.id === id && isPublicItem(branch)) || null;
export const isPublicItem = item => Boolean(item && item.active !== false && item.catalogVisible !== false && item.published !== false && (!item.status || ["active", "published", "available", "scheduled"].includes(item.status)));
const withinDates = (item, now) => {
  const start = item.startAt ? new Date(item.startAt).getTime() : -Infinity;
  const end = item.endAt ? new Date(item.endAt).getTime() : Infinity;
  return !Number.isNaN(start) && !Number.isNaN(end) && start <= now && now <= end;
};
export function publicSubset(items, branchId, { now = Date.now(), dated = false, includeUnavailable = false } = {}) {
  if (!branchId) return [];
  return (items || []).filter(item => isPublicItem(item) && (includeUnavailable || item.available !== false) && availableAtBranch(item, branchId) && (!dated || withinDates(item, now)));
}
export function packageEligible(item, catalog, branchId, choices = null, now = Date.now()) {
  if (!isPublicItem(item) || item.available === false || !availableAtBranch(item, branchId) || !withinDates(item, now) || item.demoBookable === false) return false;
  const services = new Map((catalog.services || []).map(row => [row.id, row]));
  const eligible = id => { const service = services.get(id); return isPublicItem(service) && service.available !== false && availableAtBranch(service, branchId) && withinDates(service, now); };
  return (item.includedServiceIds || []).every(eligible) && (item.choiceGroups || []).every(group => {
    const selected = choices?.[group.id];
    return selected ? (group.options || []).some(option => option.id === selected && eligible(option.serviceId))
      : group.required === false || (group.options || []).some(option => eligible(option.serviceId));
  });
}
export function reconcileBranchCart(cart, catalog, branchId, now = Date.now()) {
  const packages = new Set((catalog.packages || []).map(item => item.id));
  const drinks = new Set((catalog.drinks || []).map(item => item.id));
  const index = new Map([...(catalog.services || []), ...(catalog.packages || []), ...(catalog.offers || []), ...(catalog.drinks || [])].map(item => [item.id, item]));
  const kept = (Array.isArray(cart) ? cart : []).filter(line => {
    const item = index.get(line.id);
    return isPublicItem(item) && item.available !== false && withinDates(item, now) && (availableAtBranch(item, branchId, drinks.has(line.id))) && (!packages.has(line.id) || packageEligible(item, catalog, branchId, line.choices, now));
  });
  return { kept, removed: (Array.isArray(cart) ? cart.length : 0) - kept.length };
}
