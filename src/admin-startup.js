const marketingClaims=new Set(['offers','campaigns','gallery','results','hairMedia','celebrities','posts']);
export async function verifyStaffStartup(user,checkApplication) {
  // Both proofs are required. Start independent network work together, without caching access.
  const [token]=await Promise.all([user.getIdTokenResult(true),checkApplication()]);
  return token;
}
export function needsMarketingGrantCheck(role,permissions=[]) {
  return ['cashier','manager','media'].includes(role)&&permissions.some(value=>marketingClaims.has(value));
}
