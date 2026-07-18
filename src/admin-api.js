import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { browserLocalPersistence, EmailAuthProvider, getAuth, onAuthStateChanged, reauthenticateWithCredential, setPersistence, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const config = globalThis.__FIREBASE_CONFIG__ || {};
export const configured = Boolean(config.projectId && !String(config.projectId).includes("YOUR_"));
let app;
let auth;
let functions;
let storage;

if (configured) {
  app = initializeApp(config);
  if (globalThis.__APP_CHECK_SITE_KEY__) {
    if (["localhost", "127.0.0.1"].includes(globalThis.location?.hostname)) globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(globalThis.__APP_CHECK_SITE_KEY__), isTokenAutoRefreshEnabled: true });
  }
  auth = getAuth(app);
  functions = getFunctions(app, "europe-west1");
  storage = getStorage(app);
  setPersistence(auth, browserLocalPersistence);
  if (globalThis.__USE_EMULATORS__) connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export async function login(email, password) {
  if (!configured) throw new Error("FIREBASE_NOT_CONFIGURED");
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
  return { role: token.claims.role || null, permissions: Array.isArray(token.claims.permissions) ? token.claims.permissions : [], branchIds: Array.isArray(token.claims.branchIds) ? token.claims.branchIds : [] };
}

export async function logout() { if (auth) await signOut(auth); }

async function call(name, data = {}) {
  if (!configured) throw new Error("FIREBASE_NOT_CONFIGURED");
  if (navigator.onLine === false) throw new Error("أنت غير متصل بالإنترنت");
  try {
    const result = await httpsCallable(functions, name, { timeout: 30000 })(data);
    return result.data;
  } catch (error) {
    const code = String(error?.code || "").replace(/^functions\//, "");
    const original = String(error?.message || "");
    if (/[\u0600-\u06ff]/.test(original) && !/^Firebase:/.test(original)) throw new Error(original, { cause: error });
    const messages = {
      unauthenticated: "انتهت جلسة الدخول؛ سجّل الدخول مرة أخرى",
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

export const getDashboard = () => readCall("getAdminDashboard");
export const getBusinessDashboard = month => readCall("getBusinessDashboard", { month });
export const getCollection = (collection, limit = 300) => readCall("getAdminCollection", { collection, limit });
export const saveEntity = (collection, id, data) => call("adminUpsert", { collection, id, data });
export const deleteEntity = (collection, id) => call("adminDelete", { collection, id });
export const secureDeleteRecord = (kind, id) => call("adminSecureDelete", { kind, id });
export const changeBooking = (id, action, paymentMethod) => call("updateBooking", { id, action, paymentMethod });
export const createPosOrder = payload => call("createPosOrder", payload);
export const recordExpense = payload => call("recordExpense", payload);
export const updateExpense = payload => call("updateExpense", payload);
export const recordPayrollPayment = payload => call("recordPayrollPayment", payload);
export const changeUserRole = (uid, email, role, permissions = [], branchIds = []) => call("setUserRole", { uid, email, role, permissions, branchIds });
export const createUserAccount = payload => call("createAdminUser", payload);

export async function verifyAdminPassword(password) {
  const user = auth?.currentUser;
  if (!user?.email || !password) throw new Error("ADMIN_PASSWORD_REQUIRED");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  await user.getIdToken(true);
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

export async function uploadImage(file, folder = "content") {
  if (!file || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("اختر صورة JPG أو PNG أو WebP أو AVIF بحد أقصى 10MB قبل الضغط");
  const optimized = await optimizeImage(file);
  if (optimized.size >= 5 * 1024 * 1024) throw new Error("تعذر ضغط الصورة لأقل من 5MB؛ اختر صورة أصغر");
  const safeName = optimized.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const target = ref(storage, `public/${folder}/${crypto.randomUUID()}-${safeName}`);
  await uploadBytes(target, optimized, { contentType: optimized.type, cacheControl: "public,max-age=31536000,immutable" });
  return getDownloadURL(target);
}

export async function uploadVideo(file, folder = "content") {
  const allowed = ["video/mp4", "video/webm"];
  if (!file || !allowed.includes(file.type) || file.size >= 30 * 1024 * 1024) throw new Error("اختر فيديو MP4 أو WebM أقل من 30MB");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const target = ref(storage, `public/${folder}/videos/${crypto.randomUUID()}-${safeName}`);
  await uploadBytes(target, file, { contentType: file.type, cacheControl: "public,max-age=31536000" });
  return getDownloadURL(target);
}

export async function enablePush() {
  if (!configured || !globalThis.__VAPID_KEY__ || !await isSupported()) throw new Error("PUSH_NOT_CONFIGURED");
  const registration = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("PUSH_DENIED");
  const token = await getToken(getMessaging(app), { vapidKey: globalThis.__VAPID_KEY__, serviceWorkerRegistration: registration });
  await call("registerPushToken", { token });
  return true;
}
