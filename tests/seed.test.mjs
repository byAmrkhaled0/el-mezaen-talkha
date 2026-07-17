import test from "node:test";
import assert from "node:assert/strict";
import { seedCatalog } from "../src/seed-data.js";

test("contains every requested service without duplicate IDs", () => {
  assert.equal(seedCatalog.services.length, 82);
  assert.equal(new Set(seedCatalog.services.map(item => item.id)).size, 82);
});

test("preserves duplicate names and zero-duration products", () => {
  assert.equal(seedCatalog.services.filter(item => item.nameAr === "كيرلي كريم").length, 2);
  assert.equal(seedCatalog.services.filter(item => item.nameAr === "تركيب جديد").length, 5);
  assert.equal(seedCatalog.services.filter(item => item.type === "product").length, 5);
  assert.equal(seedCatalog.services.filter(item => item.duration === 0).length, 6);
});

test("contains the six packages and twenty-one team members", () => {
  assert.equal(seedCatalog.packages.length, 6);
  assert.equal(seedCatalog.staff.length, 21);
  assert.equal(new Set(seedCatalog.packages.map(item => item.id)).size, 6);
  assert.equal(new Set(seedCatalog.staff.map(item => item.id)).size, 21);
});

test("contains two active bookable branches with real contact actions", () => {
  assert.deepEqual(seedCatalog.branches.map(item => item.id), ["talkha", "mashaya"]);
  for (const branch of seedCatalog.branches) {
    assert.ok(branch.nameAr && branch.nameEn && branch.addressAr);
    assert.match(branch.phone, /^01[0125]\d{8}$/);
    assert.match(branch.whatsapp, /^201[0125]\d{8}$/);
    assert.match(branch.mapsUrl, /^https:\/\/www\.google\.com\/maps\//);
    assert.equal(branch.active, true);
  }
});

test("every catalog item has Arabic and English names and editable state", () => {
  for (const item of [...seedCatalog.categories, ...seedCatalog.services, ...seedCatalog.packages, ...seedCatalog.staff]) {
    assert.ok(item.nameAr);
    assert.ok(item.nameEn);
    assert.equal(typeof item.active, "boolean");
  }
});
