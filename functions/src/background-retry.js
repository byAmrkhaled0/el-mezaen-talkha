import { createHash } from 'node:crypto';
const permanentCodes = new Set(['3','5','7','9','invalid-argument','not-found','permission-denied','failed-precondition']);

// Firebase events are at-least-once, including with retry disabled. The actual
// business handlers keep their durable deduplication keys. This wrapper only
// bounds failure retries and leaves an auditable terminal failure for support.
export function backgroundRetry({ db, timestamp, now = Date.now, report = console.error }) {
  return async function run(name, event, action) {
    const identity = String(event.id || `${event.subject || ''}|${event.time || ''}|${JSON.stringify(event.params || {})}`);
    const id = createHash('sha256').update(name + '|' + identity).digest('hex');
    const ref = db.doc(`backgroundEventFailures/${id}`);
    const eventTime = Date.parse(event.time || '');
    const expired = Number.isFinite(eventTime) && now() - eventTime > 24 * 60 * 60 * 1000;
    let failure;
    if (!expired) {
      try { return await action(); } catch (error) { failure = error; }
    } else failure = Object.assign(new Error('Background event exceeded retry age'), { code: 'EVENT_EXPIRED' });
    const code = String(failure.code || 'UNKNOWN').replace(/^functions\//, '').slice(0, 80);
    const permanent = expired || permanentCodes.has(code);
    const state = await db.runTransaction(async tx => {
      const previous = await tx.get(ref), data = previous.data() || {};
      const attempts = Number(data.attempts || 0) + 1;
      const terminal = permanent || attempts >= 8;
      tx.set(ref, { functionName: name, eventId: identity.slice(0, 250), attempts,
        state: terminal ? 'NEEDS_REVIEW' : 'RETRY', code, updatedAt: timestamp(),
        ...(!previous.exists ? { createdAt: timestamp() } : {}) }, { merge: true });
      return { terminal, attempts };
    });
    report('Background event failed', { functionName: name, eventId: identity, code, ...state });
    if (!state.terminal) throw failure;
    return { needsReview: true, code };
  };
}
