# تدقيق المسارات وApp Check — Phase 11.3

## السبب والتصحيح

صورة المستخدم أظهرت /admin بدون slash كصفحة عامة و/ admin/ كمدخل إدارة مع خطأ حماية. أضيف middleware allowlist في configureServer وconfigurePreviewServer؛ المسارات المعروفة بدون slash تحصل على 307 إلى entry صحيح مع بقاء query. لا يوجد protected-route fallback إلى Home.

المسارات المختبرة: admin،worker،login،account،booking،services،packages،team،reviews،results،hair-systems،branches/talkha،branches/mashaya. اختبار HTTP فعلي يقارن HTML لكل زوج slash/no-slash في dev وbuild preview؛ browser يختبر refresh/back/forward وروابط مباشرة. Firebase Hosting smoke: 26 فحصًا. Vercel/Firebase rewrites السابقة لم تتغير.

## الأدوار

Browser مستقل لكل Admin/Manager/Cashier/Worker. التأكد من الشارة المرئية والمسار قبل التصوير. Worker يُحوّل من /admin/ إلى /worker/؛ Admin/Manager/Cashier لا يفتحون بيانات العامل من /worker/؛ غير المسجل يصل إلى /login/?mode=worker. خمس redirect cases ناجحة. اختبارات emulator تحفظ role ceilings ونطاق الفروع. Account Center screenshot يتطلب #users.active والعنوان والفلاتر وبطاقة حساب حقيقية من renderer، وإلا يفشل.

## App Check المحلي

لم يتغير enforcement أو ReCaptcha Enterprise في الإنتاج. localhost وحده يستخدم debug mode من SDK. إعداد محلي اختياري في ملف غير متتبع:

`.local/firebase-dev.json`

يحوي appCheckDebugToken الذي سجله المطور مسبقًا. لا ينسخ إلى public أو dist. Vite dev يخدمه runtime إلى Host محلي واتصال loopback فقط، مع Cache-Control:no-store. لا يُخدم هذا الإعداد في build preview/production؛ يمكن هناك استخدام الرمز الذي يولده SDK وتسجيله في Console. .local/ و.env.local و.env.*.local وpublic/firebase-local.js محمية بـ.gitignore.

الخطوات: Console المتصفح → نسخ App Check Debug Token الذي يولده SDK → Firebase Console → App Check → Apps → التطبيق → Debug tokens → إضافة → Reload. لا ترسل الرمز في المحادثة ولا تضعه في Git.

شاشة الخطأ المحلية: شعار، «تعذر فتح لوحة الإدارة محليًا»، إعادة المحاولة، تفاصيل قابلة للفتح. في production لا تعرض إرشادات أو بيانات محلية. console المحلي يعرض نوع الواجهة وprojectId وemulators وApp Check mode فقط. أسماء المشروع العامة ليست أسرارًا.

NO DEPLOY / NO PUSH / NO PRODUCTION WRITE.
