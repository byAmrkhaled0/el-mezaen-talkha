import {assertDemoEmulator,connectLocalAuth,connectLocalFunctions,connectLocalStorage} from './firebase-local-emulators.js';
import {parseCustomerProfile} from '../functions/src/customer-profile.js';
import {createCustomerAccountRouter} from './customer-account-entry.js';
import {isOtpLoopback,normalizeOtp,hostedAccountUrl} from './customer-onboarding.js';
import {readPublicCatalogCache, purgeLegacyCatalogCache} from './catalog-cache.js';
import {applySiteMedia} from './site-media.js';
import {getLang} from "./i18n.js";
import {accountCopy} from "./account-copy.js";
import './global-navigation.js';
import { safeMediaUrl } from "./media.js";
import "./account.css";
import "./account-favorite.css";
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, browserLocalPersistence, getAuth, onAuthStateChanged, RecaptchaVerifier, setPersistence, signInWithPhoneNumber, signOut } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { normalizePhone } from "../functions/src/core.js";
import { bindSafeBack } from "./navigation.js";
import { availableAtBranch } from "./branch-availability.js";

bindSafeBack();
purgeLegacyCatalogCache();
const config = globalThis.__FIREBASE_CONFIG__ || {};
const configured = Boolean(config.projectId && !String(config.projectId).includes("YOUR_"));
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const money = value => `${Number(value || 0).toFixed(2)} ${getLang() === "en" ? "EGP" : "ج.م"}`;
const dateKey = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (key, days) => { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
let registrationMode = false, pendingRegistration = null, retryAt = 0, retryTimer;
document.querySelector('#loginCard').hidden=true;
const accountEntryRouter=createCustomerAccountRouter({
 showGuest(){resetAccountEntry();$('#accountRestoring').hidden=true;$('#customerGuest').hidden=false;},
 showPending(){resetAccountEntry();$('#customerGuest').hidden=true;$('#accountRestoring').hidden=false;},
 async showCustomer(){await enterAccount();$('#accountRestoring').hidden=true;},
 navigate:destination=>location.replace(destination),
 onError:error=>{$('#customerGuestMessage').textContent=friendly(error);}
});
let auth, functions, confirmation, portalData, catalog, unsubscribe, loginBusy = false, actionBusy = false, loadSequence = 0, selectedBooking = null, availableSlots = [];
function resetAccountEntry(){++loadSequence;portalData=null;selectedBooking=null;$('#profileSetup').hidden=true;$('#portal').hidden=true;$('#loginCard').hidden=true;$('#logout').hidden=true;$('#customerGuestMessage').textContent='';}
function message(value, error = false, target = "#loginMessage") { $(target).textContent = value; $(target).dataset.messageState = error ? "error" : "success"; $(target).setAttribute("role", error ? "alert" : "status"); }
function friendly(error) {
  // Do not log profile data, phone numbers or OTP values.

  const code = String(error?.code || "").replace(/^(auth|functions)\//, "");
  if (code === 'captcha-check-failed' && /hostname|domain/i.test(error?.message||'')) return accountCopy('تعذر التحقق من عنوان الموقع؛ افتح حسابك من الموقع الرسمي.');
  if (getLang() === "ar" && error?.message && /[\u0600-\u06ff]/.test(error.message) && !/^Firebase:/.test(error.message)) return error.message;
  return ({ "invalid-phone-number": accountCopy("اكتب رقم موبايل مصري صحيح"), "invalid-verification-code": accountCopy("رمز التحقق غير صحيح"), "code-expired": accountCopy("انتهت صلاحية الرمز؛ أعد إرساله"), "invalid-verification-id": accountCopy("انتهت صلاحية الرمز؛ أعد إرساله"), "too-many-requests": accountCopy("محاولات كثيرة؛ انتظر قليلًا ثم حاول مرة أخرى"), "captcha-check-failed": accountCopy("تعذر التحقق؛ أعد اختبار الحماية"), "missing-app-credential": accountCopy("أكمل اختبار الحماية ثم حاول مرة أخرى"), "network-request-failed": accountCopy("تحقق من اتصال الإنترنت ثم حاول مرة أخرى"), unauthenticated: accountCopy("سجّل الدخول من جديد"), "permission-denied": accountCopy("تعذر التحقق من صلاحية الطلب"), "failed-precondition": accountCopy("تغيرت حالة الحجز أو الموعد؛ حدّث البيانات وحاول مجددًا"), "not-found": accountCopy("لم نجد حجزًا تابعًا لحسابك"), "already-exists": accountCopy("تم تنفيذ هذا الطلب من قبل"), "resource-exhausted": accountCopy("محاولات كثيرة؛ انتظر قليلًا"), internal: accountCopy("حدث خطأ مؤقت؛ حاول لاحقًا") })[code] || (error?.message === "INVALID_PHONE" ? accountCopy("اكتب رقم موبايل مصري صحيح") : accountCopy("تعذر إتمام الطلب؛ حاول مرة أخرى"));
}
function phoneE164(value) { return `+2${normalizePhone(value)}`; }
async function call(name, data = {}) { return (await httpsCallable(functions, name, { timeout: 30000 })(data)).data; }
// One catalog promise per account-page session, shared with the authenticated portal.
let accountCatalogPromise;
function loadPublicAccountCatalog(){return accountCatalogPromise ||= call('getCatalog').then(data=>{applySiteMedia(data.settings||{});window.dispatchEvent(new CustomEvent('mz:catalog',{detail:data}));return data;}).catch(error=>{accountCatalogPromise=null;throw error;});}


function statusLabel(status) { return ({ pending: accountCopy("جديد"), confirmed: accountCopy("مؤكد"), arrived: accountCopy("وصل"), completed: accountCopy("مكتمل"), cancelled: accountCopy("ملغي"), rejected: accountCopy("مرفوض"), no_show: accountCopy("عدم حضور"), void: accountCopy("ملغي") })[status] || status || "—"; }
function bookingCard(item, actions = false) {
  const cancellable = ["pending", "confirmed"].includes(item.status) && item.paymentStatus !== "paid";
  const names = getLang() === "en" && item.serviceNamesEn?.length ? item.serviceNamesEn : item.serviceNamesAr?.length ? item.serviceNamesAr : (item.items || []).map(line => (getLang() === "en" ? line.nameEn || line.nameAr : line.nameAr) || line.id);
  return `<div class="booking-card"><b>${esc(item.code || item.id)}</b><span>${esc(statusLabel(item.status))}</span><small>${accountCopy("الفرع:")} ${esc((getLang() === "en" ? item.branchNameEn || item.branchNameAr : item.branchNameAr) || item.branchId || "—")}</small><small>${esc(names.join(" + ") || accountCopy("لا توجد خدمات"))}</small><small>${accountCopy("المتخصص:")} ${esc((getLang() === "en" ? item.staffNameEn || item.staffNameAr : item.staffNameAr) || "—")}</small><small>${accountCopy("الموعد:")} ${esc(item.bookingDate || accountCopy("طلب منتجات"))} ${esc(item.bookingTime || "")}</small><small>${accountCopy("الفرعي:")} ${money(item.subtotal)} • ${accountCopy("الخصم:")} ${money(item.discountAmount)}${item.couponCode ? ` • ${accountCopy("كوبون")} ${esc(item.couponCode)}` : ""}${item.walletRedemptionAmount ? ` • ${accountCopy("من المحفظة:")} ${money(item.walletRedemptionAmount)}` : ""}</small><strong>${accountCopy("الإجمالي:")} ${money(item.total)}</strong>${["pending", "confirmed"].includes(item.status) && item.paymentStatus === "paid" ? accountCopy("<small>الإلغاء بعد الدفع يحتاج التواصل مع الفرع لمعالجة الاسترداد.</small>") : ""}${actions ? `<div class="booking-actions">${cancellable ? `<button type="button" data-cancel="${esc(item.id)}">${accountCopy("إلغاء")}</button>` : ""}${["pending", "confirmed"].includes(item.status) && !item.productOnly ? `<button type="button" data-reschedule="${esc(item.id)}">${accountCopy("تغيير الموعد")}</button>` : ""}<button type="button" data-repeat="${esc(item.id)}">${accountCopy("كرر الحجز")}</button></div>` : ""}</div>`;
}
function renderFavorite() {
  const item = catalog?.staff?.find(value => value.id === $("#favoriteStaff").value);
  const target = $("#favoriteDetails");
  target.hidden = !item; $("#bookFavorite").hidden = !item;
  if (item) target.innerHTML = `${item.imageUrl ? `<img src="${esc(safeMediaUrl(item.imageUrl))}" alt="${esc(getLang() === "en" ? item.nameEn || item.nameAr : item.nameAr)}" width="72" height="72">` : ""}<div><b>${esc(getLang() === "en" ? item.nameEn || item.nameAr : item.nameAr)}</b><span>${esc((getLang() === "en" ? item.specialtyEn || item.specialtyAr : item.specialtyAr) || accountCopy("حلاق مزين مصر"))}</span><small>${(item.branchIds || []).map(id => esc(catalog.branches.find(branch => branch.id === id)?.nameAr || id)).join(" • ")}</small><small>${accountCopy("المواعيد المتاحة تظهر بعد اختيار الخدمة والتاريخ.")}</small></div>`;
}
async function loadPortal() {
  const sequence = ++loadSequence;
  const [data, nextCatalog] = await Promise.all([call("getCustomerPortal"), loadPublicAccountCatalog()]);
  if (sequence !== loadSequence || !auth.currentUser) return;
  portalData = data; catalog = nextCatalog; populateProfileBranches(nextCatalog);
  const c = data.customer;
  if(!c.firstName || !c.lastName){showProfileSetup(c);return;}
  $("#profileSetup").hidden=true;
  $("#customerName").textContent = `${c.firstName || ""} ${c.lastName || ""}`.trim() || accountCopy("عميل مزين مصر");
  $("#customerPhoneDisplay").textContent = c.phone || "";
  $("#whatsappMarketingConsent").checked = c.whatsappOptIn === true;
  $("#points").textContent = Number(c.pointsBalance || 0);
  $("#cashback").textContent = money(c.cashbackBalance);
  const visits = Number(c.bookingCount || data.bookingHistory?.length || 0);
  const tier = visits >= 10 ? { name: accountCopy("عميل مميز"), from: 10, to: 20 } : visits >= 5 ? { name: accountCopy("عميل دائم"), from: 5, to: 10 } : { name: accountCopy("عضو مزين"), from: 0, to: 5 };
  const progress = Math.min(100, Math.round((visits - tier.from) / (tier.to - tier.from) * 100));
  $("#memberTier").textContent = tier.name; $("#tierProgressValue").textContent = `${progress}%`;
  $("#tierProgressBar").style.width = `${progress}%`;
  $("#tierProgressLabel").textContent = visits >= 20 ? accountCopy("وصلت لأعلى مستوى حاليًا") : (getLang() === "en" ? `${Math.max(0, tier.to - visits)} visits to the next tier` : `متبقي ${Math.max(0, tier.to - visits)} زيارة للمستوى التالي`);
  if (c.qrToken) { const {default: QRCode} = await import("qrcode"); if (sequence !== loadSequence || !auth.currentUser) return; await QRCode.toCanvas($("#customerQr"), c.qrToken, { width: 220, margin: 1, errorCorrectionLevel: "M" }); }
  $("#upcoming").innerHTML = data.upcomingBookings.map(item => bookingCard(item, true)).join("") || accountCopy("<div>لا توجد حجوزات قادمة.</div>");
  $("#bookingHistory").innerHTML = data.bookingHistory.map(item => bookingCard(item, true)).join("") || accountCopy("<div>لا يوجد سجل حجوزات بعد.</div>");
  $("#walletActivity").innerHTML = data.walletActivity.map(item => `<div><b>${esc(item.type)}</b><br>${Number(item.points || 0)} ${accountCopy("نقطة")} • ${money(item.cashback)}</div>`).join("") || accountCopy("<div>لا توجد حركات بعد.</div>");
  $("#lastBooking").innerHTML = data.lastBooking ? bookingCard(data.lastBooking) : accountCopy("لا يوجد حجز سابق.");
  $("#repeatBooking").hidden = !data.lastBooking;
  $("#favoriteStaff").innerHTML = accountCopy('<option value="">اختر الحلاق</option>') + catalog.staff.map(item => `<option value="${esc(item.id)}" ${item.id === c.favoriteStaffId ? "selected" : ""}>${esc(getLang() === "en" ? item.nameEn || item.nameAr : item.nameAr)} • ${esc((getLang() === "en" ? item.specialtyEn || item.specialtyAr : item.specialtyAr) || "")}</option>`).join("");
  renderFavorite(); $("#loginCard").hidden = true; $("#portal").hidden = false; $("#logout").hidden = false;
}
function findBooking(id) { return portalData?.bookingHistory?.find(item => item.id === id); }
function repeatBooking(item) {
  const branch = catalog?.branches?.find(value => value.id === item.branchId && value.active !== false);
  if (!branch) { message(accountCopy("فرع هذا الحجز لم يعد متاحًا؛ اختر فرعًا وخدمات جديدة."), true, "#accountMessage"); return; }
  const lines = (item.items || []).map(line => ({ id: line.id, kind: line.kind, qty: line.qty || 1, option: line.option || "", choices: Array.isArray(line.choices) ? Object.fromEntries(line.choices.map(choice => [choice.groupId, choice.optionId])) : line.choices || {} }));
  const index = new Map([...catalog.services, ...catalog.packages, ...catalog.offers, ...(catalog.products || []), ...(catalog.drinks || []).map(entry => ({ ...entry, kind: "drink" }))].map(entry => [entry.id, entry]));
  const valid = lines.filter(line => { const entry = index.get(line.id); return entry && entry.active !== false && entry.status !== "expired" && entry.status !== "stopped" && availableAtBranch(entry, branch.id, entry.kind === "drink"); });
  if (!valid.length) { message(accountCopy("خدمات هذا الحجز لم تعد متاحة في الفرع؛ اختر بدائل من القائمة."), true, "#accountMessage"); return; }
  sessionStorage.setItem("mz-repeat-booking", JSON.stringify({ branchId: branch.id, staffId: item.staffId, items: valid }));
  if (valid.length < lines.length) sessionStorage.setItem("mz-repeat-notice", accountCopy("بعض خدمات الحجز السابق لم تعد متاحة؛ راجع الاختيارات واختر موعدًا جديدًا."));
  location.href = "/?repeat=1#services";
}
function rescheduleLines(item) { return (item.items || []).filter(line => ["service", "package", "offer", "product"].includes(line.kind)).map(line => ({ id: line.id, kind: line.kind, qty: line.qty || 1, choices: Array.isArray(line.choices) ? Object.fromEntries(line.choices.map(choice => [choice.groupId, choice.optionId])) : line.choices || {} })); }
async function refreshSlots() {
  const booking = selectedBooking, date = $("#rescheduleDate").value;
  const select = $("#rescheduleSlot"); select.disabled = true; select.innerHTML = accountCopy('<option value="">جاري تحميل المواعيد…</option>');
  availableSlots = [];
  if (!booking || !date) { select.innerHTML = accountCopy('<option value="">اختر التاريخ أولًا</option>'); return; }
  try {
    const result = await call("getAvailableSlots", { branchId: booking.branchId, bookingDate: date, staffId: "any", items: rescheduleLines(booking), excludeBookingId: booking.id });
    if (selectedBooking?.id !== booking.id || $("#rescheduleDate").value !== date) return;
    availableSlots = (result.slots || []).flatMap(time => (result.staffBySlot?.[time] || []).map(staff => ({ time, staffId: staff.id, staffNameAr: staff.nameAr })));
    select.innerHTML = availableSlots.length ? accountCopy('<option value="">اختر الموعد المتاح</option>') + availableSlots.map((slot, index) => `<option value="${index}">${esc(slot.time)} • ${esc(slot.staffNameAr)}</option>`).join("") : accountCopy('<option value="">لا توجد مواعيد متاحة؛ جرّب تاريخًا آخر</option>');
    select.disabled = !availableSlots.length;
    message(availableSlots.length ? accountCopy("اختر موعدًا جديدًا.") : accountCopy("لا توجد مواعيد متاحة لهذا التاريخ."), !availableSlots.length, "#rescheduleMessage");
  } catch (error) { select.innerHTML = accountCopy('<option value="">تعذر تحميل المواعيد</option>'); message(friendly(error), true, "#rescheduleMessage"); }
}
function openReschedule(item) {
  if (actionBusy || !item || !["pending", "confirmed"].includes(item.status)) return;
  selectedBooking = item; $("#rescheduleDescription").textContent = `${(getLang() === "en" ? item.branchNameEn || item.branchNameAr : item.branchNameAr) || item.branchId} • ${item.code} • ${item.bookingDate} ${item.bookingTime}`;
  $("#rescheduleDate").min = dateKey(); $("#rescheduleDate").max = addDays(dateKey(), 60); $("#rescheduleDate").value = "";
  $("#rescheduleSlot").innerHTML = accountCopy('<option value="">اختر التاريخ أولًا</option>'); $("#rescheduleSlot").disabled = true;
  message("", false, "#rescheduleMessage"); $("#reschedulePanel").hidden = false; $("#reschedulePanel").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
const profileKeys={firstName:'accountFirstName',lastName:'accountLastName',email:'accountEmail',city:'accountCity',address:'accountAddress',birthDate:'accountBirthDate',preferredBranchId:'accountPreferredBranch'};
function profileInput(prefix){return parseCustomerProfile(Object.fromEntries(Object.entries(profileKeys).map(([key,id])=>[key,$('#'+prefix+id).value])),dateKey());}
function fillProfile(prefix,data={}){for(const [key,id] of Object.entries(profileKeys))$('#'+prefix+id).value=data[key]||'';}
function populateProfileBranches(data){for(const prefix of ['reg','profile']){const select=$('#'+prefix+'accountPreferredBranch'),selected=select.value;select.innerHTML=`<option value="">${accountCopy('اختار الفرع')}</option>`+(data.branches||[]).filter(item=>item.active!==false).map(item=>`<option value="${esc(item.id)}">${esc(getLang()==='en'?item.nameEn||item.nameAr:item.nameAr)}</option>`).join('');select.value=selected;}}
function showProfileSetup(data={}){$('#profileSetup').hidden=false;$('#portal').hidden=true;$('#loginCard').hidden=true;$('#logout').hidden=false;$('#verifiedProfilePhone').textContent=auth.currentUser?.phoneNumber||'';fillProfile('profile',data);$('#cancelProfileEdit').hidden=!portalData?.customer?.firstName;}
function showOtpHostNotice(){const url=hostedAccountUrl(globalThis.__SITE_URL__||'https://'+config.authDomain);$('#otpHostNotice').hidden=false;$('#otpHostText').textContent=accountCopy('رمز SMS الحقيقي متاح من عنوان الموقع الرسمي. على اللوكال استخدم محاكيات الاختبار فقط.');$('#openHostedAccount').hidden=!url;if(url)$('#openHostedAccount').href=url;}
function updateRetry(){const seconds=Math.max(0,Math.ceil((retryAt-Date.now())/1000));$('#retryCode').disabled=loginBusy||seconds>0;$('#retryCode').textContent=seconds?`${accountCopy('إعادة إرسال الرمز')} (${seconds})`:accountCopy('إعادة إرسال الرمز');if(!seconds&&retryTimer){clearInterval(retryTimer);retryTimer=null;}}
async function enterAccount(){if(pendingRegistration){try{await call('saveCustomerProfile',pendingRegistration);pendingRegistration=null;}catch(error){showProfileSetup(pendingRegistration);message(friendly(error),true,'#profileMessage');return;}}await loadPortal();}
$('#registerMode').addEventListener('click',()=>setRegistrationMode(true));
$('#loginMode').addEventListener('click',()=>setRegistrationMode(false));
function setRegistrationMode(value){if(loginBusy||confirmation)return;registrationMode=value;$('#registrationFields').hidden=!value;$('#registrationFields').disabled=!value;$('#registerMode').setAttribute('aria-pressed',String(value));$('#loginMode').setAttribute('aria-pressed',String(!value));pendingRegistration=null;message('');}
$('#profileForm').addEventListener('submit',async event=>{event.preventDefault();if(actionBusy||!auth?.currentUser)return;actionBusy=true;const button=$('#saveProfile');button.disabled=true;try{await call('saveCustomerProfile',profileInput('profile'));pendingRegistration=null;await loadPortal();message(accountCopy('تم حفظ بيانات حسابك.'),false,'#accountMessage');}catch(error){message(friendly(error),true,'#profileMessage');}finally{actionBusy=false;button.disabled=false;}});
$('#editProfile').addEventListener('click',()=>showProfileSetup(portalData?.customer||{}));
$('#cancelProfileEdit').addEventListener('click',()=>{if(actionBusy||!portalData?.customer?.firstName)return;$('#profileSetup').hidden=true;$('#portal').hidden=false;});



if (!configured) {accountEntryRouter.update(null);$('#customerGuestMessage').textContent=accountCopy("إعداد Firebase غير مكتمل.");}
else {
  if(globalThis.__USE_EMULATORS__)assertDemoEmulator(config);
  const app = initializeApp(config);
  if (globalThis.__APP_CHECK_SITE_KEY__) initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(globalThis.__APP_CHECK_SITE_KEY__), isTokenAutoRefreshEnabled: true });
  auth = getAuth(app); functions = getFunctions(app, "europe-west1");
  if(globalThis.__USE_EMULATORS__){connectLocalAuth(auth,connectAuthEmulator);connectLocalFunctions(functions,connectFunctionsEmulator);}
  setPersistence(auth, browserLocalPersistence).then(() => {
    unsubscribe = onAuthStateChanged(auth, user => {void accountEntryRouter.update(user);}, error => {void accountEntryRouter.update(null);$('#customerGuestMessage').textContent=friendly(error);});
  }).catch(error => {void accountEntryRouter.update(null);$('#customerGuestMessage').textContent=friendly(error);});
  window.addEventListener("pagehide", () => {accountEntryRouter.dispose();unsubscribe?.();clearInterval(retryTimer);});
}
async function sendCode() {
  if (loginBusy || !auth) return;
  if(Date.now()<retryAt){message(accountCopy("انتظر قبل إعادة إرسال الرمز"),true);return;}
  loginBusy = true; const button = $("#sendCode"); button.disabled = true; $("#retryCode").disabled = true; button.textContent = accountCopy("جاري إرسال الرمز…");
  try {
    const phone = phoneE164($("#phone").value);
    if(!$('#phoneConsent').checked)throw new Error('وافق على إرسال رمز التحقق أولًا');
    pendingRegistration=registrationMode?profileInput('reg'):null;
    if(isOtpLoopback(location.hostname)&&!globalThis.__USE_EMULATORS__){showOtpHostNotice();message(accountCopy('افتح الموقع الرسمي لإرسال رمز OTP الحقيقي.'),true);return;}
    if (!globalThis.recaptchaVerifier) globalThis.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha", { size: "normal" });
    confirmation = await signInWithPhoneNumber(auth, phone, globalThis.recaptchaVerifier);
    retryAt=Date.now()+60000;clearInterval(retryTimer);retryTimer=setInterval(updateRetry,1000);updateRetry();
    $("#phoneForm").hidden = true; $("#codeForm").hidden = false; message(accountCopy("تم إرسال رمز التحقق."));
  } catch (error) { message(friendly(error), true); try { globalThis.recaptchaVerifier?.clear(); } catch {} globalThis.recaptchaVerifier = null; }
  finally { loginBusy = false; button.disabled = false; updateRetry(); button.textContent = accountCopy("إرسال رمز التحقق"); }
}
$("#phoneForm").addEventListener("submit", event => { event.preventDefault(); void sendCode(); });
$("#retryCode").addEventListener("click", async () => { if (loginBusy || Date.now()<retryAt) return; try { const widgetId = await globalThis.recaptchaVerifier?.render(); if (widgetId != null) globalThis.grecaptcha?.reset(widgetId); } catch {} void sendCode(); });
$("#changePhone").addEventListener("click", () => { if (loginBusy) return; confirmation = null; $("#codeForm").hidden = true; $("#phoneForm").hidden = false; message(""); });
$("#codeForm").addEventListener("submit", async event => {
  event.preventDefault(); if (loginBusy || !confirmation) return;
  loginBusy = true; const button = $("#verifyCode"); button.disabled = true; $("#retryCode").disabled = true; button.textContent = accountCopy("جاري التحقق…");
  try { await confirmation.confirm(normalizeOtp($("#code").value)); confirmation = null; message(accountCopy("تم تسجيل الدخول.")); }
  catch (error) { message(friendly(error), true); }
  finally { loginBusy = false; button.disabled = false; updateRetry(); button.textContent = accountCopy("تأكيد الدخول"); }
});
$("#logout").addEventListener("click", async event => { const button = event.currentTarget; if (button.disabled) return; button.disabled = true; button.textContent = accountCopy("جاري الخروج…"); try { pendingRegistration=null;await signOut(auth); message(accountCopy("تم تسجيل الخروج.")); } catch (error) { message(friendly(error), true, "#accountMessage"); } finally { button.disabled = false; button.textContent = accountCopy("خروج"); } });
$("#saveFavorite").addEventListener("click", async event => { const staffId = $("#favoriteStaff").value, button = event.currentTarget; if (!staffId || button.disabled) return; button.disabled = true; button.textContent = accountCopy("جاري الحفظ…"); try { await call("saveFavoriteBarber", { staffId }); portalData.customer.favoriteStaffId = staffId; message(accountCopy("تم حفظ الحلاق المفضل."), false, "#accountMessage"); } catch (error) { message(friendly(error), true, "#accountMessage"); } finally { button.disabled = false; button.textContent = accountCopy("حفظ الاختيار"); } });
$("#saveWhatsappConsent").addEventListener("click", async event => {
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true; button.textContent = accountCopy("جارٍ الحفظ…");
  try {
    const optedIn = $("#whatsappMarketingConsent").checked;
    await call("updateOwnWhatsappConsent", { optedIn });
    portalData.customer.whatsappOptIn = optedIn;
    message(optedIn ? accountCopy("تم تسجيل موافقتك على رسائل العروض.") : accountCopy("تم إلغاء موافقتك على رسائل العروض."), false, "#accountMessage");
  } catch (error) {
    $("#whatsappMarketingConsent").checked = portalData.customer.whatsappOptIn === true;
    message(friendly(error), true, "#accountMessage");
  } finally { button.disabled = false; button.textContent = accountCopy("حفظ التفضيلات"); }
});
$("#repeatBooking").addEventListener("click", () => { if (portalData?.lastBooking) repeatBooking(portalData.lastBooking); });
$("#favoriteStaff").addEventListener("change", renderFavorite);
$("#bookFavorite").addEventListener("click", () => { const worker = catalog?.staff?.find(item => item.id === $("#favoriteStaff").value); if (!worker) return; const branchId = portalData.customer.lastBranchId && worker.branchIds?.includes(portalData.customer.lastBranchId) ? portalData.customer.lastBranchId : (worker.branchIds || []).find(id => catalog.branches.some(branch => branch.id === id && branch.active !== false)); if (!branchId) { message(accountCopy("هذا الحلاق غير متاح في الفروع الحالية؛ اختر حلاقًا آخر."), true, "#accountMessage"); return; } sessionStorage.setItem("mz-favorite-booking", JSON.stringify({ staffId: worker.id, branchId })); location.href = "/?favorite=1#services"; });
$("#portal").addEventListener("click", async event => {
  const cancel = event.target.closest("[data-cancel]"), reschedule = event.target.closest("[data-reschedule]"), repeat = event.target.closest("[data-repeat]");
  if (repeat) { const item = findBooking(repeat.dataset.repeat); if (item) repeatBooking(item); return; }
  if (reschedule) { openReschedule(findBooking(reschedule.dataset.reschedule)); return; }
  if (!cancel || actionBusy) return;
  const item = findBooking(cancel.dataset.cancel);
  if (!item || !["pending", "confirmed"].includes(item.status) || item.paymentStatus === "paid" || !confirm(accountCopy("هل تريد إلغاء الحجز؟"))) return;
  actionBusy = true; cancel.disabled = true; cancel.textContent = accountCopy("جاري الإلغاء…");
  try { await call("cancelCustomerBooking", { code: item.code, requestId: crypto.randomUUID() }); await loadPortal(); message(accountCopy("تم إلغاء الحجز وتحديث المواعيد."), false, "#accountMessage"); }
  catch (error) { message(friendly(error), true, "#accountMessage"); }
  finally { actionBusy = false; if (cancel.isConnected) { cancel.disabled = false; cancel.textContent = accountCopy("إلغاء"); } }
});
$("#rescheduleDate").addEventListener("change", () => { void refreshSlots(); });
$("#closeReschedule").addEventListener("click", () => { if (actionBusy) return; selectedBooking = null; $("#reschedulePanel").hidden = true; });
$("#rescheduleForm").addEventListener("submit", async event => {
  event.preventDefault(); if (actionBusy || !selectedBooking) return;
  const slot = availableSlots[Number($("#rescheduleSlot").value)];
  if (!slot) { message(accountCopy("اختر موعدًا متاحًا."), true, "#rescheduleMessage"); return; }
  const staffId = slot.staffId;
  if (!staffId || staffId === "any" || staffId === "none") { message(accountCopy("اختر موعدًا مع متخصص متاح."), true, "#rescheduleMessage"); return; }
  actionBusy = true; const button = $("#confirmReschedule"); button.disabled = true; button.textContent = accountCopy("جاري تغيير الموعد…");
  try { await call("rescheduleBooking", { id: selectedBooking.id, date: $("#rescheduleDate").value, time: slot.time, staffId, requestId: crypto.randomUUID() }); await loadPortal(); selectedBooking = null; $("#reschedulePanel").hidden = true; message(accountCopy("تم تحديث الموعد بنجاح."), false, "#accountMessage"); }
  catch (error) { message(friendly(error), true, "#rescheduleMessage"); void refreshSlots(); }
  finally { actionBusy = false; button.disabled = false; button.textContent = accountCopy("تأكيد إعادة الجدولة"); }
});

if(configured){void loadPublicAccountCatalog().then(populateProfileBranches).catch(error=>console.debug('Published branding unavailable',error?.code||'unavailable'));}else{try{const cached=readPublicCatalogCache();if(cached?.settings)applySiteMedia(cached.settings);}catch{}}

if(isOtpLoopback(location.hostname)&&!globalThis.__USE_EMULATORS__)showOtpHostNotice();
