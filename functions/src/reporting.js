// Cairo business periods use calendar keys rather than UTC midnight timestamps.
export const cairoDateKey = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
export const addDays = (key, days) => {
  const date = new Date(`${key}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== key) throw new Error("INVALID_REPORT_DATE");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
export function reportPeriod(type, key) {
  if (type === "daily" && /^\d{4}-\d{2}-\d{2}$/.test(key)) return { start: addDays(key, 0), end: addDays(key, 0), key };
  if (type === "weekly" && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const start = addDays(key, 0);
    if (new Date(`${start}T12:00:00Z`).getUTCDay() !== 1) throw new Error("INVALID_REPORT_WEEK");
    return { start, end: addDays(start, 6), key };
  }
  if (type === "monthly" && /^\d{4}-\d{2}$/.test(key)) {
    const start = `${key}-01`;
    addDays(start, 0);
    const [year, month] = key.split("-").map(Number);
    return { start, end: addDays(`${year}-${String(month + 1).padStart(2, "0")}-01`.replace(`${year}-13`, `${year + 1}-01`), -1), key };
  }
  throw new Error("INVALID_REPORT_PERIOD");
}
export const weekStart = key => {
  const day = new Date(`${addDays(key, 0)}T12:00:00Z`).getUTCDay();
  return addDays(key, -((day + 6) % 7));
};
export const reportId = (type, branchId, key) => `${type}_${branchId}_${key}`;
export function periodDays(period) {
  const days = [];
  for (let key = period.start; key <= period.end; key = addDays(key, 1)) days.push(key);
  return days;
}
export function rollupDaily(daily, period, targetAmount = null) {
  const fields = ["grossRevenue", "netRevenue", "cash", "card", "transfer", "other", "refunds", "expenses", "advances", "cashIn", "cashOut", "transactions", "bookings", "completed", "cancelled", "noShow"];
  const totals = Object.fromEntries(fields.map(field => [field, 0]));
  const days = periodDays(period).map(key => {
    const row = daily.find(item => item.periodKey === key);
    if (row) fields.forEach(field => { totals[field] += Number(row.totals?.[field] || 0); });
    return { key, available: Boolean(row), netRevenue: row?.totals?.netRevenue ?? null, bookings: row?.totals?.bookings ?? null };
  });
  totals.averageTicket = totals.transactions ? totals.grossRevenue / totals.transactions : 0;
  const target = targetAmount == null ? null : { amount: Number(targetAmount), actual: totals.netRevenue, remaining: Math.max(0, Number(targetAmount) - totals.netRevenue), percent: Number(targetAmount) > 0 ? Math.round(totals.netRevenue / Number(targetAmount) * 100) : 0 };
  return { totals, days, complete: days.every(day => day.available), missingDays: days.filter(day => !day.available).map(day => day.key), target };
}
