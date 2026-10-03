import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { canonicalManagedStoragePath, isOwnManagedStaffPhoto } from "../functions/src/managed-media.js";
import { isApprovedVideoEmbed, safeMediaUrl, videoSource } from "../src/media.js";
import { branchAllowed, effectivePermissions } from "../functions/src/authorization.js";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const bucket = "el-mezaen.appspot.com";
const photo = (path, host = "firebasestorage.googleapis.com", name = bucket) => `https://${host}/v0/b/${name}/o/${encodeURIComponent(path)}?alt=media&token=public-download-token`;

test("worker photo requires canonical project bucket and exact own staff path", () => {
  assert.equal(canonicalManagedStoragePath(photo("public/staff/worker-1/photo.webp"), bucket), "public/staff/worker-1/photo.webp");
  assert.equal(isOwnManagedStaffPhoto(photo("public/staff/worker-1/photo.webp"), bucket, "worker-1"), true);
  for (const url of [
    "https://evil.example/public/staff/worker-1/photo.webp",
    photo("public/staff/worker-1/photo.webp", "firebasestorage.googleapis.com", "other.appspot.com"),
    photo("public/staff/worker-2/photo.webp"), photo("public/staff/worker-1/../worker-2/photo.webp"),
    photo("public/staff/worker-1/%2e%2e/photo.webp"), photo("public/staff/worker-1/extra/photo.webp"),
    "http://firebasestorage.googleapis.com/v0/b/el-mezaen.appspot.com/o/public%2Fstaff%2Fworker-1%2Fphoto.webp",
    "https://firebasestorage.googleapis.com.evil.example/v0/b/el-mezaen.appspot.com/o/public%2Fstaff%2Fworker-1%2Fphoto.webp"
  ]) assert.equal(isOwnManagedStaffPhoto(url, bucket, "worker-1"), false, url);
});

test("dynamic media and embedded video reject active URL schemes and unknown iframe providers", () => {
  for (const value of ["javascript:alert(1)", "vbscript:msgbox(1)", "file:///etc/passwd", "data:text/html,<script>alert(1)</script>"]) {
    assert.equal(safeMediaUrl(value), "");
    assert.equal(videoSource(value).url, "");
    assert.equal(isApprovedVideoEmbed(value), false);
  }
  assert.equal(isApprovedVideoEmbed("https://evil.example/embed/abcdef"), false);
  assert.equal(isApprovedVideoEmbed("https://www.youtube-nocookie.com/embed/abcdef?autoplay=1"), true);
  assert.equal(isApprovedVideoEmbed(videoSource("https://fb.watch/abcdef/").url), true);
  assert.equal(isApprovedVideoEmbed("https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fevilfacebook.com"), false);
});

test("runtime has no OS command or dynamic code execution primitives", async () => {
  const paths = ["src", "functions/src"];
  for (const directory of paths) for (const file of await readdir(new URL(`../${directory}/`, import.meta.url))) {
    if (!file.endsWith(".js")) continue;
    const code = await source(`${directory}/${file}`);
    assert.doesNotMatch(code, /(?:node:)?child_process|\bshelljs\b|(?<![.\w])exec(?:Sync|File)?\s*\(|(?<![.\w])spawn(?:Sync)?\s*\(|(?<![.\w])eval\s*\(|new\s+Function\s*\(|\bvm\.run\w*\s*\(/, `${file} introduces runtime execution`);
  }
});

test("Storage generic and staff writes are admin only; scoped media paths do not inherit wildcard grants", async () => {
  const rules = await source("storage.rules");
  assert.match(rules, /function canManageMedia\(\)\s*\{\s*return request\.auth != null && request\.auth\.token\.role == 'admin';/);
  assert.match(rules, /folder != 'offers' && folder != 'content' && canManageMedia\(\)/);
  assert.match(rules, /isOwnWorkerPhoto\(staffId, fileName\)/);
});

test("sensitive role changes revoke refresh tokens and fail visibly before success", async () => {
  const code = await source("functions/src/index.js");
  const roleHandler = code.slice(code.indexOf("export const setUserRole ="), code.indexOf("export const createAdminUser ="));
  assert.match(roleHandler, /replaceClaimsAndRevoke\(getAuth\(\), uid,/);
  assert.match(roleHandler, /throw new HttpsError\("unavailable"/);
  assert.ok(roleHandler.indexOf("replaceClaimsAndRevoke") < roleHandler.indexOf("await batch.commit()"));
  assert.match(await source("functions/src/privilege-change.js"), /revokeRefreshTokens\(uid\)/);
  for (const name of ["adminSecureDelete", "setUserRole", "createAdminUser"]) {
    const handler = code.slice(code.indexOf(`export const ${name} =`));
    assert.match(handler.slice(0, 350), /await requireLiveAdmin\(request\)/);
  }
});

test("Meta origin is fixed and phone ID cannot add path or URL components", async () => {
  const code = await source("functions/src/index.js");
  const requests = [...code.matchAll(/fetch\(`([^`]+)`/g)].map(match => match[1]);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(url => url === "https://graph.facebook.com/v22.0/${phoneNumberId}/messages"));
  assert.equal((code.match(/\^\[0-9\]\{5,25\}\$/g) || []).length, 2);
});

test("public HTML contexts escape customer text and validate URL contexts", async () => {
  for (const path of ["src/admin.js", "src/catalog-page.js", "src/reviews-page.js", "src/faq-chatbot.js"]) {
    const code = await source(path);
    assert.match(code, /replaceAll\('"', "&quot;"\)/);
  }
  assert.match(await source("src/app.js"), /safeWebUrl\(branch\.mapsUrl\)/);
  assert.match(await source("src/app.js"), /isApprovedVideoEmbed\(src\)/);
  for (const payload of ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", '\"><svg onload=alert(1)>']) {
    const escaped = payload.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    assert.doesNotMatch(escaped, /<script|<img|<svg/);
    assert.ok(!escaped.includes('"'));
  }
});

test("staff tab persistence and App Check session separation remain in place", async () => {
  assert.match(await source("src/admin-api.js"), /browserSessionPersistence/);
  assert.doesNotMatch(await source("src/admin-api.js"), /browserLocalPersistence/);
  assert.match(await source("src/account.js"), /browserLocalPersistence/);
  assert.match(await source("src/admin-session.js"), /function|const/);
});

test("webhook rejects unsigned, oversized and unsupported methods before mutation", async () => {
  const code = (await source("functions/src/index.js")).slice((await source("functions/src/index.js")).indexOf("export const whatsappWebhook ="));
  assert.match(code, /request\.method !== "POST".*405/);
  assert.match(code, /request\.rawBody\.length > 256 \* 1024.*413/);
  assert.match(code, /!validMetaSignature\(request\).*401/);
  assert.ok(code.indexOf("!validMetaSignature(request)") < code.indexOf("db.collection(\"whatsappOperations\")"));
});

test("old extra claims do not exceed role ceiling or known branch", () => {
  const grants = effectivePermissions("cashier", ["pos", "users", "payroll", "settings", "activity"]);
  for (const elevated of ["users", "payroll", "settings", "activity"]) assert.equal(grants.has(elevated), false);
  assert.equal(branchAllowed("cashier", ["talkha"], "mashaya"), false);
});

test("Firestore collection allowlists and audit payloads exclude raw credentials", async () => {
  const code = await source("functions/src/index.js");
  assert.match(code, /ADMIN_COLLECTIONS\.includes\(collection\)/);
  assert.match(code, /PUBLIC_COLLECTIONS\.map\(name =>/);
  assert.match(code, /validatePayloadSize\(raw\)/);
  const createUser = code.slice(code.indexOf("export const createAdminUser ="), code.indexOf("export const notifyAdminsOnBooking ="));
  assert.match(createUser, /const password = String\(request\.data\?\.password/);
  const auditWrite = createUser.match(/batch\.set\(db\.collection\("activityLogs"\)\.doc\(\),\s*\{([^}]+)\}/)?.[1] || "";
  assert.ok(auditWrite);
  assert.doesNotMatch(auditWrite, /\bpassword\b|\btoken\b|\botp\b|\bsecret\b/i);
});
