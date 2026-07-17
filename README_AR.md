# مزين مصر – فرعا طلخا والمشاية

نسخة Firebase-first مطورة من المشروع الأصلي، وتضم اختيار الفرع قبل الحجز، موقع الحجز، لوحة الإدارة، Cloud Functions، قواعد Firestore وStorage، PWA وSEO. بقي مجلد `worker/` الأصلي داخل السورس كمرجع للترحيل، لكنه لا يدخل في نسخة Firebase المبنية داخل `dist/`.

## المتطلبات

- Node.js 22.
- Java 21 فقط عند تشغيل Firebase Emulator.
- مشروع Firebase بخطة مناسبة لتشغيل Cloud Functions من الجيل الثاني.
- حساب خدمة محلي للزرع/الترحيل، أو Application Default Credentials.

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

## زرع البيانات الأصلية

الزرع يستخدم `merge` ولا يحذف أي مستند موجود:

```bash
FIREBASE_PROJECT_ID=YOUR_PROJECT_ID npm run seed
```

على Windows PowerShell:

```powershell
$env:FIREBASE_PROJECT_ID="YOUR_PROJECT_ID"
npm run seed
```

البيانات المزروعة: فرعا طلخا والمشاية، 12 تصنيفًا، 82 خدمة/منتجًا، 6 باقات، 21 عضو فريق، كوبون `WELCOME10` الموجود في السورس الأصلي، ومحتوى الصور والإعدادات. يجب تنفيذ الزرع بعد نشر الدوال أو قبل أول حجز حتى تستطيع الدالة التحقق من الفرع.

## إدارة الفرعين

- يختار العميل الفرع قبل فتح خطوات الحجز، ويظهر الفرع في الملخص وكود الحجز ولوحة الإدارة والتقارير.
- المواعيد والأقفال والإجازات والموظفون والخدمات والعروض والكوبونات قابلة للتخصيص لكل فرع.
- من لوحة الإدارة افتح «الفروع والتواصل» لتعديل العنوان والهاتف وواتساب والخرائط والسوشيال وساعات العمل.
- بيانات طلخا والمشاية موجودة كبداية، لكن راجعها مع المالك قبل النشر النهائي.

## إنشاء أول مدير بدون حفظ كلمة المرور في السورس

أنشئ المستخدم أولًا من Firebase Authentication، ثم نفّذ:

```bash
FIREBASE_PROJECT_ID=YOUR_PROJECT_ID npm run create-admin -- --email owner@example.com --role admin
```

الأدوار المدعومة:

- `admin`: تحكم كامل وإدارة الصلاحيات.
- `manager`: إدارة المحتوى والخدمات والحجوزات والدفع.
- `receptionist`: تأكيد/رفض/إلغاء/إكمال الحجوزات، بدون تسجيل الدفع.
- `accountant`: تسجيل الدفع والاسترداد، بدون تغيير حالة الحجز التشغيلية.

بعد تعديل الدور يجب على المستخدم تسجيل الخروج والدخول مجددًا لتحديث الـToken.

## الاختبار

```bash
npm test
npm run test:functions
npm run build
npm run verify:build
```

اختبار Firebase Emulator الكامل:

```bash
npm run test:emulator
```

يختبر: تحميل الكتالوج، كوبون الخصم، التسعير من الخادم، إنشاء الحجز، منع الحجز المطابق، فصل أقفال المواعيد بين الفرعين، وحجز المنتجات من دون موعد. يحتاج Java 21 وقد يحتاج أول تشغيل لتنزيل Firestore Emulator.

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
npx firebase login
npx firebase use --add
npx firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting
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

## ترحيل Cloudflare D1 دون حذف البيانات

السورس الأصلي يستخدم Cloudflare Worker/D1. صدّر الجداول إلى ملف JSON بالشكل التالي: `services`, `packages`, `staff`, `bookings`، ثم:

```bash
FIREBASE_PROJECT_ID=YOUR_PROJECT_ID node scripts/migrate-d1-export.mjs d1-export.json
```

الترحيل يعمل بـ`merge` ولا يحذف بيانات Firestore. خذ نسخة احتياطية من D1 ومن Firestore قبل التشغيل، وراجع عدد السجلات بعده.

## ملاحظات تشغيلية

- إرسال حالة الحجز عبر واتساب متاح من زر داخل كل حجز برسالة جاهزة. الإرسال الآلي الكامل يحتاج WhatsApp Business Cloud API وبياناته من المالك.
- إشعارات المتصفح تعمل بصريًا وصوتيًا من اللوحة، وFCM يحتاج VAPID Key وإذن المستخدم.
- الصور المرفوعة مقصورة على JPEG/PNG/WebP/AVIF وأقل من 5MB.
- جميع أسعار الحجز النهائية والخصومات وتعارض المواعيد تُراجع داخل Cloud Functions، ولا تُقبل أسعار من المتصفح.
- لوحة الإدارة محظورة في `robots.txt` و`X-Robots-Tag` وMeta Robots.
