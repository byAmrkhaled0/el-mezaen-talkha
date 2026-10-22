# مراجعة السلة والتشغيل وBackend — تسليم محلي

## المنفذ
أيقونات الهيدر أهدأ: خلفية وحدود شفافة ورسمة18px بstroke1.6 مع بقاء مساحة ضغط44px وfocus واضح. اللغة والشمس/الهلال ظاهرين كما في النسخة السابقة.
السلة خرجت من الهيدر ومن عنوان الخدمات، واتشال زرها من HTML الأولي لمنع ظهوره لحظة التحميل. عنصر عائم واحد: button على الرئيسية يستخدم openBooking الحالي، وعلى الصفحات الأخرى رابط /?book=1 يعيد سياق الحجز والسلة الحالي. العدد يشمل الكميات ويتحدث عند التغيير وتغيير اللغة. مكانه يمينًا مقابل المساعد، ويختفي أثناء menu/assistant/dialog modal، وموضع أعلى الصفحة فوقه بـ64px.
روابط الأقسام الاختيارية الفاضية مثل العروض تكشف رسالة empty state عند فتحها بالـhash؛ لا تتحول روابط لا تفعل شيئًا بسبب إخفاء القسم الافتراضي.

## إصلاحات QA العملية
قراءة CLI15.31.0 أكدت أن project directory هو مجلد config وأن المسار الخارج عنه مرفوض. تم تجهيز firebase.qa.json في الجذر بمسارات داخلية؛ qa-only/firebase.qa.json قالب فقط. إعداد firebase.json الإنتاجي كما هو.
qa-only/run-local.ps1 يوفر Check/Backend/Seed/Web/Gates/Rules، يرفض المضيف قبل تشغيل process، ويشترط حساب Sandbox وعدم وجود adapter نشط/default route ومجلدات offline الصحيحة. لا تثبيت أو تفعيل ميزة أو تعديل سياسة أمان. رفض التشغيل على المضيف متحقق ومُسجل. الملف اتفحص بPowerShell parser؛ لم تُنفذ أوضاع تشغيل التطبيق لأن Sandbox غير موجودة حاليًا والجلسة ليست Administrator.
حساب العامل التجريبي اتظبط ليستعمل workerAuthEmail من implementation الحالي وusername qa-worker-talkha. لا تغيير لمسار الدخول أو custom claims في إنتاج، ولا schema/collection جديدة. seeder نفسه لم يُنفذ؛ الكود ده fixtures فقط.
Node media hook اجتاز اختبار استيراد مستقل ببيئة مصطنعة على مدقق URL فقط، بدون Firebase SDK. مصدر CLI يورث process.env؛ وراثته وعمله داخل Functions الفعلية لم يُختبرا بعد. قراءة مصدر CLI ليست تشغيل emulator.

## النتائج الحالية
-632/632 اختبار وحدة آمن في الجذر PASS، و142/142 Functions units PASS. اختباري Vite اللذين يبدأان server خارج هذه المجموعة BLOCKED لحين العزل. السكربت Gates يشغلهما داخل guest.
-build وverify:build PASS، وaudit:links PASS:18 HTML routes و602 local links/assets.
-مراجعة HTML ساكنة:18 صفحة و908 عناصر form/control/link،57 عنصر تنقل للإدارة تؤدي إلى35 قسمًا فريدًا، وكل IDs وملفات المسارات المستهدفة موجودة. ده لا يعني أن كل عنصر dynamic أو submit أو authorization اشتغل فعليًا. ALL_STATIC_CONTROLS وSTATIC_LINKS وADMIN_ACCEPTANCE يوضحوا النطاق.
-32 معاينة ساكنة عربي/إنجليزي وفاتح/داكن على320/360/390/430/600/820/1280/1440:لا overflow ولا تداخل للسلة مع المساعد/التنقل السفلي/أعلى الصفحة. الصور HTML بلا JavaScript ومواردها مضمنة، ليست screenshots لتطبيق متصل أو Admin محقق.
-تم الحفاظ على504 بند جرد و40 رحلة بالأعمدة التاريخية مع حالة runtime الحالية مستقلة. لا نتائج تاريخية تُحسب نجاحًا حاليًا.

## Functions وFirebase
المقارنة مع المرجع المحلي FINAL_MOBILE_SOURCE:93 اسم تصدير قبل وبعد،0 جديد،0 محذوف. المطلوب من الإصلاحات السابقة تحديث getCatalog وgetAdminCollection فقط، ومعهما helperpublic-staff ضمن الحزمة وليس وظيفة Cloud جديدة. تغييرات السلة والهيدر الحالية لا تحتاج Functions إضافية.
قائمة الوظائف المنشورة حاليًا غير معروفة لأن إنتاج لم يُفتح؛ لو أقدم من المرجع فلا ننشر بناءً على افتراض التطابق. BACKEND_FIREBASE_RELEASE_PLAN_AR فيه الأمر المستقبلي المحدد بعد نجاح QA وموافقة نشر منفصلة، ولم يُنفذ.
لا تغييرات مطلوبة بسبب هذه الحزمة في Rules/Indexes/schema/collections/productionAuthClaims/StorageBucket/AppCheck. نفس Firebase Storage للفيديو؛ لا cleanup ولا حذف. Source config يدل على el-mezaen-talkha وURL Vercel لكن حالة الاستضافة والفوترة والخدمات الحية لم تتحقق. نشر الواجهة والوظيفتين لاحقًا مطلوب لتطبيق الإصلاحات على مستخدمي الإنتاج؛ الحزمة الحالية محلية فقط.

## التشغيل الفعلي والـERP
البيئة المعزولة لم تتجهز: actual Admin/booking/account/media/Rules/branch security runtime BLOCKED. Admin UI الحقيقي وصحة كل form/save/role والسرعة لم يراجعوا بالمتصفح؛ لم نعرض mock Dashboard كدليل. قائمة35 قسمًا ومراحل القبول والأوامر موجودة في LOCAL_QA_COMMANDS_AR وADMIN_ACCEPTANCE.
الأقسام التشغيلية والمالية الموجودة في المصدر تشمل الحجز والفريق وPOS والمخزون والمصروفات والإيرادات والتقارير والرواتب والسلف والورديات. اعتماد ERP متكامل يحتاج قبول الدورات الفعلية والاتساق والأداء والمتطلبات المحاسبية؛ لا نطلق عليه ERP مكتمل بمجرد وجود الأقسام. لم نضف أو نغير نظامًا ماليًا.
فشلا المالية التاريخيان (41PASS/2FAIL) محفوظان: #39 توقع advance مباشر مخالف للسياسة الحالية، و#42 يحتمل cascade بعد توقف fixture قبل غلق الوردية. لم يتغير الكود المالي أو اختباراته. الحالة الحالية لإعادة التحقق BLOCKED، ولا نعلن إصلاحهما بنجاح142 وحدة.
Lighthouse/LCP/CLS/INP وstartup/auth readiness/request timings فعلية NOT TESTED. Bundle budgets وdedup unit لا يثبتوا سرعة نظام الإدارة على بيانات حقيقية. Admin readCall error-code retry له proposal سابق غير مطبق يحتاج مراجعة وتفويض منفصل لتعديل protected API.

لا Push،لا Deploy،لا وصول/كتابة إنتاج،لا AI حي،لا رسائل حقيقية،لا تغيير AppCheck أو سياسات النظام. الحزمة للمراجعة والتشغيل المحلي المعزول، وليست اعتماد Production-ready.
