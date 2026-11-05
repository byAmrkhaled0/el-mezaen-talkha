// Help copy only. A guide never navigates, submits forms or changes business state.
const step=(selector,title,body,enTitle,enBody)=>({selector,title,body,enTitle,enBody});
const attendance=[
  step('[data-self-in]','تسجيل حضورك','اضغط وإنت داخل فرعك، واسمح للموقع بقراءة اللوكيشن. شكل البصمة زر حضور؛ الموقع لا يجمع بصمة إصبع.','Check in','Check in at your assigned branch and allow location access. This button does not collect fingerprints.'),
  step('[data-self-out]','تسجيل الانصراف','سجّل انصرافك لما تخلص. راجع مواعيدك في سجل الشهر أسفل الصفحة.','Check out','Check out when you finish. Review your times in the monthly attendance log.'),
  step('[data-self-month]','ساعات الشهر','اختار الشهر لعرض أيام الحضور والساعات المحتسبة. السجل المفتوح قد لا يكون احتُسب بالكامل بعد.','Monthly attendance','Choose a month to review attendance days and recorded hours. An open shift may not be fully counted yet.')
];
const commonStaff=[
  step('#headerBranchFilter','الفرع الحالي','راجع الفرع قبل أي عملية. البيانات والإجراءات المتاحة مرتبطة بفروع وصلاحيات حسابك.','Current branch','Check your selected branch. Available records and actions depend on your account permissions and branches.'),
  step('#pushButton','الحجوزات والتنبيهات','افتح الجرس لمتابعة الحجوزات الجديدة والطلبات. فعّل إشعارات الجهاز من داخله لو محتاج التنبيه خارج الصفحة.','Bookings and alerts','Open the bell for new bookings and requests. Enable device notifications there if needed.'),
  step('#adminMenu','أقسام اللوحة','اختار القسم المطلوب من القائمة. الأقسام بتظهر حسب صلاحياتك، وتقدر تعيد الشرح من علامة الاستفهام الصغيرة.','Dashboard sections','Choose a section from the menu. Sections follow your permissions; replay the guide with the small question-mark icon.')
];
const operations=[
  step('[data-new-pos]','فاتورة جديدة','اختار العميل، راجع ملفه، أضف الخدمات والعامل، وبعدها راجع الحساب وطريقة الدفع قبل الحفظ.','New check','Select the customer, review their profile, add services and a barber, then review totals and payment before saving.'),
  step('#cashierTransactionsTable, #bookingsTable','الحجوزات والشيكات','افتح تفاصيل العملية قبل تنفيذ الإجراء. الحجز الجديد يحتاج موافقة الكاشير ثم الإرسال للعامل.','Bookings and checks','Open the details before acting. A new booking needs cashier approval before it is sent to the worker.'),
  step('#posItemSearch','البحث عن خدمة','ابحث باسم الخدمة، وحدد الكمية والعامل. السعر والإجمالي النهائي بيتم التحقق منهم في السيرفر.','Find a service','Search by name and check quantity and the assigned worker. Final pricing is validated by the server.')
];
const sections={
  dashboard:[step('#dashboard','ملخص الشغل','الأرقام ملخص للفترة والفرع المختارين. افتح التقرير المناسب لمراجعة التفاصيل قبل اتخاذ قرار.','Business overview','Figures summarize the selected period and branch. Open the relevant report to inspect details.')],
  cash:[step('#cash','الشيفت ودرج الكاش','راجع رصيد البداية والحركات والمتوقع. قبل إنهاء الشيفت، عدّ النقد الفعلي ووضح أي فرق؛ الحفظ بيسجل عملية مالية.','Shift and cash drawer','Review opening balance, movements and expected cash. Count actual cash and explain any difference before closing.')],
  targets:[step('#targets','الأهداف الشهرية','حدد الشهر والفرع والعامل وراجع المحقق. اعتماد الهدف للشهر له قواعد تثبيت؛ راجع القيمة كويس قبل الحفظ.','Monthly targets','Review month, branch, worker and achieved totals. Monthly targets have locking rules; check values before saving.')],
  tasks:[step('#tasks','توزيع المهام','حدد العامل والمطلوب والوقت. تابع حالة المهمة، واستخدم التنبيه المخصص لما يحتاج يتابعها.','Assign tasks','Choose the worker, task and time. Track status and use the available alert action when follow-up is needed.')],
  workerRequests:[step('#workerRequests','طلبات العاملين','راجع نوع الطلب والعامل والسبب. الموافقة الإدارية على سلفة أو إجازة مش معناها صرف السلفة أو تفعيل الإجازة تلقائيًا.','Employee requests','Review type, worker and reason. Approval of an advance or leave request does not itself mean cash was paid or leave activated.')],
  branchNeeds:[step('#branchNeeds','احتياجات الفرع','سجل الاحتياج والكمية والأولوية، وتابع حالته من نفس القسم بدل تكرار الطلب.','Branch needs','Record the item, quantity and priority, then follow its status here rather than duplicating the request.')],
  expenses:[step('#expenses','المصروفات والمشتريات','اختار الفرع والتصنيف وطريقة الدفع، وراجع المبلغ والبيان. تسجيل المصروف يؤثر على التقارير والحركات حسب طريقة الدفع.','Expenses and purchases','Check branch, category, payment method, amount and description. Expenses affect reports and movements according to their payment method.')],
  customers:[step('#customers','ملف العميل','ابحث بالاسم أو الموبايل وافتح الملف للسجل والبيانات. راجع العميل الصحيح قبل تعديل بياناته أو أي رصيد.','Customer profile','Search by name or phone and open the profile. Verify the customer before changing details or balances.')],
  services:[step('#services','الخدمات والأسعار','راجع الاسم والتصنيف والسعر والمدة والفروع وحالة الإتاحة قبل الحفظ.','Services and prices','Review name, category, price, duration, branches and availability before saving.')],
  results:[step('#results','نشر النتائج','أضف الصور والوصف وراجع الفروع وحالة النشر. تأكد من موافقة العميل على استخدام صورته.','Publish results','Add images and copy, then review branch scope and publication status. Obtain permission to use customer photos.')],
  offers:[step('#offers','العروض','راجع السعر والشروط والفترة والإتاحة قبل النشر. إرسال العرض على واتساب إجراء منفصل عن نشره.','Offers','Review price, terms, dates and availability. Sending an offer on WhatsApp is separate from publishing it.')],
  activity:[step('#activity','سجل النشاط','حدد الفترة والفرع وراجع مين نفذ الإجراء ووقته. ده سجل للمراجعة، مش زر للتراجع عن العمليات.','Activity log','Review who performed an action and when, by period and branch. This is an audit log, not an undo control.')],
  pos:operations,
  bookings:[step('#bookingsTable','إدارة الحجز','افتح التفاصيل للموافقة أو الرفض أو إعادة الجدولة. عيّن العامل المناسب بعد مراجعة التوفر. التحصيل خطوة مالية مستقلة.','Manage bookings','Open details to approve, reject or reschedule. Assign an available worker. Payment is a separate financial action.')],
  calendar:[step('#calendarBoard, #calendar','جدول الحجوزات','غيّر اليوم والفلاتر لعرض الحجوزات. إضافة حجز من هنا تتم داخل اللوحة.','Booking calendar','Change the date and filters. Adding a booking here stays inside the dashboard.')],
  myAttendance:attendance, attendanceManagement:attendance,
  attendance:[step('#attendance','حضور الفريق','راجع الفرع والموظف والتاريخ. في التسجيل اليدوي اختار وقت وصول الموظف الحقيقي وسبب التسجيل.','Team attendance','Check branch, employee and date. For manual attendance, enter the actual arrival time and a reason.')],
  teamAvailability:[step('#teamAvailability','حالة العمال في المحل','راجع مين حاضر ومتاح ومين مشغول. انتهاء وقت الانشغال اليدوي مختلف عن إنهاء خدمة شغالة.','Team availability','See who is present, available or busy. A manual busy timer is different from completing an active service.')],
  orderAdditions:[step('#orderAdditions','طلبات إضافة الخدمات','راجع الخدمة والسعر والعامل قبل الموافقة. الطلب لا يضاف للشيك إلا بعد الاعتماد.','Service addition requests','Review the service, price and worker. A request is added to the check only after approval.')],
  payroll:[step('#payroll','الرواتب والتارجت','راجع الشهر والفرع. المكافأة حسب إعدادات الموظف، وبيانات السلف والتسوية تحتاج مراجعة قبل تسجيل الصرف.','Payroll and targets','Check the month and branch. Bonuses follow employee settings; review advances and adjustments before recording payment.')],
  revenue:[step('#revenue','تقارير الإيرادات','حدد الفترة والفرع ثم راجع التفاصيل. تغيير الشهر يعرض سجله؛ لا يحذف حسابات الشهور السابقة.','Revenue reports','Choose a period and branch. Changing the month shows that month’s records without deleting earlier records.')],
  packages:[step('#packages','الباقات','راجع الخدمات المضمّنة والسعر والمدة والفروع والإتاحة قبل الحفظ. التعديل يؤثر على الطلبات الجديدة حسب قواعد النظام.','Packages','Review included services, price, duration, branches and availability before saving.')],
  users:[step('#users','الحسابات والصلاحيات','حدد الدور والفروع وأقل صلاحيات يحتاجها الموظف. لا تشارك حساب الأدمن مع موظفين تانيين.','Accounts and permissions','Choose the role, assigned branches and only the permissions the employee needs. Do not share the admin account.')],
  settings:[step('#settings','إعدادات الموقع والفروع','راجع القيم قبل الحفظ، خصوصًا إحداثيات الفرع ونطاق الحضور. أي تغيير هنا محتاج بيانات معتمدة.','Site and branch settings','Review values before saving, especially branch coordinates and attendance radius. Use approved branch data.')],
  staff:[step('#staff','فريق العمل','راجع الفرع وربط حساب الموظف وإتاحته. الصورة وبيانات العرض العام منفصلة عن صلاحيات دخوله.','Team members','Review branch assignment, linked account and availability. Public profile data is separate from login permissions.')]
};
const intros={
  admin:['لوحة الأدمن','ابدأ بالفرع، وبعدها اختار القسم من القائمة. الحسابات والصلاحيات والإعدادات العامة تحت إدارتك.','Admin dashboard','Start with the branch, then choose a section. You manage accounts, permissions and general settings.'],
  manager:['إدارة الفرع','تابع التشغيل والحضور والفريق والتقارير حسب صلاحياتك. راجع الفرع قبل تسجيل أي عملية.','Branch management','Follow operations, attendance, staff and reports within your permissions. Check the branch before acting.'],
  cashier:['شغل الكاشير','استقبل الحجز ووافق عليه، عيّن العامل، تابع إضافات الخدمات، وبعد انتهاء الخدمة راجع الشيك وحصّل.','Cashier workspace','Accept bookings, assign workers and review extras. Once service is finished, review the check and collect payment.'],
  media:['إدارة المحتوى','راجع الصور والنصوص والفروع وحالة النشر قبل الحفظ. احرص إن صور العملاء عندك موافقة على نشرها.','Content management','Review media, copy, branches and publication status before saving. Obtain permission to publish customer photos.']
};
export function guideSteps({role='admin',section=''}={}) {
  const intro=intros[role];
  if(!intro)return [];
  return [step('',...intro),...(sections[section]||[]),...commonStaff];
}
export const fieldHelp=[
  ['[data-self-in]','الحضور بيتحقق من لوكيشن فرعك؛ مفيش بصمة إصبع بتتخزن.','Attendance verifies your branch location; no fingerprint is stored.'],
  ['[data-self-month]','اختار الشهر لعرض سجله بدون تغيير أو حذف الشهور السابقة.','Choose a month to view its records without changing previous months.'],
  ['#headerBranchFilter','الفلتر بيحدد سياق عرض البيانات؛ صلاحيات فروعك لسه مطبّقة.','This selects the data context; branch permissions still apply.'],
  ['#editorForm [name="targetBonusPercent"]','نسبة من الراتب الأساسي كمكافأة عند تحقيق هدف الإيراد؛ مش نسبة من الإيراد الزائد.','A percentage of base salary awarded when the revenue target is met, not a percentage of excess revenue.'],
  ['#editorForm [name="attendanceRadiusMeters"]','المسافة المقبولة بالمتر من إحداثيات الفرع لتسجيل الحضور باللوكيشن.','Allowed check-in distance in metres from the branch coordinates.'],
  ['#branchTargetForm [name="targetAmount"]','الهدف الشهري للفرع بالجنيه. راجع الفرع والشهر قبل الحفظ.','Monthly branch target in EGP. Check branch and month before saving.'],
  ['#serviceTargetForm [name="targetCount"]','عدد الخدمات المكتملة والمحصلة المستهدف؛ الاسترداد يعكس الاحتساب حسب قواعد النظام.','Target count of completed, paid services. Refunds reverse counts according to system rules.']
];
