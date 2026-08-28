const choice = (id, labelAr, labelEn, options) => ({
  id,
  labelAr,
  labelEn,
  required: true,
  minSelections: 1,
  maxSelections: 1,
  options
});

const option = (id, labelAr, labelEn, serviceId) => ({ id, labelAr, labelEn, serviceId });

export const NEW_PACKAGE_IDS = [
  "package-mashaya-friends-250",
  "package-mashaya-silver-600",
  "package-mashaya-450"
];

export const newMashayaPackages = [
  {
    id: NEW_PACKAGE_IDS[0],
    nameAr: "عرض الصحاب",
    nameEn: "Friends Offer",
    descriptionAr: "باقة عناية كاملة للأصحاب في فرع المشاية، مع اختيار خدمة الدقن وطريقة التسريح أثناء الحجز.",
    descriptionEn: "A complete friends grooming package at El Mashaya, with beard and styling choices during booking.",
    includedItemsAr: ["شعر", "دقن زيرو أو تنعيم", "حمام كريم", "ماسك لإزالة الدهون", "ماسك سنفرة", "فوطة نعناع", "فوطة سخنة", "تسريح استشوار أو ويفي"],
    includedItemsEn: ["Haircut", "Zero beard shave or smoothing", "Cream bath", "Oil-control mask", "Exfoliating mask", "Mint towel", "Hot towel", "Blow-dry or wavy styling"],
    includedServiceIds: ["hair-001", "hair-011", "skin-002", "beard-care-004"],
    choiceGroups: [
      choice("beard-finish", "اختر خدمة الدقن", "Choose beard service", [
        option("zero", "دقن زيرو", "Zero beard shave", "beard-001"),
        option("smoothing", "تنعيم دقن", "Beard smoothing", "beard-care-001")
      ]),
      choice("hair-finish", "اختر التسريح", "Choose styling", [
        option("blow-dry", "تسريح استشوار", "Blow-dry styling", "hair-006"),
        option("wavy", "تسريح ويفي", "Wavy styling", "hair-008")
      ])
    ],
    termsAr: "لو 3 صحاب جم مع بعض، الرابع شعره مجانًا. يُطبّق الشرط داخل الفرع بعد التحقق من حضور المجموعة؛ لا يُخصم تلقائيًا من الموقع حاليًا.",
    termsEn: "When three friends arrive together, the fourth haircut is free. The branch verifies the group; no automatic online discount is applied yet.",
    promotionMode: "terms-only",
    maximumAutomaticApplications: 0,
    originalPrice: 350,
    price: 250,
    duration: 61,
    durationSource: "linked-services-max-choice",
    branchIds: ["mashaya"],
    branchLabelAr: "خاص بفرع المشاية – المنصورة",
    phone: "01101006961",
    imageUrl: "/assets/package-mashaya-friends-250.webp",
    status: "active",
    active: true,
    badge: "special",
    sortOrder: 7
  },
  {
    id: NEW_PACKAGE_IDS[1],
    nameAr: "عرض صبغة السيلفر",
    nameEn: "Silver Dye Offer",
    descriptionAr: "صبغة سيلفر وعناية متكاملة في فرع المشاية، مع اختيار خدمة الدقن وطريقة التسريح أثناء الحجز.",
    descriptionEn: "Silver dye and complete grooming at El Mashaya, with beard and styling choices during booking.",
    includedItemsAr: ["صبغة سيلفر", "شعر", "دقن زيرو أو تنعيم", "حمام كريم", "ماسك سنفرة", "فوطة سخنة", "فوطة ساقعة", "تسريح استشوار أو ويفي"],
    includedItemsEn: ["Silver dye", "Haircut", "Zero beard shave or smoothing", "Cream bath", "Exfoliating mask", "Hot towel", "Cold towel", "Blow-dry or wavy styling"],
    includedServiceIds: ["hair-016", "hair-001", "hair-011", "skin-002"],
    choiceGroups: [
      choice("beard-finish", "اختر خدمة الدقن", "Choose beard service", [
        option("zero", "دقن زيرو", "Zero beard shave", "beard-001"),
        option("smoothing", "تنعيم دقن", "Beard smoothing", "beard-care-001")
      ]),
      choice("hair-finish", "اختر التسريح", "Choose styling", [
        option("blow-dry", "تسريح استشوار", "Blow-dry styling", "hair-006"),
        option("wavy", "تسريح ويفي", "Wavy styling", "hair-008")
      ])
    ],
    termsAr: "العرض خاص بفرع المشاية، والسعر يُحسب من الخادم ولا يتغير باختيارات البدائل.",
    termsEn: "El Mashaya only. The server calculates the price; alternative choices do not alter it.",
    promotionMode: "fixed-price",
    maximumAutomaticApplications: 1,
    originalPrice: 800,
    price: 600,
    duration: 63,
    durationSource: "linked-services-max-choice",
    branchIds: ["mashaya"],
    branchLabelAr: "خاص بفرع المشاية – المنصورة",
    phone: "01101006961",
    imageUrl: "/assets/package-mashaya-silver-600.webp",
    status: "active",
    active: true,
    badge: "special",
    sortOrder: 8
  },
  {
    id: NEW_PACKAGE_IDS[2],
    nameAr: "عرض الـ450",
    nameEn: "EGP 450 Offer",
    descriptionAr: "قص شعر ودقن وتنظيف بشرة بروفيشنال وشمع، مع اختيار استشوار أو ويفي في فرع المشاية.",
    descriptionEn: "Haircut, beard, professional facial and waxing, with a blow-dry or wavy choice at El Mashaya.",
    includedItemsAr: ["قص شعر", "دقن", "تنظيف بشرة بروفيشنال", "شمع", "استشوار أو ويفي"],
    includedItemsEn: ["Haircut", "Beard", "Professional facial cleansing", "Waxing", "Blow-dry or wavy styling"],
    includedServiceIds: ["hair-001", "beard-001", "facial-cleaning-002", "wax-002"],
    choiceGroups: [
      choice("hair-finish", "اختر التسريح", "Choose styling", [
        option("blow-dry", "استشوار", "Blow-dry", "hair-005"),
        option("wavy", "ويفي", "Wavy styling", "hair-007")
      ])
    ],
    termsAr: "اسم العرض قابل للتعديل من لوحة الإدارة. المدة محسوبة من مدد الخدمات المرتبطة وأطول اختيار بديل، ويمكن للأدمن تعديلها بعد مراجعة زمن التنفيذ الفعلي.",
    termsEn: "The offer name is editable. Duration is derived from linked services and the longest alternative, and can be adjusted by an administrator.",
    promotionMode: "fixed-price",
    maximumAutomaticApplications: 1,
    originalPrice: 750,
    price: 450,
    duration: 95,
    durationSource: "linked-services-max-choice",
    branchIds: ["mashaya"],
    branchLabelAr: "خاص بفرع المشاية – المنصورة",
    phone: "01101006961",
    imageUrl: "/assets/package-mashaya-450.webp",
    status: "active",
    active: true,
    badge: "special",
    sortOrder: 9
  }
];
