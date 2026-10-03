# EL MEZAEN — V10 Final Production Gate

تاريخ الفحص: 2 أكتوبر 2026. الأساس الوحيد: `el-mezaen-public-ui-v9.6.1.zip`. هذا تقرير تحقق محلي؛ لم يحدث نشر أو Push أو اتصال يغيّر بيانات الإنتاج.

## 1. Executive Summary

**LOCAL APPLICATION GATE: PASS. RULES GATE: PASS. HANDLER GATE: PASS. STATIC SECURITY GATE: PASS ضمن حدود الفحص والاختبارات المذكورة.** لم يثبت خلل يستدعي تغيير كود التطبيق. فحص HTTP الحقيقي ولقطات الواجهة ما زالا غير مكتملين. **PRODUCTION RUNTIME: BLOCKED — BILLING DISABLED. النتيجة: ليست Production Ready.**

## 2. Baseline

- فُحص الأرشيف بـ`unzip -t` دون تلف، واستُخرج بمجلد `el-mezaen/` مستقل. ملفات `package-lock.json` في الجذر وFunctions متفقة مع حزم `package.json` المباشرة؛ lockfile v3.
- مشروع Firebase في الإعدادات `el-mezaen-talkha`. اختبارات المحاكيات استخدمت حصريًا `demo-el-mezaen-rules` و`demo-el-mezaen-gate`، ومحاولة HTTP استخدمت `demo-el-mezaen-http`.
- Node 22.23.3 للمحاكيات، Java 21.0.12، Firebase Tools 15.32.1. إصدار Node الافتراضي في مساحة العمل مختلف؛ استُخدم Node 22 لمسارات المحاكي وSmoke.
- فحص ملفات الأرشيف لم يجد `.env` يحوي أسرار إنتاج، service-account key، private key، Meta token حرفيًا، أو App Check debug token ثابتًا؛ يوجد `functions/.env.example` فقط. Firebase Web API key العامة ليست سرًا خاصًا.

## 3. Files Changed

الملف الجديد الوحيد: `V10_PRODUCTION_GATE_AR.md`. لا تغيير في JS/CSS/HTML أو Functions/Rules/Dependencies/Lockfiles. توليد `public/sitemap.xml` أثناء `npm run build` كان أثرًا محليًا مؤقتًا؛ أُعيدت نسخة الـbaseline قبل التغليف.

## 4. App Tests

`npm test`: **189/189 PASS**. تشمل اختبارات الموقع العام، الفرع، الأمن، App Check/session، وروابط الحجز والواجهة. النجاح لا يمثل تجربة متصفح مع بيانات إنتاج حقيقية.

## 5. Functions Tests

`npm run test:functions`: **45/45 PASS**. تستمر تغطية التسعير والتفويض والتجميع، ومن ضمنها منع `undefined staffId` في قيود الدفع والاسترداد.

## 6. Rules / Storage Tests

`npm run test:rules` نفذ فعلًا Firestore وStorage Emulator باستخدام Java 21 على `demo-el-mezaen-rules`: **18/18 PASS**. رفض العمليات السلبية متوقع. `firestore.rules` تمنع وصول العميل المباشر إلا قراءة ملف المستخدم الذاتية المحددة؛ عمليات المشروع تمر عبر Functions. Storage تسمح بالمسارات العامة غير المحددة للأدمن فقط، وتقيّد مسارات المحتوى/العروض بالفرع والصلاحية وصيغ وحجم الملفات.

## 7. Emulator Status

`npm run test:gate:handlers` نفذ Auth وFirestore Emulator على `demo-el-mezaen-gate`: **43/43 PASS**؛ تشمل سيناريوهات العزل المالي والحجز والاسترداد وحقل العامل الاختياري. هذه اختبارات `handler.run()` وليست نقل HTTP.

شُغّل Functions HTTP Emulator مع Auth/Firestore على `demo-el-mezaen-http` و`--debug`. فشل قبل أول طلب عند تسجيل `notifyAdminsOnBooking` في واجهة Firestore/Eventarc بـ`SocketError: other side closed`. سبق إعادة إنتاج الفشل في مشروع مستقل ذي trigger v2 واحد في V9.5.3. **HTTP TRANSPORT: NOT VERIFIED — FIREBASE TOOLS / EVENTARC EMULATOR ISSUE**. لم تُعطّل الـtrigger للحصول على نجاح شكلي.

## 8. Branch Isolation

المراجعة شملت `functions/src/authorization.js`، `functions/src/index.js`، `storage.rules`، `src/app.js` وصفحات Catalog/Branch، مع اختبارات المحاكيات. `effectivePermissions` تقاطع الصلاحيات مع سقف الدور؛ `branchesFor` و`requireBranchAccess` يقيّدان Manager/Cashier/Worker، بينما Admin يستطيع الفرعين. تستخرج العمليات ذات المورد الموجود فرعه من المستند أو الشيفت الفعلية، ثم يتحقق الخادم؛ إدخال `branchId` من العميل ليس كافيًا. اختبارات IDs من فرع آخر والوسائط والمهام والحجز والمالية نجحت في الـhandler/rules suites. في الموقع العام، `mz-branch` يغذي `state.branchId` بعد صلاحية الفرع، وتستخدم المعاينات `publicSubset` وفقه. يلزم اختبار Browser ببيانات منشورة فعلية للعرض والتبديل قبل الإنتاج.

## 9. Auth / Authorization

Staff يستخدم `browserSessionPersistence`، وحساب العميل يحتفظ بـ`browserLocalPersistence` الحالي. سقوف Admin/Manager/Cashier/Worker تمنع claims زائدة قديمة من توسيع الدور. `setUserRole` يتحقق من Admin الحالي عبر Firebase Auth، ويستدعي `replaceClaimsAndRevoke` قبل حفظ الدور والفروع؛ يعرض فشل إبطال الجلسات بوضوح. `adminSecureDelete` والعمليات عالية الخطورة تتطلب تحققاتها الحالية. **إبطال refresh tokens لا يلغي فورًا كل ID token صادر**؛ تبقى نافذة صلاحيته المتبقية للعمليات التي لا تفحص سجل الحساب حيًا. لا ندّعي انتهاء فوريًا لكل الجلسات. الدخول المباشر إلى Route لا يمنح إذن callable، لكن تفاعل جميع الأدوار في Browser غير متحقق هنا.

## 10. Customer Account

Phone Auth وreCAPTCHA والتطبيع وملكية الحجز تعتمد على هوية Firebase/رقمها المجزأ في الخادم: `getCustomerBooking`، `cancelCustomerBooking`، `rescheduleBooking` و`getCustomerPortal` تتحقق من المالك. لم تُغيّر persistence أو Consent الاختياري. اختبار OTP/SMS حي غير منفذ بسبب عدم الاتصال بالإنتاج.

## 11. Booking

راجعت `getCatalog`، `getAvailableSlots`، `createBooking`، التعديل/الإلغاء، والمسار الحالي في `src/app.js`. الـbackend يحدد التوافر والمدة والجدولة والـlocks والسعر والخصم والقسائم، مع idempotency الموروثة. تأكدت اختبارات المشروع من العقود المتاحة. لم يُبن مسار حجز ثانٍ؛ لا دليل محلي يسمح بالحكم على Availability إنتاجية أو نجاح حجز فعلي أثناء توقف Billing.

## 12. POS / Cashier

فتح/إغلاق الشيفت، الحركات المالية، المصروفات والسلف، `createPosOrder`، `updateBooking`، الإيصال/إعادة الطباعة والاسترداد ضمن المصدر الحالي. `shiftId` للإيراد والاسترداد يأتي من الشيفت النشطة التي يستخرجها الخادم؛ رفض IDs الأخرى مغطى في الـgate. حقل `staffId` في قيدي payment/refund يكتب فقط إذا كان موجودًا، محفوظًا كما في V9.5.1. الاسترداد سالب وينسب لشيفت التنفيذ وطريقة الدفع الأصلية. لم تُنفذ دورة كاشير كاملة من Browser في هذه البيئة.

## 13. Reports

المصدر الحالي يدعم تقرير الشيفت واليومي والأسبوعي والشهري بحدود الدور والفرع، و`getBusinessReport` و`rebuildBusinessReport` مفصولان بالصلاحية. Snapshot الشيفت مصدر KPIs وليس صفحة المعاملات المحدودة؛ target الشهري لا يسمى هدف الشيفت. نتائج handler تغطي التجميع/الفرع. مطابقة أرقام إنتاج فعلية تحتاج runtime بعد Billing.

## 14. Attendance

`recordWorkerAttendance` يقيد العامل بهويته و`staffId` المرتبط والتحقق المكاني، ويكتب PRESENT/CHECKED_OUT. `getAttendanceDashboard` يعرض نطاق الفرع المصرح. Cashier لا يمتلك مسار check-in يدوي لعامل آخر. GPS الفعلي على جهاز حقيقي لم يُتحقق منه هنا.

## 15. Tasks / Notifications

`createWorkerTask` و`updateWorkerTask` و`notifyWorker` تستخدم مستند المهمة/العامل والفرع والصلاحية، مع حالات NEW/SEEN/IN_PROGRESS/DONE وسجل النشاط. إشعار Push وسيلة وصول؛ مستند Workspace هو الحقيقة. المحاكيات تثبت رفض الفرع الآخر. تسليم FCM فعلي لم يُختبر.

## 16. Content / Offers

المحتوى يستخدم `content` وأنواعه القائمة، والعروض تستخدم `offers` نفسها للموقع والحجز والتسويق. Manager مقيد بفروعه، وCashier يحتاج grant اختياريًا؛ قراءة عروض POS التشغيلية لا تمنح CRUD. تخزين الصور والفيديوهات في مسارات صريحة مقيدة بالنوع والفرع. `getCatalog` يستبعد المحتوى غير المنشور ويصفّي الفرع في الواجهة. لا توجد Migration أو بيانات وهمية.

## 17. Public Website

حُفظ Hero، Trust، اختيار الفرع، خدمات (معاينة 8)، عروض، باقات، نتائج، تركيب الشعر، About، فريق (معاينة 4)، مشاهير، مراجعات، استعادة الحجز، FAQ، الدعوة النهائية والفوتر. صفحات `/services/` و`/packages/` و`/team/` تعرض الكتالوج الكامل وفق الفرع؛ المعاينة فقط محدودة. أصلحت V9.6.1 اتساق نسخ empty state وصورة الفرع fallback؛ لم تتغير هذه المرحلة. فحص ظهور صور حقيقية وتجربة التمرير يتطلب Browser متصلًا وCatalog.

## 18. Mobile

المراجعة الثابتة لملفات CSS/DOM عند حدود 360، 375، 390، 430، 768، 1024 و1366/1440/1920 تحققت من media queries، قيود drawer/modal، safe-area، التنقل السفلي، ووجود بدائل بطاقات للجداول. يوجد تمرير أفقي مقصود داخل بعض carousels. **VISUAL QA: PARTIALLY VERIFIED / STATIC ONLY**؛ لا نؤكد عدم page overflow أو التداخل أو قابلية استخدام Owner/Manager/Cashier/Worker بلا لقطات متصفح فعلية.

## 19. XSS / URL Sinks

أُعيد مسح `innerHTML` و`outerHTML` و`insertAdjacentHTML` و`href/src/iframe` في `src/admin.js`، `src/app.js`، `src/account.js` وصفحات catalog/branch/results/reviews وغيرها. جرد V9.5 السابق `V9_5_XSS_SINK_INVENTORY_AR.md` يحدد الـsinks بالتفصيل. الأنماط المرصودة: **STATIC SAFE** لقوالب الثوابت، **ESCAPED** لنصوص/خصائص Firestore عبر `escapeHtml`/`escapeAttr`، و**TRUSTED CONTROLLED** للأيقونات والثوابت والبنية المنسقة. `safeMediaUrl` يقصر بروتوكول الوسائط على HTTP(S)، و`isApprovedVideoEmbed` يقصر iframe على مزودين محددين. لم يثبت **USER-CONTROLLED UNSAFE** جديد في مواضع العينة والفحوص الآلية؛ هذا ليس بديلًا عن اختبارات DOM العدائية في Browser بجميع الأدوار. CSP يمنع inline scripts و`object-src`، لكنه دفاع إضافي.

## 20. SSRF / Injection Review

بحث Runtime عن `child_process` و`spawn` و`eval` و`new Function` وطلبات الشبكة لم يجد تنفيذ أوامر أو SQL datastore. طلبا Meta server-side يستخدمان أصلًا ثابتًا `https://graph.facebook.com` ومعرّف هاتف مضبوطًا، لا URL كاملًا يختاره العميل. `RegExp.exec` إن ظهر هو فحص تعبيرات وليس OS exec. `Buffer.byteLength` يحد حجم payload؛ حدود MIME والحجم للوسائط في Storage. اختبارات `security-v95` تحمي تلك العقود، وفحص التبعيات مذكور أدناه. CWE-89 SQL التقليدي غير منطبق مع Firestore؛ أسماء مجموعات الإدارة محكومة بقوائم السماح.

## 21. Storage Security

`storage.rules`: `public/staff` للأدمن أو العامل في صورته الذاتية المحددة؛ `public/offers/{branchId}` و`public/content/{type}/{branchId}` تقيدان صلاحية النوع والفرع؛ `public/{fileName}` والمجلد العام Admin-only. صورة العامل في Function تُقبل فقط عبر `managedStoragePath` بالـbucket ومسار staff الصحيحين، لا URL خارجي يبدو مشابهًا. الصور أقل من 5MB والفيديو أقل من 30MB بصيغ محددة. 18 اختبار rules/storage نفذت فعليًا؛ لم تُنقل وسائط الإنتاج.

## 22. App Check

`src/admin-api.js` يحتفظ بكائن App Check ونتيجة readiness، ويستخدم debug provider فقط في localhost/127.0.0.1 بلا token ثابت. `src/admin-session.js` يجدد Firebase ID token ثم يعيد المحاولة، لكنه لا يسجل الخروج إن بقي Auth صالحًا ورفض callable بسبب App Check؛ invalid Auth الحقيقي فقط يسمح logout. Hotfix V8.1 محمي بالاختبارات. App Check الإنتاجي لم يُختبر بسبب Billing.

## 23. Dependency Audit

`npm audit --audit-level=high`: exit 0، **0 reported npm vulnerabilities** في الجذر. `npm --prefix functions audit --audit-level=high`: exit 0، **0 reported npm vulnerabilities**. `firebase@12.19.0` و`firebase-admin@14.5.0` و`firebase-functions@7.4.0`، وgRPC 1.14.5 في الشجرتين كما في V9.5.3؛ لم يحدث تحديث تبعيات. الصفر ليس ضمانًا لخلو التطبيق أو registry من كل ثغرة مستقبلية.

## 24. Routes / Buttons

`npm run audit:links`: PASS، 13 صفحة HTML و307 رابط/ملف. `npm run smoke`: PASS، 15 route/MIME مع خادم محلي. الصفحات: Home، Services، Packages، Reviews، Team، Hair Systems، Results، Talkha، Mashaya، Account، Login، Admin، إلى جانب 404 وصفحات مساعدة. فحص HTML IDs لم يُظهر تكرارًا؛ أزرار النموذج بلا `id` تستخدم submit، وأزرار Gallery ذات class مرتبطة بمستمعين في JS. لا يمكن تأكيد كل زر ومدخل hash/back/forward دون Browser وتفاعل مع البيانات.

## 25. Performance

`npm run build`: PASS مع Vite 7.3.6. `npm run verify:build` و`npm run verify:firebase`: PASS. `npm run audit:performance`: PASS، 48 طلب HTTP محليًا، 0% أخطاء، p50 نحو 2ms وp95 نحو 5ms. هذه أرقام خدمة ملفات محلية، وليست LCP/CLS/INP أو تكلفة Firestore/Cloud.

## 26. Production Runtime Status

**BLOCKED — BILLING DISABLED**، بحسب السجل الذي قدّمه المستخدم: `The request failed because billing is disabled for this project.` لم أختبر Cloud Functions الحقيقية، ولم أفسر 500/503 الحالي باعتباره خطأ CORS أو `getCatalog`. لا تغييرات في Billing أو بيانات الإنتاج.

## 27. Billing Blocker

بعد إعادة تفعيل Billing بقرار المستخدم، يلزم اختبار `health` و`getCatalog` والـcallables المقيدة، App Check، وصفحات الحجز، والتدفقات التشغيلية على بيئة مناسبة مع خطة مراقبة، قبل اعتبار النسخة جاهزة للإنتاج. هذا خارج V10 المحلي ولا يستدعي تعديل كود لحالة Billing.

## 28. Known Limitations

- نقل HTTP/Callable عبر Functions Emulator **غير متحقق** بسبب Firestore/Eventarc trigger registration؛ نجاح `handler.run()` لا يغطي transport أو headers أو error contract.
- Visual QA الحقيقية عبر Owner/Manager/Cashier/Worker والموقع العام **غير متحققة**؛ فحص CSS/DOM وSmoke لا يثبت عدم overflow أو تكامل الأزرار.
- اختبارات GPS/Push/OTP/WhatsApp الخارجي، بيانات وتقارير إنتاجية وWeb Vitals غير منفذة. لا رسائل WhatsApp Production.
- بقية عمر ID token قد تتيح طلبات على بعض endpoints بعد تقليل الدور حتى انتهاء token؛ Live Admin check يغطي العمليات العالية الحساسية المعينة، ولا ندعي إبطالًا فوريًا عامًا.

## 29. Production Checklist

| البند | الحالة |
|---|---|
| تطبيق محلي واختبارات Functions | PASS: 189/189 و45/45 |
| Firestore/Storage Rules | PASS: 18/18 مع Java 21 |
| Handler emulator | PASS: 43/43 |
| Build/Verify/Links/Smoke/Performance المحلي | PASS |
| NPM audit المبلّغ عنه | 0 في الجذر وFunctions |
| HTTP Functions transport | NOT VERIFIED — tooling/Eventarc |
| Browser viewport وعمليات جميع الأدوار | PARTIAL / STATIC ONLY |
| Cloud runtime بعد Billing | BLOCKED — BILLING DISABLED |

يلزم إكمال التحقق من Browser/HTTP والوظائف السحابية بعد إزالة المانع، ثم مراجعة مستقلة وقرار نشر صريح. لا تُستخدم اختبارات هذه النسخة لتغيير بيانات Production.

## 30. Final Gate Result

**LOCAL APPLICATION GATE: PASS**<br>
**RULES GATE: PASS**<br>
**HANDLER GATE: PASS**<br>
**STATIC SECURITY GATE: PASS (بحدود الفحص الموثقة)**<br>
**HTTP FUNCTIONS: NOT VERIFIED — FIREBASE TOOLS / EVENTARC EMULATOR ISSUE**<br>
**VISUAL QA: PARTIALLY VERIFIED / STATIC ONLY**<br>
**PRODUCTION RUNTIME: BLOCKED — BILLING DISABLED**<br>
**PRODUCTION READY: NO**

توقف العمل عند V10. لا Deploy، لا Push، لا Production Data، ولا بدء AI Agent.
