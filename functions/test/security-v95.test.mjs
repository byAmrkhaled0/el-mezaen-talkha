import test from "node:test";
import assert from "node:assert/strict";
import { canonicalManagedStoragePath, isOwnManagedStaffPhoto } from "../src/managed-media.js";
import { isCurrentAdmin, replaceClaimsAndRevoke } from "../src/privilege-change.js";

test("managed staff photo validator rejects wrong bucket, external lookalikes, encoded traversal and other workers", () => {
  const bucket = "project.appspot.com";
  const url = path => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
  assert.equal(isOwnManagedStaffPhoto(url("public/staff/worker-1/image.webp"), bucket, "worker-1"), true);
  assert.equal(isOwnManagedStaffPhoto("https://evil.example/public/staff/worker-1/image.webp", bucket, "worker-1"), false);
  assert.equal(isOwnManagedStaffPhoto(url("public/staff/worker-2/image.webp"), bucket, "worker-1"), false);
  assert.equal(isOwnManagedStaffPhoto(url("public/staff/worker-1/../worker-2/image.webp"), bucket, "worker-1"), false);
  assert.equal(isOwnManagedStaffPhoto(url("public/staff/worker-1/%2e%2e/image.webp"), bucket, "worker-1"), false);
  assert.equal(canonicalManagedStoragePath(url("public/staff/worker-1/image.webp"), "other.appspot.com"), "");
});

test("sensitive admin mutation checks current Auth user, not stale token role", async () => {
  for (const user of [{ disabled: true, customClaims: { role: "admin" } }, { disabled: false, customClaims: { role: "cashier" } }]) {
    assert.equal(await isCurrentAdmin({ getUser: async () => user }, "admin-1"), false);
  }
  assert.equal(await isCurrentAdmin({ getUser: async () => ({ disabled: false, customClaims: { role: "admin" } }) }, "admin-1"), true);
});

test("role downgrade revokes refresh tokens after claims and surfaces revocation failure", async () => {
  const calls = [];
  const auth = {
    async setCustomUserClaims(uid, claims) { calls.push(["claims", uid, claims.role]); },
    async revokeRefreshTokens(uid) { calls.push(["revoke", uid]); }
  };
  await replaceClaimsAndRevoke(auth, "cashier-1", { role: "worker", branchIds: ["talkha"] });
  assert.deepEqual(calls, [["claims", "cashier-1", "worker"], ["revoke", "cashier-1"]]);
  await assert.rejects(replaceClaimsAndRevoke({ ...auth, async revokeRefreshTokens() { throw new Error("AUTH_UNAVAILABLE"); } }, "cashier-1", { role: "worker" }), /AUTH_UNAVAILABLE/);
});
