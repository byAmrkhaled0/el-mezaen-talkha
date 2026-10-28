import { createHash } from 'node:crypto';
export const reminderVersion = b => createHash('sha256').update(JSON.stringify([b?.branchId, b?.staffId, b?.bookingDate, b?.bookingTime])).digest('hex').slice(0, 32);
import {cairoAppointmentMillis} from './cairo-time.js';
export {cairoAppointmentMillis} from './cairo-time.js';
export function reminderEligible(booking, now = Date.now()) {
  return Boolean(booking && !(booking.source==='website'&&booking.status==='pending') && booking.staffId && !['any', 'none'].includes(booking.staffId) && ['pending', 'confirmed', 'arrived'].includes(booking.status) && cairoAppointmentMillis(booking.bookingDate, booking.bookingTime) > now);
}

export function snapshotRevision(snapshot) {
  const stamp = snapshot?.updateTime;
  return stamp ? `${stamp.seconds}:${stamp.nanoseconds}` : '';
}
export function isCurrentEvent(live, after) {
  const expected = snapshotRevision(after);
  return !expected || snapshotRevision(live) === expected;
}
export function workerEventKey(event, entityId, fallback) {
  return createHash('sha256').update(`${entityId}|${event.id || snapshotRevision(event.data?.after) || fallback}`).digest('hex').slice(0,32);
}
