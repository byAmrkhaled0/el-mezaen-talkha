# V6 — تدقيق الوظائف والمسارات والأزرار

التاريخ: 27 سبتمبر 2026. المصدر: نسخة `el-mezaen-branch-lock-v5.zip` مستقلة. لم يحدث نشر أو Push أو تعديل بيانات إنتاج. هذا التقرير يميز بين الاختبارات التي شُغلت والفحص الثابت وبين تدفقات حسابات Firebase الحقيقية التي لم تتوفر لها بيئة تفاعلية أو حسابات اختبار.

## ROUTE MATRIX

| النوع | المسار الفعلي | النتيجة القابلة للإثبات | غير المتحقق |
|---|---|---|---|
| PUBLIC | `/` و`/booking` | الصفحة الأساسية ضمن Build وSmoke؛ `/booking` له rewrite إلى الصفحة الأساسية مع فتح تدفق الحجز حسب `pathname` | إكمال حجز حيّ والنقر والرجوع/التقدم |
| PUBLIC | `/services/`, `/packages/`, `/reviews/`, `/team/`, `/hair-systems/`, `/results/` | الملفات موجودة؛ فحص الروابط/الأصول وSmoke؛ عرض catalog يخضع لفلتر فرع صريح | صور وحالات التحميل والنماذج والمتصفح الحقيقي |
| PUBLIC | `/branches/talkha/`, `/branches/mashaya/` | الملفات وrewrites موجودة؛ Smoke 200 | الاختيار والتصفح التفاعلي |
| AUTH | `/login/` | HTML وhandler للدخول، local persistence قبل تسجيل الدخول، Smoke 200 | حساب خاطئ/معطل/منتهي الجلسة حيًّا |
| CUSTOMER | `/account/` | phone OTP وprofile/history/wallet/cancel/reschedule/repeat/favorite موجودة؛ Smoke 200 واختبارات العقد | SMS/reCAPTCHA والجلسة وملكية البيانات عبر Emulator/حسابات فعلية |
| ADMIN/MANAGER/CASHIER/WORKER | `/admin/#admin=<section>` | 33 قسم عمل + `workspaceHome`. إصلاح v6 يحفظ deep link المسموح عند التحديث، ويرفض hash لقسم غير موجود أو غير مصرح | فتح كل قسم وتحميل بياناته والنقر/Back/Forward في متصفح موثق |
| FALLBACK | `/404.html` وأي public path غير معروف | ملف 404 موجود؛ rewrites لا تحتوي catch-all عام؛ `canOpenSection` يرفض hash إداريًا مجهولًا | استجابة CDN الفعلية لمسار غير معروف |

مسارات HTML الأساسية 13 بما فيها `404.html`، و`/booking` alias إضافي. `audit:links` فحص 276 رابطًا/أصلًا محليًا. Smoke شمل 15 مسارًا/أصلًا. لم يُختبر route direct navigation وrefresh وBack وForward تفاعليًا، ولا حالات missing resource على خادم حيّ؛ هذه **NOT VERIFIED**.

## ROLE / ROUTE MATRIX

| الدور | الواجهة/الأقسام | شرط الوصول الفعلي |
|---|---|---|
| زائر | صفحات PUBLIC وبدء الحجز | تحقق المنتجات والفرع والتسعير على الخادم عند الإنشاء |
| Customer | `/account/` | Firebase Phone Auth وملكية الحجوزات في callables؛ لا Admin shell |
| Admin | جميع أقسام `/admin/` | دور admin؛ خيار كل الفروع أو فرع محدد؛ قراءة/تعديل بحسب API |
| Manager | قسم الإدارة الموافق للصلاحيات الممنوحة | تقاطع claims مع سقف manager و`branchIds` في الخادم؛ لا users/settings/activity/campaigns |
| Cashier | `pos`, `calendar`, `bookings`, `cash` وقراءة هدف الشيفت الخاصة؛ `expenses` فقط إذا مُنحت صراحة | القائمة الأساسية خمسة عناصر؛ لا `attendance/tasks/customers` مباشرة أو من hash، والخادم يرفض claims زائدة |
| Worker | `worker` | فرع وعامل مرتبط؛ عمليات attendance/tasks المخصصة فقط، وليس صفحات الإدارة |

قائمة الأقسام الفعلية: `dashboard`, `pos`, `bookings`, `calendar`, `cash`, `dailyClosing`, `rewards`, `campaigns`, `revenue`, `expenses`, `inventory`, `drinks`, `payroll`, `services`, `packages`, `offers`, `coupons`, `staff`, `customers`, `reviews`, `faqs`, `schedule`, `gallery`, `results`, `hairMedia`, `celebrities`, `posts`, `settings`, `activity`, `attendance`, `tasks`, `worker`, `users`. اختبار V5 لسقف الأدوار وفروع الموارد بقي ناجحًا. فحص كل دور وكل قسم ببيانات فعلية **NOT VERIFIED**.

## BROKEN ITEMS FOUND / ROOT CAUSES / FIXES IMPLEMENTED

| الخلل المعاد إنتاجه من الكود والاختبار | السبب | الإصلاح المحدود | الاختبار |
|---|---|---|---|
| عنصر legacy بلا `branchIds` يظهر في إعادة الحجز/الكتالوج/POS ثم يرفضه خادم V5 | تعبير `!branchIds?.length` اعتبر غياب النطاق مشاركة بين الفرعين | شرط إتاحة موحد يطلب branch scope صريحًا؛ استثناء `branchId: "all"` يتطلب تصنيف العنصر كمشروب من مصدر الكتالوج، ولا ينطبق على خدمة أو باقة؛ طُبق في العرض والسلة والـpreview، بلا تغيير backend | `v6-branch-rendering.test.mjs` + V5 |
| تحديث `/admin/#admin=bookings` يبدأ بالقسم الافتراضي؛ hash مجهول قد يعرض مساحة فارغة للأدمن | التهيئة تجاهلت hash و`canOpenSection` للأدمن لم يتحقق من وجود عنصر section | اختيار القسم الموجود في الرابط إذا كان قسمًا حقيقيًا ومسموحًا؛ وإلا القسم الافتراضي | عقد direct hash في اختبار v6 |
| استجابة تقويم أقدم لنفس الفرع يمكن أن تستبدل تاريخًا/عرضًا أحدث؛ ومؤشر تحميل Dashboard قد ينطفئ عند اكتمال طلب قديم | حارس التقويم فحص الفرع فقط؛ `finally` لم يقارن نسخة الطلب | حراسة request version والتاريخ والعرض؛ انتهاء مؤشر Dashboard للطلب الأحدث فقط | عقد السباق في اختبار v6 |
| حساب غير Admin بلا `branchIds` أو دور غير معروف يصل إلى shell فارغة قبل أن يرفض backend البيانات | التهيئة فحصت وجود role فقط | خروج آمن وتحويل إلى Login برسالة عربية واضحة؛ لم يتغير سقف الصلاحيات | عقد guard في اختبار v6 |

هذه الإصلاحات لا تغير أسعارًا أو status حجز أو Cloud Functions أو قواعد Firestore. شرط الإتاحة قبل اختيار الفرع يخفي العناصر القديمة بلا نطاق بدل نسبتها عشوائيًا لفرع؛ يجب معالجة بيانات legacy المجهولة بأداة إدارية لاحقًا بعد مراجعة المصدر.

## BUTTON AUDIT

فحص HTML ثابت: 234 زرًا (180 Admin، 27 Home، 10 Account، 1 Login، والباقي صفحات المحتوى)، منها 57 زر Admin لها `id` و112 لها `data-*`؛ جميع معرّفات أزرار Admin غير الخاصة بـsubmit لها ذكر في `admin.js` أو تفويض `data-*`. أزرار Admin الاثنان بلا `id/data-*` هما submit افتراضيان داخل form. أزرار عارض النتائج الثلاثة مرتبطة بفئة CSS ويُراجعها `results.js`. هذا لا يثبت أن كل نقرة تنجح في runtime.

| المجموعة | التدقيق | التصنيف |
|---|---|---|
| حجز عام، coupon، إدارة حجز، تقييم | handlers ومعامل منع submit مكرر للحجز وidempotency key | handler موجود؛ runtime **NOT VERIFIED** |
| Login/OTP/Account cancel/reschedule/favorite | busy flags وتعطيل أثناء الطلب ورسائل عربية للحالات المعروفة | handler موجود؛ SMS/حساب حقيقي **NOT VERIFIED** |
| Admin POS، booking actions، financial actions، shift، customer، role/settings | handlers مباشرة أو event delegation؛ `withButtonBusy` للكثير من الإجراءات؛ backend authorization | handler موجود؛ التنفيذ المالي الفعلي **NOT VERIFIED** |
| Cashier menu وbell وlogout | role-specific rendering وbinding موجودان في اختبارات v4/v5 | التفاعل والإشعارات الحية **NOT VERIFIED** |

لا يُصنف أي زر ديناميكي أو زر حيّ بأنه Working اعتمادًا على البحث النصي وحده؛ ولم يُثبت زر Dead في الفحص الثابت. `withButtonBusy` لا يغطي بالضرورة كل إجراء غير مذكور صراحة، لذلك يظل تدقيق جميع async actions عمليًا مفتوحًا.

## FORM AUDIT

24 نموذج HTML ثابت: Home 3، Account 3، Login 1، Admin 17. كل form له `id` مذكور في مصدر الصفحة؛ فحص `required`, numeric limits, dates, phone, form validity, loading/error/busy في الكود. منع الازدواج الحاسم موجود للحجز وPOS عبر idempotency على الخادم، و`loginBusy`/`actionBusy` في حساب العميل. إدخال بيانات خاطئة في كل form ونموذج ديناميكي، واختبار الضغط المزدوج في المتصفح، **NOT VERIFIED**.

## BOOKING FLOW

المسار البرمجي: Homepage → اختيار فرع canonical → service/package/offer حسب `branchIds` → staff تابع للفرع → availability من callable → customer form → submit بقفل `bookingSubmitting` و`clientRequestId` مستقر → `bookings/{code}` واحد → confirmation. خادم V5 يتحقق من الفرع والأسعار والموعد والأقفال، ومن نفس السجل تستعلم واجهات Cashier/Manager/Admin/Calendar/Account. لا collection موازية. اختبارات contracts وcore نجحت؛ الحجز الحقيقي من البداية للنهاية واختبار double click في متصفح **NOT VERIFIED**. preview المحلي عند غياب إعداد Firebase منفصل ومعلّم preview ولا يُعد حجز إنتاج.

## CUSTOMER ACCOUNT

`setPersistence(browserLocalPersistence)` قبل observer؛ OTP وreCAPTCHA وPhone normalization وprofile/upcoming/history/detail/cancel/reschedule/repeat/wallet/rewards/favorite مذكورة في الكود والاختبارات. أصلحنا فلترة repeat للعناصر القديمة غير المحددة الفرع. لم نستخدم SMS أو حسابًا فعليًا، وبالتالي حالة تحميل البيانات وملكية العميل والرسائل عبر اتصال حقيقي **NOT VERIFIED**.

## ADMIN AUDIT

33/33 section IDs موجودة. direct hash صار يتحقق من DOM والصلاحية بعد استعادة claims. Dashboard يحمل `branchId` في الطلب ويتجاهل الرد الأقدم؛ تقويم الحجوزات يتحقق الآن من النسخة/الفرع/التاريخ/نوع العرض. Admin يظل قادرًا على كل الأقسام دون حذف binding. تشغيل كل إجراء/فلتر/modal ضمن 33 قسمًا على بيانات فعلية **NOT VERIFIED**.

## CASHIER AUDIT

القائمة الأساسية: المعاملات، جدول الحجوزات، قائمة الحجوزات، إحصائيات الشيفت، أهداف الشيفت؛ إنهاء الشيفت والخروج في الأسفل. `canOpenSection` يمنع attendance/tasks/customers عبر hash، وV5 backend ceiling يمنع claims القديمة. Snapshot/Calendar/Bookings وCash API تستخدم فروع الحساب. التجربة على حسابين حقيقيين وفرعين، bell والـdrawer/الشيفت **NOT VERIFIED**.

## MANAGER AUDIT

Manager يُقيد بالصلاحيات الفعلية و`branchIds`، ولا يحصل على users/settings/system. اختبارات V5 السلبية ما زالت ضمن suite. لم تتوفر claims Manager أو Firestore Emulator هنا، لذلك اختبار كل صفحة وكل resource IDOR حيًّا **NOT VERIFIED**.

## POS / FINANCE AUDIT

POS يستخدم createPosOrder والتحقق من الفرع والسعر على الخادم وidempotency؛ Cash shift/movements/expenses/revenue/targets مربوطة بـbranch. صُحح عرض عنصر فرع غير محدد وعامل غير متاح في POS؛ لم تتغير قاعدة التسعير أو payment. مقارنة مبالغ فعلية بين صفحات وتسجيل حركة مع اختبار إدخال خاطئ/فشل الشبكة **NOT VERIFIED**. إجراءات WhatsApp الموجودة مسبقًا لم تُوسع.

## BRANCH REGRESSION

العنصر المشترك يتطلب `branchIds` للفرعين صراحة؛ Talkha-only لا يظهر بعد اختيار Mashaya والعكس في دالة الإتاحة المختبرة. السلة وإعادة الحجز وصفحات catalog وPOS تستخدم الشرط نفسه، ومعاينة booking المحلية ترفض العنصر بلا فرع. `getAdminDashboard(branchId)` وCalendar يمنعان ردًا قديما من اختيار آخر. اختبارات V5 للخادم نجحت 28/28 مع بقية الوظائف؛ اختبار الواجهة التفاعلي/Emulator السلبي لفروع فعلية **NOT VERIFIED**.

## SESSION STATUS

Auth Admin يستخدم local persistence، تجديد token عند `functions/unauthenticated` مرة واحدة ثم خروج إذا فشل، وواجهة إعادة محاولة عند تعذر التحقق العابر. إغلاق صلاحية الدور/غياب فرع صار يخرج إلى Login برسالة واضحة. Auth Account يستخدم local persistence وobserver. لم نستطع إعادة إنتاج لقطة «انتهت جلسة الدخول» بحقوق مستخدم/شبكة حية، لذا سببها السابق الدقيق **NOT VERIFIED**؛ لم نخفِ الرسالة أو نضع retry عام لإجراءات كتابة.

## CONSOLE STATUS / MOBILE STATUS

فحص syntax للملفات المعدلة وBuild مرّ. متصفح Playwright المحلي لا يحتوي executable، وBrowser cloud منع `127.0.0.1`، وVite preview في هذه البيئة فشل عند تعداد واجهات الشبكة. لذلك Console/network panel، الفحص البصري، mobile overflow، أزرار drawers، Escape/Backdrop وresponsive الفعلي **NOT VERIFIED**. `verify:build` فحص breakpoints/الأصول فقط وليس فحصًا بصريًا.

## FILES CHANGED

`src/branch-availability.js` (جديد)، `src/account.js`, `src/app.js`, `src/catalog-page.js`, `src/firebase-client.js`, `src/admin.js`, `src/login.js`; اختبارات `tests/v6-branch-rendering.test.mjs` (جديد)، `tests/branch-lock-v5.test.mjs`, `tests/hardening-regressions.test.mjs`; وهذا التقرير. لا تعديل في `functions/`, `firestore.rules`, `storage.rules`, `firestore.indexes.json` أو package files. أرشيف v5 الأصلي لم يُعدل.

## TESTS ADDED / TEST RESULTS / BUILD RESULT

اختبار v6 الجديد يغطي fail-closed لفرعين/المشترك/legacy، استخدام الشرط في مسارات العرض، guard سباق الردود، direct hash ورفض دور/فرع غير صالح. عُدّلت assertions قديمة كانت تتوقع صراحة قبول legacy بلا branch scope، لتطابق عقد أمان V5.

| الأمر المنفذ بعد الإصلاح | النتيجة الفعلية |
|---|---|
| `npm test` | **119/119 PASS** |
| `npm run test:functions` | **28/28 PASS** |
| `npm run build` | PASS؛ Vite بنى 447 module في 3.79 ثانية |
| `npm run verify:build` | PASS؛ routes/assets/PWA/SEO/breakpoints/bundle budgets |
| `npm run verify:firebase` | PASS للفحص الثابت للتكوين/Functions/Rules/indexes، لا Emulator |
| `npm run audit:links` | PASS؛ 13 HTML route و276 link/asset |
| `npm run smoke` | PASS؛ 15 route/asset وMIME عبر خادم `dist` محلي مؤقت داخل العملية نفسها |
| `npm run audit:performance` | PASS؛ 48 طلبًا متسلسلًا، p50=3ms، p95=5ms، error=0% لخادم الملفات المحلي، وليس قياس Firebase أو إنتاج |
| `npm run test:rules` | **NOT VERIFIED**؛ Java المتاح 17، والشرط Java 21+ |
| `node --check` لملفات JS المعدلة | PASS، بلا syntax error |

## FIREBASE COST IMPACT / SECURITY IMPACT

صفر query/listener/polling جديد؛ helper محلي فقط. `loadCalendar` يستخدم نفس الطلب السابق وحارس محلي، وDashboard لا يضيف read. لا تعديل backend أو rules. صلاحيات V5 وحدود الفرع والتحقق الخادمي وأقفال المواعيد والملكية والتسعير بقيت كما هي. غياب `branchId/branchIds` القديم يخفي العنصر من المسارات التشغيلية المعنية، ويجب حسمه من سجله الأصلي بلا تخمين.

## P0 REMAINING / P1 REMAINING / P2 REMAINING / PRODUCTION BLOCKERS

- **P0 مؤكد في الكود بعد الإصلاح:** لا شيء من الحالات التي أمكن إعادة إنتاجها. هذا لا يثبت خلو النظام من عيوب الإنتاج.
- **P1:** الاختبارات التفاعلية للدخول/OTP، الحجز والحساب و33 قسمًا، الأدوار الثلاثة وفروعها على Emulator/Staging لم تُنفذ. يلزم التحقق من وجود فهارس V5 في البيئة المقصودة قبل الاعتماد على استعلاماتها؛ لا نشر هنا.
- **P2:** Badge الإشعارات يعني حجوزات تستدعي الانتباه، لا unread محفوظة؛ تغطية كل أزرار async وresponsive التفاعلية غير مكتملة.
- **Production blockers:** Java 17 لا تفي بشرط Java 21+ لتشغيل `test:rules`؛ قواعد Firestore وIDOR عبر Emulator **NOT VERIFIED**. كذلك غياب حسابات اختبار ومرجع Staging قابل للوصول يمنع تصديق end-to-end والفحص المرئي والـconsole. لا يجوز إعلان Branch E2E أو Ready for Production اعتمادًا على Smoke/Unit فقط.

## NEXT PHASE

إتاحة Java 21+ وبيئة Emulator/Staging وحسابات اختبار admin/manager/cashier/worker/customer لكل فرع، ثم تنفيذ مصفوفة المسارات والنقرات والحجز والمالية والفروع وConsole على desktop/mobile، وإغلاق ما يظهر من عيوب مثبتة. لا يبدأ تطوير تقارير أو تسويق أو إعادة تصميم قبل ذلك.
