import { createHash } from 'node:crypto';
export const reminderVersion = b => createHash('sha256').update(JSON.stringify([b?.branchId, b?.staffId, b?.bookingDate, b?.bookingTime])).digest('hex').slice(0, 32);
export function cairoAppointmentMillis(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return NaN;
  const target = Date.parse(`${date}T${time}:00Z`);
  let instant = target;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(formatter.formatToParts(instant).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
    const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    const delta = target - local;
    if (!delta) return instant;
    instant += delta;
  }
  return NaN; // Impossible local DST time: do not send a guessed reminder.
}
export function reminderEligible(booking, now = Date.now()) {
  return Boolean(booking && booking.staffId && !['any', 'none'].includes(booking.staffId) && ['pending', 'confirmed', 'arrived'].includes(booking.status) && cairoAppointmentMillis(booking.bookingDate, booking.bookingTime) > now);
}
