import {withoutPublicTargetFields} from '../functions/src/public-target-fields.js';
import {publicStaff} from '../functions/src/public-staff.js';
export const PUBLIC_CATALOG_CACHE_KEY = 'mz-public-catalog-v6';
const LEGACY_KEYS = ['mz-public-catalog-v4','mz-public-catalog-v5'];
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export function projectCatalogStaff(data) {
  return {...data, branches:Array.isArray(data?.branches)?data.branches.map(withoutPublicTargetFields):[], staff: Array.isArray(data?.staff) ? data.staff.map(item => publicStaff({id:item.id,data:()=>item})) : []};
}
export function purgeLegacyCatalogCache(storage = globalThis.localStorage) {
  try { for(const key of LEGACY_KEYS)storage?.removeItem(key); } catch {}
}
export function readPublicCatalogCache(storage = globalThis.localStorage, now = Date.now()) {
  purgeLegacyCatalogCache(storage);
  try {
    const cached = JSON.parse(storage.getItem(PUBLIC_CATALOG_CACHE_KEY) || 'null');
    const savedAt = Number(cached?.savedAt);
    if (!cached?.data || !Number.isFinite(savedAt) || savedAt <= 0 || now - savedAt > MAX_AGE || savedAt > now) return null;
    return {...projectCatalogStaff(structuredClone(cached.data)), cachedAt:savedAt};
  } catch { return null; }
}
export function savePublicCatalogCache(data, storage = globalThis.localStorage, now = Date.now()) {
  purgeLegacyCatalogCache(storage);
  try { storage.setItem(PUBLIC_CATALOG_CACHE_KEY, JSON.stringify({savedAt:now,data:projectCatalogStaff(data)})); } catch {}
}
