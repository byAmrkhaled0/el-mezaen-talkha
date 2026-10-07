import { configureLocalAppCheck } from './local-environment.js';
import { initializeApp } from "firebase/app";
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { isAppCheckFailure, retryAuthenticatedCall } from "./admin-session.js";
import { browserPopupRedirectResolver, browserSessionPersistence, EmailAuthProvider, initializeAuth, onAuthStateChanged, reauthenticateWithCredential, setPersistence, signInWithEmailAndPassword, signOut, updatePassword } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { getDownloadURL, getStorage, ref, uploadBytes, uploadBytesResumable } from "firebase/storage";

const config = globalThis.__FIREBASE_CONFIG__ || {};
export const configured = Boolean(config.projectId && !String(config.projectId).includes("YOUR_"));
let app;
let auth;
let functions;
let storage;
let appCheck;
let appCheckReadiness;
const FRONTEND_VERSION = "2.0.0";
let messagingModulePromise;
const loadMessaging = () => messagingModulePromise ||= import("firebase/messaging");

async function getActiveServiceWorker() {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return registration.active ? registration : navigator.serviceWorker.ready;
}

function assertBackendCompatibility(data) {
  const current = FRONTEND_VERSION.split(".").map(Number);
  const required = String(data?._meta?.minimumFrontendVersion || "0.0.0").split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if ((current[index] || 0) > (required[index] || 0)) return;
    if ((current[index] || 0) < (required[index] || 0)) throw new Error("نسخة لوحة الإدارة قديمة؛ حدّث الصفحة قبل تنفيذ أي عملية");
  }
}

if (configured) {
  app = initializeApp(config);
  if (globalThis.__APP_CHECK_SITE_KEY__) {
    configureLocalAppCheck();
    appCheck = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(globalThis.__APP_CHECK_SITE_KEY__), isTokenAutoRefreshEnabled: true });
  }
  // Staff identity belongs to this tab. Customer auth is initialized separately
  // in account.js and keeps its existing local persistence.
  auth = initializeAuth(app, { persistence: browserSessionPersistence });
  functions = getFunctions(app, "europe-west1");
  storage = getStorage(app);
  if (globalThis.__USE_EMULATORS__) connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

const isLocalPreview = () => ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname);
function appCheckError(error) {
  const message = isLocalPreview()
    ? "App Check غير مصرح لهذه البيئة المحلية. أضف Debug Token إلى Firebase Console ثم أعد المحاولة."
    : "تعذر التحقق من حماية التطبيق. أعد المحاولة بعد قليل.";
  return Object.assign(new Error(message, { cause: error }), { code: "app-check/unavailable" });
}

export async function ensureAdminAppCheckReady(forceRefresh = false) {
  if (!appCheck) return;
  if (forceRefresh) appCheckReadiness = null;
  appCheckReadiness ||= getToken(appCheck, forceRefresh).then(result => {
    if (!result?.token) throw new Error("App Check token unavailable");
    return true;
  }).catch(error => { appCheckReadiness = null; throw appCheckError(error); });
  return appCheckReadiness;
}

export async function login(email, password) {
  if (!configured) throw new Error("FIREBASE_NOT_CONFIGURED");
  await setPersistence(auth, browserSessionPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}

export function watchAuth(callback) {
  if (!configured) { callback(null); return () => {}; }
  return onAuthStateChanged(auth, callback);
}

export async function currentRole(user) {
  const token = await user.getIdTokenResult(true);
  return token.claims.role || null;
}

export async function currentAccess(user) {
  const token = await user.getIdTokenResult(true);
  await ensureAdminAppCheckReady();
  const role = token.claims.role || null;
  let permissions = Array.isArray(token.claims.permissions) ? token.claims.permissions : [];
  const branchIds = Array.isArray(token.claims.branchIds) ? token.claims.branchIds : [];
  if (role === "cashier" || role === "manager") {
    let grants = [];
    try {
      grants = (await httpsCallable(functions, "getOwnMarketingGrants", { timeout: 15000 })({})).data.grants || [];
    } catch { /* Optional marketing access fails closed; normal operations retain their claims. */ }
    permissions = permissions.filter(value => (role === "cashier" && ["offers", "campaigns", "gallery", "results", "hairMedia", "celebrities", "posts"].includes(value)) || (role === "manager" && value === "campaigns") ? grants.includes(value) : true);
  }
  return { role, staffId: token.claims.staffId || null, permissions, branchIds };
}

export async function logout() {
  if (!auth) return;
  try {
    const { deleteToken, getMessaging, getToken, isSupported } = await loadMessaging();
    if (configured && "Notification" in globalThis && Notification.permission === "granted" && await isSupported()) {
      const messaging = getMessaging(app);
      const registration = await getActiveServiceWorker();
      const token = await getToken(messaging, { vapidKey: globalThis.__VAPID_KEY__, serviceWorkerRegistration: registration });
      if (token) await Promise.race([call("unregisterPushToken", { token }), new Promise(resolve => setTimeout(resolve, 3000))]);
      await deleteToken(messaging);
    }
  } catch (error) { console.debug("Push token logout cleanup was deferred", error?.message || error); }
  await signOut(auth);
}

async function call(name, data = {}) {
  if (!configured) throw new Error("FIREBASE_NOT_CONFIGURED");
  if (navigator.onLine === false) throw new Error("أنت غير متصل بالإنترنت");
  try {
    await ensureAdminAppCheckReady();
    const invoke = httpsCallable(functions, name, { timeout: 30000 });
    const result = await retryAuthenticatedCall(invoke, data, auth, signOut, () => ensureAdminAppCheckReady(true));
    assertBackendCompatibility(result.data);
    return result.data;
  } catch (error) {
    if (isAppCheckFailure(error)) throw appCheckError(error);
    const code = String(error?.code || "").replace(/^functions\//, "");
    const original = String(error?.message || "");
    if (/[\u0600-\u06ff]/.test(original) && !/^Firebase:/.test(original)) throw new Error(original, { cause: error });
    const messages = {
      unauthenticated: "تعذر التحقق من طلب الإدارة. جلسة الدخول محفوظة؛ أعد المحاولة.",
      "unauthenticated-with-valid-auth": "تعذر التحقق من طلب الإدارة رغم صلاحية جلسة الدخول؛ أعد المحاولة أو تحقق من App Check.",
      "permission-denied": original.toLowerCase().includes("app check") ? "تعذر التحقق من حماية التطبيق؛ حدّث الصفحة ثم حاول مرة أخرى" : "لا تملك صلاحية تنفيذ هذه العملية",
      "invalid-argument": "راجع البيانات المدخلة ثم حاول مرة أخرى",
      "failed-precondition": "لا يمكن تنفيذ العملية بحالتها الحالية",
      "not-found": "السجل المطلوب غير موجود أو تم حذفه",
      "already-exists": "تم تسجيل هذه العملية من قبل",
      "resource-exhausted": "محاولات كثيرة؛ انتظر قليلًا ثم حاول مرة أخرى",
      unavailable: "الخدمة غير متاحة مؤقتًا؛ تحقق من الإنترنت وحاول مرة أخرى",
      "deadline-exceeded": "استغرقت العملية وقتًا أطول من اللازم؛ تحقق من النتيجة قبل إعادة المحاولة",
      internal: "حدث خطأ داخل الخادم؛ لم يتم تأكيد حفظ العملية"
    };
    throw new Error(messages[code] || "تعذر تنفيذ العملية الآن", { cause: error });
  }
}

async function readCall(name, data = {}) {
  let lastError;
  for (const delay of [0, 500, 1500]) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    try { return await call(name, data); }
    catch (error) {
      lastError = error;
      if (!String(error?.code || "").match(/unavailable|deadline-exceeded|internal/)) throw error;
    }
  }
  throw lastError;
}

export const getDashboard = (branchId = "all") => readCall("getAdminDashboard", { branchId });
export const getOwnerMobileHistory = options => readCall("getOwnerMobileHistory", options);
export const setBranchMonthlyTarget = payload => call("setBranchMonthlyTarget", payload);
export const getCashierSnapshot = (branchId = "all") => readCall("getCashierSnapshot", { branchId });
export const getPosOffers = branchId => readCall("getPosOffers", { branchId });
export const getBusinessDashboard = month => readCall("getBusinessDashboard", { month });
export const getServiceTargetsDashboard = (month, branchId = "all") => readCall("getServiceTargetsDashboard", { month, branchId });
export const upsertServiceTarget = payload => call("upsertServiceTarget", payload);
export const getCollection = (collection, limit = 100, cursor = "") => readCall("getAdminCollection", { collection, limit, cursor });
export const saveEntity = (collection, id, data) => call("adminUpsert", { collection, id, data });
export const deleteEntity = (collection, id) => call("adminDelete", { collection, id });
export const secureDeleteRecord = (kind, id, reason = "") => call("adminSecureDelete", { kind, id, reason });
export const changeBooking = (id, action, paymentMethod, reason = "", idempotencyKey = "") => call("updateBooking", { id, action, paymentMethod, reason, idempotencyKey });
export const rescheduleBooking = payload => call("rescheduleBooking", payload);
export const createPosOrder = payload => call("createPosOrder", payload);
export const previewPosCoupon = payload => readCall("validateCoupon", payload);
export const getBookingCalendar = (from, to, branchId = "all") => readCall("getBookingCalendar", { from, to, branchId });
export const getCustomer360 = customerId => readCall("getCustomer360", { customerId });
export const rotateCustomerQr = payload => call("rotateCustomerQr", payload);
export const getCashOperations = (branchId, options = {}) => readCall("getCashOperations", { branchId, includeReports: options.includeReports === true });
export const openCashShift = payload => call("openCashShift", payload);
export const addCashMovement = payload => call("addCashMovement", payload);
export const closeCashShift = payload => call("closeCashShift", payload);
export const closeBusinessDay = payload => call("closeBusinessDay", payload);
export const getBusinessReport = payload => readCall("getBusinessReport", payload);
export const rebuildBusinessReport = payload => call("rebuildBusinessReport", payload);
export const getAuditEvents = payload => readCall("getAuditEvents", payload);
export const scanCustomerCode = code => call("scanCustomerCode", { code });
export const findCustomerByPhone = phone => call("findCustomerByPhone", { phone });
export const adjustCustomerWallet = payload => call("adjustCustomerWallet", payload);
export const createWhatsappCampaign = payload => call("createWhatsappCampaign", payload);
export const previewWhatsappCampaign = payload => readCall("previewWhatsappCampaign", payload);
export const updateWhatsappCampaignState = (campaignId, action) => call("updateWhatsappCampaignState", { campaignId, action });
export const getWhatsappCampaignRecipients = (campaignId, cursor) => readCall("getWhatsappCampaignRecipients", { campaignId, cursor });
export const getWhatsappCampaignStats = campaignId => readCall("getWhatsappCampaignStats", { campaignId });
export const getWhatsappCampaignOptions = () => readCall("getWhatsappCampaignOptions");
export const checkWhatsappMarketingRecipient = (customerId, offerId = "") => readCall("checkWhatsappMarketingRecipient", { customerId, offerId });
export const sendWhatsappReceipt = bookingId => call("sendWhatsappReceipt", { bookingId });
export const updateWhatsappConsent = (customerId, optedIn) => call("updateWhatsappConsent", { customerId, optedIn, source: "admin" });
export const recordExpense = payload => call("recordExpense", payload);
export const updateExpense = payload => call("updateExpense", payload);
export const recordPayrollPayment = payload => call("recordPayrollPayment", payload);
export const changeUserRole = (uid, email, role, permissions = [], branchIds = [], staffId = "") => call("setUserRole", { uid, email, role, permissions, branchIds, staffId });
export const createUserAccount = payload => call("createAdminUser", payload);
export const getAttendanceDashboard = (dateKey, branchId = "all") => readCall("getAttendanceDashboard", { dateKey, branchId });
export const recordWorkerAttendance = payload => call("recordWorkerAttendance", payload);
export const getWorkerWorkspace = () => readCall("getWorkerWorkspace");
export const createWorkerTask = payload => call("createWorkerTask", payload);
export const updateWorkerTask = (taskId, status) => call("updateWorkerTask", { taskId, status });
export const notifyWorker = payload => call("notifyWorker", payload);
export const updateWorkerProfilePhoto = imageUrl => call("updateWorkerProfilePhoto", { imageUrl });

export async function verifyAdminPassword(password) {
  const user = auth?.currentUser;
  if (!user?.email || !password) throw new Error("ADMIN_PASSWORD_REQUIRED");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  await user.getIdToken(true);
  return true;
}

export async function changeOwnPassword(currentPassword, newPassword) {
  const user = auth?.currentUser;
  if (!user?.email || !currentPassword || !newPassword || newPassword.length < 8) throw new Error("كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
  await updatePassword(user, newPassword);
  try { await call("recordPasswordChange"); } catch (error) { console.warn("Password change audit deferred", error?.message); }
  return true;
}

async function optimizeImage(file) {
  if (!globalThis.createImageBitmap || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d", { alpha: true }).drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("IMAGE_OPTIMIZATION_FAILED")), "image/webp", .82));
  if (blob.size >= file.size && scale === 1) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
}

async function uploadMediaWithProgress(target, file, metadata, onProgress) {
  if (!onProgress) return uploadBytes(target, file, metadata);
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(target, file, metadata);
    task.on("state_changed", snapshot => onProgress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)), reject, () => resolve(task.snapshot));
  });
}

export async function uploadImage(file, folder = "content", onProgress = null) {
  if (!file || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("اختر صورة JPG أو PNG أو WebP أو AVIF بحد أقصى 10MB قبل الضغط");
  const optimized = await optimizeImage(file);
  if (optimized.size >= 5 * 1024 * 1024) throw new Error("تعذر ضغط الصورة لأقل من 5MB؛ اختر صورة أصغر");
  const safeName = optimized.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const target = ref(storage, `public/${folder}/${crypto.randomUUID()}-${safeName}`);
  await uploadMediaWithProgress(target, optimized, { contentType: optimized.type, cacheControl: "public,max-age=31536000,immutable" }, onProgress);
  return getDownloadURL(target);
}

export async function validateVideoFile(file) {
  const allowed = ["video/mp4", "video/webm"];
  if (!file) throw new Error("اختر فيديو من الجهاز");
  if (!allowed.includes(file.type)) throw new Error("الفيديو بصيغة MOV غير مناسب للموقع. حوّله إلى MP4 بترميز H.264 ثم أعد رفعه");
  if (file.size >= 30 * 1024 * 1024) throw new Error(`حجم الفيديو ${Math.ceil(file.size / 1024 / 1024)}MB؛ الحد الأقصى 30MB`);
  if (file.type === "video/mp4") {
    const metadata = new TextDecoder("latin1").decode(await file.arrayBuffer());
    const isH264 = metadata.includes("avc1") || metadata.includes("avc3");
    if (!isH264) throw new Error("ترميز الفيديو غير متوافق وقد يظهر شاشة سوداء. حوّله إلى MP4 بترميز H.264 (AVC) ثم أعد رفعه");
  }
  return true;
}

export async function uploadVideo(file, folder = "content", onProgress = null) {
  await validateVideoFile(file);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const target = ref(storage, `public/${folder}/videos/${crypto.randomUUID()}-${safeName}`);
  await uploadMediaWithProgress(target, file, { contentType: file.type, cacheControl: "public,max-age=31536000" }, onProgress);
  return getDownloadURL(target);
}

export async function createVideoPoster(file) {
  if (!file?.type?.startsWith("video/")) throw new Error("VIDEO_POSTER_INVALID_FILE");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("VIDEO_PREVIEW_TIMEOUT")), 12000);
      video.addEventListener("loadedmetadata", () => { clearTimeout(timeout); resolve(); }, { once: true });
      video.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("VIDEO_CODEC_UNSUPPORTED")); }, { once: true });
    });
    if (!video.videoWidth || !video.videoHeight) throw new Error("VIDEO_CODEC_UNSUPPORTED");
    const seekTo = Number.isFinite(video.duration) && video.duration > .2 ? Math.min(.35, video.duration / 3) : 0;
    if (seekTo) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("VIDEO_PREVIEW_TIMEOUT")), 8000);
        video.addEventListener("seeked", () => { clearTimeout(timeout); resolve(); }, { once: true });
        video.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("VIDEO_CODEC_UNSUPPORTED")); }, { once: true });
        video.currentTime = seekTo;
      });
    }
    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("VIDEO_POSTER_FAILED")), "image/webp", .82));
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-poster.webp`, { type: "image/webp" });
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function enablePush() {
  if (!configured || !globalThis.__VAPID_KEY__ || !("Notification" in globalThis) || !("serviceWorker" in navigator)) throw new Error("PUSH_NOT_CONFIGURED");
  const { getMessaging, getToken, isSupported } = await loadMessaging();
  if (!await isSupported()) throw new Error("PUSH_NOT_CONFIGURED");
  const registration = await getActiveServiceWorker();
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") throw new Error("PUSH_DENIED");
  const token = await getToken(getMessaging(app), { vapidKey: globalThis.__VAPID_KEY__, serviceWorkerRegistration: registration });
  if (!token) throw new Error("PUSH_TOKEN_FAILED");
  await call("registerPushToken", { token });
  return true;
}

// Uses the existing staff Auth instance and session persistence.
export const requestWorkerAccess = () => call('registerWorkerAccess');
export const redeemWorkerInvitation = secret => call('redeemWorkerInvitation', { secret });
export const createWorkerInvitation = data => call('createWorkerInvitation', data);
export const manageAccessAccount = data => call('manageAccessAccount', data);
export async function staffGoogleLogin() {
  if (!configured) throw new Error('FIREBASE_NOT_CONFIGURED');
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import('firebase/auth');
  if (matchMedia('(pointer: coarse)').matches) return signInWithRedirect(auth, new GoogleAuthProvider(), browserPopupRedirectResolver);
  return signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver);
}
export async function staffRedirectResult() {
  if (!configured) return null;
  const { getRedirectResult } = await import('firebase/auth');
  return getRedirectResult(auth, browserPopupRedirectResolver);
}
export async function staffPhoneLogin(phone, elementId) {
  if (!configured) throw new Error('FIREBASE_NOT_CONFIGURED');
  const [{ RecaptchaVerifier, signInWithPhoneNumber }, { normalizePhone }] = await Promise.all([import('firebase/auth'), import('../functions/src/core.js')]);
  const verifier = new RecaptchaVerifier(auth, elementId, { size: 'normal' });
  try { return await signInWithPhoneNumber(auth, '+2' + normalizePhone(phone), verifier); }
  finally { verifier.clear(); }
}
export const markWorkerNotificationRead = id => call('markWorkerNotificationRead', { id });
export async function watchWorkerPush(callback) {
  if (!configured) return () => {};
  const { getMessaging, onMessage, isSupported } = await loadMessaging();
  if (!await isSupported()) return () => {};
  return onMessage(getMessaging(app), callback);
}

export const getAccessAccountCenter = (data = {}) => readCall('getAccessAccountCenter', data);
