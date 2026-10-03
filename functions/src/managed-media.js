// Decode only URLs emitted by Firebase Storage for this project's bucket.
export function canonicalManagedStoragePath(value, bucketName) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password || url.port || !bucketName) return "";
    let encodedPath = "";
    if (url.hostname === "firebasestorage.googleapis.com") {
      const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (!match || decodeURIComponent(match[1]) !== bucketName) return "";
      encodedPath = match[2];
    } else if (url.hostname === "storage.googleapis.com") {
      const match = url.pathname.match(/^\/([^/]+)\/(.+)$/);
      if (!match || decodeURIComponent(match[1]) !== bucketName) return "";
      encodedPath = match[2];
    } else return "";
    const path = decodeURIComponent(encodedPath);
    if (path.split("/").some(segment => !segment || segment === "." || segment === ".." || /[\\\u0000-\u001f%]/.test(segment))) return "";
    return path;
  } catch { return ""; }
}

export function isOwnManagedStaffPhoto(value, bucketName, staffId) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(staffId || ""))) return false;
  const path = canonicalManagedStoragePath(value, bucketName);
  return path.startsWith(`public/staff/${staffId}/`)
    && /^[A-Za-z0-9._-]+\.(?:jpe?g|png|webp|avif)$/i.test(path.slice(`public/staff/${staffId}/`.length));
}
