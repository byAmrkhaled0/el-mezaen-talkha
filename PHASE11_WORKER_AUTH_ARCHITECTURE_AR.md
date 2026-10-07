# مصادقة العامل
Google أو Phone OTP عبر Firebase Auth، مع بقاء email/password. Google popup على desktop وredirect على mobile؛ Egyptian phone normalization ومسار reCAPTCHA/OTP المشترك. الحساب الجديد يبقى PENDING وتظهر رسالة انتظار الإدارة.

الدعوة تربط staffId وفروع السجل المعتمد وهوية اختيارية وانتهاء وcreatedBy، وتحفظ hash فقط. Redemption transaction يمنع إعادة الاستخدام ويربط UID بالعامل المعتمد؛ الخادم يطبق worker claims والصلاحيات ثم يلغي الجلسات ويطلب تسجيل الدخول مجددًا. ACTIVE/PENDING/DISABLED تُفحص مع Auth الحي. لا role/staffId/branchIds من العميل.

Account Center يعرض metadata آمنة فقط، حتى 100 حساب staff و30 عميلًا حديثًا؛ editor الأصلي يظل مسؤولًا عن role/branches/permissions. لا passwords أو OTP أو refresh tokens. unlink/disable/revoke تتطلب live Admin revalidation وaudit. الربط الإداري يستخدم setUserRole القائم؛ لا نظام عامل ثانٍ.

قبل الاستخدام الحقيقي يلزم تفعيل Google في Console واعتماد authorized domains، واختبار redirect وPhone provider وSMS/reCAPTCHA. لم يتم تغيير أي Provider إنتاجي. فشل claims بعد transaction يُعالج بإجراء إداري وإعادة تسجيل دخول؛ لا إعادة تشغيل الدعوة المستهلكة.
