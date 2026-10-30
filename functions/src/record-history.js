// Cursor scope is validated, and every page re-applies ownership/branch permissions.
export function historyCursor(data, scope, fail) {
  if (!data) return null;
  try {
    if (typeof data !== 'string' || data.length > 4000) throw Error();
    const cursor = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (cursor.scope !== scope || typeof cursor.id !== 'string' || !/^[A-Za-z0-9_-]{1,150}$/.test(cursor.id)) throw Error();
    return cursor;
  } catch { throw fail(); }
}
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
export function recordMatches(row, kind, filters) {
  if (kind === 'revenue') return (!filters.from || row.dateKey >= filters.from) && (!filters.to || row.dateKey <= filters.to)
    && (filters.staff === 'all' || row.staffId === filters.staff)
    && (filters.service === 'all' || (row.itemIds || []).includes(filters.service));
  const query = filters.query || '';
  const phone = query.replace(/\D/g, '');
  return row.source !== 'pos' && (!filters.date || (row.bookingDate || row.dateKey) === filters.date)
    && (filters.status === 'all' || (filters.status === 'active' ? ['pending','confirmed','arrived'].includes(row.status) : row.status === filters.status))
    && (filters.payment === 'all' || row.paymentStatus === filters.payment)
    && (!query || [row.id,row.code,row.customerName,row.phone,row.branchNameAr].some(v => String(v || '').toLowerCase().includes(query))
      || (phone.length >= 10 && String(row.phone || '').replace(/\D/g,'').replace(/^20/,'0') === phone.replace(/^20/,'0')));
}
export async function customerRecordPage({db,FieldPath,Timestamp,identity,kind,cursor,today,cleanDoc,fail}) {
  if (!['history','wallet','upcoming'].includes(kind)) throw fail();
  const scope = JSON.stringify([identity.uid,identity.customerId,kind,kind === 'upcoming' ? today : '']);
  const boundary = historyCursor(cursor,scope,fail);
  let query = db.collection(kind === 'wallet' ? 'walletTransactions' : 'bookings')
    .where(kind === 'wallet' ? 'customerId' : 'phoneHash','==',identity.customerId);
  if (kind === 'upcoming') {
    query = query.where('status','in',['pending','confirmed','arrived']).where('bookingDate','>=',today)
      .orderBy('bookingDate','asc').orderBy(FieldPath.documentId(),'asc');
    if (boundary) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(boundary.date || '')) throw fail();
      query = query.startAfter(boundary.date,boundary.id);
    }
  } else {
    query = query.orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc');
    if (boundary) {
      if (!Number.isInteger(boundary.seconds) || !Number.isInteger(boundary.nanos) || boundary.nanos < 0 || boundary.nanos >= 1e9) throw fail();
      query = query.startAfter(new Timestamp(boundary.seconds,boundary.nanos),boundary.id);
    }
  }
  const snapshot = await query.limit(21).get(), docs = snapshot.docs.slice(0,20), last = docs.at(-1);
  const value = last?.data();
  return {items:docs.map(cleanDoc),nextCursor:snapshot.size > 20 && last ? encode({scope,id:last.id,...(kind === 'upcoming' ? {date:value.bookingDate} : {seconds:value.createdAt.seconds,nanos:value.createdAt.nanoseconds})}) : null};
}
export async function adminRecordPage({db,FieldPath,Timestamp,uid,branches,data,cleanDoc,fail}) {
  const kind = data.kind;
  if (!['revenue','bookings'].includes(kind)) throw fail();
  const text = (v,fallback='') => String(v ?? fallback).trim().slice(0,120);
  const filters = kind === 'revenue' ? {from:text(data.from),to:text(data.to),staff:text(data.staff,'all'),service:text(data.service,'all')}
    : {date:text(data.date),query:text(data.query).toLowerCase(),status:text(data.status,'active'),payment:text(data.payment,'all')};
  for (const key of ['from','to','date']) if (filters[key] && !/^\d{4}-\d{2}-\d{2}$/.test(filters[key])) throw fail();
  if (filters.from && filters.to && filters.from > filters.to) throw fail();
  const scope = JSON.stringify([uid,[...branches].sort(),kind,filters]);
  const boundary = historyCursor(data.cursor,scope,fail);
  const pages = await Promise.all(branches.map(branchId => {
    let q = db.collection(kind === 'revenue' ? 'revenueLedger' : 'bookings').where('branchId','==',branchId);
    if (kind === 'revenue') {
      if (filters.from) q=q.where('dateKey','>=',filters.from);
      if (filters.to) q=q.where('dateKey','<=',filters.to);
      q=q.orderBy('dateKey','desc').orderBy(FieldPath.documentId(),'desc');
      if (boundary) {if (!/^\d{4}-\d{2}-\d{2}$/.test(boundary.date || '')) throw fail();q=q.startAfter(boundary.date,boundary.id);}
    } else {
      q=q.orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc');
      if (boundary) {if (!Number.isInteger(boundary.seconds)||!Number.isInteger(boundary.nanos)||boundary.nanos<0||boundary.nanos>=1e9) throw fail();q=q.startAfter(new Timestamp(boundary.seconds,boundary.nanos),boundary.id);}
    }
    return q.limit(51).get();
  }));
  const key = doc => kind === 'revenue' ? doc.data().dateKey : doc.data().createdAt;
  const compareKey = (a,b) => typeof a === 'string' ? Buffer.compare(Buffer.from(b),Buffer.from(a)) : b.seconds-a.seconds || b.nanoseconds-a.nanoseconds;
  const docs = pages.flatMap(s=>s.docs).sort((a,b)=>compareKey(key(a),key(b)) || Buffer.compare(Buffer.from(b.id),Buffer.from(a.id)));
  // Cursor follows the last SCANNED row, even when all rows were filtered out.
  const scanned = docs.slice(0,50), last=scanned.at(-1), value=last?.data();
  return {items:scanned.map(cleanDoc).filter(row=>recordMatches(row,kind,filters)),nextCursor:docs.length>50 && last ? encode({scope,id:last.id,...(kind==='revenue'?{date:value.dateKey}:{seconds:value.createdAt.seconds,nanos:value.createdAt.nanoseconds})}):null};
}
