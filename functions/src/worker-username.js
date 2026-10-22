// An address is an Auth identifier, never an authority for a role or branch.
export function normalizeWorkerUsername(value) {
  const name = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(name)) throw new Error('INVALID_WORKER_USERNAME');
  return name;
}
export const workerAuthEmail = value => `${normalizeWorkerUsername(value)}@workers.el-mezaen.invalid`;
