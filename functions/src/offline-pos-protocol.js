import {createHash} from 'node:crypto';
// Offline sales use the same financial transaction as online POS. Device time,
// cached prices and permissions are never accepted as server authority.
export function offlinePosProtocol({HttpsError}) {
  const reject = message => { throw new HttpsError('failed-precondition', message); };
  const fingerprint = data => createHash('sha256').update(JSON.stringify(canonical(data))).digest('hex');
  function parse(data) {
    if (!data?.offline) return null;
    const o = data.offline;
    if (o.version !== 1 || !/^[A-Za-z0-9_-]{1,100}$/.test(o.shiftId || '') || !/^\d{4}-\d{2}-\d{2}$/.test(o.dateKey || '') || !Number.isFinite(o.total) || o.total < 0 || !Array.isArray(o.prices) || o.prices.length !== data.items?.length || o.prices.length > 40) reject('بيانات الشيك المحفوظ على الجهاز غير مكتملة؛ راجع قائمة المزامنة');
    if (data.paymentMethod !== 'cash' || data.paid !== true || Number(data.discountAmount || 0) || data.couponCode || Number(data.redeemPoints || 0) || Number(data.redeemCashback || 0)) reject('الشيكات الأوفلاين تدعم الدفع النقدي الكامل بدون خصم أو استبدال محفظة');
    return {...o, fingerprint: fingerprint(data)};
  }
  function check(offline, {items, total, activeShift, dateKey}) {
    if (!offline) return;
    if (offline.dateKey !== dateKey) reject('تاريخ الشيك مختلف عن يوم التشغيل الحالي؛ يحتاج مراجعة الإدارة قبل ترحيله');
    if (!activeShift || activeShift.ref.id !== offline.shiftId || activeShift.snapshot.data().status !== 'OPEN') reject('وردية الشيك الأصلية اتقفلت أو اتغيرت؛ الشيك محفوظ ويحتاج مراجعة الإدارة');
    if (Math.abs(offline.total - total) > 0.005 || items.length !== offline.prices.length || items.some((item, i) => {
      const price = offline.prices.find(p => p.id === item.id && p.kind === item.kind);
      if (!price) return true;
      return price.id !== item.id || price.kind !== item.kind || price.qty !== item.qty || !Number.isFinite(price.unitPrice) || Math.abs(price.unitPrice - item.unitPrice) > 0.005;
    })) reject('سعر أحد الأصناف اتغير؛ الشيك محفوظ للمراجعة بدون تغيير المبلغ تلقائيًا');
  }
  function match(offline, guard) {
    if (offline && guard.offlineFingerprint !== offline.fingerprint) reject('معرّف الشيك مستخدم ببيانات مختلفة؛ لا تعيد إنشاءه بمعرّف آخر');
  }
  return {parse, check, match};
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
