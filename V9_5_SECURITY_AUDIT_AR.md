# V9.5 — تدقيق وتقوية الأمن

تاريخ الفحص: 2026-09-30. المصدر: `el-mezaen-mobile-verified-v9.4.1.zip`. نسخة مستقلة، دون Deploy أو Push أو بيانات Production. **READY FOR FINAL PRODUCTION GATE: NO**.

## EXECUTIVE SECURITY STATUS

أُصلحت قرارات الثقة الثلاثة المؤكدة في المصدر: الكتابة العامة في Storage، قبول رابط صورة عامل من نطاق خارجي، وعدم إبطال refresh tokens بعد تغيير claims. عولجت مواضع XSS مثبتة في الخصائص والروابط الديناميكية، وعُدلت تبعيات ضمن نطاقاتها الحالية حتى أصبح تدقيق npm بلا advisories. **لا يُعد هذا إثباتًا تشغيليًا لقواعد Storage/Firestore أو handlers**: Java 17 فقط متاحة، و`firebase-tools` رفض البدء لأنه يحتاج 21+. يبقى HTTP Functions Emulator Gate السابق غير متحقق. لا توجد رسالة Meta حية أو تعديل Production.

## CONFIRMED FINDINGS BEFORE FIX

| الخلل | إعادة الإنتاج/الدليل قبل الإصلاح | Root cause | الإصلاح |
|---|---|---|---|
| Storage generic/staff | `canManageMedia()` قبل التعديل سمح بـManager لديه `gallery/results/hairMedia/posts/settings`؛ المسارات العامة وStaff استخدمته | صلاحية المحتوى استُخدمت كتصريح عام للملفات | Admin فقط للمسارات العامة وStaff؛ Content/Offers بالمسارات الصريحة والنوع والفرع |
| Worker URL | `updateWorkerProfilePhoto` استخدم `decodeURIComponent(new URL(...).pathname).includes(...)`، فيقبل pathname مشابهًا من نطاق آخر | الثقة في جزء النص بدل bucket ومسار managed | URL HTTPS من Firebase Storage لنفس bucket، ومسار Staff خاص دقيق |
| Role change | `setCustomUserClaims` دون `revokeRefreshTokens` | جلسات قابلة للتحديث بعد تغيير السلطة | claim replacement ثم revoke مع فشل واضح؛ فحص Auth user الحالي على ثلاث عمليات Admin حساسة |
| DOM | escaping النص عبر `textContent→innerHTML` لم يرمّز `"` في عدة ملفات، وروابط خرائط/صور ضُمّنت بعد HTML escaping فقط | خلط HTML text وattribute وURL contexts | ترميز الاقتباس، فحص scheme، حصر iframe، وتحويل الأعداد المعروضة؛ جرد 172 sink |

## STORAGE AUTHORIZATION FIX

`storage.rules`: `canManageMedia()` أصبح Admin-only. العامل يكتب صورة بامتداد صورة وMIME/حجم صالحين في `public/staff/{ownStaffId}/{fileName}` فقط؛ لا يحذف. Staff media الأخرى للإدارة. Content وOffers ما زالا يسمحان بالمنح الصريح مع `branchIds` المطابقة، وصور المحتوى لا تقبل video MIME ومسار `/videos/` لا يقبل image MIME. مسارا `public/{fileName}` و`public/{folder}/{allPaths=**}` للإدارة فقط. ملفات Production القديمة لم تُنقل أو تُحذف، والقراءة العامة الحالية ظلت كما هي. اختبارات Storage السلبية أضيفت، **لكنها NOT VERIFIED بالمحاكي**.

## WORKER IMAGE TRUST FIX

`canonicalManagedStoragePath()` يفحص HTTPS، hostname المحدد، bucket الفعلي، البنية `/v0/b/{bucket}/o/{encodedPath}` أو `storage.googleapis.com/{bucket}/{path}`، ويرفض segment فارغًا و`.` و`..` و`%` المتبقية وcontrol characters. `isOwnManagedStaffPhoto()` يفرض `public/staff/{staffId}/{one image filename}`. اختبار Functions فعلي رفض evil.example والـbucket الخطأ وStaff آخر والمسارات المرمزة. لا يوجد Storage metadata/existence read عند حفظ الرابط؛ يمكن لعامل وضع رابط مشروع لمسار خاص به لم يعد موجودًا، ويظل هذا قيد سلامة عرض الصورة، لا عبور فرع.

## STALE CLAIM / ROLE CHANGE FIX

`replaceClaimsAndRevoke()` يستدعي `setCustomUserClaims` ثم `revokeRefreshTokens(uid)` قبل نجاح `setUserRole` وكتابة السجل؛ فشل الإبطال يرجع `unavailable` واضحًا ويسجل code فقط. لأن Claims/Auth وFirestore ليسا transaction واحدة، فشل الإبطال بعد نجاح تغيير claims يترك حالة جزئية تتطلب مراجعة وإعادة محاولة إدارية. `requireLiveAdmin()` يجلب Auth user الحالي ويرفض `disabled` أو role لم تعد Admin في `setUserRole` و`createAdminUser` و`adminSecureDelete` فقط؛ هذه RPC إضافية نادرة وليست Firestore read لكل طلب. **إبطال refresh tokens لا يلغي فورًا ID tokens الصادرة سابقًا**؛ قد تبقى حتى انتهاء صلاحيتها على بقية endpoints التي تعتمد claims. لم نضف `authzVersion` عامًّا أو read لكل request بسبب التكلفة والتغيير الواسع. الحساب المحذوف يُحذف من Auth في `adminSecureDelete`؛ تعطيل حساب عام مستقل غير موجود في هذه النسخة.

## AUTHENTICATION MATRIX

كل export من `functions/src/index.js` مذكور؛ التصنيف يصف بوابة handler، و`adminOptions` لا يعني تلقائيًا Admin role. `rescheduleBooking` يقبل Customer يملك الحجز أو Staff لديه `bookings` وصلاحية الفرع.

| التصنيف | Endpoints | قاعدة الدخول |
|---|---|---|
| PUBLIC | `health`, `getCatalog`, `getPublishedReviews`, `getAvailableSlots`, `validateCoupon`, `createBooking`, `submitReview` | تحقق input؛ rate limit حيث يوجد؛ App Check public في Production حسب options |
| PUBLIC signed webhook | `whatsappWebhook` | GET verify token؛ POST HMAC، method وbody limit |
| CUSTOMER AUTH | `getCustomerBooking`, `cancelCustomerBooking`, `getCustomerPortal`, `saveFavoriteBarber`, `updateOwnWhatsappConsent` | Firebase phone identity وربط customer/booking ownership |
| CUSTOMER AUTH أو STAFF AUTH | `rescheduleBooking` | ملكية booking أو permission `bookings` والفرع الفعلي |
| STAFF AUTH | `getOwnMarketingGrants`, `getAdminDashboard`, `getCashierSnapshot`, `getPosOffers`, `getAdminCollection`, `adminUpsert`, `adminDelete`, `getBusinessDashboard`, `getServiceTargetsDashboard`, `upsertServiceTarget`, `getAttendanceDashboard`, `recordWorkerAttendance`, `getWorkerWorkspace`, `updateWorkerProfilePhoto`, `createWorkerTask`, `updateWorkerTask`, `notifyWorker`, `openCashShift`, `addCashMovement`, `closeCashShift`, `getCashOperations`, `getBookingCalendar`, `getCustomer360`, `closeBusinessDay`, `getBusinessReport`, `recordPasswordChange`, `recordExpense`, `updateExpense`, `createPosOrder`, `recordPayrollPayment`, `updateBooking`, `scanCustomerCode`, `findCustomerByPhone`, `getWhatsappCampaignOptions`, `checkWhatsappMarketingRecipient`, `previewWhatsappCampaign`, `createWhatsappCampaign`, `sendWhatsappReceipt`, `updateWhatsappCampaignState`, `getWhatsappCampaignRecipients`, `getWhatsappCampaignStats`, `registerPushToken`, `unregisterPushToken` | `requireRole`/`requirePermission` أو ملكية Worker الذاتية؛ تحقق فرع المورد؛ المنح الاختيارية تُراجع من user record للتسويق |
| ADMIN | `getOwnerMobileHistory`, `setBranchMonthlyTarget`, `rebuildBusinessReport`, `getAuditEvents`, `adminSecureDelete`, `rotateCustomerQr`, `adjustCustomerWallet`, `updateWhatsappConsent`, `setUserRole`, `createAdminUser` | Admin claim، وبعضها recent auth؛ الثلاثة الحساسة أعلاه تفحص Auth user الحالي |
| SYSTEM-TRIGGER | `scheduledBusinessReports`, `processCampaignBatch`, `notifyAdminsOnBooking` | Scheduler/Cloud Tasks/Firestore trigger؛ ليست Callable عامة |

## AUTHORIZATION MATRIX

| مورد | مصدر الملكية والتحقق | قيود سلبية |
|---|---|---|
| Booking/POS/Refund/shift | تحميل booking/shift والفرع من الخادم، `requireBranchAccess`، حالة transaction/shift، idempotency | client branch/shift ID ليس سلطة؛ paid لا يدفع مرتين |
| Expenses/reports/payroll/targets | branch من المورد، capability `expenses/revenue/payroll`، rebuild Admin | Cashier reports قراءة فرعه فقط، لا rebuild |
| Attendance/tasks/notifications | Staff من record، GPS للعامل، branch match، worker own task | Cashier لا يزور check-in ولا يعبر الفرع |
| Content/offers/campaigns | document type/branch، role ceiling والمنح الصريحة، campaign resource fetch قبل state change | Cashier عادي لا يحصل على marketing؛ `all` للإدارة |
| Customer/wallet | phone identity أو operational lookup محدود، resource lastBranchId، admin wallet adjustment | لا قائمة Customers للكاشير |
| Users/audit/delete | Admin، recent auth للحذف، Auth user current للثلاثة الحساسة | old claims لا تتجاوز ceiling |

## BRANCH / IDOR TESTS

اختبارات pure authorization وFunctions ‏45/45 تتضمن ceiling والفرع، واختبارات الـhandler gate الحالية تُغطي booking وexpense/ledger وcustomer وcampaign وreport وshift وrefund؛ اختبارات Storage الجديدة تشمل staff/generic/content/offer والكتابة والحذف عبر الفروع. **اختبارات الطلبات السلبية الفعلية في Firebase Emulator لم تُنفذ بسبب Java 17، لذلك Branch/Storage gate في V9.5 = NOT VERIFIED.** لا يُستبدل ذلك بنتيجة `verify:firebase` أو الاختبارات الثابتة.

## COMMAND/CODE INJECTION RESULT

فحص runtime `src/*.js` و`functions/src/*.js` واختبار regression: لا `child_process`, `shelljs`, OS `exec/spawn`, `eval`, `new Function`, `vm.run*`. استُثني `RegExp.exec` لأنه ليس تنفيذ أوامر. لا يوجد بناء أمر shell من إدخال مستخدم في runtime.

## SSRF RESULT

الطلبان الخارجيان من Functions هما POST إلى `https://graph.facebook.com/v22.0/${phoneNumberId}/messages` فقط؛ `phoneNumberId` secret بيئي، ثم أصبح مشروطًا بـ`^[0-9]{5,25}$` في مسار الإيصال والدفعات. لا URL كامل من Client ولا server fetch لوسائط العميل. طلب Auth Emulator في ملف الاختبار فقط، محصور بمضيفه المحلي demo. لا طبقة حجب private IP عامة لأن التطبيق لا يطلب URL تعسفيًا. Browser media URL مسألة XSS/خصوصية منفصلة.

## XSS SINK AUDIT

جرد إسنادات HTML: [V9_5_XSS_SINK_INVENTORY_AR.md](V9_5_XSS_SINK_INVENTORY_AR.md)، 172 إسنادًا في 9 ملفات. فُحصت المصادر ضمن catalog/content/offers/staff/reviews/account/customer/task، مع فصل النص عن الخاصية وURL. `escapeHtml` المستند إلى DOM في admin/catalog/reviews/FAQ صار يرمّز `"` و`'`؛ بقية الصفحات تستخدم escape نص/خاصية. `safeMediaUrl()` لا يقبل `javascript:`, `vbscript:`, `file:`, `data:text/html`، واستُخدم في صور catalog/branches/results/account والمواضع الإدارية الأساسية. روابط خرائط/social/news تفحص scheme. iframe تشغيل الخبر يُعاد فحص مزوده (YouTube nocookie/Facebook/TikTok) عند الضغط، والفيديو المباشر يفحص نوعه. `data:image` الناتج محليًا من QR/Canvas يبقى مقصودًا. `popup.document.write` في طباعة الإيصال يستخدم title مهربًا وصورة Canvas محلية؛ يحتاج اختبار CSP/DOM فعليًا. حمولات `<script>`, `<img onerror>`, `"><svg onload>` و`javascript:` اختُبرت في helper/قواعد source؛ **DOM تفاعلي مع بيانات Firestore عدائية لم يُختبر هنا، لذلك الإغلاق الشامل لكل sink NOT VERIFIED**. لا تغيير CSP `script-src` ولا إضافة `unsafe-inline` له.

## SESSION RESULT

Staff: `browserSessionPersistence` وتبويبات مستقلة؛ Customer: `browserLocalPersistence` كما كان. لا ID token يدوي في storage أو URL. Hotfix V8.1 لا يسجل خروجًا عند فشل App Check وحده؛ اختبارات V8.1 المحلية بقيت PASS. لم يتوفر اختبار متصفح حقيقي متعدد التبويبات في هذا العمل، فتظل الملاحظة التشغيلية كما كانت.

## SQL INJECTION RESULT

لا SQL datastore أو SQL query؛ Firestore فقط. `ADMIN_COLLECTIONS` و`PUBLIC_COLLECTIONS` قوائم ثابتة، و`adminUpsert/adminDelete` يرفضان collection غير معروف و`validatePayloadSize` يحد payload؛ document IDs تنظف وتُراجع حسب endpoint. SQL CWE-89 غير منطبق؛ Firestore authorization يحتاج Emulator.

## BUFFER OVERFLOW RESULT

Runtime JavaScript/Node، لا native buffer parsing مخصص؛ `Buffer.byteLength` للتحقق من JSON، وحدود Storage 5MiB للصور/30MiB للفيديو، وحد webhook 256KiB. التبعيات transitive ذات parsers تخضع لـnpm audit؛ لا تدعي هذه النتيجة إثبات سلامة كل parser أو upload MIME spoofing.

## DEPENDENCY AUDIT

قبل الإصلاح: High `nanoid <3.3.18` (PostCSS→Vite dev/build، zero-size custom generator DoS؛ غير معرض مباشرة لطلب مستخدم في Runtime)، High `brace-expansion 2.0.0–2.1.6` (Firestore Admin→google-gax→glob/minimatch؛ يحتاج glob pattern خبيث، ولا يمرر التطبيق pattern حرًا من العميل)، Moderate `postcss` و`qs`. تحديث lockfile متوافق دون Major: nanoid `3.3.16→3.3.19`, postcss `8.5.19→8.5.28`, brace-expansion `2.1.4→2.1.7`, qs `6.15.3→6.16.0`, express `4.22.2→4.22.3`, body-parser `1.20.6→1.20.8`. أُعيد `npm ci`. نتيجتا `npm audit --audit-level=high` و`npm --prefix functions audit --audit-level=high`: **0 vulnerabilities** وقت الفحص. لا `--force`.

## WEBHOOK SECURITY

POST فقط مع `x-hub-signature-256` وHMAC في `verifyMetaSignature` (اختبار payload معدّل يرفضه)، ورفض 401 قبل أي Firestore query، و413 إذا body غائب أو فوق 256KiB، وحالات delivery bounded إلى 100 مع عدم downgrade من read بفضل `shouldApplyDeliveryStatus`. GET handshake يتحقق verify token. سجل webhook يعرض عدد statuses فقط؛ لا access/app secret. HTTP Functions Emulator غير متحقق هنا، لذا السلوك الشبكي الفعلي غير مثبت.

## SECRETS SCAN

مسح مصادر `src`, `functions/src`, `public`, `tests`: لا private key marker ولا debug App Check token ثابت ولا literal WhatsApp access token. `functions/.env.example` فقط template. Firebase Web API key عامة وليست credential خاصة. لا طباعة لقيم tokens أثناء الفحص؛ لا ضمان للبيئات خارج ZIP.

## SECURITY HEADERS

`vercel.json` و`firebase.json`: CSP `script-src` دون unsafe-inline، `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`، و`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. Vercel يضيف HSTS. `style-src 'unsafe-inline'` قائم من baseline ولم يُوسع. `verify:build` و`verify:firebase` نجاح تكوين، وليس فحص HTTP deployed headers.

## RATE LIMITING AND SECURITY LOGGING

محددات موجودة للحجز برقم الهاتف وبصمة IP، المراجعة، lookup/QR، attendance، tasks/notify، POS finalize، booking mutation، WhatsApp receipt. حركات كاش/مصروفات تعتمد authentication/idempotency/shift state؛ لا limit مستقل لكل callable، وهو تحسين لاحق مع قياس تكلفة Firestore. Audit actor/action/branch/entity/timestamp في العمليات الحساسة؛ اختبار جديد يفحص عدم تسرب password/token/OTP/secret في create-user audit، ولم نجد raw credential في نشاط تغيير كلمة المرور. فحص كل event تشغيلي بمحاكي ما زال مطلوبًا.

## CWE STATUS TABLE

الـSTATUS تخص درجة الإثبات لهذه النسخة. الحقول المختصرة التالية: السطح، الدليل، الملفات، الإصلاح، الاختبار، الخطر المتبقي.

| CWE / فئة | STATUS | ATTACK SURFACE | EVIDENCE | FILES REVIEWED | FIX | TEST | RESIDUAL RISK |
|---|---|---|---|---|---|---|---|
| CWE-78/77 | NOT APPLICABLE | Runtime JS | لا OS exec/spawn | `src`, `functions/src` | لا يلزم | `security-v95` scan PASS | tooling خارج runtime ليس ضمن الفحص |
| CWE-94 | NOT APPLICABLE | Runtime JS | لا eval/Function/vm.run | `src`, `functions/src` | لا يلزم | scan PASS | dynamic imports محددة في المصدر |
| CWE-918 | MITIGATED | Meta outbound | fixed origin وnumeric ID | `functions/src/index.js` | ID allowlist | static + source test PASS | Meta network mock/HTTP لم يختبر |
| CWE-862/863 | NOT VERIFIED | Callables/Storage | role/branch checks وقواعد معدلة | `index.js`, `authorization.js`, rules | least privilege Storage؛ current Auth على Admin حساس | unit PASS؛ Emulator BLOCKED | IDOR الفعلي غير متحقق |
| CWE-306/287 | MITIGATED | Auth endpoints | Firebase auth + HMAC/App Check | `index.js`, `marketing.js`, `admin-api.js` | webhook body gate | unit PASS؛ handler BLOCKED | HTTP integration مستقل |
| CWE-501 | MITIGATED | URL/branch/claims | backend source، managed bucket | `index.js`, `managed-media.js` | canonical URL & resource checks | pure PASS؛ emulator BLOCKED | stale ID tokens |
| CWE-269 | MITIGATED | role/grants | ceiling + revoke | `authorization.js`, `privilege-change.js` | revoke + live Auth critical | unit PASS | partial state if revoke fails |
| CWE-384 | MITIGATED | Staff tabs | session persistence | `admin-api.js`, `admin-session.js`, `account.js` | preserved | V8.1/local PASS | browser multi-tab not repeated |
| CWE-89 | NOT APPLICABLE | data layer | Firestore only | `index.js`, packages | allowlists remain | static PASS | Firestore rules emulator pending |
| CWE-120 | NOT APPLICABLE | app JS | no native buffer writes | `index.js`, rules, dependencies | payload/upload limits | unit/static; npm audit 0 | media parsers ليست مثبتة fuzz |
| CWE-79 | NOT VERIFIED | 172 DOM HTML sinks | quote/URL issues fixed | `src/*.js`, `media.js` | escaping/context URLs/iframe | unit + build PASS؛ hostile DOM QA absent | complex sinks require interactive adversarial QA |
| IDOR/BOLA | NOT VERIFIED | resource IDs | owner branch fetched server side | handlers/rules | existing controls retained | pure PASS؛ handler BLOCKED | actual negative requests pending |
| Path traversal | MITIGATED | Storage URL/doc path | decoded segments rejected | `managed-media.js`, `index.js` | exact path | unit PASS | Storage rules emulator pending |
| Unsafe upload | NOT VERIFIED | Storage | MIME/size/scoped paths | `storage.rules`, `admin-api.js` | generic writes tightened | static PASS؛ Storage emulator BLOCKED | content bytes not magic-byte checked server side |
| Webhook authentication | MITIGATED | Meta HTTP | HMAC + method + bound | `marketing.js`, `index.js` | 413 limit | HMAC unit PASS | HTTP emulator pending |
| Secrets exposure | MITIGATED | source/logs | scan no literals | source/config | no new secret fields | static scan | external environment not inspected |
| Stale claims | MITIGATED | role change | revoke + current Admin check | `index.js`, `privilege-change.js` | refresh revoke | mock unit PASS | issued ID token lifetime for other endpoints |
| Dependency vulnerabilities | FIXED | npm tree | audit 0/0 | two lockfiles | patch/minor lockfile | two actual npm audits PASS | future advisories |

## FILES CHANGED

`storage.rules`; `functions/src/index.js`, `functions/src/managed-media.js`, `functions/src/privilege-change.js`; `src/admin.js`, `src/app.js`, `src/account.js`, `src/catalog-page.js`, `src/branch-page.js`, `src/results.js`, `src/reviews-page.js`, `src/hair-systems.js`, `src/faq-chatbot.js`, `src/media.js`; `tests/security-v95.test.mjs`, `functions/test/security-v95.test.mjs`, `tests/firebase-rules.emulator.mjs`; root/Functions `package-lock.json`; هذا التقرير وجرد XSS. لم تتغير طبقة Admin session/App Check أو business model.

## TESTS ADDED AND RESULTS

| الأمر | النتيجة |
|---|---|
| `npm test` | 188/188 PASS بعد الإضافات النهائية |
| `npm run test:functions` | 45/45 PASS |
| `npm run test:rules` | **NOT VERIFIED**؛ firebase-tools: Java قبل 21 مرفوض؛ project `demo-el-mezaen-rules` |
| `npm run test:gate:handlers` | **NOT VERIFIED**؛ السبب ذاته؛ project `demo-el-mezaen-gate` |
| `npm run build`, `verify:build`, `verify:firebase`, `audit:links` | PASS؛ 13 routes و302 روابط/أصول محلية |
| `npm run smoke` | 15/15 routes PASS على خادم محلي مع `NODE_USE_ENV_PROXY=0` |
| `npm run audit:performance` | 48 طلبًا، 0% خطأ، p95 محلي 5ms؛ ليس قياس Web Vitals أو Production |
| root وFunctions `npm audit --audit-level=high` | 0 vulnerabilities لكل منهما |

اختبارات الأمن الجديدة: pure managed URL/branch/role، ترتيب revoke وفشله، current Admin record، fixed Meta destination، schemes/iframe، غياب runtime execution، فحص secrets في audit، webhook body/order، وتوقعات قواعد Storage المضافة. الاختبارات الثابتة لم تُحسب بديلًا لنتائج Emulator.

## FIREBASE COST IMPACT

لا reads/listeners عامة جديدة ولا Storage mapping documents. `requireLiveAdmin()` يزيد Firebase Auth `getUser` RPC واحدة على ثلاث mutations إدارية نادرة فقط. قواعد Storage لا تضيف Firestore lookups. لا تغيير لتكاليف الزيارات العادية أو تقارير V7.

## HIGH FINDINGS REMAINING / CRITICAL FINDINGS REMAINING

High/Critical مؤكدة في `npm audit` بعد الإصلاح: **0/0**. لا نعلن إغلاقًا نهائيًا لمخاطر Storage/IDOR/XSS لأن Emulator وDOM adversarial QA غير متحققين. هذا **Production security blocker**، حتى إن لم يُثبت exploit جديد. فشل revoke بعد تعديل claims حالة تشغيلية جزئية عالية الحساسية تحتاج تشغيلًا إداريًا ومراقبة؛ تستدعي إعادة المحاولة ولا تعني نجاح العملية.

## PRODUCTION SECURITY BLOCKERS

1. Java 21+ وتشغيل `test:rules` و`test:gate:handlers` فعليًا على demo projects، بما فيها Storage write/delete negative requests.
2. HTTP Functions Emulator Gate القديم لا يزال NOT VERIFIED؛ لا ادعاء Production Ready.
3. اختبار DOM تفاعلي ببيانات Firestore عدائية لكل المسارات المهمة ومراجعة الجرد المعقد المتبقي.
4. تحقق تشغيلي من معالجة فشل إبطال tokens الجزئي ومن الفترة المتبقية لـID tokens الصادرة، خصوصًا صلاحيات غير الثلاثة Admin الحساسة.

**READY FOR FINAL PRODUCTION GATE: NO.**
