export const hasBranchScope = (item, allowGlobalDrink = false) => (allowGlobalDrink && item?.branchId === "all") || (Array.isArray(item?.branchIds) && item.branchIds.length > 0);

export const availableAtBranch = (item, branchId, allowGlobalDrink = false) => Boolean(branchId && ((allowGlobalDrink && item?.branchId === "all") || (Array.isArray(item?.branchIds) && item.branchIds.includes(branchId))));
