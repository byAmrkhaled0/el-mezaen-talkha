export const isLocalEnvironment = () => ['localhost','127.0.0.1','[::1]'].includes(globalThis.location?.hostname);
// Runtime-only untracked developer config; this module contains no token.
export function configureLocalAppCheck() {
  if (!isLocalEnvironment()) return;
  globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = globalThis.__LOCAL_APPCHECK_DEBUG_TOKEN__ || true;
  const config=globalThis.__FIREBASE_CONFIG__||{};
  console.info('[El Mezaen local]',{frontend:import.meta.env.DEV?'Vite dev':'build preview',firebaseProject:config.projectId||'not configured',emulators:Boolean(globalThis.__USE_EMULATORS__),appCheck:'local debug token; registration required'});
  if(config.projectId&&!globalThis.__USE_EMULATORS__) console.info('LOCAL PREVIEW connected to configured Firebase backend. Use emulators for mutations.');
}
export function localAppCheckSetup() {
  const details=document.createElement('details');details.className='local-appcheck-setup';
  const summary=document.createElement('summary');summary.textContent='إعداد App Check المحلي';
  const steps=document.createElement('ol');for(const text of ['افتح Console في المتصفح.','انسخ App Check Debug Token الذي يولده Firebase SDK.','افتح Firebase Console ثم App Check ثم Apps.','اختر التطبيق ثم Debug tokens وأضف الرمز.','أعد تحميل الصفحة. تسجيل الرمز لا يلغي App Check.']){const li=document.createElement('li');li.textContent=text;steps.append(li);}
  details.append(summary,steps);return details;
}
