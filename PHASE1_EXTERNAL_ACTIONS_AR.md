# إجراءات الإنتاج الخارجية المطلوبة

هذه الخطوات لم تُنفذ من السورس، ولا يجوز اعتبارها مكتملة قبل التحقق من الـConsole وبيئة Staging.

## ترتيب النشر الآمن

1. احفظ نسخة/Tag مستقرة من الإصدار الحالي، وسجّل Deployment ID الحالي في Vercel ونسخة Functions الحالية.
2. أنشئ أسرار Meta قبل نشر Functions:

```bash
firebase use el-mezaen-talkha
firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN
firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
firebase functions:secrets:set WHATSAPP_WEBHOOK_VERIFY_TOKEN
firebase functions:secrets:set WHATSAPP_APP_SECRET
```

3. اترك flags الآتية `false`: `loyaltyEnabled`, `walletRedemptionEnabled`, `whatsappCampaignsEnabled`, `cashDrawerEnabled`. فعّل كل ميزة منفردة بعد Smoke Test.
4. انشر Rules وIndexes أولًا وانتظر اكتمال بناء الفهارس، ثم Functions، ثم Vercel:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions
```

5. انشر ZIP/المستودع نفسه إلى Vercel Preview، نفّذ Smoke Test، ثم Promote إلى Production. لا تنفذ Hosting Migration.

## App Check

- تأكد أن Web App و`el-mezaen-talkha.vercel.app` وأي نطاق مخصص مسجلة في App Check/reCAPTCHA Enterprise.
- `enforceAppCheck` مفعّل افتراضيًا في Production داخل الكود؛ الـEmulator فقط هو الاستثناء الصريح.
- اختبر Catalog والحجز وتسجيل الدخول وPOS من Preview قبل Promote. الطلب بدون/بتوكن غير صالح يجب أن يُرفض.

## Firestore TTL

فعّل TTL على حقل `expiresAt` فقط للمجموعات المؤقتة التالية، ولا تفعّله لأي سجل أعمال:

`rateLimits`, `requestGuards`, `rescheduleGuards`, `refundGuards`, `voidGuards`, `campaignGuards`, `qrRotationGuards`, `appointmentLocks`, `bookingGuards`.

مثال لكل collection group:

```bash
gcloud firestore fields ttls update expiresAt --collection-group=rateLimits --enable-ttl
gcloud firestore fields ttls list
```

## Backup / Disaster Recovery

- `BUSINESS APPROVAL REQUIRED`: اعتمد RPO/RTO والاحتفاظ والتكلفة. اقتراح مبدئي: RPO يوم واحد، RTO أربع ساعات، Daily Backup باحتفاظ 14 أسبوعًا.
- يتطلب Blaze وصلاحيات Backup Admin/Restore Admin.

```bash
firebase firestore:backups:schedules:create --database '(default)' --recurrence DAILY --retention 14w
firebase firestore:backups:schedules:list --database '(default)'
```

- اختبر Restore إلى قاعدة بيانات غير إنتاجية جديدة، ثم تحقق من عينات: bookings/customers/orders/revenue/expenses/inventory/wallet/cash/activity/settings. الـRestore لا يعيد TTL policies، لذلك أعد فحصها بعد الاستعادة.

## Meta WhatsApp Business Cloud API

- اربط WABA ورقم العمل والفوترة، واعتمد قالب شيك عربي وقوالب العروض.
- الإرسال الحالي يدوي: زر الشيك يشارك نفس صورة PNG المستخدمة في الطباعة، وزر «إرسال للعملاء يدويًا» داخل العرض يجهز نص العرض ويحمل العملاء على دفعات ويفتح محادثة تلو الأخرى للمراجعة والإرسال. لا يحتاج ذلك Cloud API أو وسيلة دفع، ولا يدّعي النظام وصول الرسالة لأنه لا يملك Webhook بدون Meta.
- التكامل الآلي يظل مغلقًا بالـFeature Flags. عند تفعيله لاحقًا، اعتمد قالب شيك `Utility` وقوالب عروض `Marketing` واختبرهما على أرقام مسموحة فقط.
- اضبط Meta Webhook على Function `whatsappWebhook`. الكود يتحقق من `X-Hub-Signature-256` ويحدّث حالات `sent/delivered/read/failed`؛ تسجيل Callback URL وVerify Token والاشتراك في أحداث الرسائل يحتاج Meta Business Manager.
- الـopt-out يحتاج قالب/سياسة تشغيل معتمدة وربط الحدث بحقل `whatsappOptIn=false`؛ لا تعتبره مفعّلًا قبل اختبار مسار الموافقة والإلغاء مع Meta.
- ابدأ بـ`whatsappCampaignsEnabled=false` و`whatsappReceiptsEnabled=false`، وأضف allowlist في `whatsappTestCustomerIds`، ثم اختبر Test Mode فقط. لا ترسل حملة حقيقية أثناء الاختبار.
- بعد نجاح القالب والـWebhook فعّل الشيك أولًا، ثم حملة صغيرة، ثم Bulk. Kill switch يظل متاحًا من Settings.

## Monitoring

- أنشئ Cloud Monitoring alerts لـ5xx، Function error count، p95 latency، Cloud Tasks failures، Firestore reads/writes، App Check rejection spike، وBudget alert.
- أنشئ Log-based metrics للأحداث: `pos_finalize`, booking failure, refund, inventory, cash, wallet, WhatsApp.
- لا تسجل رقم الهاتف أو QR أو محتوى الرسالة في Logs.

## Smoke Test بعد النشر

1. Health endpoint يعيد `ready=true` والإصدار المتوقع دون أسرار.
2. حجز صالح، duplicate request، نفس slot بطلبين، إعادة جدولة وإجازة عامل.
3. شيك متعدد العمال، double-click حفظ وطباعة، إعادة طباعة، ومخزون غير كافٍ.
4. فتح وردية، نقدي، cash in/out، refund، إغلاق وردية ويوم.
5. QR صحيح/قديم ملغي، Wallet/Rewards بعد `completed + paid` فقط.
6. WhatsApp receipt لحساب اختبار، ثم pause/resume/cancel لحملة Test Mode.

## Rollback

- Vercel: اعمل Promote للـDeployment المستقر السابق.
- Functions: أعد نشر الـTag/ZIP المستقر السابق. التغييرات الجديدة Additive ومتوافقة مع السجلات القديمة.
- لا تحذف Collections/Indexes الجديدة أثناء Rollback. أوقف الميزات فورًا بالـflags قبل أي رجوع.
- بعد الرجوع: اختبر Health، الحجز، POS، Revenue، Inventory وCash Drawer.
