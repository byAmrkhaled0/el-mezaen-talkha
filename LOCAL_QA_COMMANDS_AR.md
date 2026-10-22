# تشغيل ومراجعة EL MEZAEN محليًا

الأوامر التالية داخل Windows Sandbox مجهز بالشبكة Disabled، بعد نسخ المصدر إلى C:\work\app. لا تشغّل npm run dev أو preview العاديين على المضيف للتحقق من الإدارة: إعداد Firebase الإنتاجي محفوظ كما هو. السكربت الجديد يرفض المضيف قبل أي عملية؛ اختبرنا الرفض بالفعل. تشغيل التطبيق الحقيقي ما زال BLOCKED حتى تجهيز البيئة.

## المتطلبات
راجع qa-only/RUN_PLAN_AR.md لتفعيل Sandbox بواسطة مسؤول وبعد موافقة المالك، وتجهيز المجلدين المرتبطين read-only input وoutput. لا تفعيل أو تثبيت اتنفذ في هذه المرحلة.
جهز Offline داخل input: runtime/node (Node22.23.2 مع npm.cmd/node_modules)، runtime/java (JDK21)، runtime/firebase (Firebase CLI15.31.0 كامل مع dependencies ومدخل lib/bin/firebase.js)، emulator-cache مطابق، app/node_modules وapp/functions/node_modules المطابقين للـlockfiles. Gates يحتاج runtime/python/python.exe مع PIL وlxml. راجع المساحة قبل نسخ الحزمة. مفيش npm install/npx تلقائي ولا credentials/.local/.env/بيانات إنتاج. المتصفح داخل guest.
ملف firebase.qa.json في جذر التطبيق هو ملف المحاكيات. qa-only/firebase.qa.json قالب فقط؛ CLI يعتبر مجلد ملف config هو جذر المشروع ولذلك ../ كان مرفوضًا واتصلح. firebase.json الإنتاجي لم يتغير.

## نافذة1: فحص ثم Backend
```powershell
Set-Location C:\work\app
powershell.exe -NoProfile -File .\qa-only\run-local.ps1 -Mode Check
powershell.exe -NoProfile -File .\qa-only\run-local.ps1 -Mode Backend
```
Check يراجع حساب Sandbox، غياب adapter فعال/default routes، وجود runtimes/locked modules وNode22≥22.15. راجع أيضًا أن ملف WSB المستخدم Networking Disable؛ غياب route لحظة واحدة لا يغني عن تعطيل شبكة guest. أي فشل يتوقف؛ لا تغيّر السياسات أو تستخدم ExecutionPolicy Bypass لتخطيه.
Backend يبدأ Auth9099/Firestore8080/Functions5001/Storage9199 بproject demo-el-mezaen-qa. لا Console أو login أو service account. كل العمليات وأبنائها داخل نفس guest. UI المحاكيات معطلة لتجنب تنزيل dependency غير موجودة؛ OTP يؤخذ من سجل Auth Emulator.

## نافذة2: بيانات مصطنعة ثم الموقع
```powershell
Set-Location C:\work\app
powershell.exe -NoProfile -File .\qa-only\run-local.ps1 -Mode Seed
powershell.exe -NoProfile -File .\qa-only\run-local.ps1 -Mode Web
```
Seeder يكتب داخل المحاكيات فقط ويطبع الحسابات وكلمة المرور المصطنعة. العامل يستخدم username qa-worker-talkha وعقد workerAuthEmail الفعلي، لا بريدًا عشوائيًا مخالفًا لمسار الدخول. لا نسمي fixture دليلًا أن الحجز/الإدارة اشتغلوا. Web يستخدم qa-only/vite.config.mjs فقط ويشترط جاهزية المنافذ الأربعة.
افتح داخل guest:
- http://127.0.0.1:4173/
- http://127.0.0.1:4173/login/
- http://127.0.0.1:4173/admin/
- http://127.0.0.1:4173/worker/
- http://127.0.0.1:4173/account/

## نافذة3: بوابات الجودة
```powershell
Set-Location C:\work\app
powershell.exe -NoProfile -File .\qa-only\run-local.ps1 -Mode Gates
```
يشغّل npm test كاملًا بما فيه اختباري Vite الفعليين داخل العزل، ووحدات Functions والبناء والروابط. تسجيل كل وضع في C:\QAOutput. لا يزعم اختبار كل عمليات الإدارة المالية/الحجز أو قياس Lighthouse بمجرد النجاح.

## Rules: بعد إيقاف Web وBackend
```powershell
powershell.exe -NoProfile -File .\qa-only\run-local.ps1 -Mode Rules
```
Rules suite الحالية مثبتة على demo-el-mezaen-rules، لذلك تعمل كسويت مستقل على المحاكيات نفسها بعد إيقاف التطبيق؛ ممنوع خلطها مع demo-el-mezaen-qa. أسماء المشاريع في الاختبارات المحمية لم تتغير. السويت المالية التاريخية مشروعها demo-el-mezaen-gate وتظل مراجعة منفصلة؛ فشلاها القديمان محفوظان ولم تُغير توقعاتهما.

## قبول الإدارة والحجز والـERP الموجود
استخدم قائمة ADMIN_ACCEPTANCE.csv ومصفوفات الحجز/الوسائط من التسليم السابق. راجع كل قسم ظاهر حسب الدور، وصوّر النتيجة وسجل console/network والـIDs. اختبر:
1. دخول admin والمدير بكل فرع والكاشير والعامل، session/logout وحماية الروابط؛ Manager/Cashier لا يقرأ/يعدل فرعًا آخر، والعامل بياناته فقط.
2. Talkha وMashaya: اختيار خدمة وباقة وعامل وتوقيت ثم تأكيد صريح؛ reference يظهر في Admin الفرع الصحيح. أعد نفس الطلب/حاول حجز توقيت متعارض؛ backend هو صاحب قرار availability، لا slots أو عمال مخترعين.
3. كل حفظ/تعديل/فلتر/pagination/dialog له permitted وdenied وvalidation وfailed request/retry. راجع شكل الإدارة فعليًا على390/820/1366/1920 وفاتح/داكن حيث مدعوم، بدون mock Dashboard.
4. CMS صورة وفيديو Firebase Storage: authorization/progress/metadata/publish/preview/playback، حدود النوع والحجم، فشل الرفع والحفظ وإعادة المحاولة، وعدم حذف أي ملف تلقائيًا. تحقق أن URL على9199 والـproject demo.
5. حساب العميل وOTP وhistory/cancel/reschedule/repeat/favorites/coupon/reviews، وكل الروابط والفرع والسلة والمساعد. لا رسائل واتساب حقيقية ولا AI حي.
6. التشغيل والمالية الموجودة: POS والمخزون والمصروفات والإيرادات والتقارير والرواتب والسلف والورديات حسب الدور. السياسة محفوظة: اعتماد أدمن ثم صرف كاشير من وردية الفرع المفتوحة وربط ذري؛ لا سلفة مباشرة لتجاوز الفشل القديم. أي خلل مالي يتوثق بدون تعديل الكود أو تمييع الاختبار.
7. قِس startup/auth readiness والتنقل والطلبات الفعلية وLighthouse/LCP/CLS/INP وظروف القياس؛ حجم bundle أو نجاح وحدة ليس أداء ERP فعليًا.

الـNode media hook اجتاز اختبار استيراد مستقل مع البيئة المصطنعة دون SDK، والـCLI15.31.0 يورث process.env بحسب المصدر. تشغيله داخل Functions Emulator فعليًا والـseeder لم يُختبرا بعد لغياب البيئة. أي startup/secrets/service غير محاكى يفشل ويُسجل BLOCKED ولا نرجع لإنتاج أو نكسر App Check.
