import { availableAtBranch } from "./branch-availability.js";

export const activeBranch = (catalog, id) => (catalog.branches || []).find(branch => branch.id === id && branch.active !== false) || null;

const withinDates = (item, now) => {
  const start = item.startAt ? new Date(item.startAt).getTime() : -Infinity;
  const end = item.endAt ? new Date(item.endAt).getTime() : Infinity;
  return !Number.isNaN(start) && !Number.isNaN(end) && start <= now && now <= end;
};

export function publicSubset(items, branchId, { now = Date.now(), dated = false } = {}) {
  if (!branchId) return [];
  return (items || []).filter(item => item.active !== false && item.catalogVisible !== false && item.status !== "stopped" && item.status !== "expired" && availableAtBranch(item, branchId) && (!dated || withinDates(item, now)));
}

export function reconcileBranchCart(cart, catalog, branchId, now = Date.now()) {
  const index = new Map([...(catalog.services || []), ...(catalog.packages || []), ...(catalog.offers || []), ...(catalog.drinks || [])].map(item => [item.id, item]));
  const kept = (Array.isArray(cart) ? cart : []).filter(line => {
    const item = index.get(line.id);
    return item && item.active !== false && item.catalogVisible !== false && !["stopped", "expired"].includes(item.status) && withinDates(item, now) && (availableAtBranch(item, branchId) || item.kind === "drink" && item.branchId === "all");
  });
  return { kept, removed: (Array.isArray(cart) ? cart.length : 0) - kept.length };
}
