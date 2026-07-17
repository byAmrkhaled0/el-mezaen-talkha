import "./login.css";
import { configured, currentRole, login, watchAuth } from "./admin-api.js";

const form = document.querySelector("#loginForm");
const errorBox = document.querySelector("#loginError");

if (!configured) errorBox.textContent = "أضف إعدادات Firebase في public/firebase-config.js أولًا.";

watchAuth(async user => {
  if (!user) return;
  const role = await currentRole(user).catch(() => null);
  if (role) location.replace("/admin/");
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
    errorBox.textContent = error.message === "FIREBASE_NOT_CONFIGURED" ? "Firebase غير مربوط بعد." : error.message === "NO_ROLE" ? "الحساب لا يملك صلاحية دخول لوحة الإدارة." : "بيانات الدخول غير صحيحة أو الحساب غير مصرح له.";
  } finally {
    button.disabled = false;
    button.textContent = "دخول آمن";
  }
});
