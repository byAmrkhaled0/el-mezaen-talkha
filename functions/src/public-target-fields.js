// Monthly goals are internal; preserve the existing public branch booking fields.
export function withoutPublicTargetFields(data){return Object.fromEntries(Object.entries(data).filter(([key])=>!/^(monthlyTargets|monthlyRevenueTargets|monthlyTarget|monthlyRevenueTarget)(\.|$)/.test(key)));}
