export function cashVariance(actualCash, expectedCash) {
  const actual = Number(actualCash);
  const expected = Number(expectedCash);
  return Number.isFinite(actual) && Number.isFinite(expected) && actualCash !== ""
    ? Math.round((actual - expected) * 100) / 100 : null;
}

export function closeShiftReasonMissing(actualCash, expectedCash, reason) {
  const variance = cashVariance(actualCash, expectedCash);
  return variance !== null && variance !== 0 && !String(reason || "").trim();
}
