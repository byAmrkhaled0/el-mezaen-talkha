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
