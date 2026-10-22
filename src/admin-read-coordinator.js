// Memory only. No customer data, results or credentials are persisted.
export function createReadCoordinator(invoke, {identity = () => '', now = Date.now, cooldownMs = 45000} = {}) {
  const active = new Map(), failures = new Map();
  const read = (name, data = {}) => {
    const scope = JSON.stringify([identity(), name]);
    const key = scope + JSON.stringify(Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b))));
    if (active.has(key)) return active.get(key);
    const failure = failures.get(scope);
    if (failure && now() < failure.until) return Promise.reject(failure.error);
    failures.delete(scope);
    const promise = Promise.resolve().then(() => invoke(name, data)).catch(error => {
      const code = String(error?.code || error?.cause?.code || '').replace(/^functions\//, '');
      if (['internal', 'unavailable', 'deadline-exceeded'].includes(code)) {
        if (failures.size >= 100) failures.delete(failures.keys().next().value);
        failures.set(scope, {error, until: now() + cooldownMs});
      }
      throw error;
    }).finally(() => {if (active.get(key) === promise) active.delete(key);});
    active.set(key, promise);
    return promise;
  };
  read.reset = () => {active.clear(); failures.clear();};
  return read;
}
