# V8.1 — إصلاح جلسة الإدارة عند فشل App Check

## ROOT CAUSE

في `src/admin-api.js`، كان استدعاء Function يعيد المحاولة بعد `functions/unauthenticated` وتجديد Firebase Auth ID token، ثم ينفذ `signOut(auth)` إن أعاد الاستدعاء الثاني الخطأ نفسه. نجاح تجديد Auth لا يثبت أن رفض الاستدعاء الثاني صادر عن جلسة الدخول؛ قد يكون App Check debug token المحلي غير معتمد، أو قد يفشل التحقق في بنية الاستدعاء. لذلك كان تسجيل الدخول ينجح وتظهر `/admin/` لحظة قبل العودة إلى `/login/`. خطأ Vite WebSocket يخص HMR ولا يثبت انتهاء Auth.

## APP CHECK FAILURE FLOW BEFORE / AFTER

| الحالة | قبل | بعد |
| --- | --- | --- |
| App Check debug token غير معتمد محليًا | قد ينتهي مسار `unauthenticated` بتسجيل الخروج | فحص جاهزية `getToken` مخزن للمحاولات العادية؛ يعرض خطأ تطوير واضحًا وزر إعادة المحاولة؛ يظل Auth صالحًا |
| رفض callable بعد تجديد Auth بنجاح | تسجيل خروج بعد المحاولة الثانية | فحص App Check بتجديد token عند الحاجة، ثم رسالة خطأ داخل شاشة التحقق دون تسجيل خروج |
| نجاح إعادة التحقق | لم يكن مسار App Check مفصولًا | إعادة المحاولة تعيد تهيئة شاشة Admin باستعمال المستخدم نفسه |

`initializeAppCheck` يحتفظ بالـinstance. إعداد debug يعمل فقط على `localhost` و`127.0.0.1` ويستخدم `FIREBASE_APPCHECK_DEBUG_TOKEN = true` دون تثبيت قيمة token في المصدر. لم يتغير فرض App Check في الإنتاج أو ترخيص Functions.

## AUTH LOGOUT FLOW BEFORE / AFTER

| الحالة | قبل | بعد |
| --- | --- | --- |
| رفض callable مرتين مع Auth token قابل للتجديد | `signOut` وتحويل إلى login | إبقاء المستخدم مسجلًا، رسالة وإعادة محاولة |
| فشل تجديد Auth برمز مثبت لبطلان الجلسة | تسجيل خروج | تسجيل خروج وتحويل آمن إلى login |
| خطأ عابر أثناء تجديد Auth | قد يظهر أثره كفشل جلسة | رسالة خطأ مع الاحتفاظ بالمستخدم |
| زر تسجيل الخروج | `signOut` صريح | باقٍ كما هو |

جرى إبقاء فشل منح التسويق الاختياري محصورًا في تلك المنح؛ لا يغير جلسة الدخول أو صلاحيات العمليات الأساسية.

## FILES CHANGED

- `src/admin-session.js`: فصل قرار انتهاء Auth عن فشل App Check وإعادة المحاولة مرة واحدة.
- `src/admin-api.js`: فحص App Check المخزن، رسالة محلية واضحة، وإلغاء الخروج عند رفض callable مع Auth صالح.
- `src/admin.js`: شاشة تحقق مع زر إعادة المحاولة، وإخفاء بيانات الإدارة إلى حين نجاح التحقق.
- `src/login.js`: رسالة تحقق واضحة عند فشل قراءة الدور دون حلقة تحويل.
- `tests/v8-1-appcheck-session.test.mjs`: اختبارات عدم الخروج، انتهاء Auth الحقيقي، نجاح إعادة المحاولة، واستعادة App Check.
- `tests/cashier-v43.test.mjs` و`tests/v6-branch-rendering.test.mjs`: تحديث عقدي فحص ثابتين كانا يتوقعان سلوك الخروج القديم أو صيغة callback القديمة.

## TESTS ADDED / RESULTS

| الأمر | النتيجة |
| --- | --- |
| `npm test` | 132/132 PASS |
| `npm run test:functions` | 40/40 PASS |
| `npm run test:rules` مع Java 21 | 17/17 PASS |
| `npm run test:gate:handlers` مع Java 21 | 37/37 PASS |
| `npm run build` | PASS |
| `npm run verify:build` | PASS |
| `npm run verify:firebase` | PASS |
| `npm run smoke` | 15/15 مسارًا وأصلًا PASS بخادم ملفات محلي |

## KNOWN LIMITATIONS

- لم يُستخدم Firebase production أو اعتماد debug token حقيقي في Console. فشل `exchangeDebugToken` برمز 403 المبلغ عنه لم يُعد تشغيله أمام خدمة Google في هذه البيئة؛ الاختبارات تحاكي الرفض ومسارات Auth/App Check. يلزم تسجيل Debug Token المحلي في Firebase Console والتحقق من السلوك تفاعليًا في localhost.
- Smoke يثبت وصول ملفات ومسارات البناء، ولا يثبت تسجيل الدخول الحقيقي أو نقر زر إعادة المحاولة في متصفح تفاعلي. هذا **NOT VERIFIED**.
- بوابة HTTP Functions Emulator السابقة مستقلة عن هذا الإصلاح ولم يُدّعَ إغلاقها.

لم يحدث Deploy أو Push أو تعديل بيانات إنتاج، ولم يبدأ عمل V9 ضمن هذه الحزمة.
