import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { ROLE_CAPABILITY_CEILINGS, ROLE_DEFAULT_PERMISSIONS, effectivePermissions } from "../src/authorization.js";
import { CAMPAIGN_STATES, campaignBranchAllowed, campaignComponents, campaignTemplate, eligibleRecipient, offerAtBranch, shouldApplyDeliveryStatus, verifyMetaSignature } from "../src/marketing.js";

test("campaigns and offers are explicit optional grants with a role ceiling", () => {
  assert.equal(ROLE_DEFAULT_PERMISSIONS.manager.includes("campaigns"), false);
  assert.equal(ROLE_DEFAULT_PERMISSIONS.cashier.includes("offers"), false);
  assert.equal(ROLE_DEFAULT_PERMISSIONS.cashier.includes("campaigns"), false);
  assert.equal(ROLE_CAPABILITY_CEILINGS.cashier.includes("campaigns"), true);
  assert.deepEqual([...effectivePermissions("cashier", ["campaigns", "offers", "users", "settings"])], ["campaigns", "offers", "teamOperations"]);
  assert.equal(effectivePermissions("worker", ["campaigns"]).has("campaigns"), false);
});

test("all branch campaigns are admin only and branch employees remain locked", () => {
  for (const role of ["cashier", "manager"]) {
    assert.equal(campaignBranchAllowed(role, ["mashaya"], "mashaya"), true);
    assert.equal(campaignBranchAllowed(role, ["mashaya"], "talkha"), false);
    assert.equal(campaignBranchAllowed(role, ["mashaya"], "all"), false);
  }
  assert.equal(campaignBranchAllowed("admin", [], "all"), true);
  assert.equal(campaignBranchAllowed("admin", [], "talkha"), true);
});

test("an offer must be active, current, and valid for every targeted branch", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const offer = { active: true, status: "active", branchIds: ["mashaya"], startAt: "2026-09-01", endAt: "2026-10-01" };
  assert.equal(offerAtBranch(offer, "mashaya", now), true);
  assert.equal(offerAtBranch(offer, "talkha", now), false);
  assert.equal(offerAtBranch(offer, "all", now), false);
  assert.equal(offerAtBranch({ ...offer, branchIds: ["talkha", "mashaya"] }, "all", now), true);
  for (const mutation of [{ active: false }, { status: "stopped" }, { endAt: "2026-09-27" }, { startAt: "2026-09-29" }])
    assert.equal(offerAtBranch({ ...offer, ...mutation }, "mashaya", now), false);
});

test("consent missing or revoked and the other branch never enter an audience", () => {
  const campaign = { branchId: "mashaya", testMode: false };
  assert.equal(eligibleRecipient({ id: "a", whatsappOptIn: true, lastBranchId: "mashaya" }, campaign), true);
  for (const customer of [
    { whatsappOptIn: false, lastBranchId: "mashaya" },
    { lastBranchId: "mashaya" },
    { whatsappOptIn: true, lastBranchId: "talkha" }
  ]) assert.equal(eligibleRecipient({ id: "a", ...customer }, campaign), false);
  assert.equal(eligibleRecipient({ id: "a", whatsappOptIn: true, lastBranchId: "mashaya" }, { ...campaign, testMode: true }, ["b"]), false);
  assert.equal(eligibleRecipient({ id: "a", whatsappOptIn: true, lastBranchId: "mashaya" }, { ...campaign, testMode: true }, ["a"]), true);
});

test("only configured Meta component mappings and image headers are emitted", () => {
  const settings = { whatsappMarketingTemplates: [{ name: "offer_image_ar", headerType: "image", languageCode: "ar", bodyVariables: ["customerFirstName", "offerName", "newPrice"] }] };
  const template = campaignTemplate(settings, "offer_image_ar");
  assert.equal(campaignTemplate(settings, "other"), null);
  assert.equal(campaignTemplate({ whatsappMarketingTemplates: [{ name: "bad", headerType: "image", bodyVariables: ["arbitrary"] }] }, "bad"), null);
  assert.deepEqual(campaignComponents(template, { imageUrl: "https://example.test/image.webp", nameAr: "خصم", newPrice: 90 }, { firstName: "أحمد أمين" }, "المشاية"), [
    { type: "header", parameters: [{ type: "image", image: { link: "https://example.test/image.webp" } }] },
    { type: "body", parameters: [{ type: "text", text: "أحمد" }, { type: "text", text: "خصم" }, { type: "text", text: "90" }] }
  ]);
  assert.deepEqual(campaignComponents({ ...template, headerType: "none", bodyVariables: [] }, {}, {}, ""), []);
});

test("completed and cancelled campaigns cannot resume", () => {
  assert.equal(CAMPAIGN_STATES.RESUME.COMPLETED, undefined);
  assert.equal(CAMPAIGN_STATES.RESUME.CANCELLED, undefined);
  assert.equal(CAMPAIGN_STATES.PAUSE.SENDING, "PAUSED");
});

test("delivery webhooks do not downgrade an already read message", () => {
  assert.equal(shouldApplyDeliveryStatus("sent", "delivered"), true);
  assert.equal(shouldApplyDeliveryStatus("delivered", "read"), true);
  assert.equal(shouldApplyDeliveryStatus("read", "sent"), false);
  assert.equal(shouldApplyDeliveryStatus("read", "failed"), false);
  assert.equal(shouldApplyDeliveryStatus("delivered", "failed"), false);
});

test("webhook HMAC accepts the signed body and rejects changes", () => {
  const body = Buffer.from('{"entry":[]}');
  const signature = `sha256=${createHmac("sha256", "emulator-only").update(body).digest("hex")}`;
  assert.equal(verifyMetaSignature(signature, body, "emulator-only"), true);
  assert.equal(verifyMetaSignature(signature, Buffer.from('{"entry":[1]}'), "emulator-only"), false);
  assert.equal(verifyMetaSignature("sha256=invalid", body, "emulator-only"), false);
});
