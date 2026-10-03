import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync(new URL("../functions/src/index.js", import.meta.url), "utf8");
const admin = readFileSync(new URL("../src/admin.js", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/account.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");

test("V8 reuses the existing campaign, recipient, guard and webhook paths", () => {
  for (const path of ["campaigns", "campaignRecipients", "campaignGuards", "whatsappConsentHistory", "activityLogs"]) assert.match(backend, new RegExp(path));
  assert.match(backend, /export const whatsappWebhook/);
  assert.match(backend, /validMetaSignature/);
  assert.match(backend, /taskQueue\("processCampaignBatch"\)/);
});

test("V8 counts the audience on the server, validates offer and recipient cap, and reserves unique recipients", () => {
  assert.match(backend, /query\.count\(\)\.get\(\)/);
  assert.doesNotMatch(backend, /eligibleCount:\s*Number\(request\.data\?\.eligibleCount/);
  assert.match(backend, /const offer = await campaignOffer\(offerId, branchId\)/);
  assert.match(backend, /recipientCap > Math\.min\(eligibleCount, 1000\)/);
  assert.match(backend, /targetedCount: FieldValue\.increment\(1\)/);
  assert.match(backend, /if \(existing\.exists\) return "SEEN"/);
});

test("V8 checks consent and campaign state again inside the batch transaction", () => {
  assert.match(backend, /transaction\.get\(customerRef\)/);
  assert.match(backend, /eligibleRecipient\(\{ id: customerSnapshot\.id, \.\.\.currentCustomer\.data\(\) \}/);
  assert.match(backend, /CAMPAIGN_STATES\[action\]/);
  assert.match(backend, /campaignScope\(request, snapshot\.data\(\)\.branchId\)/);
  assert.match(backend, /getWhatsappCampaignRecipients/);
});

test("V8 offer editor, composer, account consent and optional navigation remain wired", () => {
  assert.match(admin, /data-offer-campaign/);
  assert.match(admin, /previewWhatsappCampaign/);
  assert.match(html, /id="campaignForm"/);
  assert.match(html, /id="campaignPreview"/);
  assert.match(html, /id="campaignRecipientList"/);
  assert.match(admin, /cashierOptionalMarketing/);
  assert.match(account, /updateOwnWhatsappConsent/);
});
