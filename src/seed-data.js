import { newMashayaPackages } from "./package-definitions.js";

const categories = [
  ["hair", "الشعر", "Hair"],
  ["beard", "حلاقة الدقن", "Beard Shaving"],
  ["skin", "العناية الأساسية بالبشرة", "Basic Skin Care"],
  ["extras", "إضافات", "Extras"],
  ["wax", "شمع", "Waxing"],
  ["beard-care", "العناية بالذقن", "Beard Care"],
  ["hair-care", "عناية بالشعر", "Hair Care"],
  ["service", "سيرفيس", "Service & Hair Systems"],
  ["packages", "الباقات", "Packages"],
  ["installation", "تركيب", "Installation"],
  ["products", "بضاعة", "Products"],
  ["facial-cleaning", "تنظيف البشرة الاحترافي", "Professional Facial Cleansing"]
].map(([id, nameAr, nameEn], sortOrder) => ({ id, nameAr, nameEn, active: true, sortOrder }));

const sharedSocial = {
  facebook: "https://www.facebook.com/profile.php?id=61559147948668",
  instagram: "https://www.instagram.com/ahmed_elmzin1",
  tiktok: "https://www.tiktok.com/@ahmedelmzin1"
};

const branches = [
  {
    id: "talkha",
    code: "TK",
    nameAr: "فرع طلخا",
    nameEn: "Talkha Branch",
    shortNameAr: "طلخا",
    shortNameEn: "Talkha",
    addressAr: "المنصورة - طلخا، تقسيم بهاء الشربيني، أمام محل LONDONE للملابس",
    addressEn: "Bahaa El-Sherbiny Division, opposite LONDONE clothing store, Talkha, Dakahlia",
    phone: "01093008896",
    secondaryPhone: "0502535810",
    whatsapp: "201093008896",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=%D8%AA%D9%82%D8%B3%D9%8A%D9%85+%D8%A8%D9%87%D8%A7%D8%A1+%D8%A7%D9%84%D8%B4%D8%B1%D8%A8%D9%8A%D9%86%D9%8A+%D8%B7%D9%84%D8%AE%D8%A7",
    latitude: 31.0520115,
    longitude: 31.3815616,
    attendanceRadiusMeters: 100,
    monthlyRevenueTarget: 0,
    openingTime: "11:00",
    closingTime: "23:00",
    slotMinutes: 15,
    ...sharedSocial,
    active: true,
    sortOrder: 1
  },
  {
    id: "mashaya",
    code: "MS",
    nameAr: "فرع المشاية",
    nameEn: "El Mashaya Branch",
    shortNameAr: "المشاية",
    shortNameEn: "El Mashaya",
    addressAr: "المنصورة - المشاية السفلية، أمام بوابة نادي الجزيرة الثانية، شارع حسام ربيع",
    addressEn: "Hossam Rabie Street, opposite Al Gezira Club Gate 2, Lower El Mashaya, Mansoura",
    phone: "01101006961",
    secondaryPhone: "0502253357",
    whatsapp: "201101006961",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=%D8%B4%D8%A7%D8%B1%D8%B9+%D8%AD%D8%B3%D8%A7%D9%85+%D8%B1%D8%A8%D9%8A%D8%B9+%D8%A7%D9%84%D9%85%D8%B4%D8%A7%D9%8A%D8%A9+%D8%A7%D9%84%D8%B3%D9%81%D9%84%D9%8A%D8%A9+%D8%A7%D9%84%D9%85%D9%86%D8%B5%D9%88%D8%B1%D8%A9",
    latitude: 31.0456639,
    longitude: 31.3670561,
    attendanceRadiusMeters: 100,
    monthlyRevenueTarget: 0,
    openingTime: "11:00",
    closingTime: "23:00",
    slotMinutes: 15,
    ...sharedSocial,
    active: true,
    sortOrder: 2
  }
];

const s = (id, categoryId, nameAr, nameEn, duration, price, startsFrom = false, type = "service") => ({
  id,
  categoryId,
  nameAr,
  nameEn,
  duration,
  price,
  startsFrom,
  type,
  active: true,
  sortOrder: Number(id.split("-").at(-1)) || 0
});

const services = [
  s("hair-001", "hair", "قص شعر", "Haircut", 30, 100),
  s("hair-002", "hair", "صبغة شعر سوداء", "Black Hair Dye", 20, 100),
  s("hair-003", "hair", "حمام زيت بخار للشعر", "Steam Hair Oil Treatment", 15, 100, true),
  s("hair-004", "hair", "معالج", "Hair Treatment", 15, 100),
  s("hair-005", "hair", "استشوار", "Blow-Dry", 15, 60, true),
  s("hair-006", "hair", "تسريح بالاستشوار", "Blow-Dry Styling", 5, 30),
  s("hair-007", "hair", "ويفي", "Wavy Styling", 10, 80),
  s("hair-008", "hair", "تسريح ويفي", "Wavy Finish", 5, 30),
  s("hair-009", "hair", "كيرلي مكواة", "Curling-Iron Curls", 20, 200),
  s("hair-010", "hair", "كيرلي كريم", "Curl Cream Styling", 20, 100, true),
  s("hair-011", "hair", "حمام كريم", "Hair Cream Bath", 2, 10),
  s("hair-012", "hair", "حمام زيت عادي", "Classic Hair Oil Treatment", 5, 30),
  s("hair-013", "hair", "توبك", "Toppik Hair Fibers", 10, 100),
  s("hair-014", "hair", "استشوار وتوبك", "Blow-Dry & Toppik", 20, 150),
  s("hair-015", "hair", "صبغة شعر ألوان", "Fashion Hair Color", 20, 200),
  s("hair-016", "hair", "صبغة شعر سيلفر", "Silver Hair Dye", 4, 450),
  s("hair-017", "hair", "جلسة قشرة", "Dandruff Treatment Session", 20, 100),
  s("hair-018", "hair", "شعر + دقن", "Haircut & Beard", 30, 150),
  s("hair-019", "hair", "شعر + دقن + استشوار", "Haircut, Beard & Blow-Dry", 40, 200),
  s("hair-020", "hair", "قص طفل", "Kids' Cut", 30, 70),
  s("hair-021", "hair", "قص شعر طفل", "Kids' Haircut", 25, 80),
  s("hair-022", "hair", "شعر + دقن زيرو", "Zero Haircut & Beard", 25, 120),
  s("hair-023", "hair", "تسريح + توبك", "Styling & Toppik", 10, 120),
  s("hair-024", "hair", "بروتين", "Hair Protein Treatment", 60, 700, true),
  s("hair-025", "hair", "شامبو سيلفر", "Silver Shampoo", 15, 50),
  s("hair-026", "hair", "تحديد", "Hairline Shape-Up", 5, 30),
  s("hair-027", "hair", "شعر + تنعيم", "Haircut & Smoothing", 25, 130),
  s("hair-028", "hair", "كيرلي كريم", "Curl Cream Styling", 20, 100, true),
  s("hair-029", "hair", "حمام زيت بخار للشعر بالزيوت", "Steam Hair Oil Blend Treatment", 20, 150),
  s("hair-030", "hair", "استشوار شبكية", "Hair-System Blow-Dry", 10, 100),
  s("hair-031", "hair", "صبغة شعر Apple", "Apple Hair Dye", 20, 200),
  s("hair-032", "hair", "شعر وتسريح بالاستشوار", "Haircut & Blow-Dry Styling", 60, 130),

  s("beard-001", "beard", "حلاقة دقن", "Beard Shave", 20, 70),
  s("beard-002", "beard", "صبغة دقن أسود", "Black Beard Dye", 10, 50),
  s("beard-003", "beard", "صبغة دقن ألوان", "Colored Beard Dye", 10, 100),
  s("beard-004", "beard", "حلاقة ذقن بالبخار", "Steam Beard Shave", 20, 100),
  s("beard-005", "beard", "صبغة دقن سيلفر", "Silver Beard Dye", 2, 200),
  s("beard-006", "beard", "صبغة دقن Apple", "Apple Beard Dye", 10, 100),

  s("skin-001", "skin", "تنظيف بشرة", "Facial Cleansing", 15, 150, true),
  s("skin-002", "skin", "ماسك", "Face Mask", 2, 10),
  s("skin-003", "skin", "مكياج", "Makeup", 10, 500),
  s("skin-004", "skin", "لاصقة أنف", "Nose Strip", 5, 50),

  s("extras-001", "extras", "كريم جيل", "Gel Cream", 1, 30),

  s("wax-001", "wax", "شعر + دقن + شمع", "Haircut, Beard & Wax", 35, 200),
  s("wax-002", "wax", "شمع للوجه كامل", "Full-Face Waxing", 10, 100),
  s("wax-003", "wax", "شمع للأنف", "Nose Waxing", 5, 25),
  s("wax-004", "wax", "شمع أنف وأذن", "Nose & Ear Waxing", 10, 50),

  s("beard-care-001", "beard-care", "تنعيم دقن", "Beard Smoothing", 10, 30),
  s("beard-care-002", "beard-care", "أدوات استخدام مرة واحدة", "Single-Use Tools", 1, 10),
  s("beard-care-003", "beard-care", "تنعيم", "Smoothing", 5, 30),
  s("beard-care-004", "beard-care", "فوطة نعناع", "Mint Towel", 2, 10),
  s("beard-care-005", "beard-care", "بروتين دقن", "Beard Protein Treatment", 60, 250),

  s("hair-care-001", "hair-care", "مجموعة عناية بالشعر", "Hair Care Set", 1, 500),

  s("service-001", "service", "سيرفيس 250", "Service 250", 60, 250),
  s("service-002", "service", "سيرفيس 350", "Service 350", 60, 350),
  s("service-003", "service", "سيرفيس 450", "Service 450", 60, 450),
  s("service-004", "service", "سيرفيس 550", "Service 550", 60, 550),
  s("service-005", "service", "قص شبكية", "Hair-System Cut", 60, 300),
  s("service-006", "service", "استشوار", "Blow-Dry", 10, 50),
  s("service-007", "service", "تركيب جديد", "New Hair-System Installation", 30, 4900),
  s("service-008", "service", "تنظيف شبكية", "Hair-System Cleaning", 20, 150),
  s("service-009", "service", "دبل فيس أزرق صغير", "Small Blue Double-Sided Tape", 1, 550),
  s("service-010", "service", "دبل فيس أبيض صغير", "Small White Double-Sided Tape", 1, 550),
  s("service-011", "service", "تركيب شبكية فئة 3500", "3,500-Class Hair-System Installation", 120, 3500),
  s("service-012", "service", "تركيب جديد", "New Hair-System Installation", 60, 3450),
  s("service-013", "service", "تركيب جديد", "New Hair-System Installation", 30, 3500),
  s("service-014", "service", "تنظيف شبكية من المساعد", "Assistant Hair-System Cleaning", 5, 50),
  s("service-015", "service", "دابل فيس", "Double-Sided Tape", 0, 550),
  s("service-016", "service", "تركيب جديد", "New Hair-System Installation", 30, 7500),
  s("service-017", "service", "تركيب جديد", "New Hair-System Installation", 45, 2850),
  s("service-018", "service", "تركيب 6750", "6,750 Hair-System Installation", 45, 6750),
  s("service-019", "service", "تركيب جديد 7000", "New 7,000 Hair-System Installation", 45, 7000),

  s("installation-001", "installation", "تركيب شبكية", "Hair-System Installation", 60, 4350, true),
  s("installation-002", "installation", "شبكية فئة عالية", "Premium Hair System", 90, 7500),

  s("product-001", "products", "مشط فينيش", "Finishing Comb", 0, 5, false, "product"),
  s("product-002", "products", "ماكينة زيرو", "Zero-Gap Clipper", 0, 400, false, "product"),
  s("product-003", "products", "كريم استيلا", "Estella Cream", 0, 170, false, "product"),
  s("product-004", "products", "كلبسات", "Hair Clips", 0, 20, false, "product"),
  s("product-005", "products", "سولفنت", "Solvent", 0, 350, false, "product"),

  s("facial-cleaning-001", "facial-cleaning", "تنظيف بشرة", "Facial Cleansing", 20, 250),
  s("facial-cleaning-002", "facial-cleaning", "بروفيشنال", "Professional Facial", 20, 250),
  s("facial-cleaning-003", "facial-cleaning", "هيدرافيشال", "HydraFacial", 20, 500)
];

const serviceClarifications = {
  "hair-005": { nameAr: "استشوار شعر (يبدأ من)", descriptionAr: "استشوار للشعر الطبيعي؛ السعر يبدأ من القيمة الظاهرة حسب الطول والكثافة." },
  "beard-004": { nameAr: "حلاقة دقن بالبخار", descriptionAr: "حلاقة دقن مع استخدام البخار." },
  "skin-001": { nameAr: "تنظيف بشرة أساسي", descriptionAr: "تنظيف أساسي للبشرة ضمن قسم العناية اليومية." },
  "service-006": { nameAr: "استشوار شبكية – سيرفيس", descriptionAr: "استشوار مخصص للشبكية ضمن خدمات السيرفيس." },
  "service-007": { nameAr: "تركيب جديد – فئة 4900", descriptionAr: "تركيب جديد بسعر الفئة المسجلة 4900 جنيه." },
  "service-012": { nameAr: "تركيب جديد – فئة 3450", descriptionAr: "تركيب جديد بسعر الفئة المسجلة 3450 جنيه." },
  "service-013": { nameAr: "تركيب جديد – فئة 3500", descriptionAr: "تركيب جديد بسعر الفئة المسجلة 3500 جنيه." },
  "service-016": { nameAr: "تركيب جديد – فئة 7500", descriptionAr: "تركيب جديد بسعر الفئة المسجلة 7500 جنيه." },
  "service-017": { nameAr: "تركيب جديد – فئة 2850", descriptionAr: "تركيب جديد بسعر الفئة المسجلة 2850 جنيه." },
  "facial-cleaning-001": { nameAr: "تنظيف بشرة احترافي", descriptionAr: "جلسة تنظيف بشرة ضمن قسم التنظيف الاحترافي." },
  "facial-cleaning-002": { nameAr: "تنظيف بشرة بروفيشنال", descriptionAr: "جلسة تنظيف بشرة بروفيشنال بالسعر والمدة المسجلين." }
};
services.forEach(item => {
  const clarification = serviceClarifications[item.id] || {};
  Object.assign(item, clarification, {
    descriptionAr: clarification.descriptionAr || `${item.nameAr} بالسعر والمدة الموضحين في الكارت.`,
    descriptionEn: clarification.descriptionEn || item.nameEn,
    branchIds: ["talkha", "mashaya"]
  });
});
Object.assign(services.find(item => item.id === "hair-028"), { duplicateOf: "hair-010", catalogVisible: false, descriptionAr: "سجل قديم مطابق لخدمة كيرلي كريم؛ محفوظ للتوافق مع الحجوزات السابقة ولا يظهر ككارت جديد." });

const p = (id, nameAr, nameEn, duration, price, badge = "") => ({
  id,
  nameAr,
  nameEn,
  descriptionAr: "باقة عناية متكاملة قابلة لتحديد خدماتها من لوحة الإدارة.",
  descriptionEn: "A complete care package. Included services can be configured from the admin dashboard.",
  includedServiceIds: [],
  originalPrice: price,
  price,
  duration,
  imageUrl: "/assets/package-premium.webp",
  startAt: null,
  endAt: null,
  status: "active",
  active: true,
  badge,
  branchIds: ["talkha", "mashaya"],
  sortOrder: Number(id.split("-").at(-1))
});

const packages = [
  p("package-001", "الباقة المتكاملة", "Complete Package", 45, 350, "popular"),
  p("package-002", "عرض 200", "EGP 200 Offer", 40, 200, "special"),
  p("package-003", "الباقة الأساسية", "Essential Package", 45, 250),
  p("package-004", "عرض الشباب", "Youth Offer", 30, 150, "popular"),
  p("package-005", "عرض رأس السنة", "New Year Offer", 60, 550, "special"),
  p("package-006", "الباقة المتكاملة – 60 دقيقة", "Complete Package – 60 Minutes", 60, 400, "popular"),
  ...newMashayaPackages
];
[
  "/assets/package-premium.webp", "/assets/package-haircut.webp", "/assets/package-beard.webp",
  "/assets/package-facial.webp", "/assets/package-expert.webp", "/assets/package-master.webp"
].forEach((imageUrl, index) => { packages[index].imageUrl = imageUrl; });

const staffNames = [
  ["علي", "Ali"], ["فارس", "Fares"], ["محمود عامر", "Mahmoud Amer"],
  ["السيد محمد", "El Sayed Mohamed"], ["الشواف", "El Shawaf"], ["عادل", "Adel"],
  ["أحمد رجب", "Ahmed Ragab"], ["عمر فتحي", "Omar Fathy"],
  ["أحمد السيد مساعد", "Ahmed El Sayed – Assistant"], ["إسماعيل", "Ismail"],
  ["أحمد رمزي", "Ahmed Ramzy"], ["إبراهيم عابر", "Ibrahim Aber"], ["تامر", "Tamer"],
  ["أحمد الشحات", "Ahmed El-Shahat"], ["عمار", "Ammar"], ["ياسين", "Yassin"],
  ["السكري", "El-Sokkary"], ["رمضان", "Ramadan"], ["معاذ", "Moaz"],
  ["محمد إبراهيم", "Mohamed Ibrahim"], ["محمد أيمن", "Mohamed Ayman"]
];

const staff = staffNames.map(([nameAr, nameEn], index) => ({
  id: `staff-${String(index + 1).padStart(3, "0")}`,
  nameAr,
  nameEn,
  imageUrl: [
    "/assets/staff-ali.webp",
    "/assets/staff-fares.webp",
    "/assets/staff-mahmoud-amer.webp",
    "/assets/staff-el-sayed.webp",
    "/assets/staff-el-shawaf.webp",
    "/assets/staff-adel.webp"
  ][index] || "",
  specialtyAr: index === 8 ? "مساعد حلاق" : "متخصص حلاقة وعناية رجالية",
  specialtyEn: index === 8 ? "Barber Assistant" : "Men's Grooming Specialist",
  bioAr: "عضو في فريق مزين مصر.",
  bioEn: "A member of the El Mezaen Egypt team.",
  branchIds: ["talkha", "mashaya"],
  serviceIds: [],
  workDays: [0, 1, 2, 3, 4, 5, 6],
  shiftStart: "11:00",
  shiftEnd: "23:00",
  breaks: [],
  available: true,
  active: true,
  sortOrder: index + 1,
  bookingCount: 0,
  revenueTotal: 0
}));

const offers = [];

const coupons = [{
  id: "WELCOME10",
  code: "WELCOME10",
  nameAr: "خصم الترحيب",
  nameEn: "Welcome Discount",
  type: "percent",
  value: 10,
  maxDiscount: 100,
  minSubtotal: 100,
  startAt: null,
  endAt: null,
  totalUsageLimit: 1000,
  perPhoneLimit: 1,
  applicableItemIds: [],
  active: true,
  usageCount: 0,
  discountTotal: 0
}];

const content = [
  { id: "celebrity-001", type: "celebrity", titleAr: "من صور مزين مصر مع المشاهير", titleEn: "El Mezaen Egypt Celebrity Gallery", imageUrl: "/assets/celebrity-1.webp", bodyAr: "", bodyEn: "", branchIds: ["talkha", "mashaya"], active: true, sortOrder: 1 },
  { id: "celebrity-002", type: "celebrity", titleAr: "لحظات مميزة في مزين مصر", titleEn: "Special Moments at El Mezaen Egypt", imageUrl: "/assets/celebrity-2.webp", bodyAr: "", bodyEn: "", branchIds: ["talkha", "mashaya"], active: true, sortOrder: 2 },
  { id: "celebrity-003", type: "celebrity", titleAr: "لقاء مميز من أرشيف مزين مصر", titleEn: "A Special Moment from El Mezaen Egypt", imageUrl: "/assets/celebrity-3.webp", bodyAr: "", bodyEn: "", branchIds: ["talkha", "mashaya"], active: true, sortOrder: 3 },
  { id: "celebrity-004", type: "celebrity", titleAr: "من لقاءات مزين مصر المميزة", titleEn: "A Memorable El Mezaen Egypt Encounter", imageUrl: "/assets/celebrity-4.webp", bodyAr: "", bodyEn: "", branchIds: ["talkha", "mashaya"], active: true, sortOrder: 4 }
];

const faqs = [
  { id: "faq-branches", questionAr: "أين توجد الفروع والعناوين؟", questionEn: "Where are the branches?", answerAr: "فرع المشاية في المشاية السفلية أمام بوابة نادي الجزيرة الثانية، وفرع طلخا في تقسيم بهاء الشربيني أمام محل LONDONE.", answerEn: "El Mashaya is opposite Al Gezira Club Gate 2. Talkha is in Bahaa El-Sherbiny Division opposite LONDONE.", actions: ["branch", "whatsapp"], keywords: ["الفروع", "العنوان", "المشاية", "طلخا"], active: true, sortOrder: 1 },
  { id: "faq-hours", questionAr: "ما مواعيد العمل؟", questionEn: "What are the working hours?", answerAr: "المواعيد الحالية يوميًا من 11 صباحًا إلى 11 مساءً، وتظهر المواعيد المتاحة الفعلية أثناء الحجز.", answerEn: "Current hours are daily from 11 AM to 11 PM; actual availability appears during booking.", actions: ["book"], keywords: ["المواعيد", "العمل", "الساعة"], active: true, sortOrder: 2 },
  { id: "faq-booking", questionAr: "كيف أحجز موعدًا؟", questionEn: "How do I book?", answerAr: "اختر الفرع ثم الخدمة أو الباقة والعامل والتاريخ والوقت، وبعد مراجعة السعر أدخل بياناتك واضغط تأكيد مرة واحدة.", answerEn: "Choose a branch, service or package, specialist, date and time, then review the total and confirm once.", actions: ["book", "services"], keywords: ["حجز", "موعد", "عامل"], active: true, sortOrder: 3 },
  { id: "faq-change-cancel", questionAr: "كيف أعدّل أو ألغي الحجز؟", questionEn: "How do I change or cancel a booking?", answerAr: "استخدم قسم «راجع أو ألغِ حجزك» بكود الحجز ورقم الهاتف. طلب التعديل متاح عبر واتساب الفرع، والإلغاء يظهر للحجوزات المؤهلة.", answerEn: "Use the manage-booking section with the booking code and phone. Changes go through branch WhatsApp; eligible bookings can be cancelled online.", actions: ["manage", "whatsapp"], keywords: ["تعديل", "إلغاء", "كود الحجز"], active: true, sortOrder: 4 },
  { id: "faq-services-prices", questionAr: "أين أجد الخدمات والأسعار؟", questionEn: "Where can I find services and prices?", answerAr: "صفحة الخدمات تعرض الأسعار والمدد الحالية. السعر النهائي للحجز يُعاد حسابه آمنًا من الخادم.", answerEn: "The services page shows current prices and durations. The final booking total is recalculated securely by the server.", actions: ["services", "book"], keywords: ["الخدمات", "الأسعار", "سعر"], active: true, sortOrder: 5 },
  { id: "faq-packages", questionAr: "ما الباقات والعروض المتاحة؟", questionEn: "Which packages and offers are available?", answerAr: "اختر الفرع أولًا لتظهر الباقات المتاحة له. عروض الصحاب وصبغة السيلفر وعرض الـ450 خاصة بفرع المشاية.", answerEn: "Choose a branch first to see its packages. The Friends, Silver Dye and EGP 450 offers are exclusive to El Mashaya.", actions: ["book", "branch"], keywords: ["الباقات", "العروض", "الصحاب", "السيلفر", "450"], active: true, sortOrder: 6 },
  { id: "faq-worker", questionAr: "هل يمكنني اختيار العامل؟", questionEn: "Can I choose a specialist?", answerAr: "نعم، اختر العامل التابع للفرع أثناء الحجز أو اختر أقرب متخصص متاح.", answerEn: "Yes. Choose a specialist assigned to the branch or select the nearest available specialist.", actions: ["book"], keywords: ["العامل", "الحلاق", "المتخصص"], active: true, sortOrder: 7 },
  { id: "faq-hair-system", questionAr: "هل متاح تركيب الشعر والشبكية؟", questionEn: "Are hair systems available?", answerAr: "نعم، تشمل الخدمات التركيب والقص والتنظيف والصيانة والسيرفيس. المعاينة داخل الفرع تحدد الخيار الأنسب.", answerEn: "Yes. Services include fitting, cutting, cleaning, maintenance and servicing. An in-branch consultation determines the best option.", actions: ["hair", "whatsapp"], keywords: ["تركيب الشعر", "الشبكية", "صيانة", "سيرفيس"], active: true, sortOrder: 8 },
  { id: "faq-contact", questionAr: "كيف أتواصل عبر واتساب؟", questionEn: "How do I contact WhatsApp?", answerAr: "اختر الفرع أولًا ثم اضغط واتساب ليتم توجيهك إلى رقم الفرع الصحيح.", answerEn: "Choose a branch first, then tap WhatsApp to contact the correct branch number.", actions: ["branch", "whatsapp"], keywords: ["واتساب", "تواصل", "رقم"], active: true, sortOrder: 9 }
];
faqs.forEach(item => { item.branchIds = ["talkha", "mashaya"]; });

const settings = {
  businessNameAr: "مزين مصر",
  businessNameEn: "El Mezaen Egypt",
  openingTime: "11:00",
  closingTime: "23:00",
  slotMinutes: 15,
  ...sharedSocial,
  aboutAr: "في مزين مصر نؤمن أن الإطلالة القوية تبدأ من التفاصيل. منذ 1995 نجمع بين خبرة السنين، أحدث أساليب الحلاقة والعناية الرجالية، واهتمام حقيقي براحتك لتخرج كل مرة بأفضل نسخة منك.",
  aboutEn: "Since 1995, El Mezaen Egypt has combined trusted experience, modern men's grooming and genuine attention to detail so every visit brings out your best look.",
  currency: "EGP"
};

export const seedCatalog = { branches, categories, services, packages, staff, offers, coupons, drinks: [], content, faqs, settings };
export const collectionsForSeed = { branches, categories, services, packages, staff, offers, coupons, content, faqs };
