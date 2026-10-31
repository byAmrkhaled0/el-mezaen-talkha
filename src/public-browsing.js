import {isPublicItem, publicSubset, packageEligible} from './public-branch.js';

// Browsing never chooses/persists a booking branch. Only already-public records
// belonging to an active branch are shown; checkout still uses strict branch rules.
export function browsingBranches(catalog) {
  return (catalog?.branches || []).filter(isPublicItem);
}
export function browsingSubset(items,catalog,options={}) {
  const ids=new Set(browsingBranches(catalog).flatMap(branch=>publicSubset(items,branch.id,options).map(item=>item.id)));
  return (items||[]).filter(item=>ids.has(item.id));
}
export function browsingPackageEligible(item,catalog,choices=null) {
  return browsingBranches(catalog).some(branch=>packageEligible(item,catalog,branch.id,choices));
}
