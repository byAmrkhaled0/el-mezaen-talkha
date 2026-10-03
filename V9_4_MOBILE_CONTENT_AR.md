# V9.4 — إدارة المحتوى بالموبايل واستكمال شاشات المالك

## حالة القبول

نسخة مستقلة من V9.3، بلا نشر أو دفع أو تعديل بيانات الإنتاج. **READY FOR FINAL PRODUCTION GATE: NO**. يلزم Java 21+ لمحاكيات القواعد والـGate، وفحص بصري فعلي، مع بقاء HTTP Functions Gate السابق مفتوحًا.

## CONTENT SYSTEM REUSED / CONTENT PERMISSION MATRIX

| النوع | المصدر | الصلاحية | Manager | Cashier |
| --- | --- | --- | --- | --- |
| معرض | content: gallery | gallery | فرعه | منح صريح |
| نتيجة وقبل/بعد | content: result | results | فرعه | منح صريح |
| تركيب الشعر/فيديو | content: hair-system | hairMedia | فرعه | منح صريح |
| مشاهير | content: celebrity | celebrities | فرعه | منح صريح |
| خبر/منشور | content: news | posts | فرعه | منح صريح |
| عرض | offers | offers | فرعه | منح صريح |

القيم الخمس الأولى types في مجموعة content الواحدة. بقيت صلاحيات المحتوى خارج الافتراضات للكاشير. الخادم يتحقق من سقف الدور ومنح الكاشير المسجل والنوع القديم والجديد وملكية الفروع، قبل الحفظ والحذف. الاستعلام نفسه يقيد النوع والفرع. Admin يرى الفرعين؛ المشترك يمثله branchIds يضم الفرعين، دون تخمين فرع لوثيقة Legacy.

## CASHIER OPTIONAL CONTENT ACCESS / MANAGER CONTENT ACCESS

«المحتوى» يظهر في المزيد للكاشير ذي منحة محتوى/عرض فقط، والرابط المباشر محروس. قراءة عروض POS لا تمنح إدارة العروض. المدير يستعمل صلاحياته القائمة داخل allowedBranchIds. لا ينشئ branch-scoped user محتوى Global أو محتوى فرع مقابل.

## IMAGE FLOW / VIDEO FLOW / BEFORE/AFTER FLOW / OFFER FLOW

بطاقات النوع والحالة والمعاينة والتعديل والنشر/الإخفاء والحذف تستخدم adminUpsert وadminDelete الموجودة. الرفع يستعمل uploadImage وuploadVideo وvalidateVideoFile مع تقدم ومعاينة وقفل الزر. صور قبل وبعد حقول في وثيقة result ذاتها؛ يجب اكتمال الزوج ويظهر في النتائج. الفيديو يستخدم غلافًا وpreload=metadata. Storage يقيد النوع والفرع وMIME والحجم، والـcallable يتحقق قبل النشر. العروض تحفظ في offers نفسها، المصدر الوحيد للموقع والحجز والحملات.

## PUBLIC BRANCH RENDERING

الكتالوج العام الحالي يختار النشط/المنشور ثم publicSubset حسب الفرع. طلخا فقط لا تظهر بالمشاية والعكس؛ المشترك يظهر بكليهما؛ draft/hidden لا يظهران. الحفظ يستدعي markCatalogChanged. لا polling ولا listener لكل بطاقة. لم يُعد بناء Backend الحجز أو واتساب.

## OWNER SALES FILTERS / OWNER SALES AGGREGATES

getOwnerMobileHistory الجديدة Admin-only. فترات القاهرة: كل الأيام، اليوم، أمس، 7 أيام، الشهر الحالي والسابق، سنة، يوم ونطاق. العامل، دفع/استرداد، طريقة الدفع، المصدر الفعلي POS/Website، وكود الحجز الكامل. 20 عنصرًا بالصفحة مع cursor؛ count/sum من الخادم لكل نتائج الفلتر وليس الصفحة. أسماء العملاء عبر getAll مجمعة حتى 20 حجزًا معروضًا، بلا N+1. قيد دفع/استرداد جديد يسجل source في نفس كتابة revenueLedger.

**حد معلوم:** ledger القديم لا يصنف كل قيد خدمة/منتج/باقة بصورة موثوقة، لذلك لا فلتر «نوع مبيعات» تجاري بأرقام مخترعة. البحث كود كامل؛ فلتر المصدر يستبعد بعض القيود القديمة بلا source. الوثائق بلا branchId لا تُنسب لفرع.

## OWNER EXPENSE ANALYTICS

الفترة يوم/شهر أو نطاق، والتصنيفات الموجودة. عدد/مبلغ كل نتائج الفلتر وتحليل الفئات Firestore aggregates من الخادم، والقائمة محدودة بصفحات. مخطط meter خفيف دون اعتماد جديد.

## OWNER MORE / MOBILE UX

المزيد يربط الحضور وحسابات الفريق وموقع الفرع والتقارير والعروض والكوبونات والمحتوى والإشعارات وإعدادات الحساب بالأقسام الحالية. شريط مدير مختصر؛ الكاشير يحتفظ بأقسامه التشغيلية و«المزيد» للأدوات المصرح بها. CSS للبطاقات والقوائم والأوراق السفلية. تغيير فرع المالك يبطل الاستجابات القديمة ويظهر التحميل. تعديل الموقع العام اقتصر على عرض زوج صور النتيجة من بياناته الفعلية.

## EMULATOR SAFETY / SECURITY IMPACT

test:rules يستعمل demo-el-mezaen-rules والـGate يستعمل demo-el-mezaen-gate. الملفات ترفض project ID بلا demo- وتفشل عند غياب مضيف Firestore/Storage أو Auth المطلوب. لا cloud fallback. Storage يشترط claim النوع والفرع، والـcallable يتحقق أيضًا من منحة الكاشير المسجلة وملكية المورد. لا تغيير في App Check أو صلاحيات الكاشير الافتراضية.

## FILES CHANGED / FUNCTIONS CHANGED / INDEXES

- Backend: functions/src/authorization.js، functions/src/index.js، functions/src/owner-mobile.js.
- UI: src/admin-api.js، src/admin.js، admin/index.html، src/admin.css.
- Public results: src/app.js، src/results.js، src/styles.css، results/index.html.
- Config/security: storage.rules، firestore.indexes.json، package.json.
- Tests: tests/firebase-rules.emulator.mjs، tests/v6-1-production-gate.emulator.mjs، tests/v9-4-mobile-content.test.mjs، وتوقعات admin-v42 وcashier-v44 وphase1-regressions.

الدالة الجديدة getOwnerMobileHistory؛ لا مجموعة جديدة. الفهارس المركبة 83 قبل التغيير و118 بعده لتراكيب ledger والمصروفات ونوع المحتوى/الفرع. لم تُنشر؛ صحتها التشغيلية تحتاج Emulator.

## TEST RESULTS / VISUAL QA

| الأمر | النتيجة |
| --- | --- |
| npm test | 177/177 PASS؛ 6 حالات V9.4 ثابتة/منطقية |
| npm run test:functions | 42/42 PASS |
| npm run test:rules | NOT VERIFIED؛ Firebase Tools أوقف المحاكي لأن Java 17، المطلوب 21+ |
| npm run test:gate:handlers | NOT VERIFIED للسبب نفسه |
| build، verify:build، verify:firebase، audit:links | PASS؛ 13 HTML و295 رابطًا/أصلًا |
| smoke | PASS؛ 15 مسارًا/أصلًا |
| audit:performance | 48 طلبًا، 0% خطأ، p95 محلي 3ms |

عُطّل وكيل الشبكة لطلبات localhost في smoke/performance فقط بعد خطأ Undici؛ التطبيق لم يتغير. **VISUAL QA NOT VERIFIED:** المتصفح التفاعلي حجب localhost، لذلك لا لقطات 390/1440 ولا ادعاء قبول بصري. اختبارات Storage السلبية الجديدة لم تنفذ؛ اختبارات النصوص ليست بديلًا عنها.

## FIREBASE COST IMPACT / KNOWN LIMITATIONS

حتى 21 قيدًا لكل فرع للصفحة، aggregate مبلغ/عدد لكل فرع وgetAll حتى 20 حجزًا معروضًا. تحليل المصروفات ينفذ 9 aggregate استعلامات تصنيف لكل فرع بجانب الإجمالي: تكلفة ثابتة لكل فتح/تحديث وقد تحتاج تقليلًا عند كثافة الاستخدام. لا listener جديد ولا نسخ بيانات مالية خام. قراءة محتوى الكاشير تضيف قراءة وثيقة حساب للتحقق من المنحة.

يبقى تشغيل الفهارس ورفع/حذف المحتوى بمحاكي Java 21، والفحص البصري بحسابات حقيقية تجريبية، وHTTP Functions Gate السابق، قبل أي اعتماد للإنتاج.
