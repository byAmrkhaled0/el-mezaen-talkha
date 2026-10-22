# تشغيل وتسليم المزين من VS Code — 21 أكتوبر 2026

## حدود النسخة

المصدر الحالي مرشح للتسليم بعد اختبارات محلية، وليس إقرارًا بأن الإنتاج محدث. لم ننفذ Push أو Deploy أو نغير بيانات العميل. اختلافات الباك إند أدناه مقارنة بـ EL_MEZAEN_SERVICE_OPERATIONS_CLOSURE_SOURCE.zip؛ قائمة إنتاج Firebase لم تُقرأ بعد. سجل الوظائف المحلية موجود في qa/delivery-functions-inventory.json ويضم 117 وظيفة، ولا يعني أن كلها تحتاج إعادة نشر.

## 1. التشغيل المحلي

افتح مجلد el-mezaen في VS Code بعد فك ZIP في مجلد جديد. Node22 وJava21 مطلوبان. أدوات التشغيل الحالية تعتمد على D:\ELMEZAEN-QA\input\runtime الموجود على جهاز عمرو؛ ZIP لا يحتوي الأدوات أو node_modules.

```powershell
npm ci
npm --prefix functions ci
powershell.exe -NoProfile -File .\qa-only\run-release-check.ps1 -Mode Backend
```

اترك نافذة Backend مفتوحة. بعد All emulators ready، في Terminal ثانية:

```powershell
# على قاعدة demo جديدة فارغة فقط، مرة واحدة:
powershell.exe -NoProfile -File .\qa-only\run-release-check.ps1 -Mode Seed
powershell.exe -NoProfile -File .\qa-only\run-release-check.ps1 -Mode Web
```

افتح http://127.0.0.1:4193/ . المحاكيات Auth9094/Functions5501/Firestore8084/Storage9194. إذا المنافذ مشغولة، افحص العملية والمصدر؛ لا توقف كل Node/Java ولا تكرر Seed. لا تستخدم Live Server.

حسابات اصطناعية للـdemo فقط: journey-admin@qa.example.test وjourney-cashier@qa.example.test، وفي دخول العامل journey-worker. كلمة المرور QaOnly-2026-Test! . لا تزرع هذه الحسابات أو البيانات في الإنتاج.

## 2. إعادة الاختبارات

في Terminal اختبار مستقلة، من مجلد المشروع:

```powershell
npm test
npm run test:functions
npm run build
npm run verify:build
npm run audit:links
npm run verify:firebase
powershell.exe -NoProfile -File .\qa-only\run-delivery-gates.ps1 -Suite All
```

اختبارات الصور تحتاج Python مع Pillow وlxml؛ المشغّل الحالي يضبط Python من أدوات QA إن وجد. يمكن ضبط PYTHON وQA_PYTHON على Python الصحيح قبل npm test عند الحاجة. اختبارات المحاكيات تستعمل demo فقط ومنافذ 9097/8087/9167/9197/4414/4514؛ لا تشغل نسختين منها معًا. ملفات السجلات في qa/delivery-*.log. اختبار baseline-race القديم مخصص لإعادة إنتاج خلل النسخة القديمة وليس اختبار قبول للمصدر الحالي، لذلك ليس ضمن بوابة التسليم.

## 3. قبل أي نشر: Terminal جديدة كليًا

لا تستخدم Terminal شُغلت فيها محاكيات QA للنشر. متغيرات المحاكيات تغير تعريف App Check وربط الأسرار أثناء اكتشاف Functions. افتح Terminal جديدة ثم:

```powershell
powershell.exe -NoProfile -File .\scripts\check-deploy-terminal.ps1
firebase --version
firebase login
firebase functions:list --project el-mezaen-talkha
firebase firestore:indexes --project el-mezaen-talkha
```

هذه أوامر دخول وقراءة؛ فحص Terminal نفسه محلي فقط. إذا firebase غير مثبت، ثبّت Firebase CLI حسب دليل Firebase الرسمي قبل المتابعة. احتفظ بنتائج القوائم لمقارنتها بالمصدر. لا تغيّر projectId في الفرونت ولا تنسخ firebase.*.qa.json للإنتاج.

## 4. الوظائف الجديدة والمعدلة

الجديد مقارنة بالنسخة479:

- getBranchWorkRequests: قراءة طلبات الفرع مع النطاق والتصفح.
- submitBranchWorkRequest: إنشاء طلب من الحساب المخول بالفرع دون إجراء مالي ضمني.
- updateBranchWorkRequest: مراجعة الطلب بإصدار متوقع وصلاحيات الأدمن.

المعدل: createPosOrder لتسجيل هوية الكاشير وتاريخ الإنشاء؛ getCashierSnapshot لقراءة الحجوزات القديمة بتواريخ الحجز المحدودة. المنطقة europe-west1.

بعد مراجعة القائمة المنشورة واعتماد النطاق، أمر رفع هذه الخمس فقط:

```powershell
firebase deploy --only "functions:getBranchWorkRequests,functions:submitBranchWorkRequest,functions:updateBranchWorkRequest,functions:createPosOrder,functions:getCashierSnapshot" --project el-mezaen-talkha
```

هذا الأمر جاهز للتنفيذ بواسطة المالك؛ لم يُنفذ. إذا إنتاجك أقدم من baseline، قد تحتاج وظائف إضافية للورديات/التارجت/العمال/الإجازات/السلف؛ لا يمكن تحديدها بأمان دون قائمة الإنتاج. ننشر أسماء محددة على دفعات بحد أقصى10، ولا نستعمل --force أو functions:delete أو نشر functions العام الذي قد يعرض حذف وظائف بعيدة غير موجودة بالمصدر. لا توجد حاجة لترحيل بيانات أو backfill في الفروق المذكورة.

## 5. Firestore Indexes وRules

Index واحد مضاف، ولا index محذوف مقارنة بالنسخة479:

- Collection group: branchWorkRequests، Query scope: Collection.
- branchId ASC، group ASC، createdAt DESC.

محاكي Firestore لا يثبت أن index الإنتاج موجود. قارن قائمة الإنتاج بالملف firestore.indexes.json وادمج أي indexes إضافية موجودة بالإنتاج قبل نشر القائمة. بعدها فقط:

```powershell
firebase deploy --only firestore:indexes --project el-mezaen-talkha
```

لا توافق على حذف أي index؛ أوقف النشر إذا ظهر طلب حذف. انتظر حالة Enabled للـindex قبل اختبار طلبات الفرع. Firestore/Storage Rules لم تتغير مقارنة بالنسخة479؛ لا أمر نشر Rules مطلوب لهذه الفروق. اختبارات Rules المحلية لا تعني أن نسخة Rules المنشورة مطابقة تلقائيًا.

## 6. الموديل الحي

لا يوجد مفتاح API حاليًا، لذلك المؤكد هو التحليل المحلي والبديل الصريح فقط. لا نضع مفتاحًا في Vite أو الشات. عند توفير مفتاح خاص بالمشروع وحساب مفعل:

```powershell
firebase functions:secrets:set AI_AGENT_API_KEY --project el-mezaen-talkha
firebase deploy --only "functions:customerAiAgent,functions:adminBusinessAssistant" --project el-mezaen-talkha
```

الأوامر تُدخل السر من Terminal وتربطه بالوظيفتين. تفعيل settings/public.aiAgentEnabled وإعدادات المساعد الإداري قرار منفصل على بيانات الإنتاج بعد مراجعة الميزانية وحدود الاستخدام؛ لم نفعّله. اختبارات اللغة الحالية تستعمل provider وهمي، ولا تُحسب تجربة موديل حي. أسرار WhatsApp منفصلة، ولا تعالجها أوامر AI. الوظائف التي تحتاج أسرارًا موثقة بقائمة الوظائف المحلية.

## 7. الفرونت على Vercel

بعد تحديث الباك إند واعتماد النسخة، اربط مجلد المشروع الصحيح بمشروع Vercel الموجود. Build command: npm run build، Output directory: dist، Root directory هو مجلد package.json الحالي. للإصدار المعتمد من Terminal نظيفة، بعد تحقق الربط الصحيح:

```powershell
npm run build
npm run verify:build
npm run audit:links
vercel link
vercel --prod
```

اختيار مشروع Vercel القائم el-mezaen-talkha مسؤولية المالك؛ لا تنشئ مشروعًا بديلًا بالخطأ. لم ننفذ الربط أو النشر. أصلحنا /about/ ومسار /booking/ وحماية كاش CSS/JS في المصدر. الرابط المنشور القديم لا يأخذ هذه الإصلاحات إلا بعد نشره. لا يوجد أمر Firebase Hosting مطلوب إذا الاستضافة المعتمدة Vercel.

## 8. قبول الإنتاج بعد النشر

يُجرى بتفويض وبحسابات العميل الصحيحة: فتح الرئيسية والخدمات والباقات والنتائج وعن المزين والحجز؛ فحص CSS/JS من نافذة خاصة؛ دخول أدمن وكاشير وعامل وفحص منع الفرع الآخر؛ رحلة حجز/إلغاء/تحصيل/إيصال مصرح بها مع تسوية العملية وتوثيقها؛ فحص حفظ/قفل أهداف الشهر؛ طلب فرع؛ قراءة سجلات Functions للأخطاء. لا تستخدم Seed أو حسابات QA أو اختبارات emulators على المشروع الحقيقي.

ما يحتاج اختبارًا فعليًا مستقلًا: App Check وOTP ومحتوى/أسعار/حسابات العميل، إرسال صورة إيصال WhatsApp تلقائيًا عبر Meta إن كان مطلوبًا، Push على جهاز موبايل، GPS على جهاز حقيقي، والموديل الحي بعد السر. المتاح حاليًا تجهيز/مشاركة الإيصال وفتح واتساب للرقم الصحيح؛ لا ندعي إرسال الصورة آليًا فعليًا.

## مراجع أوامر Firebase

- [نشر وظائف محددة وإدارة الحذف](https://firebase.google.com/docs/functions/manage-functions)
- [إدارة الأسرار وربطها بالوظائف](https://firebase.google.com/docs/functions/config-env)
- [إدارة Firestore indexes](https://firebase.google.com/docs/firestore/query-data/indexing)
