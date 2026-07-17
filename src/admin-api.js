import { initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut } from "firebase/auth";
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

export async function logout() { if (auth) await signOut(auth); }

async function call(name, data = {}) {
  if (!configured) throw new Error("FIREBASE_NOT_CONFIGURED");
  const result = await httpsCallable(functions, name)(data);
  return result.data;
}

export const getDashboard = () => call("getAdminDashboard");
export const getCollection = (collection, limit = 300) => call("getAdminCollection", { collection, limit });
export const saveEntity = (collection, id, data) => call("adminUpsert", { collection, id, data });
export const deleteEntity = (collection, id) => call("adminDelete", { collection, id });
export const changeBooking = (id, action, paymentMethod) => call("updateBooking", { id, action, paymentMethod });
export const changeUserRole = (uid, email, role) => call("setUserRole", { uid, email, role });

export async function uploadImage(file, folder = "content") {
  if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) throw new Error("INVALID_IMAGE");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const target = ref(storage, `public/${folder}/${crypto.randomUUID()}-${safeName}`);
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
