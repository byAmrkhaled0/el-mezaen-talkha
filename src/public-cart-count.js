export function publicCartCount(rows) {
  return Array.isArray(rows) ? rows.reduce((sum, row) => {
    const qty = Number(row?.qty);
    return sum + (Number.isFinite(qty) && qty >= 1 ? Math.floor(qty) : 1);
  }, 0) : 0;
}
