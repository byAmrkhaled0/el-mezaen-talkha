# AI allowlist
الأدوات: getBusinessInfo، getBranches، searchServices، getPackages، getOffers، getTeam، getAvailableSlots، prepareBooking، getMyBookings، prepareReschedule، prepareCancel، getPolicies، handoffToWhatsapp.

كل المدخلات تُفحص خادميًا؛ لا URLs أو collection paths حرة. أدوات العامة تُرجع إسقاطات صغيرة من الكتالوج المعتمد. getMyBookings والتعديل والإلغاء تعتمد على Firebase UID والتحقق الأصلي من ملكية الحجز. prepareBooking لا يكتب حجزًا؛ يستخدم السعر والتوافر الأصليين. confirmCustomerAgentAction callable منفصل عن model tools؛ requires confirmed=true ومسودة مملوكة للمستخدم وسارية ويعيد نتيجة التنفيذ عند تكرار التأكيد.

لم تُضف أدوات دفع أو كوبونات للـAI؛ الحجز التقليدي يحتفظ بهذه الوظائف. إعدادات settings/public.aiAgentEnabled=false أو غياب المفتاح يُرجع إلى FAQ. Provider الحقيقي لم يُختبر؛ لغة الاختبارات جاءت من mock مع تشغيل business handlers الأصلية.
