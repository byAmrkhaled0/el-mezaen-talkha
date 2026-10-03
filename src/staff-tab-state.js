// Staff presentation preferences belong to the tab. Firebase Auth owns tokens.
export function saveStaffTabPreference(key, value, storage = globalThis.sessionStorage) {
  storage.setItem(key, String(value));
}
