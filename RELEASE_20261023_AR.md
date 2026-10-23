# تحديث مزين مصر — 23 أكتوبر 2026

## إيه اللي اتصلح؟

- صورة الهيرو كانت جوه template، والسكريبت اللي بيظهرها كان بيتمنع بسياسة الأمان. اتحوّل لملف خارجي من نفس الموقع، من غير إضافة unsafe-inline أو تقليل حماية الموقع.
- اتوحّد مفتاح كاش الكتالوج واتحدّث إصدار Service Worker عشان النسخ القديمة ما تفضلش ماسكة السكريبت القديم.
- حساب الإيراد الشهري بقى بيقرأ كل صفحات الشهر، بدل الوقوف عند 2000 سجل. القيم السالبة والاسترجاعات بتتحسب زي ما هي.
- عرض تارجت وترتيب العمال بيدعم 300 عامل، وعدّ الخدمات والمهام بقى كامل.
- الأربع وظائف الخلفية ليها تسجيل فشل وحدود إعادة محاولة. الإشعارات الداخلية ليها مفاتيح تمنع التكرار. إشعار FCM ممكن يتكرر في حالة انقطاع نادر بعد إرساله وقبل تسجيل نجاحه؛ مش مضمون exactly-once.
- المساعد بيستخدم بيانات الكتالوج وتقارير الإدارة المتاحة لما الموديل مش مفعّل، وبيوضح إن الرد ملخص بيانات. مش بينادي وظيفة موديل غير منشورة.

## الاختبارات المؤكدة محليًا

786 اختبار للواجهة والمنطق، و143 اختبار لوحدات الباك إند، بالإضافة لـ16 مجموعة اختبارات على Firebase Emulators. ضمنها إنشاء 300 حساب عامل فعليًا داخل Auth Emulator، وأكثر من 2500 سجل لحساب الإيراد والخدمات، والصلاحيات والمرتجعات والسلف والإجازات والإقفال المالي. البناء وفحص الملفات عدّوا. دي اختبارات محلية ببيانات تجربة؛ مش معاملات على بيانات العميل.

صورة الهيرو اتراجعت بصريًا بعرض الموبايل وتحت نفس سياسة script-src المنشورة. معاينة الصور محلية ببيانات تجربة، ومش شاشة من الإنتاج.

## نشر النسخة من Visual Studio Code

افتح Terminal في فولدر المشروع اللي فيه package.json، بعد تطبيق التحديث على نسخة GitHub:

```powershell
powershell.exe -NoProfile -File .\DEPLOY_RELEASE.ps1 -Mode Build
firebase login
powershell.exe -NoProfile -File .\DEPLOY_RELEASE.ps1 -Mode Backend
powershell.exe -NoProfile -File .\DEPLOY_RELEASE.ps1 -Mode Verify
```

لو Firebase سأل عن تفعيل retries للأربع وظائف الخلفية في الإصدار ده، اختار Y. ما تستخدمش --force وما توافقش على حذف وظائف أو Indexes.

السكريبت بيرفع الـ11 وظيفة الجديدة أو المعدّلة، وبيضيف أي وظيفة ناقصة من قائمة الـ118 اللي مش محتاجة موديل. ما بيحذفش وظيفة وما بيستوردش بيانات وما بيغيرش أسعار أو أرصدة. مرحلة Verify بتتأكد إن الوظائف منشورة وحالتها ACTIVE، ومش بديل لتجربة الاستخدام بعد النشر.

بعد نجاح الخطوات، من نسخة GitHub نفسها:

```powershell
git status --short
git diff --stat
```

راجع الملفات قبل الإضافة: ما تضيفش ملفات .env أو المفاتيح أو firebase-debug.log أو مجلدات .qa وqa المحلية. التحديث الرسمي فيه سورس فقط، من غير بيانات دخول.

```powershell
git add index.html public/hero-bootstrap.js public/hero-mount.js public/initial-locale.js public/sw.js src/assistant-provider.js src/ai-chat.js src/admin-advisor.js functions/src/index.js functions/src/month-ledger-pages.js functions/src/monthly-targets.js functions/src/target-achievements.js functions/src/background-retry.js functions/src/admin-advisor.js scripts/verify-build.mjs tests/production-hero-csp.test.mjs tests/assistant-provider.test.mjs tests/background-and-ledger-pages.test.mjs tests/target-lock-achievements.test.mjs tests/production-repair.emulator.mjs tests/delta-ui-targets.test.mjs tests/phase12-3c-verification.emulator.mjs tests/phase12-3d-scheduling.emulator.mjs qa-only/run-delivery-gates.ps1 DEPLOY_RELEASE.ps1 RELEASE_20261023_AR.md SOURCE_FILE_HASHES.json
git commit -m "Fix hero CSP loading and complete worker backend deployment"
git push origin HEAD
```

لو GitHub مربوط بـVercel والفرع هو فرع Production، انتظر حالة Ready وافتح الموقع من لينك الإنتاج. المساعد هنا ما عملش Push أو Deploy للإنتاج.

## بعد النشر

1. افتح الموقع بتحديث قوي Ctrl+Shift+R، وشوف صورة الهيرو في الليلي والنهاري وعلى الموبايل. لو نسخة PWA فضلت قديمة اقفلها وافتحها بعد اكتمال تحديثها.
2. من حساب الأدمن افتح العمال والتارجت وطلبات العملاء؛ ما يبقاش فيه endpoint ناقص أو أخطاء CORS. لو فيه 500 جديد، ابعت اسم الوظيفة والخطأ من Firebase Logs بدل إخفائه.
3. أنشئ عامل تجربة في الفرع الصحيح، افتح حسابه، اختبر المهمة والطلب والتارجت، وبعدها عطّل الحساب من الإدارة لما تخلص. ما تعملش 300 حساب تجربة في الإنتاج.
4. جرّب OTP على دومين الإنتاج برقم يخصك، وبعده إنشاء بيانات العميل. دي محتاجة Phone Auth وAuthorized domains وSMS region policy وإعدادات الحساب السحابية الصحيحة. اختبار SMS حي لم يتم في الاختبارات المحلية.
5. جرّب إذن إشعارات الموبايل على جهاز حقيقي، مع إعداد Web Push الصحيح. اختبار جهاز حقيقي لم يتم هنا.

## المؤجل والمحتوى اللي الإدارة هتدخله

وظيفتا customerAiAgent وadminBusinessAssistant مؤجّلتان لحد توصيل المفتاح والموديل. الأربع وظائف المساعدة للتقارير والتأكيد لا تحتاج مفتاح وداخلة في النشر. ما تكتبش مفتاح وهمي.

الخدمات الحالية لطلخا، والباقات الحالية للمشاية. خدمات المشاية وباقات طلخا الإدارة هتدخلها. رقم المشاية 01093008896، ورقم طلخا زي ما اتفقنا. الصور الدعائية القديمة اللي عليها رقم مطبوع محتاجة صورة أصلية محدثة؛ تعديل رقم الفرع في البيانات مش بيغير الكلام المطبوع جوه الصورة.

تعذّر ادعاء إن الموقع «بلا أي أخطاء» قبل اختبار النسخة المنشورة. الملف ده جاهز محليًا والنشر والتجربة الحية هما الخطوة التالية.
