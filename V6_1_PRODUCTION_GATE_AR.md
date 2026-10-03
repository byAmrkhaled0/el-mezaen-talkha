# V6.1 — بوابة التحقق الأمني للإنتاج

التاريخ: 28 سبتمبر 2026 (القاهرة). الأساس: `el-mezaen-functional-audit-v6.zip`، في نسخة عمل مستقلة. كل بيانات الاختبارات أنشئت داخل Firebase Emulators في مشروع `demo-el-mezaen-gate`، باستثناء اختبار القواعد الأصلي الذي شُغّل على Emulators محلية باسم المشروع الموجود في السكربت. لا نشر، لا Push، لا اتصال لقراءة أو كتابة بيانات الإنتاج.

## JAVA VERSION

- Java الافتراضية: OpenJDK 17.0.20.
- وجدت Java 21.0.12.1 (Temurin) مثبتة في بيئة الجهاز واستخدمتها عبر `PATH` أثناء الاختبارات، بلا تعديل للمشروع. يلزم توفير Java 21+ عند إعادة التشغيل في بيئة أخرى.

## RULES TEST RESULT

- `npm run test:rules`: **15/15 PASS** بعد توسيع مصفوفة Firestore. الأصلي كان 8 اختبارات.
- اختبارات مباشرة عبر Firestore/Storage Emulator و`@firebase/rules-unit-testing`: حساب العميل يقرأ `users/{uid}` الخاص به فقط؛ القراءة والكتابة المباشرتان لـ`bookings`, `cashShifts`, `revenueLedger`, `expenses` مرفوضتان للكاشير والمدير والعامل في الفرعين؛ الحجوزات بلا `branchId` مرفوضة أيضًا. لا يقرأ العميل حجز عميل آخر مباشرة، كما لا يملك Admin صلاحية كتابة المستندات التشغيلية مباشرة من المتصفح؛ الوصول المقصود عبر Cloud Functions.
- قواعد `firestore.rules` و`storage.rules` لم تتغير.

## EMULATOR STATUS

| المكون | النتيجة |
|---|---|
| Firestore + Storage مع `test:rules` | شُغّلا؛ 15/15 PASS |
| Auth + Firestore مع معالجات Functions المستوردة | شُغّلا ببيانات محلية وهوية/claims من Auth Emulator؛ 24/24 PASS |
| Functions HTTP Emulator | **NOT VERIFIED**. حمّل تعريفات الـFunctions، ثم فشل عند تنفيذ الطلب بسبب `listen EPERM /tmp/fire_emu_*.sock`. اختبار Node بسيط لإنشاء Unix socket في `/tmp` أعاد `EPERM` نفسه. لم أغيّر منطق المشروع أو أدوات Firebase للتحايل. |

اختبار `test:gate:handlers` يستدعي `.run` لمعالجات Cloud Functions الفعلية داخل العملية، مع ID tokens منشأة ومتحقق منها في Auth Emulator وFirestore Emulator. هذا اختبار تكاملي لمنطق الخادم، **وليس** اختبار طلب HTTP إلى callable endpoint أو تحقق App Check/طبقة النقل.

## ROLE TEST MATRIX

| الهوية داخل Emulator | النطاق المختبر | النتيجة |
|---|---|---|
| Admin | كل الفروع وفرع محدد، هدف شهري وتعديله | PASS ضمن معالج الخادم |
| Manager Talkha / Mashaya | حجز وتقويم وماليات الفرع الخاص؛ رفض الآخر | PASS ضمن المعالج |
| Manager متعدد الفرعين | الفرعان المصرح بهما فقط، دون legacy مجهول | PASS ضمن المعالج |
| Cashier Talkha / Mashaya | قراءة الفرع الخاص؛ رفض معاملات الآخر | PASS ضمن المعالج |
| Cashier claims قديمة زائدة | رفض Customers Admin وAttendance وUsers وSettings | PASS ضمن المعالج |
| Worker Talkha / Mashaya | رفض درج الكاش ولوحة الإدارة | PASS ضمن المعالج والقواعد |
| Customer A / B | ملكية تفاصيل الحجز والإلغاء | PASS ضمن المعالج والقواعد |

## BRANCH NEGATIVE TESTS / BOOKING IDOR RESULT

- لكل Cashier وManager في الفرعين: قائمة الحجوزات تعرض الفرع المسموح فقط، وترفض التقويم/الـDashboard بطلب `branchId` الآخر. الحجز القديم بلا فرع لا يظهر لهم ولا يقبل تعديله.
- مع معرفة ID حجز الفرع الآخر: `updateBooking` (confirm وcheckout) و`rescheduleBooking` أعادت `permission-denied` قبل التعديل. الاختبار جرى عبر handler مع Firestore Emulator؛ **HTTP callable NOT VERIFIED**.
- Admin يرى الفرعين؛ اختيار Talkha أو Mashaya يغيّر عدد الحجوزات والإيراد، ومجموع هدفي الفرعين يساوي 3000 في بيانات الاختبار؛ تعديل هدف Talkha لا يغيّر Mashaya.
- حجز خدمة مشتركة نُفذ مرة واحدة داخل Emulator، ثم ظهر السجل نفسه في كاشير الفرع وتقويمه وحساب العميل، ولم يظهر لكاشير الفرع الآخر.

## FINANCE IDOR RESULT

- `getCashOperations`, `openCashShift`, `addCashMovement`, `recordExpense`, و`getAdminDashboard` ترفض الفرع الآخر لكل Cashier/Manager مُقيّد؛ `closeBusinessDay` يرفض الفرع الآخر للمدير المخوّل. القراءة المسموحة من `getBusinessDashboard` و`getAdminCollection(revenueLedger)` ترجع أرقام وسجلات فرعه فقط.
- اختبارات القواعد ترفض direct Firestore read/write للماليات حتى عندما تحمل claims قديمة. لم تُنفذ معاملات مالية حية على الإنتاج.

## CUSTOMER ISOLATION RESULT / OLD CLAIMS RESULT

- Customer B لا يستطيع طلب أو إلغاء حجز Customer A بالـID؛ Customer A يقرأ حجزه. Manager يعرض تاريخ العميل التشغيلي من فرعه فقط؛ Cashier لا يفتح `getCustomer360`، مع بقاء `findCustomerByPhone` التشغيلي المسموح.
- Claims قديمة لدى Cashier تضم `customers`, `attendance`, `tasks`, `users`, `settings` لم تفتح endpoints الإدارة المختبرة. هذا تحقق على handler لا HTTP transport.

## WEBSITE CROSS-BRANCH RESULT

- `createBooking` رفض خدمة وباقة وعرضًا وعاملًا خاصين بالفرع الآخر، في الاتجاهين؛ 8 حالات سلبية على المعالج الحقيقي وFirestore Emulator.
- خدمة مشتركة نجحت في حجز تجريبي canonical واحد. رحلة المتصفح العامة وإرسال طلب HTTPS فعلي إلى Functions Emulator **NOT VERIFIED**.

## INDEX STATUS

`firestore.indexes.json` لم يتغير عن V5 أو V6 (SHA-256: `5ae5f389da5103a9c473afe5e2822b5debf9db848030cf3147118239f509c91f`)، ويحتوي 65 composite indexes، منها استعلامات `bookings` بالفرع والتاريخ والحالة، و`revenueLedger` و`expenses` و`cashMovements` و`cashShifts`. لم تُنشأ query جديدة. استعلامات الاختبار عملت في Firestore Emulator، لكن Emulator لا يثبت توافر الفهارس المنشورة في المشروع الحي؛ **حالة نشر الفهارس NOT VERIFIED**.

## FILES CHANGED

- `package.json`: سكربت `test:gate:handlers` يستخدم مشروع `demo-` وAuth/Firestore Emulator فقط.
- `tests/firebase-rules.emulator.mjs`: مصفوفة اختبارات direct access للفرعين والأدوار وlegacy.
- `tests/v6-1-production-gate.emulator.mjs`: 24 اختبار handler مع هويات Auth Emulator وFirestore test fixtures؛ يرفض التشغيل دون متغيرات Emulator ومشروع `demo-`.
- هذا التقرير.

لم يتغير `functions/src/index.js` أو أي Business Logic أو Firebase Rules أو indexes. لا زيادة في قراءات Firebase الخاصة بالتطبيق؛ الاستعلامات الإضافية محصورة في بيئة الاختبار.

## TEST RESULTS

| الأمر | النتيجة الفعلية |
|---|---|
| `npm test` | **119/119 PASS** |
| `npm run test:functions` | **28/28 PASS** |
| `npm run test:rules` مع Java 21 | **15/15 PASS** |
| `npm run test:gate:handlers` مع Java 21 | **24/24 PASS**؛ handler integration، ليس HTTP |
| `npm run build` | PASS؛ Vite بنى النسخة |
| `npm run verify:build` | PASS |
| `npm run verify:firebase` | PASS فحص ثابت، منفصل عن القواعد |
| `npm run audit:links` | PASS؛ 13 صفحة HTML و276 رابطًا/أصلًا |
| `npm run smoke` | PASS؛ 15 مسارًا/أصلًا عبر Preview محلي |
| `npm run audit:performance` | PASS محلي؛ 48 طلبًا، 0% خطأ، p50=3ms، p95=6ms، وليس قياس إنتاج |

فشلت محاولة أولى لـ`audit:links` لأنها بدأت قبل اكتمال Build، وفشلت محاولتا Smoke/Performance أولًا لأن خادم Preview كان في جلسة شبكة منفصلة. أُعيد تشغيل الأوامر بعد بناء الملفات ومع خادم Preview داخل العملية نفسها، واجتازت النتائج أعلاه. فشل اختبارا handler أوليان بسبب بيانات fixture ناقصة/معدل محاولات الهاتف، ثم صُحّحت بيانات الاختبار وأُعيدت المجموعة كاملة؛ لم تُخفَ أخطاء مشروع مثبتة.

## PRODUCTION BLOCKERS / READY — NOT READY

**NOT READY** وفق معيار المهمة الصارم: طلبات HTTP السلبية الفعلية عبر Functions Emulator لم تعمل في هذه البيئة بسبب منع Unix socket. يلزم تشغيل `test:rules` و`test:gate:handlers` ثم مصفوفة HTTP callable Auth/Firestore/Functions في جهاز أو CI يسمح بـUnix sockets؛ والتحقق من توفر فهارس V5 في بيئة النشر المقصودة قبل اعتماد الإنتاج. لا يُعد عزل الفرعين VERIFIED بالكامل على طبقة الـendpoint حتى تنجح الاختبارات السلبية HTTP، رغم نجاح قواعد Firestore و24 اختبارًا تكامليًا لمنطق المعالجات.
