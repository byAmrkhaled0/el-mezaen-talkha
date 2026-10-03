# V8 — تدقيق العروض وحملات واتساب

**الحالة:** نسخة تطوير مستقلة؛ لا نشر ولا Push ولا تعديل لبيانات الإنتاج ولا إرسال إلى Meta أثناء التنفيذ. **غير جاهزة للإنتاج** إلى حين اجتياز بوابة HTTP والتجربة الآمنة بقالب Meta معتمد وأرقام اختبار.

## EXISTING WHATSAPP INFRASTRUCTURE REUSED

استخدمنا `campaigns` و`campaignRecipients` و`campaignGuards` و`whatsappConsentHistory` و`activityLogs`، وCloud Tasks و`processCampaignBatch` و`whatsappWebhook` وMeta Cloud API ومفاتيح البيئة الحالية. لم نضف طابورًا أو webhook أو مصدر عروض آخر. لا تغيير في V7/V7.1 للتقارير أو دفتر الإيراد.

## PERMISSION MODEL BEFORE / AFTER

| الدور | قبل | بعد |
|---|---|---|
| Admin | جميع الصلاحيات | جميع الفروع والعروض والحملات؛ ضبط القوالب وحالة الإرسال |
| Manager | العروض افتراضيًا، الحملات خارج سقف الدور | العروض كما كانت؛ الحملات ضمن السقف لكن **بمنحة صريحة فقط**؛ الفروع المحددة فقط |
| Cashier | لا عروض ولا حملات ضمن السقف | العروض والحملات ضمن السقف **اختياريتان وغير افتراضيتين**؛ يظل شريطه الأساسي كما كان؛ الروابط الإضافية تظهر بعد المنح |
| Worker | لا تسويق | كما هو |

`effectivePermissions` يطبق سقف الدور؛ عمليات التسويق الاختيارية تفحص أيضًا `users/{uid}.permissions` والدور والفروع من سجل Admin. لذلك claims قديمة أو أوسع لا تكفي. الواجهة تطلب `getOwnMarketingGrants` عند الدخول لإخفاء روابط غير ممنوحة؛ الحماية الفعلية في الخادم. Admin وحده يستطيع `branchId=all`.

## OFFER MODEL / IMAGE FLOW

نفس `offers/{id}` يخدم الإدارة والموقع والحجز والحملة. الحقول القائمة للأسعار والصورة والتوقيت والحالة والفروع استمرت. أضفنا `linkedPackageIds` كارتباط معلوماتي منفصل عن `includedServiceIds` الذي يظل خدمات الحجز، حتى لا يتحول ID باقة إلى ID خدمة في التسعير. الخادم يتحقق دفعة واحدة من توفر الخدمات والباقات المرتبطة في جميع فروع العرض، ومن السعر والمدة الزمنية والفرع. حفظ الحالة الجزئي (`active`) يعمل دون إسقاط حقول العرض.

رفع الصورة يستخدم `uploadImage` والتحسين الموجود ومسار `public/offers/{branchId}/...`؛ قواعد Storage تقيد MIME والحجم والدور والفرع. العرض المشترك يرفعه Admin في `all`. رابط الصورة نفسه يظهر في الموقع والقالب المصور. الصورة القديمة تبقى عند تعديلها أثناء حملة نشطة كي لا ينكسر رابط الحملة؛ تحتاج تنظيفًا إداريًا لاحقًا بعد انتهاء الحملات، ولم ننشئ مهمة حذف آلية.

العرض المنتهي أو غير النشط/الموقوف لا يقبل الحجز الخادمي. كرر الحجز في الموقع يعيد فحص التوفر والتاريخ؛ زر «احجز العرض» في الإدارة يستخدم تدفق الحجز الحالي. بطاقات الموقع تستخدم `loading="lazy"` و`decoding="async"` القائمين.

## CAMPAIGN COMPOSER / OFFER → CAMPAIGN LINK

شاشة الحملات الحالية أصبحت Panel يجمع العرض والقالب والفرع وحد المستلمين ووضع الاختبار، ومعاينة الصورة والنص المتوقع وحالة kill switch وMeta وعدد العملاء. زر العرض «إرسال العرض للعملاء» يختار نفس `offerId`. الحملة تخزن ID واسم العرض وسعره/نهايته ومرجع الصورة وقت الإنشاء، لا تنسخ مستند العرض كله. تعيد مهمة الإرسال التحقق من أن العرض نفسه ما زال نشطًا وفي الفرع؛ تتوقف إن صار غير متاح. القيم المرسلة للقالب تبقى snapshot لتطابق المعاينة وقت التأكيد.

يوجد تأكيد واضح قبل وضع الحملة الفعلية في الطابور؛ الزر يعطل نفسه ويحافظ على مفتاح idempotency عند فشل الشبكة. إعادة الطلب بنفس المفتاح ترجع نفس الحملة ويمكنها إعادة جدولة الحملة المنتظرة. لا يوجد إرسال في المتصفح.

## AUDIENCE MODEL / BRANCH AUDIENCE RULE / CONSENT MODEL

الجمهور الموثوق حاليًا هو `customers.whatsappOptIn == true`، مع `lastBranchId == branchId` لحملة الفرع. حملة Admin لجميع الفروع تجمع العملاء الموافقين. لا يوجد تحليل سلوكي أو قراءة حجوزات لكل عميل. العدد يحسبه الخادم باستعلام aggregate count، ويتجاهل `eligibleCount` القادم من المتصفح بالكامل. الحد عدد صحيح بين 1 والعدد المؤهل وحد النظام 1000، وتتحقق منه `createWhatsappCampaign` مرة أخرى.

حساب العميل يعرض اختيار موافقة **غير محدد مسبقًا**، مستقل عن إتمام الحجز؛ يستطيع الموافقة أو الانسحاب بواسطة `updateOwnWhatsappConsent` بعد فحص ملكية الهاتف و`authUid`. كل تغيير فعلي يضاف إلى `whatsappConsentHistory` بمصدر `customer_account`. Staff لا يكتب الموافقة؛ مسار Admin القديم بقي Admin-only.

عند تنفيذ كل مستلم، تقرأ المعاملة سجل العميل من جديد وتفحص `whatsappOptIn` والفرع وقائمة الاختبار؛ الانسحاب قبل الدور يؤدي إلى `SKIPPED_CONSENT`. مسار فتح واتساب اليدوي القديم يطلب فحصًا خادميًا جديدًا قبل فتح المحادثة ويخفي غير الموافقين من القائمة؛ لا يستطيع النظام التحكم في رسالة يرسلها إنسان لاحقًا خارج التطبيق.

## TEST SEND / LIVE SEND SAFETY / RECIPIENT CAP / IDEMPOTENCY

`testMode` هو الافتراضي. الجمهور التجريبي محصور في أول 30 ID مضبوطًا في `whatsappTestCustomerIds` مع موافقة وفرع صحيحين. لا تستخدم تجربة الإرسال جمهور الحملة الفعلية. مفتاح `campaignGuards` يمنع إنشاء حملتين بالنقرة المزدوجة، و`campaignRecipients/{campaignId}_{customerId}` مع حجز ذري لـ`targetedCount` يمنع تجاوز الحد ويمنع إعادة إرسال ID سبق حجزه. الطلب الذي خرج إلى Meta وبقيت نتيجته مجهولة **لا يعاد تلقائيًا**؛ هذا قرار يحمي من تكرار الرسالة، وقد يحتاج مصالحة يدوية للحالة المجهولة.

Cloud Tasks تعالج 20 عميلًا بحد أقصى في كل دفعة، مهلة Meta عشر ثوانٍ لكل طلب، ومهلة المهمة 300 ثانية. فشل مستلم لا يوقف بقية الدفعة. استمرار Pause/Resume/Cancel يفحص مستند الحملة وفرعها، ويمنع Resume لـCOMPLETED/CANCELLED. تعديل صلاحية منشئ الحملة بعد إنشائها يوقف دفعاته التالية.

## META TEMPLATE MODEL / IMAGE TEMPLATE SUPPORT / WEBHOOK STATUS

`settings/public.whatsappMarketingTemplates` يعرّف القوالب المعتمدة بقائمة محدودة: `name`, `languageCode`, `headerType` (`none` أو `image`), و`bodyVariables` من mapping مسموح فقط. لا يرسل العميل مكونات Meta حرة. قالب صورة يتطلب رابط صورة Storage معتمد ويضيف Template Header Image؛ القالب النصي يوضح أنه لن يرسل صورة. إذا كانت مفاتيح Meta ناقصة أو kill switch مغلقًا، يمكن المعاينة لكن الإنشاء يرفض برسالة عربية.

بقي HMAC `x-hub-signature-256` إلزاميًا، وحالات `sent/delivered/read/failed` مدعومة. التحديث لا ينزل حالة `read` إلى `sent`. اختبرنا التوقيع الصحيح والخاطئ بمنطق مستقل دون شبكة حقيقية؛ **نقل HTTP الفعلي للـwebhook لم يتحقق**.

## CAMPAIGN ANALYTICS / AUDIT EVENTS

القائمة محدودة بالصفحة الحالية؛ تفاصيل المستلمين 25 سجلًا مع Pagination واسم آمن وهاتف مقنّع. تعرض المؤهل والمستهدف والمرسل والمتجاوز والمتبقي من counters؛ `delivered/read/delivery failed` من aggregate count عند فتح التفاصيل فقط، بلا listeners أو تحميل آلاف المستلمين. Delivered يشمل Read.

يسجل `activityLogs`: `offer-created`, `offer-updated`, `offer-disabled`, `campaign-created`, `campaign-started`, `campaign-paused`, `campaign-resumed`, `campaign-cancelled` مع actor/role/branch/offer/campaign/cap/testMode حيث ينطبق، بلا Token أو OTP أو نصوص سرية.

## FILES CHANGED / FUNCTIONS CHANGED / INDEX CHANGES

- `functions/src/index.js`, `functions/src/authorization.js`, `functions/src/marketing.js`: صلاحيات، تحقق عروض، جمهور، قوالب، حملة، مستلمون، موافقة، HMAC.
- `src/admin.js`, `src/admin-api.js`, `src/admin.css`, `admin/index.html`: إدارة العرض والComposer والنتائج والصلاحيات الاختيارية.
- `src/account.js`, `src/account.css`, `account/index.html`, `src/app.js`: موافقة العميل وربط العرض بتدفق الحجز الحالي.
- `storage.rules`, `firestore.indexes.json`: صورة العرض حسب الفرع وفهرسا `campaignRecipients(campaignId, deliveryStatus)` و`campaigns(offerId, state)`.
- اختبارات: `functions/test/marketing.test.mjs`, `tests/v8-marketing-contract.test.mjs`, تحديث `tests/v6-1-production-gate.emulator.mjs`, `tests/firebase-rules.emulator.mjs`, و`tests/hardening-regressions.test.mjs`.

الدوال الجديدة ضمن نفس Functions: `getOwnMarketingGrants`, `getWhatsappCampaignOptions`, `getWhatsappCampaignRecipients`, `getWhatsappCampaignStats`, `checkWhatsappMarketingRecipient`, `updateOwnWhatsappConsent`. الدوال القائمة التي توسعت: `adminUpsert`, `adminDelete`, `getAdminCollection`, `getCustomerPortal`, `previewWhatsappCampaign`, `createWhatsappCampaign`, `updateWhatsappCampaignState`, `processCampaignBatch`, `whatsappWebhook`.

## TESTS ADDED / TEST RESULTS

| الأمر | النتيجة |
|---|---|
| `npm test` | **126/126 PASS** |
| `npm run test:functions` | **40/40 PASS** |
| `npm run test:rules` مع Java 21 | **17/17 PASS** |
| `npm run test:gate:handlers` على Auth/Firestore Emulator | **37/37 PASS** |
| `npm run build`, `npm run verify:build`, `npm run verify:firebase`, `npm run audit:links` | **PASS** |
| `npm run smoke` على ملفات dist محليًا | **15/15 PASS** |
| `npm run audit:performance` محليًا | **48 طلبًا، 0% أخطاء، p95=4ms** |

الاختبارات الجديدة تغطي سقف الأدوار والمنح الصريحة والفرعين وIDOR للحملة، أسعار/تواريخ العرض ومرجعياته، opt-in/out والعدد والحد، انتقاء مستلم الاختبار، توافق متغيرات القالب والصورة، تتابع حالات webhook، وتوقيع HMAC. اختبار Meta الفعلي، Cloud Tasks end-to-end، والنقر البصري على UI **NOT VERIFIED**؛ لا تدّعي الاختبارات الساكنة أنها تحل محل ذلك.

## FIREBASE COST IMPACT / SECURITY IMPACT

لا collection موازية ولا listener ولا استعلام كامل للمستلمين في المتصفح. المعاينة aggregate count؛ شاشة التفاصيل ثلاثة aggregate counts و25 مستلمًا؛ كل دفعة 20 سجلًا. فحص المنحة يقرأ `users/{uid}` مرة لكل API تسويق اختياري، وفحص opt-out يقرأ مستند العميل داخل معاملة إرسال كل مستلم؛ هذا ثمن تحقق الموافقة اللحظية، ولا يقرأ حجوزات العميل. الحفظ يضيف audit event؛ الصورة تبقى write واحدًا للرفع الحالي. فهارس جديدة مذكورة أعلاه ولم تُنشر.

لا يتيح CSS صلاحية. الخادم يرفض حملة/عرض الفرع الآخر، ويعيد فحص ID الحقيقي قبل التغيير. Firestore يظل default-deny للبيانات التشغيلية، وStorage يرفض الصورة غير المصرح بها. لم تتغير قواعد المال أو التقارير أو الحجز.

## LIVE META STATUS / HTTP GATE STATUS / KNOWN LIMITATIONS / NEXT PHASE

- **LIVE META:** لم ترسل أي رسالة حقيقية أو تجريبية أثناء التطوير، ولم تستخدم أسرار إنتاج. قالب Meta وموافقته وتوافق صورة header الفعلي بحاجة إلى تجربة على حساب اختبار مصرح به في بيئة لاحقة.
- **HTTP GATE: NOT VERIFIED.** بدأ Emulator الدوال HTTP محليًا، ثم فشل قبل تشغيل أوامر الاختبار عند تسجيل Eventarc trigger `notifyAdminsOnBooking-0` على Firestore Emulator. لا أعتبر النظام Production Ready.
- **Vite Preview التفاعلي:** فشل بيئيًا بـ`uv_interface_addresses`، لذا Smoke/Performance استخدما خادمًا محليًا للملفات المبنية. المقارنة البصرية وMobile/Tablet بالنقر **NOT VERIFIED**.
- **حالات إرسال غير مؤكدة:** إذا قبلت Meta الطلب ثم انقطعت العملية قبل حفظ `metaMessageId`، لن تعاد الرسالة تلقائيًا منعًا للتكرار؛ يحتاج السجل مصالحة تشغيلية. لا يوجد زر «إعادة محاولة الفاشلين» في V8.
- **الصورة أثناء حملة مفتوحة:** الاحتفاظ بالملف القديم يضمن رابط snapshot؛ تنظيف الملفات القديمة المؤجلة يحتاج سياسة صيانة مستقلة بعد إقفال الحملات.
- **النافذة اليدوية:** بعد فتح رابط `wa.me` يظل الضغط النهائي لدى الموظف خارج التطبيق؛ فحص الموافقة يتم قبل الفتح فقط.

**الخطوة التالية:** تشغيل بوابة HTTP وCloud Tasks وWebhook على Emulator يعمل بالكامل، ثم اختبار قالب Meta ورقم اختبار معتمد بعد تفويض منفصل، ومراجعة الواجهة على Desktop/Tablet/Mobile. لا Deploy أو Push في هذه النسخة.
