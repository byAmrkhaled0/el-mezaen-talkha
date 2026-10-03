# جرد مواضع HTML في V9.5

هذا جرد لكل إسناد `innerHTML`/`outerHTML`/`insertAdjacentHTML` في ملفات `src`؛ وصف أدوات الحماية في السطر ليس إثباتًا وحده لسلامة كل تعبير متداخل. الإصلاحات والتحقق والقيود موثقة في التقرير الرئيسي.

| الموضع | Sink | مصدر/سياق | الحماية الظاهرة |
|---|---|---|---|
| `src/account.js:41` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | media URL |
| `src/account.js:61` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/account.js:62` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/account.js:63` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | numeric |
| `src/account.js:64` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/account.js:66` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/account.js:84` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/account.js:86` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/account.js:91` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/account.js:94` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/account.js:100` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:178` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:183` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/admin.js:185` | insertAdjacentHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:186` | insertAdjacentHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:202` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:207` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:247` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:273` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:274` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:286` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:287` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute, numeric |
| `src/admin.js:292` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:333` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:334` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:335` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:351` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:393` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:399` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:432` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:445` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:455` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:465` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:497` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:499` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:544` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:549` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:550` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:599` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/admin.js:601` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:729` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:730` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:786` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:813` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:863` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:872` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/admin.js:876` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:986` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/admin.js:993` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/admin.js:1012` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/admin.js:1050` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:1074` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:1103` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:1114` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1180` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:1185` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, numeric |
| `src/admin.js:1186` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/admin.js:1275` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1280` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/admin.js:1285` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/admin.js:1297` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute, media URL |
| `src/admin.js:1307` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1320` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/admin.js:1355` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute, numeric |
| `src/admin.js:1377` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1389` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1406` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:1408` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:1428` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1441` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1450` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1769` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1777` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1786` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:1804` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:1818` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1844` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:1862` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1878` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1884` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:1922` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1930` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute, numeric |
| `src/admin.js:1935` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1946` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:1950` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:1953` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute, numeric |
| `src/admin.js:1963` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2215` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2242` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2246` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2252` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2345` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2346` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2373` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2405` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2409` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/admin.js:2417` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute, numeric |
| `src/admin.js:2434` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2492` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML attribute, media URL |
| `src/admin.js:2493` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML attribute, media URL |
| `src/admin.js:2494` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML attribute |
| `src/admin.js:2495` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML attribute |
| `src/admin.js:2496` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML attribute, media URL |
| `src/admin.js:2497` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2819` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute, numeric |
| `src/admin.js:2821` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:2826` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2896` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2898` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2906` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/admin.js:2910` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/admin.js:2980` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/admin.js:2989` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/admin.js:3204` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute, media URL, numeric |
| `src/admin.js:3344` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:151` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:178` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:197` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:222` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:265` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/app.js:267` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:278` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:289` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute, media URL |
| `src/app.js:291` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute, media URL |
| `src/app.js:293` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:298` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute, link URL |
| `src/app.js:317` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, numeric |
| `src/app.js:341` | outerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML attribute, media URL |
| `src/app.js:342` | outerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML attribute |
| `src/app.js:360` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML attribute |
| `src/app.js:376` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:382` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/app.js:386` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:460` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:474` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:479` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute, numeric |
| `src/app.js:487` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/app.js:588` | innerHTML | قالب ثابت | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:670` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:695` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:767` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:774` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:789` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:795` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/app.js:952` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/branch-page.js:29` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, media URL, numeric |
| `src/branch-page.js:32` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, media URL |
| `src/branch-page.js:33` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, media URL |
| `src/branch-page.js:68` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/catalog-page.js:83` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/catalog-page.js:84` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/catalog-page.js:98` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/catalog-page.js:99` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/catalog-page.js:106` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, media URL |
| `src/catalog-page.js:113` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/catalog-page.js:124` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/catalog-page.js:130` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/catalog-page.js:136` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/catalog-page.js:144` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text |
| `src/catalog-page.js:177` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/catalog-page.js:180` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/catalog-page.js:197` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/faq-chatbot.js:23` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/faq-chatbot.js:29` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, HTML attribute |
| `src/faq-chatbot.js:78` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/hair-systems.js:30` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/results.js:22` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, media URL |
| `src/results.js:85` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/reviews-page.js:18` | innerHTML | قالب ديناميكي: بيانات Firestore/Callable أو حالة UI | HTML text, numeric |
| `src/reviews-page.js:31` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/reviews-page.js:37` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |
| `src/reviews-page.js:38` | innerHTML | ثابت أو قالب متعدد الأسطر؛ يلزم النظر للسطر التالي | لا يظهر تحقق على نفس السطر؛ راجع التعبيرات المستدعاة |

الإجمالي: 172 موضعًا.
