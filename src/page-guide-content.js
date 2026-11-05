// Help copy only. A guide never navigates, submits forms or changes business state.
const step=(selector,title,body,enTitle,enBody)=>({selector,title,body,enTitle,enBody});
const attendance=[
  step('[data-self-in]','تسجيل حضورك','اضغط وإنت داخل فرعك، واسمح للموقع بقراءة اللوكيشن. شكل البصمة زر حضور؛ الموقع لا يجمع بصمة إصبع.','Check in','Check in at your assigned branch and allow location access. This button does not collect fingerprints.'),
  step('[data-self-out]','تسجيل الانصراف','سجّل انصرافك لما تخلص. راجع مواعيدك في سجل الشهر أسفل الصفحة.','Check out','Check out when you finish. Review your times in the monthly attendance log.'),
  step('[data-self-month]','ساعات الشهر','اختار الشهر لعرض أيام الحضور والساعات المحتسبة. السجل المفتوح قد لا يكون احتُسب بالكامل بعد.','Monthly attendance','Choose a month to review attendance days and recorded hours. An open shift may not be fully counted yet.')
];
const booking=[
  step('#bookingBranchName','الفرع المختار','ده الفرع اللي اخترته في بداية الحجز. كمّل الخدمات والعامل والموعد لنفس الفرع.','Selected branch','This is the branch you selected at the start of this booking.'),
  step('#bookingAddService','الخدمات والباقات','أضف الخدمات المطلوبة، وراجع الكميات والإجمالي قبل ما تكمل.','Services and packages','Add the services you need and review quantities and the total.'),
  step('#bookingDate','اليوم والعامل والموعد','اختار العامل واليوم، وبعدها اختار من المواعيد المتاحة. التوفر النهائي بيتراجع عند التأكيد.','Date, barber and time','Choose a barber, day and available time. Availability is checked again at confirmation.'),
  step('#partySize','بيانات الحجز','راجع بيانات التواصل وعدد الأفراد. اكتب أي ملاحظة محتاج توصلها للفرع.','Booking details','Review contact details and party size. Add any notes for the branch.'),
  step('#finalBookingReview','راجع قبل التأكيد','راجع الفرع والخدمات والموعد والإجمالي. تأكيد الإرسال مش معناه إن الكاشير وافق بالفعل.','Review your booking','Check the branch, services, time and total. Submission does not mean the cashier has accepted it yet.'),
  step('#nextStep','الخطوة التالية','الزر ده بيكمّل خطوات الحجز، وفي خطوة المراجعة بيؤكد الطلب. الشرح نفسه مش هيبعت أي حجز.','Next step','Continue through the booking steps and confirm at the review step. This guide never submits a booking.')
];
const publicSteps=[
  step('.customer-shortcuts, .hero, main h1','أهلًا بيك في المزين','اتصفح الخدمات والباقات والنتائج. هتختار الفرع مرة واحدة لما تبدأ الحجز.','Welcome to El Mezaen','Explore services, packages and results. Choose your branch when you start booking.'),
  step('#services, #catalogGrid, .catalog-grid','الخدمات والأسعار','اختار الخدمة أو الباقة المناسبة. راجع السعر والمدة والتفاصيل قبل إضافتها للحجز.','Services and prices','Choose a service or package and review its price, duration and details.'),
  step('.premium-bottom-nav','طريقك السريع','من الشريط ده تقدر تحجز، تتصفح الخدمات، أو تفتح حسابك لمتابعة حجوزاتك.','Quick navigation','Use this bar to book, explore services or open your account to follow your bookings.'),
  step('#results, .results-grid','نتائج شغلنا','دي صور الأعمال المنشورة. افتح الصورة لمشاهدة التفاصيل المتاحة.','Our results','Browse published work and open an image for its available details.')
];
const customer=[
  step('#portal','حسابك في مكان واحد','تابع حجزك القادم وسجل زياراتك. بيانات الحساب والمحفظة بتظهر حسب سجلك الفعلي.','Your account','Follow your next booking and visit history. Account and wallet figures reflect your actual records.'),
  step('[data-account-view="bookings"], [data-open-account-view="bookings"]','حجوزاتك وزياراتك','افتح القسم ده لمتابعة الحالة والتفاصيل. الإلغاء أو تغيير الموعد بيظهر حسب حالة الحجز.','Bookings and visits','Review booking status and details. Cancellation and rescheduling depend on booking status.'),
  step('[data-account-view="wallet"], [data-open-account-view="wallet"]','المحفظة والمكافآت','هنا النقاط والكاش باك وحركاتهم المسجلة؛ دي منفصلة عن قيمة أي حجز جديد.','Wallet and rewards','Review recorded points, cashback and activity, separately from a new booking total.'),
  step('#openMembership','كود عضويتك','اعرض الكود للكاشير عشان يفتح حسابك. ما تشاركش صورة الكود علنًا.','Membership code','Show your code to the cashier to locate your account. Do not share it publicly.'),
  step('#editProfile','بياناتك وتفضيلاتك','راجع الاسم وبيانات التواصل، وحدد تفضيلاتك وموافقتك على العروض من الأقسام المخصصة.','Profile and preferences','Review your name, contact information, preferences and marketing consent in their sections.')
];
const commonStaff=[
  step('#headerBranchFilter','الفرع الحالي','راجع الفرع قبل أي عملية. البيانات والإجراءات المتاحة مرتبطة بفروع وصلاحيات حسابك.','Current branch','Check your selected branch. Available records and actions depend on your account permissions and branches.'),
  step('#pushButton','الحجوزات والتنبيهات','افتح الجرس لمتابعة الحجوزات الجديدة والطلبات. فعّل إشعارات الجهاز من داخله لو محتاج التنبيه خارج الصفحة.','Bookings and alerts','Open the bell for new bookings and requests. Enable device notifications there if needed.'),
  step('#adminMenu','أقسام اللوحة','اختار القسم المطلوب من القائمة. الأقسام بتظهر حسب صلاحياتك، وزر شرح الصفحة متاح ترجع له في أي وقت.','Dashboard sections','Choose a section from the menu. Sections follow your permissions; page help is available any time.')
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
const worker=[
  step('#workerHomeHistory','يومك وحجوزاتك','هنا الحجز الحالي وسجل شغلك. ابدأ الحجز عند بدء الخدمة، وأنهِ المهمة بعد ما تخلص فعليًا.','Your workday','Your current booking and work history. Start when service begins and finish only when the work is done.'),
  step('[data-view="bookings"]','الحجز الجاري وإضافة خدمة','داخل الحجز تقدر تطلب إضافة خدمة للشيك. بتضاف بعد موافقة الكاشير؛ التحصيل مسؤولية الكاشير.','Active booking and extras','Request an extra service inside the booking. It is added after cashier approval; the cashier handles payment.'),
  step('[data-view="attendance"]','الحضور وساعاتك','سجل حضورك من الفرع باللوكيشن وتابع سجل الشهر. اختار فرعك الصحيح لو حسابك مرتبط بأكتر من فرع.','Attendance and hours','Check in at the branch using location and review your monthly log. Select the correct assigned branch.'),
  step('[data-view="tasks"]','المهام','راجع المطلوب منك وغيّر حالة المهمة مع التنفيذ. متعلّمش المهمة تمت قبل ما تخلصها.','Tasks','Review assigned tasks and update status as you work. Mark done only after completion.'),
  step('[data-view="notifications"]','الإشعارات','افتح التنبيه لتفاصيل الطلب أو الحجز. اسمح بإشعارات الجهاز من الزر المخصص لو حابب توصلك على الموبايل.','Notifications','Open a notification for details. Use the enable button to allow mobile device notifications.')
];
const intros={
  admin:['لوحة الأدمن','ابدأ بالفرع، وبعدها اختار القسم من القائمة. الحسابات والصلاحيات والإعدادات العامة تحت إدارتك.','Admin dashboard','Start with the branch, then choose a section. You manage accounts, permissions and general settings.'],
  manager:['إدارة الفرع','تابع التشغيل والحضور والفريق والتقارير حسب صلاحياتك. راجع الفرع قبل تسجيل أي عملية.','Branch management','Follow operations, attendance, staff and reports within your permissions. Check the branch before acting.'],
  cashier:['شغل الكاشير','استقبل الحجز ووافق عليه، عيّن العامل، تابع إضافات الخدمات، وبعد انتهاء الخدمة راجع الشيك وحصّل.','Cashier workspace','Accept bookings, assign workers and review extras. Once service is finished, review the check and collect payment.'],
  media:['إدارة المحتوى','راجع الصور والنصوص والفروع وحالة النشر قبل الحفظ. احرص إن صور العملاء عندك موافقة على نشرها.','Content management','Review media, copy, branches and publication status before saving. Obtain permission to publish customer photos.']
};
export function guideSteps({role='visitor',section='',bookingOpen=false}={}) {
  if(bookingOpen)return booking;
  if(role==='visitor')return publicSteps;
  if(role==='customer')return customer;
  if(role==='worker')return [...(section==='attendance'?attendance:[]),...worker];
  const intro=intros[role]||intros.manager;
  return [step('',...intro),...(sections[section]||[]),...commonStaff];
}
export const fieldHelp=[
  ['[data-self-in]','الحضور بيتحقق من لوكيشن فرعك؛ مفيش بصمة إصبع بتتخزن.','Attendance verifies your branch location; no fingerprint is stored.'],
  ['[data-self-month]','اختار الشهر لعرض سجله بدون تغيير أو حذف الشهور السابقة.','Choose a month to view its records without changing previous months.'],
  ['#partySize','عدد الأشخاص اللي الحجز ليهم؛ راجع الخدمات المطلوبة لكل شخص.','Number of people in this booking; check services for each person.'],
  ['#bookingDate','المواعيد المتاحة بتعتمد على الفرع والعامل والخدمات المختارة.','Available times depend on the branch, barber and selected services.'],
  ['#headerBranchFilter','الفلتر بيحدد سياق عرض البيانات؛ صلاحيات فروعك لسه مطبّقة.','This selects the data context; branch permissions still apply.'],
  ['#editorForm [name="targetBonusPercent"]','نسبة من الراتب الأساسي كمكافأة عند تحقيق هدف الإيراد؛ مش نسبة من الإيراد الزائد.','A percentage of base salary awarded when the revenue target is met, not a percentage of excess revenue.'],
  ['#editorForm [name="attendanceRadiusMeters"]','المسافة المقبولة بالمتر من إحداثيات الفرع لتسجيل الحضور باللوكيشن.','Allowed check-in distance in metres from the branch coordinates.'],
  ['#branchTargetForm [name="targetAmount"]','الهدف الشهري للفرع بالجنيه. راجع الفرع والشهر قبل الحفظ.','Monthly branch target in EGP. Check branch and month before saving.'],
  ['#serviceTargetForm [name="targetCount"]','عدد الخدمات المكتملة والمحصلة المستهدف؛ الاسترداد يعكس الاحتساب حسب قواعد النظام.','Target count of completed, paid services. Refunds reverse counts according to system rules.']
];
