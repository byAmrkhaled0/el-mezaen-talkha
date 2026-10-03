// Refresh-token revocation follows the claim replacement. Failure must propagate.
export async function replaceClaimsAndRevoke(auth, uid, claims) {
  await auth.setCustomUserClaims(uid, claims);
  await auth.revokeRefreshTokens(uid);
}

export async function isCurrentAdmin(auth, uid) {
  const user = await auth.getUser(uid);
  return user.disabled !== true && user.customClaims?.role === "admin";
}
