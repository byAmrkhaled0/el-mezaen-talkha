const invalidAuthCodes = new Set([
  "auth/user-disabled",
  "auth/user-token-expired",
  "auth/invalid-user-token",
  "auth/user-not-found"
]);

export const isInvalidAuthSession = error => invalidAuthCodes.has(String(error?.code || ""));

export function isAppCheckFailure(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code.startsWith("appcheck/") || code.startsWith("app-check/") || /app\s*check|appcheck|attestation/.test(message);
}

// A callable rejection alone cannot prove that the Firebase Auth session expired.
export async function retryAuthenticatedCall(invoke, data, auth, signOutSession, checkAttestation) {
  try { return await invoke(data); }
  catch (error) {
    if (error?.code !== "functions/unauthenticated" || !auth.currentUser) throw error;
    const user = auth.currentUser;
    try { await user.getIdToken(true); }
    catch (refreshError) {
      if (isInvalidAuthSession(refreshError) && auth.currentUser === user) await signOutSession(auth);
      throw refreshError;
    }
    try { return await invoke(data); }
    catch (retryError) {
      if (retryError?.code === "functions/unauthenticated" || isAppCheckFailure(retryError)) {
        await checkAttestation?.();
        if (retryError?.code === "functions/unauthenticated") {
          const message = "تعذر التحقق من طلب الإدارة رغم أن جلسة الدخول سليمة. تحقق من App Check ثم أعد المحاولة.";
          throw Object.assign(new Error(message, { cause: retryError }), { code: "functions/unauthenticated-with-valid-auth" });
        }
      }
      throw retryError;
    }
  }
}
