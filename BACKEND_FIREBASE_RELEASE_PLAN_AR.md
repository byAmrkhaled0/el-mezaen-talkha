# نطاق نشر Backend وFirebase — خطة فقط

مرجع المقارنة المحلي: EL_MEZAEN_FINAL_MOBILE_SOURCE.zip SHA256 0da1501d32a3e62225341cdd90b35f2176c69583c82a47e3c995fec530521351.
تحليل ESM باستخدام esbuild بدون تحميل Firebase SDK أثبت93 اسم تصدير قبل وبعد:0 أسماء جديدة و0 محذوفة. لا نعرف قائمة المنشور الحي لأن إنتاج لم يُفتح؛ لو الإنتاج أقدم من هذا المرجع، لا نستنتج أنه يحتوي93 وظيفة أو أن نشر وظيفتين يكفي لتهيئة المشروع كله.

| العنصر | المطلوب لهذه الإصلاحات المحلية |
|---|---|
| getCatalog | تحديث وظيفة موجودة لتطبيق whitelist العامل وحماية بيانات المرتب/الحقول الداخلية |
| getAdminCollection | تحديث وظيفة موجودة لمنع Admin branch query من type in []، مع بقاء قيود الأدوار والفرع |
| functions/src/public-staff.js | helper يُرفع ضمن حزمة getCatalog؛ ليس Cloud Function جديدة |
| باقي91 اسمًا من المصدر | لا إضافة/حذف أو تغيير معلن لها في هذا الإصلاح |
| Frontend | build dist ونشره على الاستضافة الحالية بعد موافقة النشر والتحقق منها؛ لم ننشر أو نتحقق من حالة Vercel/Firebase Hosting الحية |
| Firestore collections/schema/migration | لا إضافة أو migration مطلوبة بسبب هذه التغييرات |
| Firestore Rules/Indexes | دون تغيير؛ لا نطلب نشر/حذف فهارس أو قواعد |
| Auth roles/claims/accounts | لا تعديل إنتاج؛ حسابات Seed مصطنعة في Emulator فقط |
| Storage | نفس Firebase Storage للفيديو والصور؛ لا bucket جديدة أو cleanup/delete |
| App Check | كما هو؛ لا bypass/debug-token أو attestation مزيف |
| Firebase Console | مفيش إجراء إعداد جديد مؤكد مطلوب بسبب الواجهة؛ وجود الخدمات والإعدادات والفوترة والتصاريح الفعلية في الإنتاج غير متحقق هنا |

أمر مستقبلي لم يُنفذ، بعد موافقة صريحة للنشر ونجاح QA وتأكيد أن المشروع الحي يحتوي baseline المتوافق:
```powershell
firebase deploy --project el-mezaen-talkha --only functions:getCatalog,functions:getAdminCollection
```
لا تستخدم firebase deploy --only functions بشكل شامل ولا --force ولا أوامر حذف. لسه مفيش موافقة نشر في هذه الجلسة. اسم المشروع مأخوذ من Web config المحلي العام، وليس نتيجة تحقق من Console.

كاش Functions السابق وبيانات عميل v4: النشر المنسق للواجهة والباك إند وتقاعد النسخ القديمة مطلوب قبل إعلان إغلاق REL-01 إنتاجيًا. العميل الحالي يحذف v4 ويعيد projection قبل التخزين؛ لا نمسح بيانات إنتاج ولا ندعي سحب بيانات سبق تسليمها لمتصفح قديم.

الإدارة الموجودة تشمل الحجز والفريق وCMS وPOS والمخزون والمصروفات والإيرادات والتقارير والرواتب والسلف والورديات وفق المصدر. تصنيف ERP متكامل وكفء يحتاج قبول الدورات الفعلية والاتساق والصلاحيات والأداء، ولا يُثبت بوجود الأقسام فقط. لا إضافة دفتر أستاذ/ضرائب/موردين أو تغيير مالي ضمن هذا التعديل. فشلا المالية التاريخيان41PASS/2FAIL: توقع advance مباشر قديم، ثم report محتمل cascade؛ لم يُصلحا بتغيير السياسة أو توقعات الاختبار، وإعادة التحقق المعزولة ما زالت مطلوبة.

مراجع رسمية: https://firebase.google.com/docs/functions/manage-functions وhttps://firebase.google.com/docs/emulator-suite/connect_auth . سياسة --only تدعم تحديث الوظائف المحددة؛ demo projects لا تحتوي موارد إنتاج.
