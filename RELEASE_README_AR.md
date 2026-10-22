> تحديث الجولة الحالية: راجع DELIVERY_ACCEPTANCE_AR.md وVS_CODE_DELIVERY_AR.md لنتائج351 اختبار محاكيات وتصحيح Vite7.3.7 وأوامر النشر. ما يلي يحتفظ بتفاصيل الجولة السابقة.

# المزين — نسخة مراجعة التسليم 21 أكتوبر 2026

هذه نسخة محلية مرشحة للتسليم، وليست دليل نشرها على Vercel أو تشغيل موديل خارجي. اقرأ FINAL_RELEASE_CHECK_AR.md للنتائج الحالية والحدود.

## التشغيل في VS Code

فك المصدر في مجلد جديد وافتح مجلد el-mezaen. من Terminal:

```powershell
npm ci
npm --prefix functions ci
```

المشغّل يستخدم أدوات الجهاز الحالية في D:\ELMEZAEN-QA\input\runtime؛ هذه الأدوات والاعتمادات المثبتة ليست داخل ZIP.

لبيئة اختبار جديدة، نافذة Backend:

```powershell
powershell.exe -NoProfile -File .\qa-only\run-release-check.ps1 -Mode Backend
```

بعد ظهور All emulators ready، نافذة ثانية:

```powershell
# مرة واحدة فقط على قاعدة تجريبية فارغة:
powershell.exe -NoProfile -File .\qa-only\run-release-check.ps1 -Mode Seed
# ثم:
powershell.exe -NoProfile -File .\qa-only\run-release-check.ps1 -Mode Web
```

افتح http://127.0.0.1:4193/ . المشروع demo-el-mezaen-qa، منافذ Auth9094/Functions5501/Firestore8084/Storage9194، مختلفة عن النسخ السابقة. إذا كانت المحاكيات على هذه المنافذ مفتوحة فعلًا فلا تشغّل Backend آخر أو تعِد Seed؛ راجع مصدر العمليات أولًا. لا توقف Node/Java بشكل شامل.

حسابات QA المصطنعة:

- أدمن: journey-admin@qa.example.test
- كاشير: journey-cashier@qa.example.test
- العامل: اختار دخول العامل واكتب journey-worker فقط.
- كلمة المرور التجريبية: QaOnly-2026-Test!

هذه ليست حسابات عميل حقيقية، ولا يجوز نقلها لقاعدة الإنتاج. بيانات الخدمة والفرع التجريبية ليست المحتوى التجاري النهائي.

## تشغيل الموديل

المالك أكد عدم وجود مفتاح API حاليًا؛ التحليل المحلي وبديل الأسئلة الشائعة متاحان. وضع المحاكيات لا يتصل بموديل حي ولا يجلب AI_AGENT_API_KEY من Secret Manager. الإنتاج يحتفظ بربط السرّ وإعدادات التفعيل وحدود الاستخدام. يحتاج تشغيل الموديل الحي مفتاحًا محفوظًا بالخادم واختبارًا مصرحًا به؛ لا تضع المفتاح في الفرونت أو الشات.

## النشر

لا Push أو Deploy تم. إعداد Vercel يستخدم npm run build ومجلد dist. قبل اعتماد الرابط للعميل يجب نشر النسخة المعتمدة وتحديث Functions اللازمة بصلاحية منفصلة، ثم قبول النسخة المنشورة والتأكد من إعدادات Firebase ومحتواها الحقيقي. لا تعتبر ZIP الخاص بـdist بديلًا عن تحديث الباك إند.
