import test from "node:test";
import assert from "node:assert/strict";
import { addDays, cairoDateKey, reportId, reportPeriod, rollupDaily, weekStart } from "../src/reporting.js";

test("Cairo midnight differs from UTC and invalid dates fail closed", () => {
  assert.equal(cairoDateKey(new Date("2026-09-27T21:30:00Z")), "2026-09-28");
  assert.throws(() => reportPeriod("daily", "2026-02-30"), /INVALID_REPORT_DATE/);
});
test("week begins Monday and ends Sunday even across a month", () => {
  assert.equal(weekStart("2026-10-01"), "2026-09-28");
  assert.deepEqual(reportPeriod("weekly", "2026-09-28"), { key: "2026-09-28", start: "2026-09-28", end: "2026-10-04" });
  assert.throws(() => reportPeriod("weekly", "2026-09-29"), /INVALID_REPORT_WEEK/);
});
test("month ends correctly at leap year and year boundary", () => {
  assert.equal(reportPeriod("monthly", "2028-02").end, "2028-02-29");
  assert.equal(reportPeriod("monthly", "2026-12").end, "2026-12-31");
});
test("rollups use only daily summaries and disclose missing days", () => {
  const period = reportPeriod("weekly", "2026-09-28");
  const one = { periodKey: "2026-09-28", totals: { grossRevenue: 200, netRevenue: 180, refunds: 20, transactions: 2, bookings: 3 } };
  const result = rollupDaily([one], period, 1000);
  assert.equal(result.totals.netRevenue, 180);
  assert.equal(result.totals.averageTicket, 100);
  assert.equal(result.complete, false);
  assert.equal(result.missingDays.length, 6);
  assert.equal(result.target.amount, 1000);
  assert.notEqual(reportId("daily", "talkha", one.periodKey), reportId("daily", "mashaya", one.periodKey));
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("weekly and monthly reports classify advances inside cash-out without duplicating expenses", () => {
  const days = [
    { periodKey: "2026-09-28", totals: { cashOut: 50, advances: 20, expenses: 30, netRevenue: 200, grossRevenue: 300, transactions: 3 } },
    { periodKey: "2026-09-29", totals: { cashOut: 15, advances: 5, expenses: 10, netRevenue: 100, grossRevenue: 100, transactions: 1 } }
  ];
  for (const period of [reportPeriod("weekly", "2026-09-28"), reportPeriod("monthly", "2026-09")]) {
    const { totals } = rollupDaily(days, period);
    assert.equal(totals.cashOut, 65);
    assert.equal(totals.advances, 25);
    assert.equal(totals.expenses, 40);
    assert.equal(totals.netRevenue, 300);
  }
});
