import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { activeBranch, publicSubset, reconcileBranchCart } from "../src/public-branch.js";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const talkha = { id: "t", branchIds: ["talkha"], active: true };
const mashaya = { id: "m", branchIds: ["mashaya"], active: true };
const both = { id: "b", branchIds: ["talkha", "mashaya"], active: true };

test("branch-first subset keeps only selected branch and shared items, never branchless rows", () => {
  const rows = [talkha, mashaya, both, { id: "legacy", active: true }, { id: "off", branchIds: ["mashaya"], active: false }];
  assert.deepEqual(publicSubset(rows, "mashaya").map(item => item.id), ["m", "b"]);
  assert.deepEqual(publicSubset(rows, "talkha").map(item => item.id), ["t", "b"]);
  assert.deepEqual(publicSubset(rows, ""), []);
});

test("offers respect active state, stopped status and date at the boundary", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  const rows = [both, { ...both, id: "future", startAt: "2026-09-28T12:00:01Z" }, { ...both, id: "ended", endAt: "2026-09-28T11:59:59Z" }, { ...both, id: "bad-date", endAt: "invalid" }, { ...both, id: "stopped", status: "stopped" }];
  assert.deepEqual(publicSubset(rows, "mashaya", { dated: true, now }).map(item => item.id), ["b"]);
});

test("changing branch preserves shared cart lines and discards incompatible and unknown lines", () => {
  const catalog = { branches: [{ id: "talkha", active: true }, { id: "mashaya", active: true }], services: [talkha, mashaya, both], offers: [], packages: [], drinks: [] };
  assert.equal(activeBranch(catalog, "mashaya")?.id, "mashaya");
  assert.deepEqual(reconcileBranchCart([{ id: "t" }, { id: "b" }, { id: "legacy" }], catalog, "mashaya"), { kept: [{ id: "b" }], removed: 2 });
});

test("branch page waits for canonical catalog before a booking entry link can leave the page", async () => {
  const branch = await read("src/branch-page.js");
  assert.match(branch, /let branchContextReady = false/);
  assert.match(branch, /if \(event\.target\.closest\("\[data-choose-branch\]"\) && !branchContextReady\)/);
  assert.match(branch, /if \(!setBranchContext\(catalog\)\)/);
  assert.match(branch, /branchContextReady = true/);
  assert.match(branch, /sessionStorage\.setItem\("mz-entry-item"/);
});

test("catalog and homepage CTAs reject expired items even after a stale card remains visible", async () => {
  const [app, catalog] = await Promise.all([read("src/app.js"), read("src/catalog-page.js")]);
  for (const source of [app, catalog]) {
    assert.match(source, /item\.startAt && \(Number\.isNaN\(Date\.parse\(item\.startAt\)\) \|\| new Date\(item\.startAt\)\.getTime\(\) > Date\.now\(\)\)/);
    assert.match(source, /item\.endAt && \(Number\.isNaN\(Date\.parse\(item\.endAt\)\) \|\| new Date\(item\.endAt\)\.getTime\(\) < Date\.now\(\)\)/);
  }
});

test("booking confirmation keeps the one createBooking flow and presents the returned branch and total", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("src/app.js")]);
  for (const id of ["successCode", "successBranch", "successServices", "successStaff", "successAppointment", "successTotal"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /href="\/account\/">عرض حجوزاتي/);
  assert.match(app, /const result = await createBooking\(/);
  assert.match(app, /\$\("#successTotal"\)\.textContent = money\(result\.total\)/);
  assert.match(app, /const resultBranchId = result\.branchId \|\| bookingPayload\.branchId/);
});

test("offer and package booking buttons enter the existing dialog only after a valid cart add", async () => {
  const app = await read("src/app.js");
  assert.match(app, /if \(added && \["offer", "package"\]\.includes\(add\.dataset\.kind\)\) void openBooking\(add\)/);
  assert.match(app, /openEntryBooking = addToCart\(entry\.id\)/);
  assert.match(app, /if \(openEntryBooking && !\$\("#bookingDialog"\)\.open\) showBookingDialog\(\)/);
  assert.match(app, /if \(!selectBranch\(autoSelectedBranch\.id, false\)\) return false/);
});

test("hair systems branch CTA reconciles through the homepage instead of silently replacing a cart", async () => {
  const [seo, app] = await Promise.all([read("src/seo-page.js"), read("src/app.js")]);
  assert.match(seo, /sessionStorage\.setItem\("mz-requested-branch", link\.dataset\.bookBranch\)/);
  assert.doesNotMatch(seo, /localStorage\.setItem\("mz-branch", link\.dataset\.bookBranch\)/);
  assert.match(app, /const requestedBranch = sessionStorage\.getItem\("mz-requested-branch"\)/);
  assert.match(app, /if \(activeBranch\(state\.catalog, requestedBranch\)\) selectBranch\(requestedBranch, false\)/);
});

test("missing package artwork uses the brand mark without assigning another package's photo", async () => {
  const [app, catalog] = await Promise.all([read("src/app.js"), read("src/catalog-page.js")]);
  for (const source of [app, catalog]) {
    assert.match(source, /package-media-placeholder/);
    assert.doesNotMatch(source, /imageUrl \|\| "\/assets\/package-premium\.webp"/);
  }
});

test("public gallery App Check debug mode is constrained to local development hosts", async () => {
  for (const path of ["src/results.js", "src/hair-systems.js"]) {
    const source = await read(path);
    assert.match(source, /\["localhost", "127\.0\.0\.1"\]\.includes\(globalThis\.location\?\.hostname\)/);
    assert.match(source, /FIREBASE_APPCHECK_DEBUG_TOKEN = true/);
  }
});

test("homepage and branch entry points keep one booking flow and gate branch content before loading", async () => {
  const [html, app, branch, catalog, results] = await Promise.all([read("index.html"), read("src/app.js"), read("src/branch-page.js"), read("src/catalog-page.js"), read("src/results.js")]);
  for (const id of ["hero-title", "choose-branch", "offersGrid", "serviceGrid", "packageGrid", "teamGrid", "bookingDialog", "catalogStatus"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /data-open-booking/);
  assert.match(app, /catalogReady = true;[\s\S]*renderAll\(\)/);
  assert.match(app, /if \(!currentBranch\(\) && !\$\("#branchDialog"\)\.open\) openBranchDialog/);
  assert.match(app, /const removed = reconcileBranchCart\(state\.cart, state\.catalog, id\)\.removed/);
  assert.match(app, /const result = await createBooking\(/);
  assert.match(branch, /sessionStorage\.setItem\("mz-entry-item"/);
  assert.match(catalog, /sessionStorage\.setItem\("mz-staff-booking"/);
  assert.match(results, /publicSubset\(items, branch\)/);
});

test("homepage empty messages and filters follow the selected branch after switching", async () => {
  const app = await read("src/app.js");
  assert.match(app, /branchId: localStorage\.getItem\("mz-branch"\) \|\| ""/);
  assert.match(app, /state\.branchId = branch\.id;\s*state\.category = "all"/);
  assert.match(app, /function renderServices\(\)[\s\S]*?if \(state\.category !== "all" && !active\.some\(item => item\.categoryId === state\.category\)\) state\.category = "all"/);
  assert.match(app, /function renderServices\(\)[\s\S]*?currentBranch\(\) \? \(state\.lang === "ar" \? "لا توجد خدمات متاحة حاليًا في هذا الفرع"/);
  assert.match(app, /function renderTeam\(\)[\s\S]*?currentBranch\(\) \? \(state\.lang === "ar" \? "لا يوجد أعضاء فريق متاحون حاليًا في هذا الفرع"/);
  assert.match(app, /#branchQuickGrid"\)\.addEventListener\("error"[\s\S]*?event\.target\.replaceWith\(fallback\)/);
});

test("all existing public routes remain independent and preserve canonical metadata", async () => {
  for (const path of ["index.html", "services/index.html", "packages/index.html", "results/index.html", "reviews/index.html", "team/index.html", "hair-systems/index.html", "branches/talkha/index.html", "branches/mashaya/index.html"]) {
    const html = await read(path);
    assert.match(html, /<main\b|class="login-shell"/);
    assert.match(html, /<link rel="canonical"/);
  }
  for (const path of ["account/index.html", "login/index.html"]) assert.match(await read(path), /<main\b|class="login-shell"/);
});
