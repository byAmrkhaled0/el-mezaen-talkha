import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { seedCatalog } from "../src/seed-data.js";

test("contains every requested service without duplicate IDs", () => {
  assert.equal(seedCatalog.services.length, 82);
  assert.equal(new Set(seedCatalog.services.map(item => item.id)).size, 82);
});

test("preserves historical IDs while hiding the exact duplicate catalog card", () => {
  assert.equal(seedCatalog.services.filter(item => item.nameAr === "كيرلي كريم").length, 2);
  assert.equal(seedCatalog.services.find(item => item.id === "hair-028").duplicateOf, "hair-010");
  assert.equal(seedCatalog.services.find(item => item.id === "hair-028").catalogVisible, false);
  assert.equal(seedCatalog.services.filter(item => item.nameAr === "تركيب جديد").length, 0);
  assert.equal(seedCatalog.services.filter(item => item.type === "product").length, 5);
  assert.equal(seedCatalog.services.filter(item => item.duration === 0).length, 6);
});

test("preserves six legacy packages and adds the three fixed-id Mashaya offers", () => {
  assert.equal(seedCatalog.packages.length, 9);
  assert.equal(seedCatalog.staff.length, 21);
  assert.equal(new Set(seedCatalog.packages.map(item => item.id)).size, 9);
  assert.equal(new Set(seedCatalog.staff.map(item => item.id)).size, 21);
  for (const id of Array.from({ length: 6 }, (_, index) => `package-${String(index + 1).padStart(3, "0")}`)) assert.ok(seedCatalog.packages.some(item => item.id === id));
  const expected = new Map([
    ["package-mashaya-friends-250", [250, 350, 2]],
    ["package-mashaya-silver-600", [600, 800, 2]],
    ["package-mashaya-450", [450, 750, 1]]
  ]);
  for (const [id, [price, originalPrice, choices]] of expected) {
    const item = seedCatalog.packages.find(value => value.id === id);
    assert.deepEqual(item.branchIds, ["mashaya"]);
    assert.equal(item.price, price);
    assert.equal(item.originalPrice, originalPrice);
    assert.equal(item.choiceGroups.length, choices);
    assert.ok(item.includedServiceIds.length);
    for (const group of item.choiceGroups) { assert.equal(group.required, true); assert.equal(group.maxSelections, 1); assert.ok(group.options.length >= 2); }
  }
  assert.equal(seedCatalog.packages.find(item => item.id === "package-mashaya-friends-250").promotionMode, "terms-only");
  assert.equal(seedCatalog.packages.find(item => item.id === "package-mashaya-friends-250").maximumAutomaticApplications, 0);
  assert.equal(seedCatalog.packages.find(item => item.id === "package-mashaya-450").duration, 95);
});

test("new package cards use the three cropped advertisement WebP files", async () => {
  const expected = new Map([
    ["package-mashaya-friends-250", "/assets/package-mashaya-friends-250.webp"],
    ["package-mashaya-silver-600", "/assets/package-mashaya-silver-600.webp"],
    ["package-mashaya-450", "/assets/package-mashaya-450.webp"]
  ]);
  for (const [id, imageUrl] of expected) {
    assert.equal(seedCatalog.packages.find(item => item.id === id).imageUrl, imageUrl);
    await access(new URL(`../public${imageUrl}`, import.meta.url));
  }
});

test("fixed package IDs remain idempotent when installed more than once", () => {
  const records = new Map(seedCatalog.packages.slice(0, 6).map(item => [item.id, item]));
  for (let pass = 0; pass < 2; pass += 1) for (const item of seedCatalog.packages.slice(6)) records.set(item.id, { ...(records.get(item.id) || {}), ...item });
  assert.equal(records.size, 9);
});

test("contains two active bookable branches with real contact actions", () => {
  assert.deepEqual(seedCatalog.branches.map(item => item.id), ["talkha", "mashaya"]);
  for (const branch of seedCatalog.branches) {
    assert.ok(branch.nameAr && branch.nameEn && branch.addressAr);
    assert.match(branch.phone, /^01[0125]\d{8}$/);
    assert.match(branch.whatsapp, /^201[0125]\d{8}$/);
    assert.match(branch.mapsUrl, /^https:\/\/www\.google\.com\/maps\//);
    assert.ok(Number.isFinite(branch.latitude) && Number.isFinite(branch.longitude));
    assert.equal(branch.attendanceRadiusMeters, 100);
    assert.equal(branch.monthlyRevenueTarget, 0);
    assert.equal(branch.active, true);
  }
  assert.deepEqual(
    Object.fromEntries(seedCatalog.branches.map(branch => [branch.id, [branch.latitude, branch.longitude]])),
    { talkha: [31.0520115, 31.3815616], mashaya: [31.0456639, 31.3670561] }
  );
});

test("every catalog item has Arabic and English names and editable state", () => {
  for (const item of [...seedCatalog.categories, ...seedCatalog.services, ...seedCatalog.packages, ...seedCatalog.staff]) {
    assert.ok(item.nameAr);
    assert.ok(item.nameEn);
    assert.equal(typeof item.active, "boolean");
  }
});

test("seeded services and content have explicit branch scope", () => {
  for (const item of seedCatalog.services) assert.deepEqual(item.branchIds, ["talkha", "mashaya"]);
  for (const item of seedCatalog.content) assert.deepEqual(item.branchIds, ["talkha", "mashaya"]);
});
