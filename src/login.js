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
    if (role) location.replace("/admin/");
    else errorBox.textContent = "الحساب لا يملك صلاحية دخول لوحة الإدارة.";
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
    location.replace("/admin/");
  } catch (error) {
    errorBox.textContent = error.message === "FIREBASE_NOT_CONFIGURED" ? "Firebase غير مربوط بعد." : error.message === "NO_ROLE" ? "الحساب لا يملك صلاحية دخول لوحة الإدارة." : ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(error?.code) ? "بيانات الدخول غير صحيحة." : "تعذر التحقق من الحساب الآن. أعد المحاولة.";
  } finally {
    button.disabled = false;
    button.textContent = "دخول آمن";
  }
});
