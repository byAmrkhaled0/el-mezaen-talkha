import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizePhone } from "../functions/src/core.js";

const [backend, account, homepage, admin, rules, client, firebaseHosting, vercelHosting] = await Promise.all([
  "functions/src/index.js", "src/account.js", "src/app.js", "src/admin.js", "firestore.rules", "src/firebase-client.js", "firebase.json", "vercel.json"
].map(path => readFile(path, "utf8")));

test("one phone identity is shared across OTP, booking, account and admin lookup", () => {
  const variants = ["01012345678", "201012345678", "+201012345678", "1012345678"];
  assert.deepEqual(variants.map(normalizePhone), variants.map(() => "01012345678"));
  assert.match(account, /phoneE164\(value\) \{ return `\+2\$\{normalizePhone\(value\)\}`/);
  assert.match(backend, /customerId: hash\(phone\)/);
  assert.match(backend, /const customerRef = db\.doc\(`customers\/\$\{hash\(customer\.phone\)\}`\)/);
  assert.match(admin, /function whatsappPhone\(value\)[\s\S]*normalizePhone\(value\)/);
});

test("portal links an existing record and creates only when canonical ID is absent", () => {
  const portal = backend.slice(backend.indexOf("export const getCustomerPortal"), backend.indexOf("export const saveFavoriteBarber"));
  assert.match(portal, /transaction\.get\(customerRef\)/);
  assert.match(portal, /if \(!snapshot\.exists\) \{/);
  assert.match(portal, /transaction\.create\(customerRef/);
  assert.match(portal, /record\.authUid !== identity\.uid/);
  assert.match(portal, /where\("phoneHash", "==", identity\.customerId\)/);
  assert.match(portal, /bookingHistory: bookings\.slice/);
  assert.match(portal, /request\.data\?\.profileOnly === true/);
  assert.match(client, /getCustomerPortal", \{ profileOnly: true \}/);
});

test("booking and management actions enforce authenticated ownership in the backend", () => {
  for (const name of ["getCustomerBooking", "cancelCustomerBooking"]) {
    const section = backend.slice(backend.indexOf(`export const ${name}`), backend.indexOf("export const ", backend.indexOf(`export const ${name}`) + 13));
    assert.match(section, /authenticatedCustomer\(request\)/);
    assert.match(section, /phoneHash !== identity\.customerId/);
  }
  assert.match(backend, /if \(identity && suppliedPhone && suppliedPhone !== identity\.phone\)/);
  assert.match(backend, /phone: identity\?\.phone \|\| suppliedPhone/);
  assert.match(rules, /match \/\{document=\*\*\}/);
});

test("cancel and reschedule update lock and booking in one transaction with race guard", () => {
  const cancel = backend.slice(backend.indexOf("export const cancelCustomerBooking"), backend.indexOf("function scopedQueries"));
  assert.match(cancel, /booking\.status === "cancelled" && booking\.cancellationSource === "customer"/);
  assert.match(cancel, /booking\.paymentStatus === "paid"/);
  assert.match(cancel, /for \(const lockId of booking\.lockIds \|\| \[\]\) transaction\.delete/);
  assert.match(cancel, /transaction\.update\(ref, \{ status: "cancelled"/);
  const reschedule = backend.slice(backend.indexOf("export const rescheduleBooking"), backend.indexOf("export const submitReview"));
  assert.match(reschedule, /rescheduleGuards/);
  assert.match(reschedule, /latest\.data\(\)\.bookingDate !== current\.bookingDate/);
  assert.match(reschedule, /locks\.some\(lock => lock\.exists && lock\.data\(\)\?\.bookingId !== id\)/);
  assert.match(reschedule, /oldKeys\.filter\(key => !newKeys\.includes\(key\)\)\.forEach\(key => transaction\.delete/);
  assert.match(reschedule, /transaction\.update\(bookingRef, \{ bookingDate: date/);
});

test("repeat resets the appointment and account rescheduling uses current availability", () => {
  assert.match(homepage, /state\.date = ""; state\.time = "";/);
  assert.match(account, /call\("getAvailableSlots", \{ branchId: booking\.branchId, bookingDate: date/);
  assert.match(account, /excludeBookingId: booking\.id/);
  assert.match(account, /call\("rescheduleBooking", \{ id: selectedBooking\.id/);
  assert.match(account, /if \(actionBusy \|\| !selectedBooking\) return/);
  assert.match(account, /bookingHistory\.map\(item => bookingCard\(item, true\)\)/);
});

test("direct customer routes resolve with or without a trailing slash on both hosts", () => {
  for (const config of [firebaseHosting, vercelHosting]) {
    const rewrites = JSON.parse(config).hosting?.rewrites || JSON.parse(config).rewrites;
    for (const [route, destination] of [["/account", "/account/index.html"], ["/login", "/login/index.html"], ["/booking", "/booking/index.html"]]) {
      assert.ok(rewrites.some(item => item.source === route && item.destination === destination), route);
    }
  }
});
