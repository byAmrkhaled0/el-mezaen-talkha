export function operationalPushAllowed(user, device, branchId) {
  if (!user || user.disabled || !device?.token || device.uid !== user.uid) return false;
  const role = user.customClaims?.role;
  if (!['admin','manager','cashier'].includes(role)) return false;
  const registered = device.updatedAt?.toMillis?.() ?? Date.parse(device.updatedAt || '');
  if (user.tokensValidAfterTime && (!Number.isFinite(registered) || registered < Date.parse(user.tokensValidAfterTime))) return false;
  if (role === 'admin') return device.receiveAllBranches === true || device.branchIds?.includes(branchId) === true;
  return user.customClaims.branchIds?.includes(branchId) === true && device.branchIds?.includes(branchId) === true;
}
