import './global-navigation.js';
import { staffDestination } from "./staff-routing.js";
import "./login.css";
import { configured, currentRole, login, watchAuth } from "./admin-api.js";
import { bindSafeBack } from "./navigation.js";

bindSafeBack();

const form = document.querySelector("#loginForm");
const errorBox = document.querySelector("#loginError");
let workerAuthenticating=false;
if (new URLSearchParams(location.search).get("reason") === "access") errorBox.textContent = "الحساب غير مصرح له بدخول اللوحة أو غير مرتبط بفرع. تواصل مع الإدارة.";

if (!configured) errorBox.textContent = "أضف إعدادات Firebase في public/firebase-config.js أولًا.";

watchAuth(async user => {
  if (!user || workerAuthenticating) return;
  try {
    const role = await currentRole(user);
    if (role) location.replace(staffDestination(role));
    else { await logout(); errorBox.textContent = "الحساب غير معتمد؛ تواصل مع الإدارة"; return; /* legacy pending flow: await requestWorkerAccess(); document.querySelector("#workerInviteForm").hidden = false; document.querySelector("#pendingActivation").hidden = false;showLoginMode("worker");document.querySelector("#workerGoogle").hidden=true;document.querySelector("#workerPhoneForm").hidden=true;document.querySelector("#workerOtpForm").hidden=true; errorBox.textContent = "تم إنشاء حسابك، في انتظار اعتماد الإدارة"; */ }
  } catch {
    errorBox.textContent = "تم تسجيل الدخول، لكن تعذر التحقق من صلاحية الحساب الآن. أعد المحاولة.";
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  errorBox.textContent = "";
  const button = form.querySelector("button");
  button.disabled = true;
  button.textContent = "جارٍ التحقق...";
  try {
    const result = await login(document.querySelector("#email").value.trim(), document.querySelector("#password").value);
    const role = await currentRole(result.user);
    if (!role) throw new Error("NO_ROLE");
    location.replace(staffDestination(role));
  } catch (error) {
    errorBox.textContent = error.message === "FIREBASE_NOT_CONFIGURED" ? "Firebase غير مربوط بعد." : error.message === "NO_ROLE" ? "الحساب لا يملك صلاحية دخول لوحة الإدارة." : ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(error?.code) ? "بيانات الدخول غير صحيحة." : "تعذر التحقق من الحساب الآن. أعد المحاولة.";
  } finally {
    button.disabled = false;
    button.textContent = "دخول آمن";
  }
});


import {requestWorkerAccess, loginWorkerUsername, logout} from './admin-api.js';
const workerStatus = document.querySelector('#workerAccessStatus');
document.querySelector('#workerUsernameForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
  const button = form.querySelector('button'); if (button.disabled) return;
  button.disabled = true; workerAuthenticating=true; workerStatus.textContent = 'جارٍ التحقق…';
  try { await loginWorkerUsername(form.elements.username.value, form.elements.password.value); location.replace("/worker/"); }
  catch { workerStatus.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة، أو الحساب غير متاح.'; }
  finally { workerAuthenticating=false; button.disabled = false; form.elements.password.value = ''; }
});
const workerMode = new URLSearchParams(location.search).get("mode") === "worker";
function showLoginMode(mode) { document.querySelector("#loginForm").hidden = mode === "worker"; document.querySelector("#workerLoginCard").hidden = mode !== "worker"; document.querySelectorAll("[data-login-mode]").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.loginMode===mode))); }
document.querySelectorAll("[data-login-mode]").forEach(b=>b.addEventListener("click",()=>showLoginMode(b.dataset.loginMode)));
showLoginMode(workerMode ? "worker" : "staff");

document.querySelector("#pendingSignOut")?.addEventListener("click",async()=>{await logout();location.replace("/login/?mode=worker");});
