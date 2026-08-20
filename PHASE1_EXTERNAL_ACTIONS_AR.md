# خطوات خارجية مطلوبة قبل التشغيل الحقيقي

1. Firebase Authentication: فعّل Phone provider، أضف نطاق Firebase Hosting والنطاق المخصص إلى Authorized domains، وأضف أرقام اختبار فقط أثناء التجربة.
2. App Check: سجّل نطاق Hosting، اختبر التوكنات، ثم اضبط `ENFORCE_APP_CHECK=true` للدوال العامة بعد التأكد من عدم كسر الويب.
3. Secret Manager: أضف `WHATSAPP_ACCESS_TOKEN` و`WHATSAPP_PHONE_NUMBER_ID` عبر Firebase CLI. لا تضعهما في Git أو الواجهة.
4. Meta Business: اربط WABA والرقم والفوترة، واعتمد قالب شيك بخمسة متغيرات وقالب الحملة، ثم ضع اسم قالب الشيك في `settings/public.whatsappReceiptTemplate`.
5. Firestore settings: اترك `whatsappCampaignsEnabled=false` و`whatsappReceiptsEnabled=false` حتى نجاح اختبار allowlist. أضف `whatsappTestCustomerIds` ثم فعّل Test Mode فقط.
6. Firebase/GCP: فعّل Cloud Tasks، وانشر Functions وRules وIndexes وStorage Rules ثم Hosting إلى Staging أولًا.
7. اختبر Phone Auth وQR والكاميرا والـPOS والشيك والحملة التجريبية على أجهزة حقيقية، ثم غيّر DNS بعد نجاح Smoke/Routes مع إبقاء Vercel كمسار رجوع مؤقت.

أوامر النشر بعد تسجيل الدخول واختيار المشروع الصحيح:

```bash
firebase use el-mezaen-talkha
firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN
firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
firebase deploy --only functions,firestore:rules,firestore:indexes,storage
firebase deploy --only hosting
```
