# مزين مصر – فرعا طلخا والمشاية

نسخة Firebase-first نظيفة تضم اختيار الفرع والحجز ولوحة الإدارة وCloud Functions وقواعد Firestore وStorage وPWA وSEO. أزيلت منها نسخة Cloudflare Worker القديمة والأصول المكررة وأدوات الترحيل غير المستخدمة.

## المتطلبات

- Node.js 22.
- مشروع Firebase بخطة مناسبة لتشغيل Cloud Functions من الجيل الثاني.
- Firebase CLI مثبت عالميًا للنشر: `npm install -g firebase-tools`.

## التشغيل المحلي للواجهة

```bash
npm install
npm --prefix functions install
npm run dev
```

عند عدم إضافة إعدادات Firebase، يعرض الموقع البيانات الأصلية المرفقة في وضع معاينة محلية. الحجز في هذا الوضع يُحفظ في `localStorage` ويظهر بكود يبدأ بـ `MZ-PREVIEW` ولا يصل إلى لوحة الإدارة. هذه الحماية تمنع إظهار نجاح إنتاجي زائف قبل الربط.

## إعداد Firebase

1. أنشئ مشروعًا من Firebase Console.
2. فعّل Authentication ثم Email/Password.
3. أنشئ Firestore وStorage.
4. أنشئ Web App وانسخ بياناته إلى `public/firebase-config.js`.
5. انسخ `.firebaserc.example` إلى `.firebaserc` وضع Project ID الحقيقي.
6. إن أردت إشعارات FCM، أنشئ Web Push certificate وضع الـVAPID Key في `window.__VAPID_KEY__` داخل `public/firebase-config.js`.
7. اترك `window.__USE_EMULATORS__ = false` في الإنتاج.

إعداد Firebase Web ليس كلمة مرور؛ قواعد الأمان والصلاحيات والدوال هي التي تمنع الوصول. لا تضع Service Account أو أي مفتاح سري داخل `public/`.

## إدارة الفرعين

- يختار العميل الفرع قبل فتح خطوات الحجز، ويظهر الفرع في الملخص وكود الحجز ولوحة الإدارة والتقارير.
- المواعيد والأقفال والإجازات والموظفون والخدمات والعروض والكوبونات قابلة للتخصيص لكل فرع.
- من لوحة الإدارة افتح «الفروع والتواصل» لتعديل العنوان والهاتف وواتساب والخرائط والسوشيال وساعات العمل.
- بيانات طلخا والمشاية موجودة كبداية، لكن راجعها مع المالك قبل النشر النهائي.

## حسابات العاملين

الأدمن ينشئ المدير والكاشير من «حسابات العاملين والصلاحيات»، ويحدد الفروع والأقسام المسموح بها. حذف حساب العامل يتطلب إعادة إدخال باسورد الأدمن، ويحذف Authentication والصلاحيات وPush Tokens ويسجل العملية في Activity Logs.

## الاختبار

```bash
npm test
npm run test:functions
npm run build
npm run verify:build
```

## البناء وSEO

استخدم رابط الإنتاج الحقيقي حتى تُولد Canonical وOpen Graph وsitemap وrobots بصورة صحيحة:

```bash
SITE_URL=https://your-domain.com npm run build
```

على PowerShell:

```powershell
$env:SITE_URL="https://your-domain.com"
npm run build
```

## النشر – بعد موافقة المالك فقط

لم يتم تنفيذ أي نشر من هذه النسخة. بعد مراجعة المشروع محليًا:

```bash
firebase login
firebase use el-mezaen-talkha
firebase deploy --only functions,firestore:rules,firestore:indexes,storage
```

بعد النشر:

1. اختبر حجزًا حقيقيًا من الموقع.
2. تأكد من وصوله إلى لوحة الإدارة.
3. سجّل الدفع مرة ثم أعد الضغط للتأكد من idempotency.
4. اختبر الاسترداد.
5. اختبر تعارض نفس العامل والموعد.
6. اختبر كوبونًا منتهيًا وحد الاستخدام لكل هاتف.
7. راجع Console وNetwork وFirebase Logs.
8. فعّل App Check للدوال العامة بعد تسجيل النطاقات والتأكد من عدم كسر iPhone/Android.

## ملاحظات تشغيلية

- إرسال حالة الحجز عبر واتساب متاح من زر داخل كل حجز برسالة جاهزة. الإرسال الآلي الكامل يحتاج WhatsApp Business Cloud API وبياناته من المالك.
- إشعارات المتصفح تعمل بصريًا وصوتيًا من اللوحة، وFCM يحتاج VAPID Key وإذن المستخدم.
- الصور المرفوعة مقصورة على JPEG/PNG/WebP/AVIF وأقل من 5MB.
- جميع أسعار الحجز النهائية والخصومات وتعارض المواعيد تُراجع داخل Cloud Functions، ولا تُقبل أسعار من المتصفح.
- لوحة الإدارة محظورة في `robots.txt` و`X-Robots-Tag` وMeta Robots.
