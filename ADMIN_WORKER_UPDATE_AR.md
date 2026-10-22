# تحديث الإدارة وحسابات العمال — 22 أكتوبر 2026

## حالة النسخة
تعديل محلي، لم يتم Push أو Deploy أو إنشاء حسابات على الإنتاج. الـ300 حساب في الاختبار بيانات مصطنعة على المحاكيات فقط.

## الاستخدام
من الأدمن أو الكاشير: «العمال والتوفر» ← افتح «حسابات دخول العمال» ← اختار الفرع والعامل المسجل، واكتب اسم مستخدم وباسورد مؤقت وكلمة مرور حسابك للتأكيد. سلّم العامل رابط /login/?mode=worker واسم المستخدم والباسورد المؤقت بشكل خاص. الباسورد لا يُحفظ في Firestore ولا يظهر في سجلات النشاط، والعامل يغيّره أول مرة.

الأدمن يقدر يربط العمال في الفرعين. الكاشير يقدر يعمل حساب عامل في نطاق فروعه فقط. العامل المشترك بين فرعين لا ينشئ حسابه كاشير عنده صلاحية فرع واحد؛ ينشئه الأدمن أو كاشير مصرح للفرعين. لا يستطيع الكاشير إنشاء أدمن أو كاشير أو مدير، أو تغيير فروع سجل العامل من هذه الشاشة. سجّل بيانات العامل أولًا من قسم فريق العمل بحساب الأدمن. إنشاء حسابات الكاشير والمدير يفضل من الأدمن فقط.

قائمة الاختيار تتعرض على دفعات 50، ولا تحمل 300 نموذج مرة واحدة. اختبار السعة أنشأ 300 حساب بالتبادل بين الأدمن والكاشير، وليس اختبار 300 مستخدم متزامن. جدول التوفر يدعم حتى 500 عامل في الفرع بدل 200؛ بعد ذلك يرفض العرض بوضوح بدل إخفاء نتائج.

## الأخطاء التي تم تشخيصها مباشرة
- getMonthlyTargetProgress، getTargetAchievementNotifications، getWorkerServiceSessions، getWorkerAvailability، getWorkerLeaderboard، getCashHandover: استجابة OPTIONS كانت 404 دون CORS. هذه الوظائف غير متاحة على روابط الإنتاج المختبرة، وليست مشكلة CSS أو مبررًا لتعطيل الحماية.
- getOwnerMobileHistory: CORS سليم (204)، وسجلات Firebase أكدت FAILED_PRECONDITION بسبب Index لاستعلام sum(amount). أضيف 34 تعريفًا لاستعلامات إجمالي المبيعات والمصروفات مع مجموعات الفلاتر المدعومة؛ التعريفات تحتاج رفع وانتظار البناء.
- notifyWorker: CORS سليم (204). سبب استجابة 400 الواردة في لقطة المستخدم لم يثبت من السجلات المتاحة. لا تعتبره مُصلحًا قبل إعادة تجربته على النسخة المنشورة ومراجعة رسالة الاستجابة.
- الواجهة أصبحت تجمع القراءات المتطابقة المتزامنة، وتوقف تكرار أخطاء البنية التحتية لنفس الوظيفة والحساب 45 ثانية. لا تحفظ نتائج مالية أو تعيد عمليات كتابة تلقائيًا.
- أزرار إدارة المحتوى تستخدم ألوان اللوحة، والوضع الليلي، وأحجام لمس مناسبة بدل تنسيق المتصفح الافتراضي.

## التشغيل المحلي العادي
```powershell
npm ci
npm --prefix functions ci
npm run build
npm run verify:build
npm run preview -- --host 127.0.0.1 --port 4200 --strictPort
```
افتح http://127.0.0.1:4200/ . هذه المعاينة متصلة بإعدادات المشروع الحقيقي؛ حسابات QA لا تعمل فيها.

## تجربة حسابات QA (محلي فقط)
سكربت QA المرفق يعتمد على مسارات بيئة D:\ELMEZAEN-QA السابقة. لو البيئة متاحة عندك، افتح ثلاثة Terminals داخل el-mezaen:

Terminal 1:
```powershell
powershell.exe -NoProfile -File .\qa-only\run-release-check.ps1 -Mode Backend
```
بعد ظهور All emulators ready، Terminal 2 (مرة واحدة على بيانات محاكي جديدة؛ لا تعيد Seed فوق بيانات الاختبار):
```powershell
powershell.exe -NoProfile -File .\qa-only\run-release-check.ps1 -Mode Seed
```
Terminal 3:
```powershell
powershell.exe -NoProfile -File .\qa-only\run-release-check.ps1 -Mode Web -Port 4203
```
افتح http://127.0.0.1:4203/login/ . حسابا المحاكي: journey-admin@qa.example.test وjourney-cashier@qa.example.test، والباسورد المشترك QaOnly-2026-Test! . لا تستخدمهما على الإنتاج.

اختبار 300 حساب (محاكيات مستقلة على 9097 و8087):
```powershell
powershell.exe -NoProfile -File .\qa-only\run-delivery-gates.ps1 -Suite WorkerAccounts
```

## أوامر الرفع اليدوي من VS Code
افتح Terminal جديد بعيد عن QA، واستخدم Node 22. لم يتم تنفيذ هذه الأوامر على الإنتاج:
```powershell
powershell.exe -NoProfile -File .\scripts\check-deploy-terminal.ps1
firebase login
firebase deploy --project el-mezaen-talkha --only firestore:indexes
```
لو ظهر اقتراح حذف Index أوقف الأمر؛ لا توافق على حذف ولا تستخدم --force. انتظر الـIndexes المطلوبة حتى READY في Console.

ثم وظائف الحساب والعمليات المذكورة في الأخطاء:
```powershell
firebase deploy --project el-mezaen-talkha --only "functions:listBranchWorkerAccounts,functions:createBranchWorkerAccount,functions:createAdminUser,functions:getWorkerWorkspace,functions:changeWorkerPassword,functions:getMonthlyTargetProgress,functions:setWorkerMonthlyTarget,functions:getTargetAchievementNotifications,functions:markTargetAchievementNotificationsRead,functions:getWorkerAvailability,functions:setWorkerAvailability,functions:cancelWorkerAvailability,functions:getWorkerServiceSessions,functions:startWorkerService,functions:extendWorkerService,functions:finishWorkerService,functions:getWorkerLeaderboard,functions:getCashHandover,functions:acceptCashHandover,functions:resolveCashHandover,functions:getCashHandoverHistory,functions:getOwnerMobileHistory,functions:notifyWorker"
```
لو تعديل تسجيل العميل السابق لم يترفع:
```powershell
firebase deploy --project el-mezaen-talkha --only "functions:saveCustomerProfile,functions:getCustomerPortal"
```
ارفع الواجهة المطابقة بعد نجاح رفع الوظائف. هذه أوامر نطاق التعديل وليست دليل إغلاق فجوة النشر القديمة بالكامل. لا تشغل حذف وظائف، ولا تغيّر App Check أو reCAPTCHA لتجاوز الخطأ.

## الاختبارات المؤكدة
- 766/766 اختبارات المشروع؛ 143/143 اختبارات Functions.
- 8/8 اختبارات إنشاء وربط ودخول العمال على المحاكيات: 300 حساب، عرض بالصفحات، رفض الفروع غير المصرح بها والأدوار المحقونة، رفض الحساب المعطل والجلسة القديمة، منع الربط المزدوج بالتوازي، دخول وتغيير أول باسورد، ومساحة العامل لا تقبل اختيار هوية عامل آخر.
- البناء وفحص CSS والمسارات والروابط نجح؛ 19 صفحة و641 رابطًا وملفًا محليًا.
- اختبار المتصفح اكتمل: الكاشير أنشأ حساب عامل محلي بنجاح، والقائمة منعت إعادة إنشاء حساب لنفس العامل، وConsole لم يسجل أخطاء. نموذج الحساب اتراجع بمقاس 390 بكسل بالوضعين النهاري والليلي: الحقول 44 بكسل وزر الإنشاء 48 بكسل، بدون خروج حقول النموذج عن الشاشة.
- ما زال مطلوبًا اختبار النشر الحقيقي وOTP الحقيقي والتوصيل الفعلي لإشعارات الموبايل.

## اختبار التسليم بعد الرفع
1. الأدمن ينشئ سجل عامل ويربط له حسابًا؛ جرّب أيضًا إنشاء كاشير من مركز حسابات الأدمن.
2. الكاشير ينشئ حساب عامل من الفرع المصرح له؛ الفرع الآخر غير متاح.
3. العامل يدخل ويغيّر الباسورد المؤقت ثم يسجّل الدخول مجددًا، ويشوف بياناته وحجوزاته ومهامه وإشعاراته والتارجت الخاص به.
4. جرّب إشعار العامل وسجل العمليات والمصروفات والتارجت، وسجّل رسالة الاستجابة لأي 400 متبقٍ بدون نشر بيانات عملاء أو أسرار.
