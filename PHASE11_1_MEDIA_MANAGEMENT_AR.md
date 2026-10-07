# إدارة الوسائط

| المجال | الإدارة | التخزين |
|---|---|---|
| الخدمات | صورة الخدمة: imageUrl + upload | public/services/ عبر pipeline القائمة |
| الباقات | إدارة الصور القائمة محفوظة | المسار الآمن الحالي |
| الفروع | imageUrl + upload في محرر الفرع الحالي | public/branches/ |
| Hero | إعداد heroImageUrl + upload | public/homepage/ |
| Hair Systems الرئيسي | إعداد hairSystemImageUrl + upload | public/homepage/ |
| العامل | profile photo upload الحالي | canonical staff/{staffId} مع نموذج الملكية الحالي |

Admin فقط يغيّر الوسائط الجديدة؛ الخادم يقبل URL جديدًا من bucket ومسار public المُدار الموافق للنوع، ويرفض forged/arbitrary URLs. URL قديم غير متغير يبقى متوافقًا، والقيمة الفارغة تعيد الافتراضي. upload pipeline الحالية تفحص النوع والحجم وتضغط الصورة؛ قواعد Storage لم تُخفف. لا اختيار client-authoritative لفروع أو دور أو staffId.

أُنشئت عشرة صور فعلية: hero، haircut، beard، skin، styling، hair-system، package، tools، interior، booking. لكل منها WebP 640 و1280 مع srcset حيث يلائم. لا نصوص أو علامات مزيفة داخل الصور؛ صورة كل فئة مختلفة. الصور التسويقية ليست نتائج عمل أو فروعًا أو فريقًا حقيقيًا. العمال يعتمدون على صورهم أو placeholder برند. صورة الفرع الافتراضية تحمل تنويه صورة تعبيرية. PHASE11_1_GENERATED_ASSETS.json يسجل الملفات. لم ينشأ manifest بوابة صور ناقصة لأن التوليد تم فعليًا.

الأسعار والخصومات من البيانات، لا من الصورة أو المساعد؛ safeMediaUrl يعيد null للمدخل الفارغ بدل URL الصفحة. custom uploaded image يتقدم على التسويق الافتراضي. التخزين والـ Rules والـ Auth لم تغير سلطاتها.

لا رفع إلى Storage الإنتاج ولا تبديل صورة إنتاج في هذه المرحلة. التجربة الحية للرفع بعد موافقة النشر يجب أن تستخدم حساب Admin معتمدًا، واختبار رفض Manager/Worker/URL مزور.
