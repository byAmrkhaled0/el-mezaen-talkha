export function normalizePhone(value) {
  let phone = String(value || "").replace(/[^\d+]/g, "");
  if (phone.startsWith("+20")) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith("20") && phone.length === 12) phone = `0${phone.slice(2)}`;
  if (!/^01[0125]\d{8}$/.test(phone)) throw new Error("INVALID_PHONE");
  return phone;
}

export function isRecentAuthentication(authTime, nowSeconds = Math.floor(Date.now() / 1000), maxAgeSeconds = 5 * 60) {
  const value = Number(authTime);
  return Number.isFinite(value) && value > 0 && nowSeconds >= value && nowSeconds - value <= maxAgeSeconds;
}

export function isValidDateKey(value) {
  const dateKey = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const date = new Date(`${dateKey}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateKey;
}

export function nextMonthKey(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw new Error("INVALID_MONTH");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) throw new Error("INVALID_MONTH");
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function normalizeExpenseInput(data = {}, { defaultDate = "", categories = [] } = {}) {
  const amount = Number(data.amount);
  const category = String(data.category || "").trim().slice(0, 30);
  const description = String(data.description || "").trim().slice(0, 200);
  const notes = String(data.notes || "").trim().slice(0, 500);
  const branchId = String(data.branchId || "").trim().toLowerCase().slice(0, 40);
  const dateKey = String(data.dateKey || defaultDate).trim().slice(0, 10);
  const inventoryItemId = category === "inventory" ? String(data.inventoryItemId || "").trim().slice(0, 100) : "";
  const stockQuantity = category === "inventory" ? Number(data.stockQuantity || 0) : 0;
  const paymentMethod = String(data.paymentMethod || "cash").trim().slice(0, 30);
  const idempotencyKey = String(data.idempotencyKey || "").trim().slice(0, 100);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) throw new Error("INVALID_EXPENSE_AMOUNT");
  if (!categories.includes(category)) throw new Error("INVALID_EXPENSE_CATEGORY");
  if (!description) throw new Error("INVALID_EXPENSE_DESCRIPTION");
  if (!/^[a-z0-9-]{2,40}$/.test(branchId) || branchId === "all") throw new Error("INVALID_EXPENSE_BRANCH");
  if (!isValidDateKey(dateKey)) throw new Error("INVALID_EXPENSE_DATE");
  if (!Number.isFinite(stockQuantity) || stockQuantity < 0 || stockQuantity > 1_000_000) throw new Error("INVALID_STOCK_QUANTITY");
  if (inventoryItemId && stockQuantity <= 0) throw new Error("INVALID_STOCK_QUANTITY");
  if (!["cash", "vodafone_cash", "instapay", "other"].includes(paymentMethod)) throw new Error("INVALID_PAYMENT_METHOD");
  if (idempotencyKey && !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  return { amount, category, kind: category === "inventory" ? "purchase" : "expense", description, notes, branchId, dateKey, inventoryItemId, stockQuantity, paymentMethod, idempotencyKey };
}

export function isDrinkAvailableAtBranch(drink, branchId) {
  return Boolean(drink && drink.active !== false && [branchId, "all"].includes(String(drink.branchId || "").toLowerCase()));
}

export function calculatePayroll({ baseSalary = 0, monthlyTarget = 0, targetBonusPercent = 0, revenue = 0, adjustment = 0 } = {}) {
  const base = Math.max(0, Number(baseSalary || 0));
  const target = Math.max(0, Number(monthlyTarget || 0));
  const percent = Math.max(0, Math.min(500, Number(targetBonusPercent || 0)));
  const earnedRevenue = Number(revenue || 0);
  const safeAdjustment = Number(adjustment || 0);
  const targetAchieved = target > 0 && earnedRevenue >= target;
  const bonus = targetAchieved ? Math.round(base * percent) / 100 : 0;
  const netSalary = Math.max(0, base + bonus + safeAdjustment);
  const progressPercent = target > 0 ? Math.max(0, Math.min(100, Math.round(earnedRevenue / target * 100))) : 0;
  return { baseSalary: base, monthlyTarget: target, targetBonusPercent: percent, revenue: earnedRevenue, targetAchieved, progressPercent, bonus, adjustment: safeAdjustment, netSalary };
}

export function calculateRevenueBreakdown(items = [], amount = 0) {
  const groups = { services: 0, products: 0, drinks: 0 };
  for (const item of items || []) {
    const value = Math.max(0, Number(item.lineTotal ?? (Number(item.unitPrice || 0) * Number(item.qty || 1))));
    if (item.kind === "drink" || (item.kind === "inventory" && item.category === "drink")) groups.drinks += value;
    else if (item.kind === "inventory" || item.kind === "product") groups.products += value;
    else groups.services += value;
  }
  const sourceTotal = groups.services + groups.products + groups.drinks;
  if (!sourceTotal) return { services: Number(amount || 0), products: 0, drinks: 0 };
  const ratio = Number(amount || 0) / sourceTotal;
  const roundMoney = value => { const rounded = Math.round(value * 100) / 100; return Object.is(rounded, -0) ? 0 : rounded; };
  const services = roundMoney(groups.services * ratio);
  const products = roundMoney(groups.products * ratio);
  const drinks = roundMoney(Number(amount || 0) - services - products);
  return { services, products, drinks };
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

export function distanceMeters(latitudeA, longitudeA, latitudeB, longitudeB) {
  const values = [latitudeA, longitudeA, latitudeB, longitudeB].map(Number);
  if (values.some(value => !Number.isFinite(value))) throw new Error("INVALID_COORDINATES");
  const [latA, lngA, latB, lngB] = values;
  if (Math.abs(latA) > 90 || Math.abs(latB) > 90 || Math.abs(lngA) > 180 || Math.abs(lngB) > 180) throw new Error("INVALID_COORDINATES");
  const radians = value => value * Math.PI / 180;
  const deltaLat = radians(latB - latA);
  const deltaLng = radians(lngB - lngA);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(deltaLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function validateAttendanceLocation({ branchLatitude, branchLongitude, latitude, longitude, accuracy, radiusMeters = 100 } = {}) {
  const safeAccuracy = Number(accuracy);
  const radius = Number(radiusMeters);
  if (!Number.isFinite(safeAccuracy) || safeAccuracy <= 0 || safeAccuracy > 150) throw new Error("LOCATION_ACCURACY_TOO_LOW");
  if (!Number.isFinite(radius) || radius < 25 || radius > 1000) throw new Error("INVALID_ATTENDANCE_RADIUS");
  const distance = distanceMeters(branchLatitude, branchLongitude, latitude, longitude);
  const tolerance = Math.min(50, safeAccuracy);
  if (distance > radius + tolerance) throw new Error("OUTSIDE_BRANCH_GEOFENCE");
  return { distanceMeters: Math.round(distance), accuracyMeters: Math.round(safeAccuracy), radiusMeters: Math.round(radius) };
}

export function priceItems(lines, docsById, now = new Date(), branchId = "") {
  if (!Array.isArray(lines) || !lines.length || lines.length > 30) throw new Error("INVALID_ITEMS");
  const seen = new Set();
  return lines.map(line => {
    const id = String(line?.id || "");
    if (!id || seen.has(id)) throw new Error("DUPLICATE_OR_INVALID_ITEM");
    seen.add(id);
    const source = docsById.get(id);
    if (!source || source.active === false || source.catalogVisible === false) throw new Error("ITEM_UNAVAILABLE");
    if (branchId && Array.isArray(source.branchIds) && source.branchIds.length && !source.branchIds.includes(branchId)) throw new Error("ITEM_UNAVAILABLE_AT_BRANCH");
    const kind = line.kind === "product" ? "product" : line.kind;
    if (source.kind !== kind && !(source.kind === "service" && kind === "product" && source.type === "product")) throw new Error("INVALID_ITEM_TYPE");
    if (source.status === "expired" || source.status === "stopped") throw new Error("ITEM_UNAVAILABLE");
    if (source.startAt && new Date(source.startAt).getTime() > now.getTime()) throw new Error("ITEM_NOT_STARTED");
    if (source.endAt && new Date(source.endAt).getTime() < now.getTime()) throw new Error("ITEM_EXPIRED");
    const qty = source.kind === "product" ? Math.max(1, Math.min(20, Number(line.qty || 1))) : 1;
    const choices = validatePackageChoices(source, line.choices);
    const serviceIds = source.kind === "service"
      ? [id]
      : [...new Set([
          ...(Array.isArray(source.includedServiceIds) ? source.includedServiceIds : []),
          ...choices.map(choice => choice.serviceId)
        ].map(value => String(value || "")).filter(Boolean))];
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
      staffRequired: source.kind !== "product",
      serviceIds,
      choices
    };
  });
}

export function validatePackageChoices(source, requested = {}) {
  const groups = Array.isArray(source?.choiceGroups) ? source.choiceGroups.slice(0, 10) : [];
  const entries = requested && typeof requested === "object" && !Array.isArray(requested) ? requested : {};
  if (!groups.length) {
    if (Object.keys(entries).length) throw new Error("UNEXPECTED_PACKAGE_CHOICES");
    return [];
  }
  const allowedGroupIds = new Set(groups.map(group => String(group?.id || "")).filter(Boolean));
  if (Object.keys(entries).some(id => !allowedGroupIds.has(String(id)))) throw new Error("INVALID_PACKAGE_CHOICE_GROUP");
  return groups.flatMap(group => {
    const groupId = String(group?.id || "");
    const optionId = String(entries[groupId] || "");
    const options = Array.isArray(group?.options) ? group.options.slice(0, 12) : [];
    const selected = options.find(option => String(option?.id || "") === optionId);
    if (!selected) {
      if (group?.required !== false) throw new Error("PACKAGE_CHOICE_REQUIRED");
      return [];
    }
    return [{
      groupId,
      groupLabelAr: String(group?.labelAr || groupId),
      groupLabelEn: String(group?.labelEn || group?.labelAr || groupId),
      optionId,
      optionLabelAr: String(selected?.labelAr || optionId),
      optionLabelEn: String(selected?.labelEn || selected?.labelAr || optionId),
      serviceId: selected?.serviceId ? String(selected.serviceId) : null
    }];
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
  const cairoParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const today = `${cairoParts.year}-${cairoParts.month}-${cairoParts.day}`;
  const nowMinutes = Number(cairoParts.hour) * 60 + Number(cairoParts.minute);
  if (date < today || (date === today && minutes(time) <= nowMinutes)) throw new Error("PAST_APPOINTMENT");
  const start = minutes(time);
  if (start < minutes(openingTime) || start + Number(duration || 0) > minutes(closingTime)) throw new Error("OUTSIDE_WORKING_HOURS");
  return { date, time, timeZone: "Africa/Cairo" };
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

export function calculateRewards(total, settings = {}) {
  const amount = Math.max(0, Number(total || 0));
  if (settings.loyaltyEnabled !== true || amount < Math.max(0, Number(settings.rewardsMinimumSpend || 0))) return { points: 0, cashback: 0 };
  const points = Math.max(0, Math.floor(amount * Math.max(0, Number(settings.pointsRate || 0))));
  const cashback = Math.max(0, Math.round(amount * Math.max(0, Number(settings.cashbackPercent || 0)))) / 100;
  return { points, cashback };
}

export function normalizeLineWorkers(items = [], legacyStaffId = "none") {
  return items.map(item => ({ ...item, workerId: String(item.workerId || (item.staffRequired ? legacyStaffId : "none") || "none") }));
}

export function serviceTargetEntries(items = []) {
  const result = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const kind = String(item?.kind || "").toLowerCase();
    const itemId = String(item?.id || "").trim();
    if (!["service", "package", "offer"].includes(kind) || !/^[A-Za-z0-9_-]{1,100}$/.test(itemId)) continue;
    const qty = Math.max(1, Math.min(100, Math.floor(Number(item?.qty || 1))));
    const key = `${kind}:${itemId}`;
    const current = result.get(key);
    if (current) current.count += qty;
    else result.set(key, {
      itemId,
      kind,
      nameAr: String(item?.nameAr || itemId).trim().slice(0, 120),
      nameEn: String(item?.nameEn || item?.nameAr || itemId).trim().slice(0, 120),
      count: qty
    });
  }
  return [...result.values()];
}

export function serviceTargetDocumentId({ month, branchId, kind, itemId } = {}) {
  const values = [month, branchId, kind, itemId].map(value => String(value || "").trim());
  const monthNumber = Number(values[0].slice(5));
  if (!/^\d{4}-\d{2}$/.test(values[0]) || monthNumber < 1 || monthNumber > 12 || !/^[a-z0-9-]{2,40}$/.test(values[1]) || !["service", "package", "offer"].includes(values[2]) || !/^[A-Za-z0-9_-]{1,100}$/.test(values[3])) throw new Error("INVALID_SERVICE_TARGET_KEY");
  return values.join("_");
}

export function calculateServiceTargetProgress(targetCount = 0, achievedCount = 0) {
  const target = Math.max(0, Math.floor(Number(targetCount || 0)));
  const achieved = Math.max(0, Math.floor(Number(achievedCount || 0)));
  return {
    targetCount: target,
    achievedCount: achieved,
    remainingCount: Math.max(0, target - achieved),
    progressPercent: target ? Math.max(0, Math.min(100, Math.round(achieved / target * 100))) : 0
  };
}

export function calculateExpectedCash({ openingCash = 0, cashSales = 0, cashIn = 0, cashOut = 0, cashRefunds = 0 } = {}) {
  return Math.round((Number(openingCash || 0) + Number(cashSales || 0) + Number(cashIn || 0) - Number(cashOut || 0) - Number(cashRefunds || 0)) * 100) / 100;
}
