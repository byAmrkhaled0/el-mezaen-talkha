import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("expense form has a real guarded submit path", async () => {
  const [html, admin] = await Promise.all([read("admin/index.html"), read("src/admin.js")]);

  assert.match(html, /id="expenseSubmit"[^>]*type="submit"/);
  assert.match(admin, /querySelector\('button\[type="submit"\], button:not\(\[type\]\)'\)/);
  assert.match(admin, /button\.disabled = true/);
  assert.match(admin, /idempotencyKey/);
  assert.match(admin, /await recordExpense/);
  assert.match(admin, /await updateExpense/);
});

test("drinks are branch-scoped server data and POS writes are idempotent", async () => {
  const functionsSource = await read("functions/src/index.js");

  assert.match(functionsSource, /collection\("drinks"\)/);
  assert.match(functionsSource, /isDrinkAvailableAtBranch\(source, branchId\)/);
  assert.match(functionsSource, /posOrderGuards/);
  assert.match(functionsSource, /idempotencyKey/);
  assert.match(functionsSource, /revenueBreakdown/);
});

test("sensitive pages are network-only and never cached by the service worker", async () => {
  const serviceWorker = await read("public/sw.js");

  assert.match(serviceWorker, /const sensitiveNavigation\s*=/);
  assert.match(serviceWorker, /cache:\s*"no-store"/);
  const core = serviceWorker.match(/const CORE\s*=\s*\[([\s\S]*?)\];/)?.[1] || "";
  assert.doesNotMatch(core, /\/admin\//);
  assert.doesNotMatch(core, /\/login/);
});

test("worker accounts have admin-only secure deletion", async () => {
  const [admin, functionsSource] = await Promise.all([read("src/admin.js"), read("functions/src/index.js")]);

  assert.match(admin, /data-secure-delete-user/);
  assert.match(admin, /openSecureDelete\("user"/);
  assert.match(functionsSource, /deleteUserAccountPermanently/);
  assert.match(functionsSource, /getAuth\(\)\.deleteUser\(uid\)/);
  assert.match(functionsSource, /secure-delete-user/);
  assert.match(functionsSource, /لا يمكنك حذف حساب الأدمن المستخدم حاليًا/);
});

test("CSP allows Firebase Authentication helper script and iframe", async () => {
  const [vercel, firebase] = await Promise.all([read("vercel.json"), read("firebase.json")]);

  for (const config of [vercel, firebase]) {
    assert.match(config, /script-src[^;]*https:\/\/apis\.google\.com/);
    assert.match(config, /frame-src[^;]*https:\/\/el-mezaen-talkha\.firebaseapp\.com/);
  }
});

test("public content rejects unsafe link protocols", async () => {
  const app = await read("src/app.js");
  assert.match(app, /const safeWebUrl/);
  assert.match(app, /\["http:", "https:"\]\.includes\(url\.protocol\)/);
  assert.match(app, /const link = safeWebUrl\(item\.linkUrl\)/);
});
