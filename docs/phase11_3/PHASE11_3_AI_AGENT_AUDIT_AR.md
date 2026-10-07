# تدقيق المساعد الحواري — Phase 11.3

## المعمارية

Browser → customerAiAgent المحمية بالـApp Check الحالي → OpenAI Chat Completions → أداة allowlisted واحدة في كل دورة → بيانات مقتصدة sanitized → النموذج يصيغ ردًا طبيعيًا. حد أقصى أربع أدوات وخمس طلبات نموذج، بلا parallel tool execution. max_completion_tokens=700، نص الرد حتى 2500 حرف، رسالة المستخدم حتى1200 حرف، history ست رسائل user/assistant، والواجهة حتى20 رسالة. 12 ثانية لكل طلب مزود ضمن ميزانية مزود25 ثانية. لا تخزين نص المحادثة هنا؛ store:false في طلب المزود.

الحدود: 20 طلب مساعد/10 دقائق عبر rate limiter الحالي، و10 تأكيدات/10 دقائق بهوية العميل. URL المزود ثابت؛ لا أداة fetchUrl أو collection/path arbitary. حقول role/customerId/UID/price/permissions غير مسموحة في args. حقن system في history مرفوض. النصوص والعناوين تُعامل كبيانات غير موثوقة؛ التحقق deterministic قبل التنفيذ.

## allowlist

getBusinessInfo، getBranches، searchServices، getPackages، getOffers، getTeam، getAvailableSlots، prepareBooking، getMyBookings، prepareReschedule، prepareCancel، getPolicies، handoffToWhatsapp.

لا confirm أو final write داخل القائمة. prepareBooking ينتج PREPARED draft مملوكًا للـUID، مدة10 دقائق؛ draftId لا يُرسل للنموذج. confirmCustomerAgent يتطلب confirmed:true ويعيد فحص الملكية والسعر والتوافر باستخدام مسار الحجز الحالي وإعادة التنفيذ idempotent. cancel/reschedule يستخدمان lookup العميل ودوال المجال الحالية. الحجز النهائي لا يثق في هاتف أو ملكية يختارها النموذج. لا وصول Firestore مباشر من Browser أو من النموذج.

يُسمح للمنسق deterministic بقراءة إعداد feature flag وإنشاء draft كما في Phase11؛ استعلامات الكتالوج والحجز عبر الدوال الحالية، وليس عبر query يختاره النموذج. لا إنشاء محرك حجز ثانٍ.

## المعرفة والبطاقات

حقول عامة محددة فقط، وقوائم نتائج محدودة12؛ لا راتب/مفاتيح/توكنات/ملفات خاصة ضمن context. الأسعار والمدد والخصومات والمواعيد المعروضة في البطاقات من الخادم؛ كلام النموذج إرشادي ولا ينفذ حسابات. بطاقة العامل لا تحتوي rating وهميًا أو صورة عامل مولدة. الحجوزات الخاصة مقتصرة على العميل المصادق؛ نتائج الإلغاء/التعديل تختزل لحقول موعد/خدمة/سعر/حالة لازمة.

عند aiAgentEnabled=false أو فشل المزود، تبقى SAME UI. resolver محلي يعمل على بيانات الكتالوج العامة والمعرفة المتاحة للفرع: مواعيد وعنوان وخدمات/سياسة؛ وإلا رد حواري واتساب. لا فتح faq-chatbot.js، ولا قائمة «اختار سؤالًا». الرد البديل لا يدعي تنفيذ حجز أو توافر مباشر.

## DEV preview

`VITE_AI_DEV_MOCK=true npm run dev` على localhost فقط. شرط import.meta.env.DEV يمنع تشغيله إنتاجيًا. يظهر DEV في الشات؛ المواعيد موسومة تجريبية وبطاقة التأكيد معطلة، ولا يحدث write. لا استخدام صور المعاينة كدليل availability إنتاجي.

## إعداد خارجي — لم يُنفذ

المفتاح Firebase Secret Manager الموجود: AI_AGENT_API_KEY. الأمر عند موافقة المالك وفي بيئة Firebase CLI مصرح بها:

```sh
firebase functions:secrets:set AI_AGENT_API_KEY --project el-mezaen-talkha
```

النموذج المختار افتراضيًا gpt-4.1-mini؛ يمكن AI_AGENT_MODEL في بيئة Functions. feature flag: settings/public.aiAgentEnabled=true عبر إجراء إدارة مصرح فقط بعد المراجعة. Secret الجديد يحتاج إصدار Functions مصرح به لاحقًا؛ لا deploy في هذه المرحلة. لا مفتاح Frontend ولا token في المصدر.

نمط التكلفة: سؤال بسيط غالبًا طلب نموذج واحد؛ معرفة أداة غالبًا طلبان؛ مسار متعدد الأدوات حتىخمسة طلبات/رسالة. لا تقدير مالي مزعوم بلا حركة واستهلاك حقيقي. الكتالوج المرسل identifiers محدودة وحقول tools مقتصدة، ولا collections كاملة. لا polling جديد.

التحقق:22 اختبار Functions جديد للحوار الحر، multi-turn، tool loop، سقف الاستدعاءات، حقن الأدوات/السعر/الملكية، sanitized outputs، draft confirmation، وتعطل المزود. اختبارات emulator السابقة تشمل الملكية والإلغاء والتعديل والتأكيد وrate limit. المزود الحقيقي بمفتاح حي غير مختبر.

مرجع API المستخدم: https://developers.openai.com/api/docs/guides/function-calling — النتائج تُعاد كtool messages، والتحقق من args يتم قبل التنفيذ.
