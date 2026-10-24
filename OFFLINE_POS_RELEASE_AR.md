# تحديث الاتصال التلقائي وشكل المزامنة

## السلوك الجديد
- مؤشر صغير «متصل» أو «بدون نت»، بدل اللوحة الكبيرة. تفاصيل الشيكات بتتفتح عند الضغط عليه وتقدر تقفلها.
- تجهيز بيانات البيع في الخلفية بعد تسجيل الدخول، وبعد فتح الوردية، وعند تفعيل ملفات الأوفلاين على الجهاز. لا يوجد زر للتجهيز أو لتبديل وضع البيع.
- فصل الإنترنت يفعّل الوضع المحلي تلقائيًا. فحص ثابت صغير كل دقيقة أثناء الاتصال، وكل 15 ثانية أثناء الانقطاع والصفحة ظاهرة، يكتشف عودة الإنترنت حتى مع استمرار الاتصال بالراوتر. لا يقرأ Firebase أثناء الاتصال السليم لمجرد الفحص.
- عند العودة، تتم محاولة مزامنة الشيكات بنفس معرّفاتها ثم تجهيز البيانات. فشل الوصول للباك إند يظل يعاد فحصه؛ أخطاء الصلاحيات ليست إذنًا لتجاوزها.
- لسه مطلوب أول دخول بالإنترنت ووردية مفتوحة وتجهيز ناجح. نفس الحساب واللوحة مفتوحة للمزامنة؛ لا تمسح بيانات المتصفح. نسخة البيانات صلاحيتها 24 ساعة. جهاز لم يُجهز لن يسجل مبيعات أوفلاين، وستظهر حالته عند انقطاع النت.
- بدون نت: شيكات نقدية جديدة مدفوعة بالكامل فقط. الخصومات والمحفظة والاسترجاعات وإغلاق الخزنة والحضور تحتاج اتصالًا. تعارض السعر أو المخزون أو يوم التشغيل أو الوردية يظل للمراجعة؛ لا يتم تجاوزه تلقائيًا.

## الفحص المؤكد لهذا التحديث
- 826 اختبار نجحوا، بدون اختبارَي مسارات Vite. الاختبارات تشمل اكتشاف فصل الراوتر/الإنترنت، العودة التلقائية، عدم تكرار التجهيز مع كل فحص، وإيقاف المراقبة ومنع الفحوص المتزامنة.
- تمت معاينة مكوّن الواجهة الفعلي وفتح التفاصيل وإغلاقها داخل صفحة محلية ببيانات صناعية، وليس داخل لوحة الإنتاج. لم تجر تجربة فصل نت حقيقية جديدة مع معاملة إنتاج لهذا التحديث.
- البناء النهائي تعطل هنا بسبب صلاحيات قراءة esbuild. يجب إكمال أوامر الفحص أدناه في VS Code قبل النشر. نجاح الإصدار السابق لا يغني عن فحص هذا التحديث.

## التطبيق
فك الضغط في فولدر مستقل وشغّل APPLY_AUTOMATIC_OFFLINE.ps1 مع ProjectPath لمسار الريبو. السكريبت يراجع كل الملفات قبل الكتابة، ويعمل Backup في TEMP. يتقبل اختلاف CRLF فقط؛ اختلاف المحتوى الحقيقي يوقفه. لا يعمل Push أو Deploy ولا يغير بيانات الإنتاج.

## الفحص من Terminal الريبو بعد PASS
```powershell
$env:PYTHON = "C:\Users\amrk7\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$env:QA_PYTHON = $env:PYTHON
$checks = @('run build','test','--prefix functions test','run verify:build','run audit:links')
foreach ($check in $checks) {
    $npmArgs = $check.Split(' ')
    & npm.cmd @npmArgs
    if ($LASTEXITCODE -ne 0) { throw "Failed: npm $check" }
}
```

## Git بعد نجاح الفحوص
الملفات تشمل تعديل الأوفلاين السابق لو لسه لم يتم رفعه. لا تضف مجلدات النسخ الاحتياطية أو qa أو dist أو sitemap تلقائيًا.
```powershell
$files = @(
 'src/admin.js','src/admin-api.js','src/offline-pos-store.js','src/offline-pos.js',
 'src/offline-admin-ui.js','src/offline-admin.css','src/offline-connectivity.js','src/offline-receipt.js',
 'functions/src/index.js','functions/src/offline-pos-protocol.js',
 'public/sw.js','public/connection-check.txt','vite.config.js','scripts/verify-build.mjs',
 'DEPLOY_RELEASE.ps1','OFFLINE_POS_RELEASE_AR.md',
 'tests/offline-pos.test.mjs','tests/offline-pos.emulator.mjs','tests/offline-receipt.test.mjs',
 'tests/offline-connectivity.test.mjs','tests/phase12-3d-scheduling.test.mjs',
 'tests/phase12-4c1-ux.test.mjs','tests/d3-continuation.test.mjs','tests/read-recovery.test.mjs'
)
git add -- $files
if ($LASTEXITCODE -ne 0) { throw 'git add failed' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Review staged whitespace errors' }
git diff --cached --stat
git commit -m "Automate offline readiness and simplify connection status"
if ($LASTEXITCODE -ne 0) { throw 'Commit did not complete' }
git push origin HEAD
```

هذا التحديث لا يغير Functions أو Rules أو Indexes. وظيفتا createPosOrder وsyncOfflinePosOrder تم نشرهما حسب سجل المستخدم؛ لا تحتاجان إعادة نشر لهذا التحديث.
بعد Vercel Ready، افتح الصفحة بالنت وانتظر تحديث Service Worker. جرب بحساب وبيانات اختبار معتمدة: وردية مفتوحة، قطع الاتصال، شيك نقدي منتظر، رجوع الاتصال، ورقم نهائي مرة واحدة. اختبر على جهاز المحل والطابعة قبل اعتماد التشغيل.
