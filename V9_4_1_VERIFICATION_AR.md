# V9.4.1 — بوابة التحقق للموبايل والمحاكيات والوسائط

## القرار

**READY FOR V10: NO.** هذه مرحلة تحقق من V9.4 فقط. لم يتغير منطق التطبيق أو القواعد أو الفهارس، ولم يحدث Deploy أو Push أو تغيير لبيانات الإنتاج. لم تسمح البيئة بتشغيل محاكيات Firebase أو فتح localhost في المتصفح التفاعلي، ولذلك لا يصح ادعاء اكتمال التحقق الأمني والبصري.

## JAVA VERSION

نتيجة java -version: OpenJDK 17.0.20. بحثت عن Java 21 في /usr/lib/jvm و/opt و/usr/local و/workspace و/root و/tmp؛ لم تظهر نسخة 21 أو حزمة مثبتة متاحة. لم أغير المشروع أو متطلبات الاختبار للتحايل على هذا القيد.

## RULES RESULT / HANDLER GATE RESULT

- npm run test:rules استُدعي فعليًا بمشروع demo-el-mezaen-rules فقط؛ توقف Firebase Tools قبل الحالات برسالة «no longer supports Java version before 21». النتيجة **NOT VERIFIED** وليست X/X PASS.
- npm run test:gate:handlers استُدعي بمشروع demo-el-mezaen-gate فقط؛ توقف للسبب نفسه. النتيجة **NOT VERIFIED**.
- شغلت أربع حالات تشغيل سلبية مستقلة: rules بلا مضيف، rules بمشروع غير demo، gate بلا مضيف، gate بمشروع غير demo. كلها خرجت بفشل قبل الاتصال. قواعد الاختبار تتطلب FIRESTORE_EMULATOR_HOST وFIREBASE_STORAGE_EMULATOR_HOST، والـGate يتطلب FIRESTORE_EMULATOR_HOST وFIREBASE_AUTH_EMULATOR_HOST. لا fallback سحابي.

## CONTENT SECURITY / MEDIA UPLOAD RESULT / BEFORE/AFTER RESULT

قُرئت صلاحيات المحتوى ومسارات adminUpsert وadminDelete وgetAdminCollection وStorage rules. الكاشير لا يملك content grant افتراضيًا، ويتحقق الخادم من المنحة المخزنة ونوع المحتوى وbranchIds القديم والجديد. المدير مقيد بفروعه، والأدمن له الفرعان. لا يتيح نموذج الحفظ الحالي branchIds فارغة حتى للأدمن؛ «مشترك» يعني الفرعين، لا وثيقة global بلا فرع. طلبات IDs المباشرة والرفع عبر Storage **NOT VERIFIED فعليًا** لعدم تشغيل المحاكي.

اختبارات Storage المكتوبة في V9.4 تغطي صورة صالحة، فرعًا آخر، نوعًا غير مصرح، فيديو MP4 صالحًا وفيديو 30MiB مرفوضًا، بينما اختبارات عامة تغطي MIME وحجم الصورة. لم تعمل هنا. فحص القاعدة النصي وجد حد الصور أقل من 5MiB وMIME jpeg/png/webp/avif، وحد الفيديو أقل من 30MiB وMIME mp4/webm. اختبار invalid video MIME على المسار الجديد، وoversized image عليه، لم ينفذا؛ لا أرفع الحالة إلى VERIFIED.

يتحقق adminUpsert من اكتمال beforeImageUrl وafterImageUrl لنوع result، والكatalog العام يخرج draft/hidden؛ publicSubset النقية فُحصت بمحتوى طلخا والمشاية والمشترك ونجحت. نشر زوج صور فعلي عبر callable وStorage ثم ظهوره بالموقع **NOT VERIFIED**. إنشاء العرض بالموبايل يوجه إلى offers نفسها وفق ربط الواجهة والكود؛ التكامل الحي مع Website/Booking/WhatsApp لم ينفذ.

## OWNER SALES RESULT / OWNER EXPENSE RESULT

فحصت getOwnerMobileHistory: يبدأ من revenueLedger أو expenses حسب kind، ويقيد branchId/dateKey، ويطبق العامل وطريقة الدفع والمصدر ونوع القيد وكود الحجز عند المبيعات. صفحات 20 سجلًا مع cursor؛ المجاميع تستعمل AggregateField.count/sum مستقلة عن pageRows. الفئات التسع تمر على استعلامات aggregate منفصلة. اختبار pure لفترات Cairo التسع وعزل publicSubset نجح 11/11.

نتائج Talkha/Mashaya/All والفلاتر والصفحات على بيانات محاكي فعلية **NOT VERIFIED**. لا يوجد مصدر موثوق لتصنيف Service/Product/Package لكل ledger قديم؛ لم أضف فلترًا مزيفًا. يمكن أن تكون source مفقودة في قيود قديمة، ويستبعدها فلتر المصدر. لم أحسب أرقامًا من قوائم UI.

## EXPENSE AGGREGATE COST

التنفيذ الحالي ينفذ aggregate للمجموع والعدد، وتسعة aggregates للفئات لكل فرع (9 أو 18 للفئات في All)، بجانب صفحة محدودة. فهرس expenses مع category يخدم الفئات التسع جميعًا، ولا يحتاج تسعة فهارس. Firestore لا يقدم group-by للفئات ضمن aggregate الحالي. تقليلها دون قراءة كل الوثائق أو إنشاء ملخص مالي جديد يتطلب تغيير architecture/semantics خارج مرحلة التحقق؛ أبقيتها كما هي ووثقت التكلفة.

## INDEX AUDIT / INDEX COUNT BEFORE/AFTER

الفهارس المركبة: **118 → 118**. قارنت فهارس V9.4 الـ35 الجديدة بالاستعلامات المعلنة: 32 تركيبة قابلة للوصول للفلاتر الاختيارية الخمسة في owner sales، وفهرسان للمصروفات (تصنيف أو بدونه)، وواحد لمحتوى branchIds+type. لم أجد duplicate مطابقًا أو فهرسًا جديدًا بلا query path. جميعها مصنفة «مطلوب لشكل استعلام ممكن، التحقق من مخطط Firestore مؤجل». لم أحذف فهرسًا بناءً على ظن أن index merging سيغنيه؛ تشغيل الاستعلامات والـcursor على Emulator بحثًا عن missing index أو ordering mismatch **NOT VERIFIED**. الملحق أدناه يسرد كل فهرس جديد.

## MOBILE OWNER QA / MANAGER QA / CASHIER QA / WORKER QA

حاولت فتح http://127.0.0.1:4173/admin/ بالمتصفح التفاعلي، فأعاد net::ERR_BLOCKED_BY_CLIENT. لم ألتقط screenshots 390x844 أو 360/375/430 أو 1440، ولم أدخل بحسابات تجريبية. لذلك **VISUAL QA NOT VERIFIED** لكل دور ولكل شاشة رفع/فلاتر/مهام/حجوزات، ولا أدعي خلو الصفحة من overflow أو صحة dropdown أو safe area عمليًا. verify:build يراجع نقاط الاستجابة والأصول، لكنه ليس فحص viewport.

## TASK END-TO-END / ATTENDANCE RESULT / COUPON RESULT

اختبارات الوحدة السابقة للحضور وGPS والكوبون ومنطق الخصم والعزل بقيت PASS ضمن suite، وفحص الكود يبيّن استعمال workerTasks وworkerNotifications وPOS coupon القائمين. تسلسل Cashier Talkha → Worker task states → إشعار → عودة الحالة، وحالة Push denied، وGPS الفعلي، والكوبونات بحدود الاستخدام داخل Firebase Emulator **NOT VERIFIED**؛ لا أدعي تكاملًا حيًا أو وصول Push.

## MULTI-TAB RESULT / SCANNER RESULT / DESKTOP REGRESSION

Staff Auth ما زالت browserSessionPersistence، واختبارات V8.1 للجلسة وApp Check ضمن npm test ناجحة؛ لا تغيير لهما. اختبار ثلاث tabs حقيقية مع Admin/Manager/Cashier **NOT VERIFIED**. فحص المصدر وجد closeScanner عند الإغلاق والتنقل وpagehide مع إيقاف controls وtracks وإبطال generation، لكن camera track stop الفعلي **NOT VERIFIED**. بناء Desktop وSmoke ناجحان؛ شكل Desktop 1440 **NOT VERIFIED**.

## FULL TESTS

| الأمر | النتيجة |
| --- | --- |
| npm test | 177/177 PASS |
| npm run test:functions | 42/42 PASS |
| npm run test:rules | NOT VERIFIED — Java 17 |
| npm run test:gate:handlers | NOT VERIFIED — Java 17 |
| npm run build | PASS |
| npm run verify:build | PASS |
| npm run verify:firebase | PASS (توصيل الإعدادات، وليس Rules Emulator) |
| npm run audit:links | PASS — 13 صفحة، 295 رابطًا/أصلًا |
| npm run smoke | PASS — 15 مسارًا/أصلًا |
| npm run audit:performance | 48 طلبًا محليًا، 0% خطأ، p95=6ms |
| تشغيل سلبي لمداخل المحاكي | 4/4 FAIL CLOSED كما هو متوقع |
| Pure Cairo/public subset | 11/11 PASS |

استخدمت NODE_USE_ENV_PROXY=0 وNode 22 لأوامر localhost فقط لتفادي وكيل الشبكة المحلي؛ لم يتغير التطبيق. لا اختبار Production أو إرسال واتساب.

## FILES CHANGED / APPLICATION LOGIC CHANGES / FIREBASE COST IMPACT

الملف الجديد الوحيد داخل المشروع: V9_4_1_VERIFICATION_AR.md. مقارنة SHA-256 لكل ملفات الأرشيف المصدر لم تجد تغييرًا قبل إضافة التقرير. لم يتغير منطق التطبيق أو الفهارس أو Security Rules أو عدد Firestore reads/writes في التشغيل؛ تكلفة النسخة هي نفس V9.4. الاستعلامات التسع للفئات باقية كما وُثقت.

## KNOWN LIMITATIONS / NEXT GATE

تشغيل Java 21+ للـRules والـGate، واختبارات callable/Storage السلبية وowner query shapes والفهارس، ثم حسابات Emulator تجريبية ومتصفح يصل إلى معاينة محلية للقطات 390/1440 واختبار multi-tab والماسح. HTTP Functions Emulator Gate المنفصل ما زال غير مثبت. بعد هذه الأدلة فقط يُعاد تقييم الاستعداد لـV10.

## ملحق: تصنيف الفهارس الجديدة واحدًا واحدًا

| # | المجموعة | فلاتر المساواة فوق branchId + dateKey | التصنيف الثابت |
| --- | --- | --- | --- |
| 83 | revenueLedger | بلا فلتر إضافي | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 84 | revenueLedger | bookingCode | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 85 | revenueLedger | paymentMethod | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 86 | revenueLedger | bookingCode، paymentMethod | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 87 | revenueLedger | source | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 88 | revenueLedger | bookingCode، source | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 89 | revenueLedger | paymentMethod، source | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 90 | revenueLedger | bookingCode، paymentMethod، source | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 91 | revenueLedger | staffId | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 92 | revenueLedger | bookingCode، staffId | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 93 | revenueLedger | paymentMethod، staffId | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 94 | revenueLedger | bookingCode، paymentMethod، staffId | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 95 | revenueLedger | source، staffId | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 96 | revenueLedger | bookingCode، source، staffId | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 97 | revenueLedger | paymentMethod، source، staffId | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 98 | revenueLedger | bookingCode، paymentMethod، source، staffId | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 99 | revenueLedger | type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 100 | revenueLedger | bookingCode، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 101 | revenueLedger | paymentMethod، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 102 | revenueLedger | bookingCode، paymentMethod، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 103 | revenueLedger | source، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 104 | revenueLedger | bookingCode، source، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 105 | revenueLedger | paymentMethod، source، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 106 | revenueLedger | bookingCode، paymentMethod، source، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 107 | revenueLedger | staffId، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 108 | revenueLedger | bookingCode، staffId، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 109 | revenueLedger | paymentMethod، staffId، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 110 | revenueLedger | bookingCode، paymentMethod، staffId، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 111 | revenueLedger | source، staffId، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 112 | revenueLedger | bookingCode، source، staffId، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 113 | revenueLedger | paymentMethod، source، staffId، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 114 | revenueLedger | bookingCode، paymentMethod، source، staffId، type | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 115 | expenses | بلا فلتر إضافي | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 116 | expenses | category | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |
| 117 | content | branchIds contains + type in + ترتيب ID | مطلوب لشكل استعلام ممكن؛ Emulator غير متحقق |

لا يوجد DUPLICATE مطابق أو UNUSED مثبت ضمن 35. لا أدعي أن محرك Firestore لم يدمج بعض الفهارس؛ لم يُختبر مخطط التنفيذ.
