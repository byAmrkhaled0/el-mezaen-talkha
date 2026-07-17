export function normalizePhone(value) {
  let phone = String(value || "").replace(/[^\d+]/g, "");
  if (phone.startsWith("+20")) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith("20") && phone.length === 12) phone = `0${phone.slice(2)}`;
  if (!/^01[0125]\d{8}$/.test(phone)) throw new Error("INVALID_PHONE");
  return phone;
}

export function minutes(value) {
  const [hour, minute] = String(value || "").split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error("INVALID_TIME");
  return hour * 60 + minute;
}

export function createSlotKeys(staffId, date, time, duration, step = 5, branchId = "") {
  const start = minutes(time);
  const safeDuration = Math.max(step, Number(duration || 0));
  const keys = [];
  for (let cursor = start; cursor < start + safeDuration; cursor += step) {
    const prefix = branchId ? `${branchId}_` : "";
    keys.push(`${prefix}${staffId}_${date}_${String(Math.floor(cursor / 60)).padStart(2, "0")}${String(cursor % 60).padStart(2, "0")}`);
  }
  return keys;
}

export function priceItems(lines, docsById, now = new Date(), branchId = "") {
  if (!Array.isArray(lines) || !lines.length || lines.length > 30) throw new Error("INVALID_ITEMS");
  const seen = new Set();
  return lines.map(line => {
    const id = String(line?.id || "");
    if (!id || seen.has(id)) throw new Error("DUPLICATE_OR_INVALID_ITEM");
    seen.add(id);
    const source = docsById.get(id);
    if (!source || source.active === false) throw new Error("ITEM_UNAVAILABLE");
    if (branchId && Array.isArray(source.branchIds) && source.branchIds.length && !source.branchIds.includes(branchId)) throw new Error("ITEM_UNAVAILABLE_AT_BRANCH");
    const kind = line.kind === "product" ? "product" : line.kind;
    if (source.kind !== kind && !(source.kind === "service" && kind === "product" && source.type === "product")) throw new Error("INVALID_ITEM_TYPE");
    if (source.status === "expired" || source.status === "stopped") throw new Error("ITEM_UNAVAILABLE");
    if (source.startAt && new Date(source.startAt).getTime() > now.getTime()) throw new Error("ITEM_NOT_STARTED");
    if (source.endAt && new Date(source.endAt).getTime() < now.getTime()) throw new Error("ITEM_EXPIRED");
    const qty = source.kind === "product" ? Math.max(1, Math.min(20, Number(line.qty || 1))) : 1;
    const unitPrice = Number(source.newPrice ?? source.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("INVALID_SERVER_PRICE");
    return {
      id,
      kind: source.kind,
      nameAr: source.nameAr,
      nameEn: source.nameEn,
      duration: Number(source.duration || 0),
      qty,
      unitPrice,
      lineTotal: unitPrice * qty,
      staffRequired: source.kind !== "product"
    };
  });
}

export function calculateCoupon(coupon, pricedItems, { now = new Date(), usageCount = 0, phoneUsageCount = 0 } = {}) {
  const subtotal = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  if (!coupon || coupon.active === false) return { valid: false, discountAmount: 0, discountPercent: 0, subtotal };
  if (coupon.startAt && new Date(coupon.startAt).getTime() > now.getTime()) return { valid: false, discountAmount: 0, discountPercent: 0, subtotal };
  if (coupon.endAt && new Date(coupon.endAt).getTime() < now.getTime()) return { valid: false, discountAmount: 0, discountPercent: 0, subtotal };
  if (subtotal < Number(coupon.minSubtotal || 0)) return { valid: false, discountAmount: 0, discountPercent: 0, subtotal };
  if (coupon.totalUsageLimit && usageCount >= Number(coupon.totalUsageLimit)) return { valid: false, discountAmount: 0, discountPercent: 0, subtotal };
  if (coupon.perPhoneLimit && phoneUsageCount >= Number(coupon.perPhoneLimit)) return { valid: false, discountAmount: 0, discountPercent: 0, subtotal };
  const applicable = Array.isArray(coupon.applicableItemIds) ? coupon.applicableItemIds : [];
  const eligible = applicable.length ? pricedItems.filter(item => applicable.includes(item.id)) : pricedItems;
  const eligibleSubtotal = eligible.reduce((sum, item) => sum + item.lineTotal, 0);
  if (eligibleSubtotal <= 0) return { valid: false, discountAmount: 0, discountPercent: 0, subtotal };
  const raw = coupon.type === "fixed" ? Number(coupon.value || 0) : eligibleSubtotal * Number(coupon.value || 0) / 100;
  const discountAmount = Math.max(0, Math.min(raw, Number(coupon.maxDiscount || raw), subtotal));
  const discountPercent = subtotal ? Math.round(discountAmount / subtotal * 10000) / 100 : 0;
  return { valid: discountAmount > 0, discountAmount, discountPercent, subtotal, total: subtotal - discountAmount };
}

export function validateAppointment({ date, time, duration, openingTime, closingTime, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Error("INVALID_DATE");
  minutes(time);
  const startDate = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(startDate.getTime()) || startDate.getTime() <= now.getTime()) throw new Error("PAST_APPOINTMENT");
  const start = minutes(time);
  if (start < minutes(openingTime) || start + Number(duration || 0) > minutes(closingTime)) throw new Error("OUTSIDE_WORKING_HOURS");
  return startDate;
}

export function paymentTransition(booking, action, method = "cash") {
  const allowedMethods = ["cash", "vodafone_cash", "instapay", "other"];
  if (!allowedMethods.includes(method)) throw new Error("INVALID_PAYMENT_METHOD");
  if (action === "markPaid") {
    if (booking.paymentStatus === "paid") return { changed: false, status: "paid", ledgerAmount: 0 };
    if (booking.paymentStatus === "refunded") throw new Error("REFUNDED_BOOKING");
    return { changed: true, status: "paid", ledgerAmount: Number(booking.total), ledgerType: "payment", method };
  }
  if (action === "refund") {
    if (booking.paymentStatus === "refunded") return { changed: false, status: "refunded", ledgerAmount: 0 };
    if (booking.paymentStatus !== "paid") throw new Error("BOOKING_NOT_PAID");
    return { changed: true, status: "refunded", ledgerAmount: -Number(booking.total), ledgerType: "refund", method };
  }
  throw new Error("INVALID_PAYMENT_ACTION");
}
