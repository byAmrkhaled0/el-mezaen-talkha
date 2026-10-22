// A working context is a selection, never an employment assignment.
export function workerContext(claimBranches, staffBranches, requested = '') {
  const authorizedBranchIds = [...new Set(Array.isArray(claimBranches) ? claimBranches : [])]
    .filter(id => ['talkha', 'mashaya'].includes(id) && Array.isArray(staffBranches) && staffBranches.includes(id));
  if (!authorizedBranchIds.length || (requested !== '' && !authorizedBranchIds.includes(requested))) {
    throw new Error('اختر فرعًا مصرحًا به لحسابك وسجل العامل');
  }
  return { authorizedBranchIds, activeBranchId: requested || authorizedBranchIds[0] };
}
