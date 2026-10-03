// A small, testable contract shared by preview, queueing and Cloud Tasks.
import { createHmac, timingSafeEqual } from "node:crypto";
export const CAMPAIGN_STATES = Object.freeze({
  PAUSE: { QUEUED: "PAUSED", SENDING: "PAUSED" },
  RESUME: { PAUSED: "QUEUED" },
  CANCEL: { QUEUED: "CANCELLED", SENDING: "CANCELLED", PAUSED: "CANCELLED" }
});

export function campaignBranchAllowed(role, branchIds, branchId) {
  return branchId === "all" ? role === "admin" : Boolean(branchId && (role === "admin" || branchIds.includes(branchId)));
}

export function offerAtBranch(offer, branchId, now = new Date()) {
  const branches = Array.isArray(offer?.branchIds) ? offer.branchIds : [];
  return Boolean(offer && offer.active !== false && !["stopped", "expired"].includes(offer.status)
    && (branchId === "all" ? ["talkha", "mashaya"].every(id => branches.includes(id)) : branches.includes(branchId))
    && (!offer.startAt || new Date(offer.startAt.toDate?.() || offer.startAt) <= now)
    && (!offer.endAt || new Date(offer.endAt.toDate?.() || offer.endAt) >= now));
}

export function eligibleRecipient(customer, campaign, testCustomerIds = []) {
  return customer?.whatsappOptIn === true
    && (campaign.branchId === "all" || customer.lastBranchId === campaign.branchId)
    && (!campaign.testMode || testCustomerIds.includes(customer.id));
}

export function shouldApplyDeliveryStatus(current, incoming) {
  const rank = { sent: 1, delivered: 2, read: 3, failed: 2 };
  if (!rank[incoming]) return false;
  if (current === "read" || (current === "delivered" && incoming === "failed")) return false;
  return rank[incoming] > (rank[current] || 0);
}

export function verifyMetaSignature(signature, rawBody, secret) {
  if (!/^sha256=[a-f0-9]{64}$/.test(String(signature || "")) || !secret) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody || Buffer.from("")).digest("hex")}`;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function campaignTemplate(settings, name) {
  const configured = Array.isArray(settings?.whatsappMarketingTemplates) ? settings.whatsappMarketingTemplates : [];
  const item = configured.find(value => value?.name === name);
  if (!item || !/^[a-z0-9_]{1,120}$/.test(name)
      || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(item.languageCode || "ar")
      || !["none", "image"].includes(item.headerType)
      || !Array.isArray(item.bodyVariables)
      || item.bodyVariables.some(value => !["customerFirstName", "offerName", "oldPrice", "newPrice", "branchName", "endDate"].includes(value))
      || item.bodyVariables.length > 10) return null;
  return { name, languageCode: item.languageCode || "ar", headerType: item.headerType, bodyVariables: item.bodyVariables };
}

export function campaignComponents(template, offer, customer, branchName) {
  const values = {
    customerFirstName: String(customer.firstName || "").trim().split(/\s+/)[0].slice(0, 50) || "عميلنا",
    offerName: String(offer.nameAr || "").slice(0, 100),
    oldPrice: String(offer.oldPrice ?? ""),
    newPrice: String(offer.newPrice ?? ""),
    branchName: String(branchName || "").slice(0, 100),
    endDate: offer.endAt ? new Date(offer.endAt.toDate?.() || offer.endAt).toISOString().slice(0, 10) : ""
  };
  const components = [];
  if (template.headerType === "image") components.push({ type: "header", parameters: [{ type: "image", image: { link: offer.imageUrl } }] });
  if (template.bodyVariables.length) components.push({ type: "body", parameters: template.bodyVariables.map(key => ({ type: "text", text: values[key] })) });
  return components;
}
