Read ADMIN_WORKER_UPDATE_AR.md first for the current deployment and test status.

> آخر تحديث: اقرأ CUSTOMER_SIGNUP_START_AR.md أولاً قبل النشر.

> لعرض نسخة العميل ببياناتها الفعلية راجع CLIENT_START_HERE_AR.md. أوامر qa-only أدناه للديمو المحلي المعزول فقط.

# ابدأ هنا — نسخة GitHub للمزين — 22 أكتوبر 2026

هذه أحدث تعليمات الحزمة. التقارير الأقدم سجلات تاريخية وليست إثباتًا لحالة الإنتاج الحالية.

## تجربة النسخة
افتح مجلد el-mezaen في VS Code ثم:

```powershell
npm ci
npm --prefix functions ci
```

الباك اند المحلي كان شغالًا عند تجهيز الحزمة على Auth9094 وFunctions5501 وFirestore8084 وStorage9194. لو ما زال شغالًا، لا تشغّل نسخة ثانية ولا تعيد Seed. شغّل الواجهة الجديدة فقط:

```powershell
powershell.exe -NoProfile -File ./qa-only/run-release-check.ps1 -Mode Web -Port 4198
```

افتح http://127.0.0.1:4198/ . لا تستخدم Live Server.

لو الباك اند متوقف، شغله في Terminal مستقلة واتركها مفتوحة:

```powershell
powershell.exe -NoProfile -File ./qa-only/run-release-check.ps1 -Mode Backend
```

انتظر All emulators ready. لو قاعدة الديمو جديدة وفارغة فقط شغّل Seed مرة واحدة في Terminal ثانية، وبعدها Web. لا تكرر Seed على بيانات موجودة. لا توقف كل Node/Java إذا المنافذ مشغولة؛ افحص مصدر العملية.

مشغل QA الحالي يعتمد على D:/ELMEZAEN-QA/input/runtime الموجود على جهاز عمرو وNode22 وJava21. ZIP لا يحتوي runtime أو node_modules. ده تشغيل محلي خاص بالتجربة وليس إعداد نشر Vercel.

## حسابات الديمو المحلي فقط
أدمن: journey-admin@qa.example.test
كاشير: journey-cashier@qa.example.test
عامل: journey-worker
كلمة المرور: QaOnly-2026-Test!
لا تزرع حسابات الاختبار أو Seed على الإنتاج.

## التجربة اليدوية قبل النشر
1. احجز كعميل في طلخا، بخدمة وعامل وموعد وبيانات اختبار.
2. من نافذة عميل ثانية تأكد من منع التداخل لنفس العامل.
3. راجع الحجز في حساب الكاشير والعامل وحدود كل دور.
4. ابدأ وأنهِ الخدمة وحصّل محليًا، وافحص الإيصال والدرج والإيراد وعدم تكرار التحصيل بعد التحديث.
5. راجع التارجت والفرع وتسليم الوردية ثم راجع الموبايل الفعلي.

## حالة الاختبارات
الواجهة: 754 اختبارًا ناجحًا والبناء وCSS و19 مسارًا و641 رابطًا/ملفًا محليًا. في جولة تجهيز GitHub أعيد تشغيل اختبارات Functions ونجح143/143. اختبارات المحاكيات المالية الـ351 موثقة بجولة سابقة ولم تُعد في هذه الجولة. لا يوجد ادعاء بتنفيذ رحلة القبول على إنتاج العميل.

## قبل GitHub وFirebase وVercel
قراءة Firebase الحالية أكدت70 وظيفة منشورة مقابل117 بالمصدر، أي47 وظيفة بالمصدر غير منشورة. القائمة المرفقة RELEASE_DEPLOYMENT_INVENTORY.json. تساوي أسماء الوظائف الموجودة لا يثبت تساوي كودها. رفع الواجهة وحدها لا يكمل وظائف العمال والتارجت والورديات؛ أوامر خمس وظائف المذكورة في دليل قديم لا تكفي للحالة الحالية.

المستودع: https://github.com/byAmrkhaled0/el-mezaen-talkha . ارفع محتويات el-mezaen في جذر المستودع، وليس ZIP أو مجلدًا إضافيًا داخل الجذر. الربط بـVercel قد ينشر تلقائيًا؛ اقفل التجربة ونطاق الباك اند الأول. لا ترفع node_modules أو dist أو .env أو مفاتيح خدمة أو سجلات QA.

Vercel: Framework Vite، Build npm run build، Output dist. Firebase project el-mezaen-talkha والمنطقة europe-west1. قبل أي نشر Functions افتح Terminal جديدة نظيفة وشغّل scripts/check-deploy-terminal.ps1. استخدم أسماء وظائف محددة وعلى دفعات، وادمج فهارس الإنتاج مع المطلوب قبل أي نشر فهارس. لا firebase deploy شامل ولا --force ولا حذف وظائف أو فهارس.

الموديل الحي يحتاج AI_AGENT_API_KEY وهو غير موجود حسب إفادة المالك. إرسال صورة واتساب آليًا وPush وGPS وApp Check الحقيقي يحتاج قبولًا منفصلًا. لا تضع أسرارًا في الفرونت أو GitHub.

الحزمة لم تُرفع إلى GitHub أو Firebase أو Vercel. نكمل تجربة المستخدم ثم نحدد أوامر النشر المناسبة.
