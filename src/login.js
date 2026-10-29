import {beginCustomerPhoneLogin} from './customer-phone-login.js';
import './global-navigation.js';
import './login.css';
import {configured,currentRole,login,loginWorkerUsername,logout,watchAuth} from './admin-api.js';
import {bindSafeBack} from './navigation.js';
import {loginIdentifier,loginDestination} from './unified-login-model.js';
import {normalizeOtp,isOtpLoopback} from './customer-onboarding.js';
bindSafeBack();
const $=selector=>document.querySelector(selector),form=$('#loginForm'),errorBox=$('#loginError'),identity=$('#email'),password=$('#password'),submit=$('#loginSubmit'),otpForm=$('#unifiedOtpForm');
let busy=false,phoneSession=null,retryAt=0,authGeneration=0,navigating=false;
const customerMode=new URLSearchParams(location.search).get('mode')==='customer';
if(customerMode){
 $('#unifiedLoginTitle').textContent='دخول حساب العميل';
 $('#unifiedLoginIntro').textContent='اكتب رقم موبايلك؛ لو أول زيارة هتكمّل بيانات حسابك بعد التحقق.';
 $('#loginIdentityLabel').textContent='رقم الموبايل';identity.type='tel';identity.inputMode='tel';identity.autocomplete='tel';identity.maxLength=20;identity.placeholder='01xxxxxxxxx';
 $('#loginBrandTitle').textContent='حجوزاتك وزياراتك في مكان واحد.';
 $('#loginBrandIntro').textContent='حسابك كعميل في مزين مصر، للدخول ومتابعة زيارتك الجاية.';
 $('#loginAudienceHint').textContent='الدخول برمز تحقق لرقم الموبايل، من غير كلمة مرور.';
}
const friendly=error=>error.message==='FIREBASE_NOT_CONFIGURED'?'Firebase غير مربوط بعد.':error.message==='NO_ROLE'?'الحساب غير معتمد؛ تواصل مع الإدارة.':['auth/invalid-credential','auth/wrong-password','auth/user-not-found','INVALID_WORKER_ACCOUNT'].includes(error.code||error.message)?'بيانات الدخول غير صحيحة.':error.code==='auth/too-many-requests'?'محاولات كتير؛ انتظر شوية وحاول تاني.':error.code?.startsWith('auth/')?'تعذر التحقق من الحساب؛ راجع البيانات وحاول تاني.':error.message||'تعذر الدخول؛ حاول مرة تانية.';
function mode(){let phone=customerMode;try{phone=phone||loginIdentifier(identity.value).kind==='phone';}catch{}$('#loginPasswordRow').hidden=phone;password.required=!phone;$('#loginPhoneConsentRow').hidden=!phone;submit.textContent=phone?'إرسال رمز التحقق':'دخول آمن';}
function controls(){submit.disabled=busy;$('#unifiedVerify').disabled=busy;$('#unifiedChangePhone').disabled=busy;identity.disabled=busy;password.disabled=busy;$('#unifiedRetry').disabled=busy||Date.now()<retryAt;}
async function route(user){const stamp=++authGeneration,role=await currentRole(user);if(stamp!==authGeneration||busy||navigating)return;const destination=loginDestination(role,user);if(!destination){await logout();throw Error('NO_ROLE');}navigating=true;location.replace(destination);}
watchAuth(user=>{if(user&&!busy&&!navigating)void route(user).catch(error=>errorBox.textContent=friendly(error));});
if(!configured)errorBox.textContent='إعدادات Firebase غير مكتملة.';
if(new URLSearchParams(location.search).get("reason") === "access")errorBox.textContent='الحساب غير مصرح أو غير مرتبط بفرع؛ راجع الإدارة.';
identity.addEventListener('input',mode);mode();
async function sendPhone(phone){
 if(Date.now()<retryAt)throw Error('انتظر دقيقة قبل إعادة إرسال الرمز.');
 if(!$('#loginPhoneConsent').checked)throw Error('وافق على إرسال رمز التحقق أولًا.');
 if(isOtpLoopback(location.hostname)&&!globalThis.__USE_EMULATORS__)throw Error('إرسال SMS الحقيقي متاح من الموقع الرسمي؛ اللوكال يستخدم محاكيات الاختبار فقط.');
 phoneSession?.clear();phoneSession=await beginCustomerPhoneLogin(phone,'unifiedRecaptcha');retryAt=Date.now()+60000;
 form.hidden=true;otpForm.hidden=false;$('#unifiedOtp').focus();errorBox.textContent='تم إرسال رمز التحقق.';
}
form.addEventListener('submit',async event=>{event.preventDefault();if(busy||navigating)return;mode();if(!form.reportValidity())return;busy=true;authGeneration++;errorBox.textContent='';controls();let user;
 try{const identifier=loginIdentifier(identity.value);if(customerMode&&identifier.kind!=='phone')throw Error('اكتب رقم موبايل مصري صحيح لدخول حساب العميل.');if(identifier.kind==='phone'){await sendPhone(identifier.value);return;}user=(await(identifier.kind==='username'?loginWorkerUsername(identifier.value,password.value):login(identifier.value,password.value))).user;
 }catch(error){errorBox.textContent=friendly(error);}finally{busy=false;password.value='';mode();controls();}
 if(user)try{await route(user);}catch(error){errorBox.textContent=friendly(error);}
});
otpForm.addEventListener('submit',async event=>{event.preventDefault();if(busy||!phoneSession||!otpForm.reportValidity())return;busy=true;authGeneration++;controls();errorBox.textContent='';let user;
 try{user=(await phoneSession.confirmation.confirm(normalizeOtp($('#unifiedOtp').value))).user;phoneSession.clear();phoneSession=null;}catch(error){errorBox.textContent=friendly(error);}finally{busy=false;controls();}if(user)try{await route(user);}catch(error){errorBox.textContent=friendly(error);}
});
$('#unifiedChangePhone').onclick=()=>{if(busy)return;phoneSession?.clear();phoneSession=null;authGeneration++;otpForm.hidden=true;form.hidden=false;$('#unifiedOtp').value='';errorBox.textContent='';identity.focus();};
$('#unifiedRetry').onclick=async()=>{if(busy||Date.now()<retryAt)return;busy=true;controls();try{await sendPhone(loginIdentifier(identity.value).value);}catch(error){errorBox.textContent=friendly(error);}finally{busy=false;controls();}};
const timer=setInterval(()=>{if(!otpForm.hidden)controls();},1000);window.addEventListener('pagehide',()=>{clearInterval(timer);phoneSession?.clear();});
