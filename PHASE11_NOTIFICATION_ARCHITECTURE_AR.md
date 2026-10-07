# الإشعارات والتذكير
تستخدم workerNotifications وcreateWorkerTask/updateWorkerTask وpushTokens وnotifyWorker القائمة. تغيير الحجز يكتب inbox event مرتبطًا بالعامل والفرع؛ حالات المهمة الأصلية NEW/SEEN/IN_PROGRESS/DONE. القراءة تتحقق من العامل والفرع، والروابط الداخلية تفتح الكيان الصحيح. واجهة العامل تتحدث عند foreground push ودخول الشاشة؛ أزيل polling العامل. الساعة محلية دون طلبات Firebase.

workerBookingReminders/{bookingId}: مستند واحد version hash(branch/staff/date/time)، dueAt قبل الموعد بـ15 دقيقة Cairo، expiresAt، state. Trigger يُعيد قراءة أحدث حجز لمنع الأحداث القديمة. Scheduler كل دقيقة يستعلم PENDING+dueAt بحد 100 عبر index ويعيد التحقق من الحالة والنسخة والموعد داخل transaction؛ notification ID حتمي يمنع التكرار. إلغاء/إعادة جدولة يمنع تذكير الموعد السابق. لا scan كامل bookings.

Inbox idempotent؛ إرسال FCM بعد transaction بمحاولة محدودة ليس exactly-once delivery: تعطل العملية بعد commit وقبل الإرسال قد يفقد Push، ويظل Inbox موجودًا. قد يصل التذكير متأخرًا نحو دقيقة وبالازدحام أكثر؛ حد 100 لكل تشغيل. الحجوزات القديمة السابقة للنشر تحتاج backfill منفصلًا معتمدًا؛ لم ينفذ. FCM delivery وdevice GPS لم يُختبرا فعليًا.
