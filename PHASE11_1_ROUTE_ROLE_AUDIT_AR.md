# تدقيق المسارات والأدوار

المسارات العامة: /، /booking/، /services/، /packages/، /team/، /reviews/، /results/، /hair-systems/، /account/، /branches/talkha/، /branches/mashaya/، /login/. يوجد HTML entry مستقل لكل route. /booking/ يحوّل إلى واجهة الحجز الأصلية ?book=1 ويحفظ query بدل إنشاء محرك ثانٍ. اختبار محاكي Hosting يشمل الشرطة النهائية وبدونها و404. اختبار المتصفح يشمل direct/reload/back/forward؛ إعدادات Vercel مدققة ولم تُنشر.

| الهوية | الوجهة | الحماية |
|---|---|---|
| Admin | /admin/ | صلاحياته القائمة والتحقق الحي للخادم |
| Manager | /admin/ | الفروع والصلاحيات المخصصة |
| Cashier | /admin/ | فرعه ووظائفه المسموحة فقط |
| Worker | /worker/ | APIs العامل الحالية، ليس لوحة Admin مصغرة |
| غير مسجل في /worker/ | /login/?mode=worker | لا تحميل بيانات العامل |

Worker على /admin/ يُحوّل إلى /worker/ قبل bootstrap التشغيلي. Admin/Manager/Cashier على /worker/ يُحوّلون إلى /admin/ قبل تحميل workspace. pending لا يمنح أي role ويعرض انتظار الإدارة والدعوة. UI guards لا تستبدل تفويض الخادم. لا تعديل ceilings/Rules/App Check/ملكية العميل. سبعة اختبارات role-route في المتصفح إضافة إلى اختبارات الوحدة والبوابات.

مركز الحسابات: role/status/branch filters، بحث هوية exact email/phone أو prefix name، صفحات 1–50 مع cursor معتمد من مستند الخادم، وmetadata Auth آمنة فقط. الفهارس المقابلة محفوظة في firestore.indexes.json. تغيير السلطات وتعطيل/تفعيل وربط وإلغاء ربط/revoke/audit تبقى backend-authoritative. self-disable ممنوع، إدارة Admin آخر لا تُفتح بتعديل مرئي. لا passwords/OTP/tokens.

Permissions-Policy تغير من geolocation=() إلى geolocation=(self) لأن المنع السابق كان يمنع GPS العامل نفسه؛ حساب المسافة والنطاق والدقة والتكرار والتوقيت ما زال من الخادم. /worker/ noindex/no-store وخارج cache التنقل الحساس.

الأدلة: firebase-hosting-route-results.json، route-role-browser.json، public-route-refresh-collision-results.json، logs البوابة. لا تشمل هذه الأدلة نشر Vercel حيًا أو دخول Google/SMS إنتاجيًا.
