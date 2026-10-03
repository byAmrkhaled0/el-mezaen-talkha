import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAppCheckFailure, isInvalidAuthSession, retryAuthenticatedCall } from "../src/admin-session.js";

const failure = (code, message = "") => Object.assign(new Error(message), { code });
const authWithToken = token => ({ currentUser: { getIdToken: token } });

test("valid Firebase Auth remains signed in when App Check attestation fails", async () => {
  const auth = authWithToken(async () => "valid-auth-token");
  let signedOut = 0;
  let attempts = 0;
  await assert.rejects(retryAuthenticatedCall(async () => { attempts++; throw failure("functions/unauthenticated"); }, {}, auth, async () => { signedOut++; }, async () => { throw failure("appCheck/fetch-status-error", "403 Forbidden"); }), { code: "appCheck/fetch-status-error" });
  assert.equal(attempts, 2);
  assert.equal(signedOut, 0);
  assert.ok(auth.currentUser);
});

test("a second unauthenticated callable rejection with valid Auth does not log out", async () => {
  let signedOut = 0;
  await assert.rejects(retryAuthenticatedCall(async () => { throw failure("functions/unauthenticated"); }, {}, authWithToken(async () => "fresh"), async () => { signedOut++; }, async () => true), { code: "functions/unauthenticated-with-valid-auth" });
  assert.equal(signedOut, 0);
});

test("revoked or disabled Firebase Auth refresh may sign out, transient network errors do not", async () => {
  for (const code of ["auth/user-token-expired", "auth/invalid-user-token", "auth/user-disabled"]) {
    let signedOut = 0;
    const auth = authWithToken(async () => { throw failure(code); });
    await assert.rejects(retryAuthenticatedCall(async () => { throw failure("functions/unauthenticated"); }, {}, auth, async () => { signedOut++; }), { code });
    assert.equal(signedOut, 1);
    assert.equal(isInvalidAuthSession(failure(code)), true);
  }
  let signedOut = 0;
  await assert.rejects(retryAuthenticatedCall(async () => { throw failure("functions/unauthenticated"); }, {}, authWithToken(async () => { throw failure("auth/network-request-failed"); }), async () => { signedOut++; }), { code: "auth/network-request-failed" });
  assert.equal(signedOut, 0);
});

test("recovered callable after fresh Auth and App Check continues", async () => {
  let calls = 0;
  const result = await retryAuthenticatedCall(async () => ++calls === 1 ? Promise.reject(failure("functions/unauthenticated")) : { data: { ok: true } }, {}, authWithToken(async () => "fresh"), async () => { throw Error("must not sign out"); });
  assert.equal(calls, 2);
  assert.deepEqual(result.data, { ok: true });
});

test("a later App Check recovery lets the same signed-in user retry", async () => {
  const auth = authWithToken(async () => "valid-auth-token");
  let signedOut = 0;
  let ready = false;
  const invoke = async () => {
    if (!ready) throw failure("functions/unauthenticated");
    return { data: { ok: true } };
  };
  const signOutSession = async () => { signedOut++; };
  await assert.rejects(retryAuthenticatedCall(invoke, {}, auth, signOutSession, async () => { throw failure("appCheck/fetch-status-error"); }), { code: "appCheck/fetch-status-error" });
  ready = true;
  assert.deepEqual((await retryAuthenticatedCall(invoke, {}, auth, signOutSession)).data, { ok: true });
  assert.equal(signedOut, 0);
  assert.ok(auth.currentUser);
});

test("App Check is probed once for startup and retried from Admin error UI without redirect loop", async () => {
  const [api, admin, login] = await Promise.all(["src/admin-api.js", "src/admin.js", "src/login.js"].map(path => readFile(new URL(`../${path}`, import.meta.url), "utf8")));
  assert.match(api, /appCheck = initializeAppCheck\(/);
  assert.match(api, /appCheckReadiness \|\|= getToken\(appCheck, forceRefresh\)/);
  assert.match(api, /await ensureAdminAppCheckReady\(\);/);
  assert.match(api, /FIREBASE_APPCHECK_DEBUG_TOKEN = true/);
  assert.match(api, /App Check غير مصرح لهذه البيئة المحلية/);
  assert.doesNotMatch(api, /FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*["'][\w-]+["']/);
  assert.match(admin, /loading\.append\(message, retry\)/);
  assert.match(admin, /ensureAdminAppCheckReady\(true\); await bootstrapAdmin\(user\)/);
  assert.match(admin, /if \(isInvalidAuthSession\(error\)\)/);
  assert.match(login, /signOut|logout|location\.replace\("\/admin\/"\)/);
  assert.match(api, /export async function logout\(\)[\s\S]*await signOut\(auth\)/);
  assert.match(admin, /logoutButton"\)\.addEventListener\("click"[\s\S]*await logout\(\); location\.replace\("\/login\/"\)/);
  assert.match(api, /Optional marketing access fails closed/);
  assert.equal(isAppCheckFailure(failure("appCheck/fetch-status-error")), true);
});
