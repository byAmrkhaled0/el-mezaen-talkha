import './global-navigation.js';
import { staffDestination } from "./staff-routing.js";
import "./login.css";
import { configured, currentRole, login, watchAuth } from "./admin-api.js";
import { bindSafeBack } from "./navigation.js";

bindSafeBack();

const form = document.querySelector("#loginForm");
const errorBox = document.querySelector("#loginError");
if (new URLSearchParams(location.search).get("reason") === "access") errorBox.textContent = "الحساب غير مصرح له بدخول اللوحة أو غير مرتبط بفرع. تواصل مع الإدارة.";

if (!configured) errorBox.textContent = "أضف إعدادات Firebase في public/firebase-config.js أولًا.";

watchAuth(async user => {
  if (!user) return;
  try {
    const role = await currentRole(user);
    if (role) location.replace(staffDestination(role));
    else { await requestWorkerAccess(); document.querySelector("#workerInviteForm").hidden = false; document.querySelector("#pendingActivation").hidden = false;showLoginMode("worker");document.querySelector("#workerGoogle").hidden=true;document.querySelector("#workerPhoneForm").hidden=true;document.querySelector("#workerOtpForm").hidden=true; errorBox.textContent = "تم إنشاء حسابك، في انتظار اعتماد الإدارة"; }
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


import { requestWorkerAccess, redeemWorkerInvitation, staffGoogleLogin, staffPhoneLogin, staffRedirectResult, logout } from './admin-api.js';
let phoneConfirmation;
const workerStatus = document.querySelector('#workerAccessStatus');
async function workerAction(button, action) {
  if (button.disabled) return;
  button.disabled = true; workerStatus.textContent = 'جارٍ التحقق…';
  try { await action(); workerStatus.textContent = ''; }
  catch (error) { workerStatus.textContent = error.message || 'تعذر الدخول؛ حاول مرة أخرى'; }
  finally { button.disabled = false; }
}
document.querySelector('#workerGoogle').addEventListener('click', event => workerAction(event.currentTarget, staffGoogleLogin));
document.querySelector('#workerPhoneForm').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  void workerAction(form.querySelector('button'), async () => { phoneConfirmation = await staffPhoneLogin(form.elements.phone.value, 'workerRecaptcha'); document.querySelector('#workerOtpForm').hidden = false; });
});
document.querySelector('#workerOtpForm').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  void workerAction(form.querySelector('button'), async () => { await phoneConfirmation.confirm(form.elements.otp.value); form.hidden = true; });
});
document.querySelector('#workerInviteForm').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  void workerAction(form.querySelector('button'), async () => { await redeemWorkerInvitation(form.elements.secret.value.trim()); await logout(); form.hidden = true; workerStatus.textContent = 'تم اعتماد حسابك؛ سجل الدخول مجددًا'; });
});
void staffRedirectResult().catch(error => { workerStatus.textContent = error.message; });

const workerMode = new URLSearchParams(location.search).get("mode") === "worker";
function showLoginMode(mode) { document.querySelector("#loginForm").hidden = mode === "worker"; document.querySelector("#workerLoginCard").hidden = mode !== "worker"; document.querySelectorAll("[data-login-mode]").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.loginMode===mode))); }
document.querySelectorAll("[data-login-mode]").forEach(b=>b.addEventListener("click",()=>showLoginMode(b.dataset.loginMode)));
showLoginMode(workerMode ? "worker" : "staff");

document.querySelector("#pendingSignOut")?.addEventListener("click",async()=>{await logout();location.replace("/login/?mode=worker");});
