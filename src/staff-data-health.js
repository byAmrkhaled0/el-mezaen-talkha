export function staffBranchHealth(staff, branchIds=['talkha','mashaya']) {
  const assigned=Array.isArray(staff.branchIds)?staff.branchIds:[];
  const invalid=assigned.filter(id=>!branchIds.includes(id));
  return {missing:assigned.length===0,invalid,active:staff.active!==false,available:staff.available!==false,branchIds:assigned,linkedUid:staff.authUid||staff.userUid||staff.linkedUid||staff.uid||null,photo:Boolean(staff.imageUrl)};
}
export function auditStaffBranches(catalog) {
  const branchIds=(catalog.branches||[]).map(b=>b.id);
  const groups={Talkha:[],Mashaya:[],Both:[],Missing:[],Invalid:[]};
  for(const staff of catalog.staff||[]){const h=staffBranchHealth(staff,branchIds);const row={staffId:staff.id,name:staff.nameAr||staff.name||'',active:h.active,available:h.available,branchIds:h.branchIds,serviceIds:staff.serviceIds||[],linkedUid:h.linkedUid};const key=h.missing?'Missing':h.invalid.length?'Invalid':h.branchIds.includes('talkha')&&h.branchIds.includes('mashaya')?'Both':h.branchIds.includes('talkha')?'Talkha':'Mashaya';groups[key].push(row);}
  const warnings=(catalog.branches||[]).filter(b=>b.active!==false&&!(catalog.staff||[]).some(s=>s.active!==false&&s.branchIds?.includes(b.id))).map(b=>({branchId:b.id,warning:'Active branch has zero assigned active staff; owner mapping required'}));
  return {groups,warnings};
}
