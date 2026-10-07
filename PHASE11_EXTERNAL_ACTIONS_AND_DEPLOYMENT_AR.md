# إجراءات خارجية وخطة نشر — وثيقة فقط
لا تنفذ هذه الخطة دون موافقة إنتاج صريحة.

1. إثبات baseline الإنتاج الحالي: Vercel deployment ID وGit commit، Firebase health revision وHTTP 200 وCORS/App Check؛ مقارنة هذه الحزمة بالأصل. الحزمة بُنيت من V10 ZIP المتاح، وليست إثباتًا مستقلاً أنه أحدث commit حي.
2. Owner يراجع read-only export للفروع/staff/services/packages/offers/reviews/content ويعتمد mapping؛ لا تخمين للفروع ولا write الآن. PHASE11_DATA_AUDIT_AR.md يحدد النواقص.
3. Firebase Console: Google provider وauthorized domains، Phone provider وSMS policy/quotas/reCAPTCHA، domain redirect flows؛ لا تغيير الآن. AI_AGENT_API_KEY secret على Functions فقط؛ لا VITE key. مراجعة model/budget وتنبيه تكلفة قبل تفعيل flag.
4. مراجعة IAM/Scheduler/FCM وfirestore.indexes.json، وتشغيل staging Auth/App Check/OTP/Google/FCM/GPS على أجهزة حقيقية؛ Node22 وJava21 مع CLI الحالي. اختبار جميع الأدوار والدفع/refund على بيانات staging معتمدة.
5. بعد الموافقة فقط: snapshot للإعدادات وفهارس ونسخة Functions/Vercel وخطة rollback؛ نشر الفهارس وانتظار READY، ثم Functions الجديدة مع إبقاء AI false؛ Rules/Storage لم تتغير ولا تحتاج إعادة نشر لهذا التغيير. اختبار /health وCORS/App Check والبوابات القديمة.
6. Vercel preview ثم production مع Config القائم؛ smoke للروابط والحجز/customer/worker/admin، checking safe areas على أجهزة فعلية. لا overwrite للبيانات أو seed.
7. اعتماد backfill محدود مستقبلي للتذكيرات القديمة منفصلًا؛ ثم اختبار cancel/reschedule وعدم التكرار. تفعيل AI فقط بعد اعتماد الميزانية والملكية واختبار provider حقيقي. مراقبة الأخطاء والتكلفة وpush، وإبقاء kill switch جاهزًا.
8. rollback: AI false أولًا، إعادة Vercel السابق وFunctions السابقة عند الحاجة، الحفاظ على سجلات audit وعدم إزالة الدعوات/المسودات/الإشعارات عشوائيًا. إعادة تقييم العملاء المرتبطين قبل rollback claims.
