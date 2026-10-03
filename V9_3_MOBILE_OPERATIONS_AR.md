# V9.3 — تشغيل الفريق وتجربة الموبايل: تقرير التحقق

## الحالة

**نسخة تطوير ومراجعة؛ غير جاهزة لاعتماد Final Production Gate.** لم يحدث Deploy أو Push أو اتصال ببيانات الإنتاج. الصور المرجعية المذكورة في التكليف لم تكن متاحة كملفات داخل هذه الجلسة، ولم يمكن فتح معاينة تفاعلية موثقة بحسابات اختبار؛ لذلك لا توجد لقطات فعلية ولا ادعاء بتطابق بصري.

## EXISTING SYSTEMS REUSED

استخدمنا `attendanceDays` و`workerTasks` و`workerNotifications` و`activityLogs` و`getAttendanceDashboard` و`recordWorkerAttendance` و`getWorkerWorkspace` و`createWorkerTask` و`updateWorkerTask` و`notifyWorker` و`sendWorkerPush` و`coupons` وPOS وDashboard. لم تُنشأ مجموعة حضور أو مهام أو إشعارات أو كوبونات جديدة.

## OWNER MOBILE ARCHITECTURE

حساب Admin نفسه على Desktop وMobile. تظهر في الهاتف بطاقة شهرية بأربعة مؤشرات، اختيار الفرع في Bottom Sheet، وتنقل من خمسة عناصر: الرئيسية، المبيعات، الحجوزات، المصروفات، المزيد. للكاشير خمسة اختصارات تشغيلية (المعاملات، الحجوزات، الفريق، الشيفت، المهام)، وللعامل خمسة اختصارات داخل Workspace نفسها (الرئيسية، الحضور، مواعيدي، المهام، حسابي). يستمر Desktop في أقسامه الحالية. شاشة المزيد تعيد استخدام بوابة الإدارة وروابطها. سجل المبيعات والمصروفات على الهاتف يعرض أحدث العناصر **المحدودة المحملة** بوضوح؛ الإجماليات الشهرية تأتي من الخادم. لا توجد شاشة Owner جديدة مستقلة أو مصدر بيانات مالي آخر.

## OWNER BRANCH AGGREGATION / HOME KPIs

`getAdminDashboard` يستخدم AggregateField على `revenueLedger` للإيراد وعدد قيود الدفع الشهرية، وعلى `customers.firstVisitDateKey` لعدد العملاء الجدد. متوسط الفاتورة = إيراد الشهر / عدد قيود الدفع، ويحسب من الإجماليات لا من آخر الصفوف. الهدف مجموع أهداف الفرعين الحاليين من المصدر الموجود. عند تغيير الفرع تُفرّغ البطاقات القديمة، تُرفض الاستجابة المتأخرة عبر `dashboardRequestVersion`، ويُعاد تحميل التقويم والحضور إذا كانا مفتوحين. تعريف «العميل الجديد في الفرع» يعتمد `lastBranchId` الحالي؛ العميل الذي انتقل لاحقًا بين الفرعين قد ينتقل تصنيفه التاريخي. هذا قيد معروف لا يصلح لاستنتاج أول فرع زاره.

## SALES MOBILE / EXPENSES MOBILE / OWNER MORE

بطاقات لأحدث قيود المبيعات والمصروفات، مع البحث في قائمة المبيعات المحدودة، وإجماليات شهرية Server-side. قوائم Desktop الموجودة تظل متاحة. **غير مكتمل:** فلاتر تاريخ/عامل/حالة/وسيلة/مصدر/نوع كاملة ذات إجماليات خادمية، تصفح شامل لسجل المبيعات، مقارنة يوم/شهر للمصروفات، ورسم الفئات. لا تُعرض أرقام القائمة المحدودة على أنها الإجمالي.

## OWNER ATTENDANCE / TEAM ACCOUNTS / BRANCH LOCATION / REPORTS / OFFERS

الأقسام الإدارية القائمة قابلة للوصول عبر «المزيد» بحسب صلاحية Admin، بما فيها الحضور والحسابات والموقع والتقارير والعروض والكوبونات. لم تُنشأ نسخ ثانية من CRUD أو التقارير. واجهات الهاتف التفصيلية لهذه الأقسام لم تُثبت بصريًا، ولا يُعد وصول الرابط بديلًا لاختبار تدفق كل نموذج.

## CASHIER PERMISSIONS BEFORE / AFTER

| القدرة | قبل | بعد |
|---|---|---|
| POS والحجوزات | افتراضي | افتراضي |
| `attendance` / `tasks` الإداريتان | ممنوعتان | ممنوعتان |
| `teamOperations` | غير موجودة | افتراضية للكاشير، حتى الحسابات ذات claims قديمة |
| إدارة الكوبونات والعملاء والعمال | ممنوعة | ممنوعة |
| عروض/حملات واتساب | Grant اختياري | كما هي |

`teamOperations` لا يفتح قسم Attendance أو Tasks الإداري في sidebar، ولا يتيح `recordWorkerAttendance`. Manager يظل يستخدم صلاحياته الإدارية الموجودة داخل فروعه. رفض الخادم الحساب غير المرتبط بفرع في Dashboard/Attendance بدل إمكان قراءة نطاق عام عبر `all`.

## CASHIER ATTENDANCE / TEAM NOW

داخل جدول الحجوزات توجد لوحة «الفريق الآن» من snapshot فرع الكاشير فقط: موجود، غائب، خرج، ومشغول تقديريًا إذا كان حجز معروض في حالة وصول/تنفيذ. «متاح» يعني حاضرًا ولا يوجد حجز نشط ظاهر في snapshot؛ **ليس ضمانًا من جدولة كل المواعيد أو حضور خارج بيانات اليوم**. تعيين العامل في قائمة الحجوزات صار يعتمد على حضور `PRESENT` بدل كل العمال النشطين. العامل وحده يسجل حضوره من `recordWorkerAttendance` مع GPS والتحقق من الفرع. لا يوجد listener لكل عامل.

## TASK FLOW / WORKER MOBILE TASK FLOW / PUSH

يُنشئ الكاشير مهمة للعامل داخل فرعه بنفس `createWorkerTask` مع مفتاح idempotency، العنوان، التفاصيل، الأولوية، موعد اختياري وحجز اختياري. التنبيه السريع يستعمل `notifyWorker`. الخادم ينشئ `workerNotifications` ويستدعي `sendWorkerPush` كما كان؛ رفض Push لا يحذف المهمة من Workspace. انتقال الحالة صار NEW → SEEN/IN_PROGRESS → IN_PROGRESS → DONE، مع CANCELLED للمشرف قبل الإنجاز؛ التحديث وفحص الحالة وكتابة Audit كلها داخل Firestore transaction واحدة لمنع سباق DONE مع CANCELLED. `getWorkerWorkspace` يظل مصدر العامل، وطلب إذن Push يظل عند الإجراء لا عند الدخول. تسليم Push الحقيقي على هاتف عامل **غير مختبر**.

## COUPON FLOW

أضيف كود خصم في POS مع زر فحص يستعمل `validateCoupon` الموجود للأصناف المدعومة، ثم تحقق نهائي داخل معاملة `createPosOrder` من الكود، الفرع، الحالة، التاريخ، حد الاستخدام والعميل، حد الفاتورة والأصناف. السعر من `priceItems`/المصادر الفعلية والخادم يحسب الخصم؛ تحديث `coupons` و`couponUsage` داخل معاملة الشيك نفسها بعد مفتاح منع التكرار. لا تُمنح صلاحية إدارة الكوبونات للكاشير. الكوبون التاريخي بلا `branchIds` لا يُطبّق تلقائيًا على أي فرع في الحجز العام أو POS؛ يحتاج مراجعة إدارية صريحة. الفواتير التي تشمل `inventory` أو `drink` تُراجع عند الحفظ فقط، لأن preview العامة لا تسعر هذين النوعين. قد يختلف مبلغ المعاينة عن النهائي إذا تغير السعر أو استُخدم الكود بين المعاينة والحفظ؛ الخادم يحسم ذلك. أضيف حقلا `manualDiscountAmount` و`couponDiscountAmount` في الحجز لكي تعكس عمليات العكس قيمة الكوبون نفسها، لا إجمالي الخصمين.

## MOBILE BUGS FIXED / SCANNER LIFECYCLE / PWA

حوّلت جدول الحجوزات والمعاملات على ≤720px إلى بطاقات CSS بإجراءات على عمودين، ونقلت فلاتر الحجز الثانوية والتصدير إلى `details`. أضيفت مساحة أسفل الصفحة للـBottom Navigation، حدود عرض للأزرار والحقول، Bottom Sheet للفرع وقيود للحوارات. عند إغلاق ماسح الباركود أو مغادرة القسم أو `pagehide`: تتوقف controls والكاميرا؛ رقم جيل يمنع استمرار فتح الكاميرا بعد استجابة async متأخرة. على localhost/127.0.0.1 لا يعترض Service Worker طلبات الشبكة، وتسجل لوحة الإدارة إزالة التسجيل السابق أثناء التطوير. هذا لا يوقف حماية App Check أو يغير Auth؛ V8.1 بقيت كما هي. أضيف اسم مستخدم autocomplete مقروء للمتصفح داخل نموذج تغيير كلمة المرور.

## ROUTE AUDIT

حافظنا على المسارات العامة الـ13 الموثقة في link audit وعلى Hash sections الموجودة، مع Home Admin mobile = `#admin=dashboard`. لا توجد route منفصلة لـOwner. Refresh/Back/Forward بُنيت على آلية `commitAdminHistory` الحالية؛ **التنقل العملي في متصفح مصرح لم يُتحقق**.

## FILES CHANGED / FUNCTIONS CHANGED / INDEX CHANGES

`admin/index.html`، `src/admin.js`، `src/admin.css`، `src/admin-api.js`، `public/sw.js`، `functions/src/authorization.js`، `functions/src/index.js`، `firestore.indexes.json`، واختبارات V9.3 وتحديث توقعات اختبارات V6.1/V9.1/V9.2 المتأثرة بتغيير الـcontract. Functions: `getAdminDashboard`, `getAttendanceDashboard`, `createPosOrder`, `createWorkerTask`, `updateWorkerTask`, `notifyWorker` (تصريح محدود)، دون إنشاء Function أو Collection جديدة. فهرسان لـ`revenueLedger`: (`branchId`, `type`, `dateKey`) و(`type`, `dateKey`). لم يُنشر الفهرس؛ جاهزيته العملية تتطلب Emulator/نشرًا لاحقًا بموافقة منفصلة.

## TESTS ADDED / TEST RESULTS

- `npm test`: **171/171 PASS**، بما فيها V9.3 لعزل teamOperations، source KPI، قسيمة POS، ودورة Scanner/localhost.
- `npm run test:functions`: **42/42 PASS**.
- `npm run test:rules`: **NOT VERIFIED**؛ Java 17 فقط، Firebase Tools يتطلب 21+. تم تشغيل الأمر وأوقفه شرط Java قبل بدء الاختبارات.
- `npm run test:gate:handlers`: **NOT VERIFIED** للسبب نفسه؛ لا نعتبر اختبار IDOR HTTP مكتملًا.
- `npm run build`: **PASS**.
- `npm run verify:build`: **PASS**.
- `npm run verify:firebase`: **PASS** (توصيل static، وليس بديلًا عن Emulator).
- `npm run audit:links`: **PASS**، 13 route و295 رابط/أصل.
- `npm run smoke`: **PASS**، 15 مسارًا/أصلًا، بخادم ملفات مؤقت وNode 22؛ Vite preview على Node 24 في هذه البيئة تعطل بسبب `uv_interface_addresses`.
- `npm run audit:performance`: **PASS**، 48 طلبًا، 0% أخطاء، p95 محلي ~3ms بخادم الملفات المؤقت. لا يمثل زمن Firebase الحقيقي.

## FIREBASE COST IMPACT / SECURITY IMPACT

بطاقة Owner تضيف aggregate counts شهرية للمدفوعات والعملاء الجدد؛ لا تحمل دفتر الإيراد الكامل إلى المتصفح. Team Now يستخدم snapshot الموجود عند فتح الجدول/التحديث دون listeners جديدة. معاينة الكوبون اختيارية وتقرأ الكوبون والاستخدام وأسعار الأصناف؛ صرف الكوبون يضيف قراءتين وكتابتين على مستندَي العداد داخل معاملة POS نفسها، دون قيد مالي مكرر. Branch Scope يؤكد من backend؛ لا يمكن للكاشير تعديل حضور العامل أو إدارة كوبون. اختبارات العزل السلبية الفعلية تحتاج Emulator.

## VISUAL QA STATUS / KNOWN LIMITATIONS

**VISUAL QA NOT VERIFIED.** لا Screenshots عند 360/390/430/768/1024/1440، ولا تطابق مؤكد للصور المرجعية؛ لا حسابات اختبار فرعية أو Preview تفاعلي موصول ببيانات Emulator. لم ينجز في هذه الدفعة: فلاتر Sales كاملة بخادم Aggregate مستقل، تحليلات Expense ورسومها على الهاتف، نموذج Owner متخصص لكل أقسام More، إثبات Staff busy من جدول الخدمات الفعلي لا Snapshot الحجز فقط، عرض موبايل متحقق للتقارير والحملات، وكامل اختبار الضغط والتفاعل. القيود القديمة على تقارير Legacy بدون branchId لم تتغير.

## READY FOR FINAL PRODUCTION GATE

**NO.** يلزم Java 21 وتشغيل Firestore Rules وHTTP Functions Gate سلبياً لكلا الفرعين، حسابات Admin/Cashier/Worker تجريبية، فحص POS coupon/attendance/task على Emulator، ثم QA بصري ولقطات شاشة مع صور المرجع والمقاسات المطلوبة. لا Deploy أو Push أو تغيير Production Data.
