# V7 — التقارير، سجل النشاط، وأمان حساب الأدمن

التاريخ: 28 سبتمبر 2026 بتوقيت القاهرة. الأساس المستقل: `el-mezaen-production-gate-v6.1.zip`. لم يحدث Deploy أو Push أو قراءة/كتابة بيانات إنتاج. نتائج الـEmulator هي اختبارات للمعالجات مع قاعدة بيانات محلية؛ ليست HTTP Functions Emulator.

## REPORT ARCHITECTURE

- تقرير الوردية Snapshot داخل نفس `cashShifts/{shiftId}.report` عند نجاح `closeCashShift` في معاملة واحدة مع إغلاق الوردية. تكرار `idempotencyKey` يعيد التقرير نفسه. لا Collection ثانية للورديات.
- `businessReports/{type}_{branchId}_{periodKey}` يحفظ ملخصًا فقط للفرع واليوم/الأسبوع/الشهر. اليومي من مصادر التشغيل الأصلية عبر Firestore aggregate queries؛ الأسبوعي والشهري من مستندات اليوم فقط. لا تُنسخ الحجوزات أو حركات الدفع الخام.
- `getBusinessReport` يقرأ مستندًا واحدًا للفرع، أو مستندين ويجمعهما على الخادم عند `all` للأدمن. لا Listener. `rebuildBusinessReport` للأدمن فقط ويُسجل `report-rebuilt`. غياب يوم في التجميع يمنع إظهار تقرير أسبوعي/شهري ناقص على أنه مكتمل.
- التقارير التاريخية قبل تشغيل الجدولة تحتاج إنشاء الأيام الناقصة يدويًا بواسطة الأدمن قبل بناء الأسبوع/الشهر؛ لا توجد Migration أو backfill تلقائي على بيانات الإنتاج.

## SOURCE OF TRUTH

| الرقم | المصدر المحفوظ والحساب |
|---|---|
| الإيراد الخام والصافي والاسترداد ووسيلة الدفع وعدد المعاملات | `revenueLedger`، مجموع `amount`؛ الدفع `type=payment` والاسترداد `type=refund` السالب. نفس المصدر الذي تستخدمه لوحة الإيراد وإغلاق اليوم. |
| المصروفات | `expenses.amount` حسب `branchId` و`dateKey`، مع إظهارها منفصلة عن صافي التحصيل. |
| النقد الداخل/الخارج والدرج | حقول `cashShifts` الحالية؛ رصيد الدرج يحسبه `calculateExpectedCash` الموجود. |
| الحجوزات والحالات | `bookings` حسب تاريخ الحجز، والحالات `completed`, `cancelled`, `no_show`. |
| الحضور | عدد `attendanceDays` للفرع واليوم. |
| الهدف | `branches/{branchId}.monthlyRevenueTargets.{YYYY-MM}` الحالي؛ المحقق من `revenueLedger`. |

لا تُجمع طريقة الدفع `other` مع التحويل: تظهر «طرق أخرى» منفصلة. `card` يظهر من ledger إن وجد، لكن POS الحالي لا يقدم خيار card صريحًا. استخدام المحفظة ضمن خصم الشيك ولا يمكن اعتباره طريقة تحصيل مالية مستقلة، لذلك لا أضع له رقمًا مختلقًا. لا تسمح الواجهة بتعديل إيراد التقرير.

## SHIFT REPORT

يحفظ الفرع، الاسم، الوردية، الكاشير وUID، البداية والنهاية، رصيد البداية، مجاميع التحصيل حسب الطريقة، الاسترداد، المصروفات ضمن فترة الشيفت، الحركات النقدية، المتوقع/الفعلي/الفرق، الملاحظات وفاعل الإغلاق. بعد النجاح يظهر التقرير مع «عرض التقرير» و«طباعة التقرير»، وتظل الوردية السابقة متاحة بالمعرّف. تم اختبار الإغلاق المزدوج: حدث إغلاق واحد وتقرير واحد.

**حد محاسبي مهم:** `revenueLedger` في V6.1 لا يحمل `shiftId` للبطاقة/التحويل. لذلك تُنسب هذه المبالغ للشيفت باستعلام تجميعي وفق `branchId` ونافذة `openedAt` إلى `snapshotCutoff` المحفوظ. أي عملية متزامنة بين cutoff ومعاملة الإغلاق قد تتطلب تسوية إدارية؛ لا أدّعي تطابقًا ذريًا لكل وسيلة دفع. النقد في الدرج يبقى من counters الوردية الذرية. لا توجد قيمة موثوقة حالية لعدد الحجوزات «التي عالجها» الكاشير أو سلف الموظفين ضمن شيفت بعينه، فلا يعرض التقرير رقمًا مصنوعًا.

## DAILY REPORT

هوية ثابتة `daily_{branchId}_{YYYY-MM-DD}`. يتضمن gross/net collected، وسائل الدفع، المصروفات والاسترداد، cash in/out، عدد المعاملات ومتوسط الشيك، حالات الحجوزات، عدد الحضور، وتقدم هدف الشهر حتى هذا اليوم. لا يولّد تقريرًا نهائيًا لليوم الجاري. إعادة البناء للأدمن فقط؛ التوليد العادي يترك Snapshot الموجود كما هو.

## WEEKLY REPORT

الأسبوع الإثنين–الأحد بتوقيت القاهرة، ومفتاحه تاريخ الإثنين. سبعة ملخصات يومية فقط؛ يُظهر تفصيل الأيام ويجمع الماليات والحجوزات. إذا نقص يوم، يرفض التوليد برسالة الأيام الناقصة. لا يستعلم ledger الأسبوعي عند العرض.

## MONTHLY REPORT

المفتاح `YYYY-MM` وهوية مستقلة لكل فرع. حتى 31 ملخصًا يوميًا، وهدف الفرع للشهر نفسه مع المحقق والمتبقي والنسبة. Admin يمكنه اختيار أي شهر وفرع أو `all`؛ الجمع عند `all` يتم على الخادم من تقريري الفرعين فقط، ولا يظهر مجموع ناقص إذا أحدهما غير محفوظ. مدير الفرع يرى تقاريره المصرح بها فقط.

## TIMEZONE HANDLING / SCHEDULERS

`Africa/Cairo` يحدد يوم الأعمال. حدود الأسبوع والشهر تحسب بمفاتيح تقويمية (مع اختبار منتصف الليل القاهرة، فبراير الكبيس ونهاية السنة). أضيفت Scheduled Function واحدة `scheduledBusinessReports` الساعة 02:10 القاهرة: تنشئ تقرير الأمس للفرعين؛ يوم الإثنين الأسبوع المنتهي، وأول الشهر الشهر المنتهي. تعالج فشل كل نوع/فرع على حدة وتبقي هوية المستند ثابتة. لا توجد Function لكل فرع، ولا Polling أو Listener للتقارير. لم أختبر تشغيل Cloud Scheduler الحقيقي بعد النشر؛ اختبار `.run` تحقق من عدم تغيير اليومي الموجود.

## ROLE / REPORT ACCESS MATRIX

| الدور | تقرير الشيفت | يومي/أسبوعي/شهري | إنشاء/إعادة بناء | سجل الأنشطة |
|---|---|---|---|---|
| Admin | الفرعان | الفرعان أو الجمع | نعم | الكل |
| Manager | فروع claims المسموحة مع `pos` | فروع claims المسموحة مع `revenue` | لا | لا |
| Cashier | شيفته الشخصية داخل فرعه مع `pos` | قراءة فرعه مع `pos` داخل قسم الورديات | لا | لا |
| Worker/Customer | لا | لا | لا | لا |

يقرأ الخادم `branchId` الحقيقي من مستند الوردية عند الطلب بالـID؛ وللتقارير التجميعية يطابق `branchId` داخل المستند مع الفرع المطلوب قبل الإرجاع. تقرير Legacy بلا `branchId` لا يُنسب لفرع بالتخمين. قواعد Firestore تمنع وصول المتصفح المباشر إلى التقارير والسجل حتى للأدمن؛ القراءة عبر Functions فقط.

## AUDIT EVENT MODEL / AUDIT EVENTS COVERED

استُخدمت `activityLogs` الحالية؛ لم تُنشأ مجموعة Audit موازية. أحداث V7 الجديدة: `booking-created` عند الحجز العام، `report-rebuilt`، و`password-change-client-confirmed` (إقرار عميل موثق بعد تحديث Firebase Auth، وليس إثباتًا مستقلًا من الخادم). أغنيت أحداث العمليات القائمة بـ`actorUid`, `actorRole`, `actorName` حيث تتاح claims، مع `branchId`, `action`, `entityType/collection`, `entityId/targetId`, و`createdAt` و`requestId` حيث متاح. كثير من العمليات المهمة كان يُسجّل مسبقًا: تحديث/إلغاء/تأكيد الحجز، دفع واسترداد، POS، الوردية والكاش، المصروفات، الهدف، المستخدمين، CRUD للعروض والإعدادات. أصلحت افتقاد الفرع في حدث POS وبعض الحذف المالي المؤمّن.

واجهة سجل الأنشطة للأدمن تعرض تاريخ/UID/دور/فرع/إجراء/نوع سجل مع صفحات 50 (حد أعلى 100 على الخادم). الاستعلام يحصر الفرع قبل الإرجاع، وتطبق بقية المرشحات داخل الصفحة المحدودة؛ الأحداث القديمة التي لا تحمل `actorRole` لا تظهر عند اختيار فلتر الدور. لا تُسجل كلمات مرور أو OTP أو tokens أو بيانات بطاقة كاملة. لا يستطيع مستخدم تعديل/حذف السجل عبر Rules. إجراءات «تعطيل/تفعيل مستخدم» ليست Flow موجودًا مستقلًا في baseline؛ لم أخترع Action جديدًا.

## PASSWORD CHANGE FLOW

زر «حسابي» للأدمن يفتح نموذجًا في قسم الحسابات: الحالية/الجديدة/التأكيد. `reauthenticateWithCredential` ثم `updatePassword` من Firebase Auth، بطول 8 أحرف على الأقل، زر busy ومنع الضغط المزدوج ورسائل عربية. لا ترسل كلمة المرور إلى Cloud Function ولا تُحفظ في Firestore. حدث `password-change-client-confirmed` لا يتضمن قيمًا سرية؛ فشل تسجيله لا يلغي نجاح تحديث Firebase Auth. يلزم التحقق التفاعلي بحساب أدمن اختبار فعلي في بيئة تسمح Auth/Functions HTTP، ولم يحدث هنا.

## FILES CHANGED

`functions/src/index.js`, `functions/src/reporting.js`, `functions/test/reporting.test.mjs`, `src/admin-api.js`, `src/admin.js`, `src/admin.css`, `admin/index.html`, `firestore.indexes.json`, `tests/v6-1-production-gate.emulator.mjs`, `tests/firebase-rules.emulator.mjs`, `tests/v7-reporting-ui.test.mjs`، وهذا التقرير. لم تتغير `firestore.rules` أو `storage.rules` أو Role Ceiling أو نموذج الحجز/التسعير.

## NEW FUNCTIONS / NEW COLLECTIONS / DOCUMENTS / INDEX CHANGES

Functions: `getBusinessReport`, `rebuildBusinessReport`, `scheduledBusinessReports`, `getAuditEvents`, `recordPasswordChange`. التخزين الجديد الوحيد `businessReports` بملخصات day/week/month؛ `cashShifts.report` حقل Snapshot؛ سجل النشاط الموجود يُعاد استخدامه. فهارس Firestore المركبة: 65 أصلية → 71، للـledger ضمن زمن الوردية، المصروفات ضمن زمنها، cashShifts اليومية، وactivityLogs حسب الفرع/الوقت. اختبار Emulator لا يثبت اكتمال بناء هذه الفهارس في بيئة النشر.

## TESTS ADDED / TEST RESULTS

| الأمر | النتيجة |
|---|---|
| `npm test` | 122/122 PASS (baseline 119) |
| `npm run test:functions` | 32/32 PASS (baseline 28) |
| `npm run test:rules` مع Java 21 | 16/16 PASS (baseline 15) |
| `npm run test:gate:handlers` مع Java 21 | 28/28 PASS (baseline 24)؛ Auth/Firestore Emulator والمعالجات الحقيقية، وليس HTTP |
| `npm run build`, `verify:build`, `verify:firebase` | PASS |
| `npm run audit:links` | PASS؛ 13 صفحة، 276 رابطًا/أصلًا |
| `npm run smoke` | PASS؛ 15 مسارًا/أصلًا |
| `npm run audit:performance` | PASS محلي؛ 48 طلبًا، 0% أخطاء، p95=7ms؛ ليس قياس Firebase |

اختبارات V7 السلبية تغطي shift/report IDs عبر الفرع، مدير/كاشير/عامل، daily مستقل، weekly/monthly والهدفين، legacy بلا فرع، admin-only audit/rebuild، ورفض القراءة/الكتابة المباشرة عبر Rules. اختبار كلمة المرور UI/source contract فقط، لا تحقق تفاعلي لعملية Auth حية.

## FIREBASE COST IMPACT / SECURITY IMPACT

- يوميًا نحو 16 aggregation لكل فرع، وشيفت مغلق نحو 9 aggregate queries مرة عند الإغلاق؛ عرض التقرير 1–2 document reads. Rollups تقرأ حتى 7/31 مستندات يومية مرة عند البناء. Audit يقرأ 50 مستندًا/صفحة + وثيقة cursor عند الانتقال. لا N+1 لكل booking ولا Listener.
- كل تقرير وأمر rebuild محكوم بـrole ceiling وbranch claims، مع قراءة branch الحقيقي للوردية. اختبار IDOR سلبي ناجح على handlers. القواعد تمنع direct client access. لم تُضعف صلاحيات V6.1 أو ownership أو appointment locks.

## LEGACY DATA BEHAVIOR

لا تنسب بيانات بلا `branchId` لفرع: استعلامات اليومي/الشيفت تتقيد بحقل الفرع؛ تقرير بلا فرع يرفض لغير Admin ويُعامل كمفقود حتى للأدمن. يحتاج التاريخ السابق Backfill صريحًا على بيانات مؤكدة الفرع. لا Migration تلقائية.

## HTTP GATE STATUS / P0 REMAINING

**NOT READY للإنتاج.** لم ينجح في V6.1 تشغيل HTTP Functions Emulator بسبب `listen EPERM /tmp/fire_emu_*.sock`؛ لم أتحايل على العائق هنا. الـHandler tests وRules tests لا تثبت callable HTTP أو App Check أو تفاعل الواجهة مع Auth. يلزم تشغيل المصفوفة السلبية عبر HTTP Functions Emulator في CI/جهاز يسمح Unix sockets، والتحقق من فهارس V7 بعد بنائها، قبل اعتبار Production Gate مغلقًا.

## P1 REMAINING

- إسناد card/transfer للشيفت يعتمد زمن `createdAt` لا `shiftId` دائمًا؛ يمكن لحركة متزامنة قرب الإغلاق أن تستدعي مراجعة/تصحيح التقرير. لا توجد بيانات موثوقة لـ«حجوزات عالجها الكاشير» أو الخصومات/السلف حسب الشيفت، ولا Top services/Staff performance يومي مستقل. لا أضع أرقامًا تقديرية.
- التقارير التاريخية تحتاج توليد Daily لكل يوم ثم weekly/monthly؛ لا Backfill batch تلقائي. سِجل الأنشطة القديم قد لا يحمل role/branch، والمرشحات غير الفرع تعمل ضمن صفحات محدودة. إقرار تغيير كلمة المرور client-confirmed لا يثبت Firebase Auth update من جانب الخادم.
- طباعة التقرير وتدفق تغيير كلمة المرور على متصفح مسجل الدخول **NOT VERIFIED بصريًا/تفاعليًا**؛ CSS وBindings والبناء تم اختبارها فقط.

## P2 REMAINING / NEXT PHASE

التحسين اللاحق بعد إغلاق HTTP gate: تثبيت `shiftId` على جميع ledger entries الجديدة مع خطة توافق/تسوية للأقدم، وآلية Backfill محددة الكلفة للتاريخ، وفهرسة Audit مرشحات أكثر انتقائية عند ثبوت حجم الاستخدام. لا تبدأ WhatsApp Marketing أو إعادة تصميم الموقع أو AI Agent ضمن هذه النسخة.
