# V9.5.2 — بوابة التحقق التشغيلي والأمني

## نطاق التنفيذ والحكم

بدأ الفحص من `el-mezaen-security-verified-v9.5.1.zip` في نسخة مستقلة. لم يُعدّل كود التطبيق أو Business Logic أو الواجهات. استخدمت اختبارات Firebase مشاريع `demo-` فقط وJava 21 (`jdk-21.0.12.1+1-jre`). **READY FOR V10: NO**، لأن محاكي HTTP الكامل لم يكتمل، ولم يمكن الوصول إلى خادم التطوير من المتصفح التفاعلي، وظهر تحذير High في تبعية `@grpc/grpc-js`.

## HTTP FUNCTIONS EMULATOR RESULT

شُغّل `firebase-tools emulators:exec --project demo-el-mezaen-http --only auth,firestore,functions` مرتين، والثانية مع `--debug`. بدأت Auth وFirestore وFunctions، وسجلت الدوال القابلة للاستدعاء عناوين HTTP محلية. توقفت العملية قبل تنفيذ أمر الاختبار/أي طلب فعلي عندما حاولت Functions تسجيل Firestore Eventarc trigger `notifyAdminsOnBooking` عبر `127.0.0.1:8080/emulator/v1/projects/demo-el-mezaen-http/eventarcTrigger`. سجل `--debug` يعرض `SocketError: other side closed` ثم `Failed to make request`. لم تُعطّل الـtrigger أو تتغير بنية التطبيق لتجاوز هذا القيد. **HTTP TRANSPORT NOT VERIFIED**؛ ظهور عنوان الدالة في log ليس نجاحًا لطلب HTTP.

## HTTP AUTH RESULT

**NOT VERIFIED** عبر النقل الحقيقي: لم تصل جلسة HTTP إلى اختبار `unauthenticated` أو رموز الخطأ. اختبارات Handler المباشرة 43/43 ناجحة، لكنها لا تختبر بروتوكول HTTP/App Check/serialization.

## HTTP AUTHORIZATION RESULT

**NOT VERIFIED** عبر HTTP لكل من فشل الصلاحيات وBranch IDOR وrefund وPOS finalize وbooking update وworker task/notification وcontent وrole mutation وwebhook. اختبار Handler المباشر يغطي عددًا من هذه العقود دون طبقة النقل. لم يُرسل WhatsApp أو FCM حقيقي.

## XSS BROWSER RESULT

**NOT VERIFIED**. المتصفح التفاعلي كان متاحًا، لكنه رفض فتح `http://127.0.0.1:4173/` برسالة `net::ERR_BLOCKED_BY_CLIENT`. لذلك لم تُزرع حمولات `<script>`, `<img onerror>`, `<svg onload>` و`javascript:` في واجهة حقيقية، ولم تُؤخذ لقطات أو يُرصد تنفيذ DOM/CSP. اختبارات `tests/security-v95.test.mjs` تجتاز فحص escaping وURL فقط؛ ليست بديلًا عن Browser QA.

## URL/MEDIA TRUST RESULT

اختبارات الوحدة 188/188 تشمل رفض صورة عامل من نطاق أو bucket خارجي، ومسار عامل آخر، ومسارات مشفرة متلاعب بها، ورفض `javascript:` و`vbscript:` و`file:` و`data:text/html` وiframe غير معتمد، وقبول مسار managed صحيح ومزود iframe معتمد. اختبارات Storage Emulator 18/18 تتحقق من المسارات وحجم/MIME الرفع. **تفاعل واجهة الرفع والمتصفح NOT VERIFIED**.

## MULTI-TAB RESULT

**NOT VERIFIED في متصفح حقيقي**: تعذر الوصول إلى الموقع المحلي من المتصفح المتاح. اختبار العقد الثابت يؤكد `browserSessionPersistence` للموظفين واستمرار Customer LOCAL دون تخزين يدوي للتوكن. لا يكفي لإثبات Login/Refresh/Logout لثلاثة تبويبات.

## ROLE DOWNGRADE RESULT

اختبارات Functions تغطي `revokeRefreshTokens` بعد تحديث claims وظهور فشل الإبطال، وفحص Auth user الحالي لبعض العمليات الإدارية عالية الخطورة. **تجربة مدير متصل ثم تقليص دوره وإعادة المحاولة من تبويب قديم NOT VERIFIED**. إبطال refresh token لا يلغي فورًا ID token صادرًا سابقًا، وتبقى فترة صلاحيته خطرًا متبقيًا للعمليات التي لا تفحص الحالة الحية.

## CASHIER END-TO-END

**NOT VERIFIED في UI حقيقي** لدورة فتح الشيفت والفاتورة والكوبون والتحصيل والاسترداد والإيصال وحركات النقد والسلفة والتقرير والإغلاق. الاختبارات الموجودة على Handler/القواعد مرت، لكنها ليست تنفيذًا متصلًا من المتصفح.

## FINANCIAL RESULT

بوابة Handler **43/43 PASS**، ومنها استرداد الفرع الصحيح بالمبلغ السالب وطريقة الدفع الأصلية وغياب `staffId` عند عدم وجود عامل، وتكرار الاسترداد دون قيد ثانٍ؛ إضافة إلى نسب `shiftId` ومعاملة POS والشيفت. **التحقق المالي عبر HTTP/UI NOT VERIFIED**.

## TASK RESULT

اختبارات العقد/Handler السابقة ما زالت تمر. **Cashier → Worker → SEEN → IN_PROGRESS → DONE عبر HTTP/UI/Push NOT VERIFIED**. لم يُطلب أو يُستخدم Push production.

## ATTENDANCE RESULT

اختبارات القواعد والمنطق الحالية مرت. **فحص GPS الحقيقي وواجهة العامل مع قراءة الكاشير في المتصفح NOT VERIFIED**.

## CONTENT/MEDIA RESULT

Storage Emulator **18/18 PASS**، ويغطي scoped content permissions وMIME/size ومسارات العامل. **الرفع الفعلي للصورة/الفيديو وBefore/After وPublish/Hide والعرض العام في المتصفح NOT VERIFIED**.

## MOBILE VISUAL QA

**NOT VERIFIED** لأي من 360×800، 375×812، 390×844، 430×932، 768، 1024 أو شاشات Owner/Manager/Cashier/Worker. لم تُلتقط screenshots؛ `verify:build` يفحص responsive contracts فقط.

## DESKTOP REGRESSION

**NOT VERIFIED بصريًا** عند 1440×900 و1920×1080 للإدارة والكاشير. Build وSmoke نجحا، لكنهما لا يثبتان التخطيط الفعلي.

## SCANNER RESULT

**NOT VERIFIED في متصفح/كاميرا حقيقية** لدورة فتح scanner وإغلاقه والتنقل والتخلص من tracks/timers. اختبار المصدر القائم يراجع lifecycle contract فقط.

## PWA RESULT

نجح Smoke على 15 route وMIME. **سلوك Service Worker المسجل مسبقًا، cache، وحالة 503 Offline في localhost NOT VERIFIED** دون متصفح متصل بالنسخة المحلية.

## PASSWORD FORM ACCESSIBILITY

**NOT VERIFIED في Browser console/Accessibility tree** لتحذير username/autocomplete. لم يتغير password flow.

## SECURITY HEADERS

`firebase.json` و`vercel.json` يحتويان CSP مع `object-src 'none'` و`frame-ancestors 'none'` و`base-uri 'self'` وبدون `unsafe-inline` في `script-src`، إضافة إلى `X-Content-Type-Options` و`Referrer-Policy` و`Permissions-Policy`. `vercel.json` يتضمن HSTS. `verify:firebase` نجح. **استجابة Hosting production أو Browser response headers NOT VERIFIED**؛ استجابة Vite المحلية ليست دليلًا على Headers الاستضافة.

## DEPENDENCY AUDIT

- `npm audit --audit-level=high`: **FAIL، 5 High** في سلسلة `firebase@12.16.0 → @firebase/firestore@4.16.0 → @grpc/grpc-js@1.9.16` وتبعيات compat/test الموروثة. أورد audit تحذيري GHSA-m9gg-hp2v-232j وGHSA-f596-whhp-79r4. استخدام المتصفح عادة لا ينفذ Node gRPC server، لكن لم يُثبت عدم قابلية الوصول في جميع مسارات SDK؛ لا نصنفه مغلقًا.
- `npm --prefix functions audit --audit-level=high`: **FAIL، 1 High** عند `firebase-admin@14.2.0 → @google-cloud/firestore@8.6.0 → google-gax@5.0.7 → @grpc/grpc-js@1.14.4`، بالتحذيرين نفسيهما. الدوال تستخدم عميل Firestore gRPC؛ نقطتا advisory تتعلقان بسلوك gRPC authorization context/error messages في ظروف معينة، ولم يُثبت استغلالهما في وظائف التطبيق. تتوفر remediation في audit، لكنها لم تُطبق آليًا أو بتحديث Major ضمن مرحلة تحقق فقط.
- لم يُشغّل `npm audit fix --force`. تحذيرات High باقية وتتطلب triage وتحديثًا آمنًا واختبارًا قبل بوابة V10.

## FULL REGRESSION

| الأمر | النتيجة |
| --- | --- |
| `npm test` | 188/188 PASS |
| `npm run test:functions` | 45/45 PASS |
| `npm run test:rules` | 18/18 PASS، Firestore/Storage Emulator، `demo-el-mezaen-rules`، Java 21 |
| `npm run test:gate:handlers` | 43/43 PASS، Auth/Firestore Emulator، `demo-el-mezaen-gate`، Java 21 |
| `npm run build` | PASS، Vite built in 4.08s |
| `npm run verify:build` | PASS |
| `npm run verify:firebase` | PASS |
| `npm run audit:links` | PASS، 13 HTML routes و302 رابط/أصل محلي |
| `npm run smoke` | PASS، 15 routes بعد تشغيل Vite preview في نفس شبكة الأمر |
| `npm run audit:performance` | PASS، 48 طلبًا، p95 محلي 8ms، error rate 0% |
| `npm audit --audit-level=high` | FAIL، 5 High |
| `npm --prefix functions audit --audit-level=high` | FAIL، 1 High |

المحاولة الأولى لـSmoke/Performance من أمر مستقل أعادت `ECONNREFUSED` لأن بيئة الأوامر تعزل localhost بين الجلسات. أُعيد الاختبار مع `vite preview` والاختبار داخل الأمر نفسه فنجح كلاهما. هذه الأرقام قياس لخادم Preview المحلي وليست Web Vitals في متصفح المستخدم.

## FILES CHANGED

- `V9_5_2_RUNTIME_VERIFICATION_AR.md` فقط. الملفات البرمجية وقواعد Firebase وملفات القفل لم تتغير مقارنة بأرشيف V9.5.1.

## BUGS FOUND / FIXES APPLIED

لم يُثبت Bug جديد في Business Logic، لذا **لا إصلاحات تطبيقية**. العوائق المرصودة: توقف Eventarc registration في المحاكي (`SocketError: other side closed`)، منع المتصفح من فتح localhost، وتحذيرات High في التبعيات. لم نغيّر Architecture أو App Check أو Firebase Security Rules للتحايل على بيئة الفحص.

## KNOWN LIMITATIONS

يتطلب اعتماد النقل الحقيقي بيئة يستطيع فيها Firestore/Functions/Eventarc إكمال startup، وبيئة متصفح يصل فعليًا إلى خادم التطوير مع هويات محاكي اختبارية ووسائط/موقع محاكى. تتطلب تحذيرات gRPC تقييم نسخة إصلاح مناسبة دون ترقية قسرية، ثم إعادة البوابات.

## READY FOR V10: NO

السبب: HTTP transport وBrowser QA غير متحققين، وتحذير High في التبعيات باقٍ. لم يحدث Deploy أو Push أو تعديل Production Data.
