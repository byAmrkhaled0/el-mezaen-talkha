# تشغيل EL MEZAEN داخل Windows Sandbox — غير منفذ

المصدر الحالي يتضمن إصلاحات محلية مصرح بها. اختبارات Runtime محجوبة حتى الخطوات التالية. لا تستخدم Firebase إنتاج أو بيانات حقيقية.

## 1. المتطلبات المؤكدة والعائق
Windows10 Pro build19045، RAM نحو15.85GiB، Intel i7-6820HQ يدعم virtualization firmware وSLAT، Hypervisor غير نشط. الجلسة ليست Administrator وWindowsSandbox.exe غير موجود بالمسار القياسي. C متاح عليه نحو12.1GiB عند الفحص السابق؛ لازم قياس حجم الحزمة + نسخة العمل + مساحة Sandbox قبل النقل. لا تعتبره كافيًا تلقائيًا. لا Docker/Podman على PATH ولا VMware/VirtualBox بالمسارات المعروفة. الفحص لا ينفي البرامج المحمولة في مسارات أخرى.

## 2. التفعيل — مسؤول وبعد موافقة المالك فقط
افتح PowerShell كمسؤول:
```powershell
Enable-WindowsOptionalFeature -Online -FeatureName 'Containers-DisposableClientVM' -All
```
أعد التشغيل إذا طلب النظام. لو ملفات الميزة ناقصة، توقف وجهز مصدر Windows رسمي مطابق؛ لا تغير BIOS أو سياسات الحماية تلقائيًا. لم ننفذ التفعيل أو تثبيت برنامج. إعداد Sandbox الرسمي: https://learn.microsoft.com/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file

## 3. جهز حزمة Offline قبل بدء guest
بعد الموافقة، جهز C:\ELMEZAEN-QA\input وC:\ELMEZAEN-QA\output. عدل مسارات WSB لو استخدمت قرصًا آخر. المجلد الأول يُربط read-only والثاني لنتائج QA فقط. input يحتوي:
- app: فك مصدر التسليم الحالي، مع node_modules الجذر وfunctions/node_modules المطابقين للـlockfiles. لا .env أو .local أو .git أو credentials أو service accounts أو export بيانات إنتاج. ملف public/firebase-config.js يظل ضمن baseline؛ adapter يستبدل استجابته داخل guest فقط.
- runtime/node: Node22 portable كامل.
- runtime/java: JDK21 portable كامل.
- runtime/firebase: firebase-tools Windows Node package كامل مع node_modules، مدخله lib/bin/firebase.js. لا تنسخ إعدادات login.
- emulator-cache: ملفات Firestore وStorage emulator المطابقة لنسخة CLI من cache/firebase/emulators فقط.
- متصفح Edge داخل guest أو متصفح portable كامل. لتشغيل Playwright: حزمه وbrowser runtime كامل مطابق، بدون تنزيل تلقائي.
- Python+PIL+lxml portable لو هتشغل كل اختبارات asset/DOM؛ وصور وفيديو MP4/H264 وWebM مصطنعة صغيرة للاختبارات.
اعمل SHA256 manifest وقِس مساحة الحزمة. لو نقصت dependencies، التثبيت/التنزيل على المضيف يحتاج موافقة؛ لا تستخدم npx أو npm install داخل guest. إكمال offline bundle والتحقق من إقلاع Java/CLI والمتصفح داخل guest لسه BLOCKED.

## 4. اثبت العزل قبل التطبيق
افتح qa-only/EL_MEZAEN_OFFLINE.wsb بعد تجهيز المجلدين. داخل guest:
```powershell
Get-NetAdapter
Get-NetRoute -AddressFamily IPv4
Test-NetConnection 1.1.1.1 -Port 443 -InformationLevel Quiet
Test-NetConnection 8.8.8.8 -Port 443 -InformationLevel Quiet
```
احفظ الناتج في C:\QAOutput. لازم WSB فيه Networking Disable، لا default route خارجية ولا واجهة خارجية، والمحاولتان False. فشل اتصال منفرد مش إثبات كافي. كل Node وJava والمتصفح وأبنائهم داخل نفس guest. لو ظهر مسار خارجي توقف. ما تفتحش سيرفر على المضيف وما تعتمدش على browser interception.
انسخ C:\QAInput\app إلى C:\work\app للعمل؛ لا تعدل نسخة الإدخال.

## 5. نافذة المحاكيات داخل guest
```powershell
$env:PATH='C:\QAInput\runtime\node;C:\QAInput\runtime\java\bin;'+$env:PATH
$env:JAVA_HOME='C:\QAInput\runtime\java'
$env:FIREBASE_EMULATORS_PATH='C:\QAInput\emulator-cache'
$env:GCLOUD_PROJECT='demo-el-mezaen-qa'
$env:GOOGLE_CLOUD_PROJECT='demo-el-mezaen-qa'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9199'
$env:FIREBASE_CONFIG='{"projectId":"demo-el-mezaen-qa","storageBucket":"demo-el-mezaen-qa.appspot.com"}'
$env:CI='true'
$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK='true'
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
Remove-Item Env:ENFORCE_APP_CHECK -ErrorAction SilentlyContinue
$env:NODE_OPTIONS='--import=file:///C:/work/app/qa-only/media-loader.mjs'
Set-Location C:\work\app
node C:\QAInput\runtime\firebase\lib\bin\firebase.js emulators:start --project demo-el-mezaen-qa --config firebase.qa.json --only auth,firestore,functions,storage
```
الـNode hook يشتغل فقط عند تحميل managed-media داخل Functions Emulator وبـdemo project والمضيف9199 بالضبط؛ غير كده يفشل. يحافظ على production validator كما هو على القرص. لو CLI لا يورث NODE_OPTIONS إلى العامل، توقف CMS كـBLOCKED بدل تغيير المدقق الإنتاجي. لا firebase login ولا service accounts. سلوك AppCheck الخاص بالمحاكيات الموجود أصلًا لم يتغير؛ لا token/debug/fake provider ولا إثبات لـAppCheck الإنتاجي.

## 6. Fixtures داخل guest
افتح نافذة ثانية، انسخ PATH ومتغيرات demo والمنافذ من أعلاه، ثم:
```powershell
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
$env:QA_ISOLATION_VERIFIED='windows-sandbox-network-disabled'
Set-Location C:\work\app
node qa-only/seed.mjs > C:\QAOutput\seed-accounts.json
```
القيمة QA_ISOLATION_VERIFIED تسجيل لقرار تحقق بشري، ليست وسيلة عزل. لا تضبطها قبل إثبات العزل. seeder يجهز أدمن/مديرين/كاشير/عامل وعميلين ومصدر خدمة وباقة وموظف لكل فرع. يعمل فقط بالمحاكيات، بلا حجوزات مسبقة ولا مدفوعات؛ نختبر الحجز من الواجهة. فحصنا صياغته فقط ولم ننفذه. حسابات الدخول وكلمة المرور المصطنعة في الملف الناتج؛ OTP من Auth Emulator وليس SMS حقيقية.

## 7. الموقع والإدارة
في نفس النافذة الثانية بعد seed:
```powershell
node node_modules/vite/bin/vite.js --config qa-only/vite.config.mjs --host 127.0.0.1 --port 4173 --strictPort
```
افتح داخل guest بملف متصفح جديد دون كاش/SW سابق: / و/admin/ و/worker/ و/login/ و/account/ على http://127.0.0.1:4173.
adapter يفشل لو تغيرت أو تكررت أي نقطة تهيئة معروفة. Admin Auth/Storage/Functions، وAccount Auth/Functions، وlazy Auth/Public Functions متصلة قبل الاستخدام. Firestore الخادمي عبر8080؛ لا SDK Firestore جديد في الواجهة. projectId موحد demo-el-mezaen-qa. الفيديو على Firebase Storage9199. URL محاكي الوسائط يُفحص بصيغة معيارية داخل QA فقط على127.0.0.1:9199 وبـbucket التجريبي بالضبط، ويبقى URL المحلي الأصلي في metadata. اختبارات الوحدة تثبت transformation والاتصال المصطنع؛ لازم إثبات طلبات المتصفح والمحاكيات الفعلية قبل Runtime PASS.
مرجع demo/Auth: https://firebase.google.com/docs/emulator-suite/connect_auth

## 8. تشغيل القبول وحفظ الأدلة
- Admin وكل الأقسام والتنقل والجلسة والصلاحيات وdenied requests؛ لا mock Dashboard.
- Talkha وMashaya: خدمة/باقة → عامل مؤهل → وقت → تأكيد صريح → booking reference → Admin الصحيح؛ تضارب/تكرار/فرع آخر/leave/schedule/full/any worker. لا مولد slots بديل.
- CMS slot matrix: صورة وفيديو → progress → save → publish → catalog → rendering/playback؛ حدود الملف ورفض الرفع غير المصرح وإعادة المحاولة. لا حذف تلقائي أو schema جديدة.
- Account OTP وhistory/cancel/reschedule/repeat/favorites/loyalty؛ cart/coupons/reviews؛ مساعد واحد وسلوك لوحة المفاتيح وفروعه وفallback. لا AI حي.
- routes/themes/lang/widths/200% zoom/reduced motion/focus وLighthouse/LCP/CLS/INP بقياسات فعلية. لا تعتبر click latency هو INP.
- Rules واختبارات Firebase يجب تشغيلها داخل guest وبنفس demo ID؛ أي اختبار يثبت project مختلف يحتاج config متسق منفصل ولا تخلط أكثر من project في suite واحد.
خزن screenshots وconsole/network وIDs ونتائج PASS/FAIL/BLOCKED/NOT TESTED في QAOutput. استخدم المصفوفات المرفقة كقائمة تنفيذ، وليس نتائج نجاح. انقل الأدلة قبل إغلاق Sandbox لأنه مؤقت. كاش v4 يحذفه العميل المحدث، لكن متصفح لم يفتح النسخة الجديدة قد يحتفظ ببياناته السابقة؛ لا ندعي سحب بيانات سبق تسليمها. تغيير الإنتاج/تقاعد Functions القديمة يحتاج تفويض نشر مستقل ولم يحصل.

إصلاح مسار QA الحالي: ملف التشغيل firebase.qa.json موجود في جذر app لأن CLI يعتبر مجلد config هو project directory ويرفض ../ للخروج منه. qa-only/firebase.qa.json قالب فقط ولا يُمرر مباشرة للـCLI.
