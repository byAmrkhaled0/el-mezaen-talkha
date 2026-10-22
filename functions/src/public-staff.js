// Explicit owner-approved public staff contract. Unknown fields stay private.
const strings = ['nameAr','nameEn','specialtyAr','specialtyEn','bioAr','bioEn','imageUrl'];
const flags = ['active','available','catalogVisible','published'];
export function publicStaff(snapshot) {
  const data = snapshot.data();
  const result = {id: snapshot.id};
  for (const key of strings) if (typeof data[key] === 'string') result[key] = data[key];
  for (const key of flags) if (key in data) result[key] = typeof data[key] === 'boolean' ? data[key] : false;
  // Preserve the existing publicSubset status gate without publishing an extra field.
  if (data.status && !['active','published','available','scheduled'].includes(data.status)) result.published = false;
  // Malformed branch/service scopes fail closed instead of widening eligibility.
  result.branchIds = Array.isArray(data.branchIds) && data.branchIds.every(x => typeof x === 'string') ? [...data.branchIds] : [];
  if (data.serviceIds != null && (!Array.isArray(data.serviceIds) || !data.serviceIds.every(x => typeof x === 'string'))) result.available = false;
  else if (Array.isArray(data.serviceIds)) result.serviceIds = [...data.serviceIds];
  if (typeof data.sortOrder === 'number' && Number.isFinite(data.sortOrder)) result.sortOrder = data.sortOrder;
  return result;
}
