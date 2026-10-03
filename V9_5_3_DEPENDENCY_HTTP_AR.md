# V9.5.3 — أمان التبعيات وإغلاق تحقيق محاكي HTTP

## الحكم

بدأت النسخة من `el-mezaen-runtime-verified-v9.5.2.zip`. **Dependency High/Critical: صفر** في شجرتي الواجهة وFunctions بعد تحديث الحزم. اختبارات الانحدار كلها نجحت. **HTTP Functions transport: NOT VERIFIED** لأن تسجيل Firestore/Eventarc trigger يوقف المحاكي قبل إرسال أول طلب. لم يحدث Deploy أو Push أو تعديل Production Data.

## DEPENDENCIES BEFORE/AFTER

| الحزمة | V9.5.2 | V9.5.3 | السبب |
| --- | --- | --- | --- |
| `firebase` | 12.16.0 | 12.19.0 | أحدث إصدار stable compatible في major 12 وقت الفحص |
| `@firebase/firestore` | 4.16.0 | 4.17.2 | تابع رسمي للإصدار الجديد |
| `firebase-admin` | 14.2.0 | 14.5.0 | تحديث رسمي ضمن major 14 |
| `firebase-functions` | 7.3.0 | 7.4.0 | تحديث رسمي ضمن major 7 |
| `@google-cloud/firestore` | 8.6.0 | 9.3.0 | حلّته `firebase-admin@14.5.0`، وليس تبعية مباشرة |
| `@grpc/grpc-js` في الواجهة | 1.9.16 | 1.14.5 | تحديث أمني عبر override مقيّد لـFirestore |
| `@grpc/grpc-js` في Functions | 1.14.4 | 1.14.5 | حلّته حزم Firebase Admin الرسمية بلا override جديد |

حاولت ترقية الحزم الرسمية أولًا. ظل `@firebase/firestore@4.17.2` يطلب `@grpc/grpc-js` بنطاق `~1.9.0`، لذا لم تتمكن ترقية `firebase` وحدها من إزالة النسخة المتأثرة. أُضيف في `package.json` override واحد فقط لـ`@firebase/firestore → @grpc/grpc-js@1.14.5`. لم تُضف تبعية مباشرة لـgRPC، ولم يُستخدم `npm audit fix --force`. تخطي النطاق الداخلي `~1.9.0` يحمل مخاطرة توافق نظرية؛ الاختبارات والبناء والمحاكيات المنفصلة نجحت، بينما HTTP transport بقي غير متحقق لأسباب المحاكي الموصوفة أدناه.

## GRPC VERSION TREE

بعد `npm ci` من ملفات القفل:

```text
root: firebase@12.19.0 → @firebase/firestore@4.17.2 → @grpc/grpc-js@1.14.5 overridden
functions: firebase-admin@14.5.0 → @google-cloud/firestore@9.3.0
  → google-gax@6.10.0 → @grpc/grpc-js@1.14.5
  → @google-cloud/firestore-api@0.2.0 → google-gax@5.0.8 → @grpc/grpc-js@1.14.5 deduped
```

لم تعد أي نسخة `1.9.16` أو `1.14.4` في شجرة `npm ls @grpc/grpc-js --all`.

## NPM AUDIT ROOT

`npm audit --audit-level=high`: exit 0، `found 0 vulnerabilities` بعد `npm ci`.

## NPM AUDIT FUNCTIONS

`npm --prefix functions audit --audit-level=high`: exit 0، `found 0 vulnerabilities` بعد `npm ci`.

## FIREBASE TOOLS VERSION

- Node المستخدم في المحاكي والاختبارات النهائية: `v22.23.3`، مطابق لـFunctions engine `22`. Node البيئة الافتراضي `v24.19.0`.
- Java: Temurin OpenJDK `21.0.12.1+1`. أُعيد استخراج JRE سليمة من أرشيف محلي بعد اكتشاف تلف نسخة scratch قديمة (`ClassFormatError` في `java/util/logging/LogRecord`)، دون تغيير التطبيق.
- `firebase-tools`: الإصدار stable الحالي المجرب `15.32.1`. النسخة السابقة `15.32.0` أظهرت فشل التسجيل نفسه.

## HTTP EMULATOR RESULT

شُغّل فعليًا مع `--debug`:

```text
firebase emulators:exec --project demo-el-mezaen-http --only auth,firestore,functions
```

مع تحقق مسبق داخل أمر الاختبار من وجود `FUNCTIONS_EMULATOR_HOST` و`FIRESTORE_EMULATOR_HOST` و`FIREBASE_AUTH_EMULATOR_HOST` وتطابق `GCLOUD_PROJECT` مع مشروع `demo-`. بدأت الخدمات ووُلدت عناوين الدوال، ثم فشل التسجيل قبل تشغيل الاختبار:

```text
POST http://127.0.0.1:8080/emulator/v1/projects/demo-el-mezaen-http/eventarcTrigger?eventarcTriggerId=europe-west1-notifyAdminsOnBooking-0
SocketError: other side closed
Error adding firestore function: Failed to make request .../eventarcTrigger
```

بالتالي **لم تُنفّذ** طلبات HTTP فعلية لمصادقة callable أو فشل الصلاحية أو branch denial أو refund أو POS أو booking أو tasks أو content. نجاح `handler.run()` ليس نجاح HTTP.

## EVENTARC ROOT CAUSE

لتمييز كود المشروع عن بيئة الأدوات، شُغّل مشروع محاكي مؤقت **خارج النسخة** بدالة v2 واحدة فقط: `onDocumentCreated('probes/{id}')` ودالة HTTP health. باستخدام `firebase-tools@15.32.1` وNode 22 وJava 21 السليمة ومشروع `demo-el-mezaen-http`، فشل تسجيل `europe-west1-noop-0` في طلب `eventarcTrigger` نفسه برسالة `SocketError: other side closed`.

الاستنتاج المدعوم: الفشل **قابل لإعادة الإنتاج دون كود El Mezaen**، ويقع في تفاعل Firestore/Eventarc emulator بهذه البيئة. لا يوجد دليل على خطأ في `notifyAdminsOnBooking` أو على تعارض port مثبت. سجل بدء Firestore طبيعي قبل طلب التسجيل، لكن سبب إغلاق socket الداخلي بالضبط غير محسوم؛ لا أدّعي إصلاحه أو جاهزية HTTP. لم تُعطّل trigger ولم تُغيّر Architecture لتوليد PASS مصطنع. التجربة الأولى قبل إعادة استخراج Java فشلت بسبب JRE scratch تالفة ولا تُستخدم دليلاً على السبب النهائي.

## FILES CHANGED

- `package.json`: تثبيت `firebase@12.19.0` وoverride مقيّد لـgRPC داخل Firestore.
- `package-lock.json`: حلّ التبعيات المعاد بناؤه (177 → 179 package entries؛ 50 تغيّر إصدار/إضافة/حذف).
- `functions/package.json`: تثبيت `firebase-admin@14.5.0` و`firebase-functions@7.4.0`.
- `functions/package-lock.json`: حلّ التبعيات المعاد بناؤه (298 → 266 package entries؛ 139 تغيّر إصدار/إضافة/حذف).
- `tests/v6-1-production-gate.emulator.mjs`: إزالة اختيار عشوائي لأول فاتورة POS في اختبار refund غير النقدي، والبحث صراحة عن فاتورة card مدفوعة. لا تغير في الاختبار المتوقع أو منطق التطبيق.
- هذا التقرير.

لا تعديلات في `functions/src/` أو `src/` أو Rules. Build ولّد تاريخًا جديدًا في `public/sitemap.xml` محليًا؛ أُعيد إلى baseline قبل الحزم.

## LOCKFILE CHANGES

أُنشئت ملفات القفل بواسطة `npm install` لإصدارات Firebase الرسمية أولًا، ثم root override المقيّد فقط. نجح `npm ci` لكلتا الحزمتين و`npm ls @grpc/grpc-js --all`. لم تُستخدم ترقيات Major مباشرة في `package.json`، على الرغم من تحديث التبعيات المتعدية بواسطة Firebase Admin.

## FULL REGRESSION

| الأمر | النتيجة |
| --- | --- |
| `npm test` | 188/188 PASS |
| `npm run test:functions` | 45/45 PASS |
| `npm run test:rules` | 18/18 PASS على `demo-el-mezaen-rules` وJava 21 |
| `npm run test:gate:handlers` | 43/43 PASS على `demo-el-mezaen-gate` وJava 21 |
| `npm run build` | PASS |
| `npm run verify:build` | PASS |
| `npm run verify:firebase` | PASS |
| `npm run audit:links` | PASS، 13 route و302 رابط/أصل |
| `npm run smoke` | PASS، 15 route على Preview محلي في نفس شبكة الأمر |
| `npm run audit:performance` | PASS، 48 طلبًا، p95 محلي 7ms، error rate صفر |
| `npm audit --audit-level=high` | PASS، صفر vulnerabilities |
| `npm --prefix functions audit --audit-level=high` | PASS، صفر vulnerabilities |

في أول تشغيل بعد ترقية SDK، فشل اختبارا Handler متتابعان لأن fixture اختار أول POS booking بلا ترتيب؛ إذا كانت نقدية يصبح `actualCash: 0` فرق درج يستلزم سببًا، وتظل الوردية مفتوحة للاختبار التالي. ثُبّت اختيار بطاقة مدفوعة كما يفترض سيناريو الاسترداد غير النقدي، ثم نجحت البوابة 43/43. هذا إصلاح حتمية اختبار فقط، وليس تغيير Business Logic.

## READY FOR BROWSER QA: NO

تنظيف التبعيات والتحقق من بوابات الكود مكتملان، لكن HTTP transport لم يبدأ بالكامل؛ لذلك لا يمكن إثبات تدفقات Browser المعتمدة على Functions في هذه البيئة. يحتاج الاختبار النهائي إلى بيئة تسمح بتسجيل Firestore v2 triggers وتصل منها جلسة المتصفح إلى التطبيق المحلي. لا Deploy ولا Push ولا Production Data.
