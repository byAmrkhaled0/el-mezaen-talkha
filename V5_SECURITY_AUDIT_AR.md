# V5 — مراجعة التفويض وحدود الفروع

هذه مراجعة للكود المعبأ، وليست إثباتًا لاختبار تشغيل Cloud Functions ضد Firestore Emulator أو بيانات الإنتاج. لم يحدث نشر أو ترحيل بيانات.

## عقد الأدوار

| الدور | السقف الفعلي على الخادم | نطاق الفرع |
|---|---|---|
| admin | جميع القدرات | عالمي؛ اختيار الفرع يحدد بيانات لوحة المتابعة |
| manager | قدرات التشغيل والإدارة المقيّدة بالفرع؛ دون users/activity/settings/campaigns/global system controls | `branchIds` المصرّح بها فقط |
| cashier | dashboard, pos, bookings، وexpenses فقط عند منحها صراحة | `branchIds` فقط؛ لا customers/attendance/tasks/users |
| worker | attendance, tasks | `branchIds` والعضو المرتبط |

تُتقاطع claims القديمة مع سقف الدور في `effectivePermissions` قبل كل `hasPermission`/`requirePermission`. غياب فرع لحساب غير admin ينتج `permission-denied`. لا تُستخدم أسماء الفروع العربية في قرار التفويض.

## جرد Cloud Functions الحساسة

| الوظيفة | الدور/القدرة | مصدر نطاق الفرع والتحقق |
|---|---|---|
| getCatalog, getPublishedReviews | عام | فهرس عام؛ الموقع يفلتر العناصر المحددة بـ`branchIds` بعد اختيار الفرع. المراجعات عامة. |
| getAvailableSlots, validateCoupon, createBooking | عام | `readBranch`، تسعير وفحص service/package/offer والخدمات المرتبطة والموظف بالفرع؛ سجل وحيد `bookings/{code}` يحمل `branchId` |
| getCustomerBooking, cancelCustomerBooking, rescheduleBooking, getCustomerPortal, saveFavoriteBarber | مالك حساب العميل أو تحقق ملكية الحجز | هوية/ملكية العميل؛ مستخدم العميل يرى حجوزاته في الفرعين وفق هويته، وهو ليس دورًا تشغيليًا |
| getAdminDashboard, getCashierSnapshot, getBookingCalendar | dashboard/bookings/pos حسب الوظيفة | `branchesFor` والتحقق من الفرع المطلوب؛ استعلامات bookings/ledger/expenses/targets مقيّدة قبل الاستجابة |
| getBusinessDashboard, getServiceTargetsDashboard | قدرات التشغيل/الأهداف | استعلامات محدودة لكل فرع مسموح؛ مجموعات shared لا تُرجع سجلات branch مفقودة لغير admin |
| getAdminCollection | قدرة المجموعة، مع استثناء POS محدود للكتالوج/الموظف/المخزون | `where(branchId == ...)` أو `array-contains` قبل الجلب؛ customers admin page ليست استثناء POS |
| adminUpsert, adminDelete | قدرة المجموعة | فحص السجل الحقيقي، وكل `branchIds` القديمة والجديدة؛ العمليات العامة محصورة في admin |
| getAttendanceDashboard, recordWorkerAttendance, getWorkerWorkspace, updateWorkerProfilePhoto | attendance أو worker | فروع الحساب، سجل العامل، فرع الحضور؛ cashier يفشل في سقف الدور |
| createWorkerTask, updateWorkerTask, notifyWorker | tasks أو books notification | فحص فرع المهمة/الحجز الحقيقي والموظف المرتبط؛ cashier لا يملك tasks |
| openCashShift, addCashMovement, closeCashShift, getCashOperations | pos/revenue؛ expense للصرف | `readBranch` + `requireBranchAccess`، ومسار حالة الوردية يحمل branchId |
| recordExpense, updateExpense, createPosOrder | expenses/pos | الفرع المدخل والفـرع الحقيقي للمصروف/المخزون، مع فحص أصناف POS من السجل الحقيقي |
| updateBooking, sendWhatsappReceipt | bookings/pos/revenue وفق الإجراء | قراءة `bookings/{id}` ثم فحص `booking.branchId`؛ الجرد المالي/المخزني يحمل الفرع نفسه |
| getCustomer360 | customers | التاريخ والمحفظة باستعلامات على فروع الحساب؛ إحصاءات العميل العالمية لا تُرجع لمدير الفرع |
| findCustomerByPhone, scanCustomerCode | pos أو customers | lookup لهوية العميل فقط، وscan يعيد حجوزات branch-scoped؛ لا يمنح صفحة الإدارة أو تاريخ الفرع الآخر |
| adjustCustomerWallet, rotateCustomerQr, updateWhatsappConsent | admin فقط | هوية/محفظة مشتركة بين الفرعين ولا تملك سجلًا محاسبيًا آمنًا لكل فرع في schema الحالي |
| recordPayrollPayment | payroll | سجل staff الحقيقي؛ الموظف متعدد الفروع يحتاج admin، ويُحفظ `branchId` في السجل الجديد |
| setBranchMonthlyTarget, upsertServiceTarget | admin فقط | الهدف مستقل بالمعرّف `branchId` والشهر؛ القراءات مقيّدة بـbranch |
| previewWhatsappCampaign, createWhatsappCampaign, updateWhatsappCampaignState, processCampaignBatch | campaigns/admin أو task queue | سقف manager/cashier لا يحتوي campaigns؛ لا إنشاء نظام حملات جديد |
| adminSecureDelete, setUserRole, createAdminUser | admin فقط، مع مصادقة حديثة للحذف | تعيين أدوار مقيد بسقف الدور وbranch IDs المعروفة |
| registerPushToken, unregisterPushToken, notifyAdminsOnBooking | مستخدم موثّق/trigger | token يحمل branches الحساب، وإشعار الحجز يرسل إلى دور admin أو token يطابق `booking.branchId` |

`firestore.rules` ينفي قراءة/كتابة المجموعات مباشرة من المتصفح. الاستثناء الوحيد `get` للملف الشخصي `users/{uid}` لصاحبه؛ لذلك تغييرات هذه المرحلة في Cloud Functions والفهارس وليست في Rules.

## إصلاحات مثبتة في الكود

- claims كاشير قديمة تحتوي `customers`, `attendance`, `tasks`, `users` تُحذف فعليًا عند حساب الصلاحيات؛ التعريف مشترك بين الواجهة والخادم.
- جلب قائمة العملاء لم يعد استثناءً لصلاحية POS؛ بحث الهاتف وQR محصوران في الهوية التشغيلية، وتاريخ QR مقيّد بالفرع.
- `getAdminCollection` و`getBusinessDashboard` و`getServiceTargetsDashboard` وواجهة العامل تستخدم استعلامات الفرع قبل الجلب بدل صفحة عامة مفلترة بعد الجلب.
- فحص مخزون POS يرفض `inventoryItems/{id}` إذا كان الفرع الحقيقي مختلفًا. تعديلات الحجز تتحقق من فرع المخزون قبل إرجاع الكمية.
- عنصر كتالوج legacy بلا `branchIds` لا يُعامل كمشترك عند الحجز؛ لا يوجد تخمين أو ترحيل تدميري. عنصر مشترك صالح يحمل الفرعين صراحة.
- تمت إضافة فهارس مركبة للاستعلامات الجديدة. يجب إنشاء هذه الفهارس في بيئة Firebase عند نشر إصدار لاحق؛ لم يُنفّذ نشر هنا.

## حدود التحقق ومخاطر البيانات القديمة

- Java 17 فقط؛ `test:rules` المشروط بـJava 21+ **NOT VERIFIED**. اختبارات السلوك السلبية في `authorization.test.mjs` و`branch-lock-v5.test.mjs` تمر، لكنها ليست اختبار Emulator end-to-end للأذونات والاستعلامات.
- الوثائق القديمة الناقصة `branchId` أو `branchIds` قد تختفي من العرض لغير admin، عمدًا وبلا نسبتها لفرع عشوائي. `payrollPayments` القديمة بلا فرع لا تظهر في قائمة المدير المقيدة.
- حساب إجمالي العامل الشهري القديم عالمي؛ واجهة العامل تستخدم الآن سجلات ledger محدودة بفرعه، حتى 2000 سجل لكل فرع، وقد يختلف المجموع مؤقتًا أو يُحد إذا تجاوز هذا الحد. لا يوجد listener أو polling أو query لكل KPI.
- صفحة العملاء للمدير تعرض هوية أساسية وتاريخ الحجوزات للفرع المصرح فقط. رصيد المحفظة المشترك قابل للاستخدام في POS، لكن تعديل المحفظة/QR/موافقة واتساب أصبح admin فقط حتى يوجد نموذج محفظة مفصول الفروع.
- فحص preview/smoke يختبر الأصول والمسارات، وليس Firebase Auth حقيقيًا أو مستندات فرعين حيّة. لا يُدّعى أن العزل التشغيلي مثبت بالكامل قبل اختبار Emulator سلبي مباشر للفروع والفهارس الجديدة.
