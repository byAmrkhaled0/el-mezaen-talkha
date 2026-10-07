# تنظيف CSS

جرى تفكيك التراكم بدل إضافة override ضخم في نهاية styles.css. أزيلت 321 مجموعة selectors قديمة للمكونات المعاد بناؤها، ودُمجت 129 مجموعة ذات نفس السياق والـ selector مع الحفاظ على !important. نقلت المكونات Canonical إلى src/premium-components.css، وواجهات العامل إلى src/worker.css دون تحميل admin.css. نُقلت قواعد dialog الحجز إلى المكون Canonical وأعيد ترتيب القواعد الأساسية قبل responsive لمنع override متأخر يفتح تنقل الهاتف دائمًا.

الهيكل: tokens/base/layout الموجودة، components canonical، صفحات وresponsive. بقيت قواعد المحتوى القديم والنماذج والسلة والـ fallback والدعم اللغوي/الثيم؛ لم يُحذف CSS يؤثر في وظيفة لمجرد قدمه. لا ادعاء بأن جميع breakpoints التاريخية أصبحت breakpoint واحدة؛ جرى توحيد المكونات المتعارضة ومواقع التحكم الفعلية.

.faq-chat-fab ثابت position:fixed في المصدر canonical مع safe-area ومسافة عن bottom nav. لا mobile position:static له. تقدم الحجز وأزراره ضمن frame ثابت مع جسم scroll مستقل. التوست والسلة وscroll-top موزعة بعيدًا عن FAB والتنقل.

الاختبار tests/phase11-1-visual.test.mjs يحلل CSS ويكشف declarations متناقضة داخل القاعدة، ويحمي FAB وعدم إعادة FAQ والحدود والمداخل. فحص المتصفح على 320/360/375/390/412/430 يقيس العناصر الثابتة والتصادم وعرض document. الكاروسيل/chips المتحركة عمدًا ليست overflow للصفحة. scripts/consolidate-public-css.mjs يسجل عملية migration واحدة؛ لا يلزم تشغيله عند كل build.

اللقطات والـ JSON هي المرجع النهائي للمراجعة؛ الآلة لا تمنح اعتمادًا بصريًا.
