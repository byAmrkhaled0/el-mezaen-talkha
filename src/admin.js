import "./admin.css";
import { addCashMovement, adjustCustomerWallet, changeBooking, checkWhatsappMarketingRecipient, changeOwnPassword, changeUserRole, closeBusinessDay, closeCashShift, createPosOrder, createUserAccount, createVideoPoster, createWhatsappCampaign, createWorkerTask, currentAccess, deleteEntity, enablePush, ensureAdminAppCheckReady, findCustomerByPhone, getAttendanceDashboard, getAuditEvents, getBookingCalendar, getBusinessDashboard, getBusinessReport, getCashierSnapshot, getCashOperations, getCollection, getCustomer360, getDashboard, getOwnerMobileHistory, getPosOffers, getServiceTargetsDashboard, getWorkerWorkspace, getWhatsappCampaignOptions, getWhatsappCampaignRecipients, getWhatsappCampaignStats, logout, notifyWorker, openCashShift, previewPosCoupon, previewWhatsappCampaign, rebuildBusinessReport, recordExpense, recordPayrollPayment, recordWorkerAttendance, rescheduleBooking, rotateCustomerQr, saveEntity, scanCustomerCode, secureDeleteRecord, setBranchMonthlyTarget, updateExpense, updateWorkerProfilePhoto, updateWorkerTask, upsertServiceTarget, updateWhatsappCampaignState, updateWhatsappConsent, uploadImage, uploadVideo, validateVideoFile, verifyAdminPassword, watchAuth } from "./admin-api.js";
import { cashVariance, closeShiftReasonMissing } from "./cashier-shift.js";
import { isInvalidAuthSession } from "./admin-session.js";
import { isVideoContent, safeMediaUrl, videoSource } from "./media.js";
import { newMashayaPackages } from "./package-definitions.js";
import { normalizePhone } from "../functions/src/core.js";
import { ROLE_DEFAULT_PERMISSIONS, ROLE_CAPABILITY_CEILINGS, effectivePermissions } from "../functions/src/authorization.js";
import { availableAtBranch } from "./branch-availability.js";
import { weekStart } from "../functions/src/reporting.js";
import { saveStaffTabPreference } from "./staff-tab-state.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(value || 0));
const dateTime = value => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(date) : "—";
};
const cairoDateKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const escapeHtml = value => { const node = document.createElement("div"); node.textContent = value ?? ""; return node.innerHTML.replaceAll('"', "&quot;").replaceAll("'", "&#39;"); };
const escapeAttr = value => escapeHtml(String(value ?? "")).replaceAll('"', "&quot;");
const state = { user: null, role: null, staffId: "", permissions: new Set(), branchIds: [], hub: "", dashboard: { bookings: [], ledger: [], expenses: [], stats: {} }, attendance: { rows: [] }, worker: { staff: null, attendance: null, bookings: [], tasks: [], notifications: [], target: {} }, business: { payroll: [], serviceTargets: [], expenses: [], inventory: [], drinks: [], reviews: [], stats: {} }, calendar: { bookings: [], staff: [] }, cash: { state: null, shift: null, snapshot: null, movements: [] }, loadedAt: { dashboard: 0, cashier: 0, business: 0, calendar: 0, cash: 0, attendance: 0, worker: 0 }, posCart: [], posOffers: [], posOffersBranch: "", posOffersLoadedAt: 0, bookingActionKeys: new Map(), posIdempotencyKey: "", posBookingId: "", editingExpenseId: "", editingUserId: "", collections: new Map(), collectionCursors: new Map(), section: "workspaceHome", expenseInventoryKind: "all", lastBookingIds: new Set(), editor: { collection: "", id: "", preset: {} }, secureDelete: { kind: "", id: "", label: "" }, manualOffer: { offer: null, recipients: [], nextCursor: null, opened: new Set(), message: "" } };
const permissionLabels = { dashboard: "الرئيسية", pos: "نقطة البيع", bookings: "الحجوزات", attendance: "الحضور والموجودون", tasks: "مهام وتنبيهات العمال", revenue: "الدفع والإيرادات", refundTransactions: "استرداد المعاملات", expenses: "المصروفات", inventory: "البضاعة والمخزون", drinks: "المشروبات", payroll: "الرواتب والتارجت", services: "الخدمات والتصنيفات", packages: "الباقات", offers: "العروض", coupons: "أكواد الخصم", staff: "فريق العمل", customers: "العملاء", rewards: "الولاء والمحافظ", campaigns: "حملات واتساب", reviews: "التقييمات", schedule: "المواعيد والإجازات", gallery: "الصور والمعرض", results: "نتائج شغلنا", hairMedia: "فيديوهات التركيبات", celebrities: "صور المشاهير", posts: "الأخبار والمنشورات", faqs: "أسئلة الشات", settings: "إعدادات الموقع", activity: "سجل الأنشطة" };
const roleDefaults = ROLE_DEFAULT_PERMISSIONS;
const socialSections = new Set(["packages", "offers", "coupons", "reviews", "gallery", "results", "hairMedia", "celebrities", "posts", "faqs", "campaigns"]);
let dashboardPage = 1;
let dashboardRequestVersion = 0;
let cashierRequestVersion = 0;
let calendarRequestVersion = 0;
let teamRequestVersion = 0;
let attendanceRequestVersion = 0;
const managementSections = new Set(["dashboard", "pos", "bookings", "calendar", "attendance", "tasks", "worker", "customers", "revenue", "expenses", "cash", "cashierGoals", "dailyClosing", "inventory", "drinks", "payroll", "services", "staff", "rewards", "schedule", "settings", "activity", "users", "mobileContent"]);
const contentGrants = { gallery: "gallery", result: "results", "hair-system": "hairMedia", celebrity: "celebrities", news: "posts", offer: "offers" };
const canManageContent = type => state.role === "admin" || (contentGrants[type] && state.permissions.has(contentGrants[type]));
const hasContentWorkspace = () => Object.keys(contentGrants).some(canManageContent);

const fields = {
  branches: [
    ["id", "معرّف الفرع بالإنجليزية بدون مسافات (مثال: talkha)", "text", true], ["nameAr", "اسم الفرع بالعربية", "text", true], ["shortNameAr", "الاسم المختصر", "text", true], ["code", "رمز الفرع في كود الحجز", "text", true],
    ["addressAr", "العنوان الكامل", "textarea", true, null, true], ["phone", "رقم الموبايل", "tel", true], ["secondaryPhone", "رقم إضافي أو أرضي", "tel"], ["whatsapp", "رقم واتساب الدولي", "tel", true],
    ["mapsUrl", "رابط خرائط Google", "url", true, null, true], ["latitude", "خط العرض GPS", "number", true], ["longitude", "خط الطول GPS", "number", true], ["attendanceRadiusMeters", "نطاق الحضور بالمتر (25–1000)", "number", true], ["monthlyRevenueTarget", "هدف مبيعات الفرع الشهري (0 = غير محدد)", "number"], ["openingTime", "بداية العمل", "time", true], ["closingTime", "نهاية العمل", "time", true], ["slotMinutes", "الفاصل بين المواعيد", "number", true],
    ["facebook", "رابط Facebook", "url", false, null, true], ["instagram", "رابط Instagram", "url", false, null, true], ["tiktok", "رابط TikTok", "url", false, null, true], ["sortOrder", "ترتيب الظهور", "number"], ["active", "متاح للحجز", "boolean"]
  ],
  categories: [
    ["nameAr", "اسم التصنيف", "text", true], ["sortOrder", "ترتيب الظهور", "number"], ["active", "الحالة", "boolean"]
  ],
  services: [
    ["nameAr", "اسم الخدمة", "text", true], ["categoryId", "التصنيف", "category-select", true],
    ["price", "السعر", "number", true], ["duration", "المدة بالدقائق", "number", true], ["branchIds", "تظهر في", "branch-scope", true, null, true], ["startsFrom", "السعر يبدأ من", "boolean"], ["type", "النوع", "select", true, [["service", "خدمة"], ["product", "منتج"]]], ["sortOrder", "ترتيب الظهور", "number"], ["active", "مفعلة", "boolean"]
  ],
  packages: [
    ["nameAr", "اسم الباقة", "text", true], ["descriptionAr", "الوصف", "textarea", false, null, true],
    ["includedItemsAr", "الخدمات الظاهرة للعميل (كل خدمة في سطر)", "textarea", false, null, true], ["includedServiceIds", "معرّفات الخدمات المرتبطة (بفواصل)", "text", false, null, true], ["choiceGroups", "مجموعات الاختيار بصيغة JSON", "json", false, null, true], ["termsAr", "الشروط المهمة", "textarea", false, null, true],
    ["branchIds", "تظهر في", "branch-scope", true, null, true], ["originalPrice", "السعر قبل الخصم", "number"], ["price", "السعر بعد الخصم", "number", true], ["duration", "المدة بالدقائق", "number", true], ["phone", "هاتف العرض", "tel"],
    ["imageUrl", "رابط الصورة", "url", false, null, true], ["imageFile", "رفع صورة", "file", false, null, true], ["startAt", "بداية العرض", "datetime-local"], ["endAt", "نهاية العرض", "datetime-local"],
    ["status", "الحالة", "select", true, [["active", "نشطة"], ["expired", "منتهية"], ["scheduled", "مجدولة"], ["stopped", "متوقفة"]]], ["badge", "العلامة", "select", false, [["", "بدون"], ["popular", "الأكثر طلبًا"], ["special", "عرض مميز"]]], ["sortOrder", "الترتيب", "number"], ["active", "تظهر في الموقع", "boolean"]
  ],
  offers: [
    ["nameAr", "اسم العرض", "text", true], ["descriptionAr", "الوصف", "textarea", false, null, true],
    ["oldPrice", "السعر القديم", "number", true], ["newPrice", "السعر الجديد", "number", true], ["duration", "المدة", "number"], ["includedServiceIds", "الخدمات المشمولة (بفواصل)", "text", false, null, true], ["linkedPackageIds", "الباقات المرتبطة (بفواصل)", "text", false, null, true], ["branchIds", "يظهر في", "branch-scope", true, null, true],
    ["imageUrl", "رابط الصورة", "url", false, null, true], ["imageFile", "رفع صورة", "file", false, null, true], ["startAt", "تاريخ البداية", "datetime-local"], ["endAt", "تاريخ النهاية", "datetime-local"], ["showCountdown", "إظهار عداد الانتهاء", "boolean"],
    ["status", "الحالة", "select", true, [["scheduled", "مجدول"], ["active", "نشط"], ["expired", "منتهي"], ["stopped", "متوقف"]]], ["sortOrder", "الترتيب", "number"], ["active", "مفعل", "boolean"]
  ],
  coupons: [
    ["code", "كود الخصم", "text", true], ["nameAr", "اسم الكود", "text"], ["type", "نوع الخصم", "select", true, [["percent", "نسبة مئوية"], ["fixed", "قيمة ثابتة"]]],
    ["value", "نسبة أو قيمة الخصم", "number", true], ["maxDiscount", "الحد الأقصى للخصم", "number"], ["minSubtotal", "الحد الأدنى للحجز", "number"], ["totalUsageLimit", "عدد الاستخدامات الإجمالي", "number"], ["perPhoneLimit", "الاستخدامات لكل هاتف", "number"],
    ["applicableItemIds", "خدمات/باقات مخصصة (بفواصل)", "text", false, null, true], ["branchIds", "الفروع المسموح بها", "branch-scope", false, null, true], ["startAt", "تاريخ البداية", "datetime-local"], ["endAt", "تاريخ النهاية", "datetime-local"], ["active", "مفعل", "boolean"]
  ],
  staff: [
    ["nameAr", "الاسم", "text", true], ["specialtyAr", "التخصص", "text"],
    ["bioAr", "نبذة", "textarea", false, null, true], ["imageUrl", "رابط الصورة", "url", false, null, true], ["imageFile", "رفع الصورة", "file", false, null, true],
    ["branchIds", "يعمل في", "branch-scope", true, null, true], ["serviceIds", "معرّفات الخدمات التي يقدمها (بفواصل)", "text", false, null, true], ["workDays", "أيام العمل 0-6 (بفواصل)", "text"], ["shiftStart", "بداية الشيفت", "time"], ["shiftEnd", "نهاية الشيفت", "time"], ["breaks", "أوقات الراحة (بفواصل)", "text", false, null, true],
    ["baseSalary", "الراتب الأساسي الشهري", "number"], ["monthlyTarget", "تارجت الإيراد الشهري", "number"], ["targetBonusPercent", "نسبة الزيادة عند تحقيق التارجت %", "number"],
    ["available", "متاح", "boolean"], ["sortOrder", "ترتيب الظهور", "number"], ["bookingCount", "عدد الحجوزات", "number"], ["revenueTotal", "إجمالي الإيرادات", "number"], ["active", "مفعل", "boolean"]
  ],
  workerLeaves: [["staffId", "العامل", "staff-select", true], ["branchId", "الفرع", "drink-branch-select", true], ["dateKey", "التاريخ", "date", true], ["startTime", "من", "time", true], ["endTime", "إلى", "time", true], ["reason", "السبب", "text"], ["active", "مفعلة", "boolean"]],
  inventoryItems: [
    ["nameAr", "اسم الصنف", "text", true], ["category", "النوع", "select", true, [["product", "بضاعة للبيع"], ["supply", "مستلزم تشغيل"]]], ["branchId", "الفرع", "branch-select", true],
    ["costPrice", "سعر التكلفة", "number", true], ["sellingPrice", "سعر البيع", "number", true], ["stockQty", "الرصيد الحالي", "number", true], ["minStock", "حد تنبيه النقص", "number"], ["unit", "الوحدة", "text"], ["sortOrder", "الترتيب", "number"], ["active", "متاح", "boolean"]
  ],
  drinks: [
    ["nameAr", "اسم المشروب", "text", true], ["type", "النوع", "select", true, [["hot", "ساخن"], ["cold", "بارد"], ["soft-drink", "مشروب غازي"], ["other", "أخرى"]]], ["branchId", "الفرع", "drink-branch-select", true],
    ["price", "سعر البيع", "number", true], ["drinkOptions", "اختيارات تحضير المشروب بفواصل (مثال: سادة، مظبوط، زيادة)", "text", false, null, true], ["sortOrder", "ترتيب الظهور", "number"], ["active", "متاح في الحجز", "boolean"]
  ],
  reviews: [["name", "اسم العميل", "text", true], ["rating", "التقييم من 5", "number", true], ["comment", "التعليق", "textarea", true, null, true], ["bookingCode", "كود الحجز", "text"], ["status", "حالة التقييم", "select", true, [["pending", "بانتظار المراجعة"], ["published", "منشور"], ["rejected", "مرفوض"]]], ["featured", "تقييم مميز ومثبت", "boolean"], ["adminReply", "رد الإدارة", "textarea", false, null, true]],
  faqs: [["questionAr", "السؤال بالعربية", "text", true, null, true], ["answerAr", "الإجابة المحددة", "textarea", true, null, true], ["keywords", "كلمات البحث (بفواصل)", "text", false, null, true], ["actions", "الأزرار: book, services, hair, branch, whatsapp, manage", "text", false, null, true], ["branchIds", "يظهر في", "branch-scope", true, null, true], ["sortOrder", "ترتيب الظهور", "number"], ["active", "مفعل", "boolean"]],
  holidays: [["branchId", "الفرع", "branch-select", true], ["date", "التاريخ", "date", true], ["reasonAr", "السبب", "text"], ["closed", "مغلق بالكامل", "boolean"]],
  content: [["type", "", "hidden"], ["mediaType", "", "hidden"], ["imageUrl", "", "hidden"], ["videoUrl", "", "hidden"], ["beforeImageUrl", "", "hidden"], ["afterImageUrl", "", "hidden"], ["linkUrl", "", "hidden"], ["titleAr", "العنوان", "text", true], ["branchIds", "يظهر في", "branch-scope", true, null, true], ["bodyAr", "وصف اختياري", "textarea", false, null, true], ["mediaFile", "اختر صورة أو فيديو من الجهاز", "media-file", false, null, true], ["beforeFile", "قبل (اختياري للنتائج)", "file", false, null, true], ["afterFile", "بعد (اختياري للنتائج)", "file", false, null, true], ["status", "حالة المحتوى", "select", true, [["draft", "مسودة"], ["published", "منشور"], ["hidden", "مخفي"]]], ["sortOrder", "ترتيب الظهور", "number"]],
};

const sectionTitles = Object.fromEntries($$('[data-section]').map(button => [button.dataset.section, button.textContent.trim().replace(/^[^\s]+\s/, "")]));
sectionTitles.workspaceHome = "البوابات الرئيسية";
sectionTitles.cashierGoals = "أهداف الخدمات";

function sectionPermission(id) { return ({ calendar: "bookings", cash: "pos", cashierGoals: "dashboard", dailyClosing: "revenue", worker: "dashboard" })[id] || id; }
const cashierSections = new Set(["pos", "calendar", "bookings", "cash", "cashierGoals", "expenses"]);
const cashierOptionalMarketing = new Set(["offers", "campaigns"]);
function canOpenSection(id) {
  if (!document.getElementById(id)?.classList.contains("admin-section")) return false;
  if (id === "mobileContent") return hasContentWorkspace();
  if (state.role === "cashier") {
    return (cashierSections.has(id) || cashierOptionalMarketing.has(id)) && state.permissions.has(sectionPermission(id));
  }
  if (id === "workspaceHome") return true;
  if (state.role === "admin") return true;
  if (state.role === "worker") return id === "worker";
  if (id === "dailyClosing") return state.permissions.has("revenue") && state.permissions.has("expenses");
  return state.permissions.has(sectionPermission(id));
}
function sectionHub(id) { return socialSections.has(id) ? "social" : managementSections.has(id) ? "management" : ""; }
function availableHubSections(hub) {
  const pool = hub === "social" ? socialSections : managementSections;
  return [...pool].filter(id => $("#" + id) && canOpenSection(id) && !(id === "worker" && state.role !== "worker"));
}
function refreshSidebarGroups() {
  $$("#sidebar .nav-group-title").forEach(title => {
    let next = title.nextElementSibling;
    let visible = false;
    while (next && !next.classList.contains("nav-group-title")) {
      if (next.matches("button") && !next.hidden) visible = true;
      next = next.nextElementSibling;
    }
    title.hidden = !visible;
  });
}
function commitAdminHistory(section, mode = "push") {
  if (mode === "none") return;
  const current = history.state?.adminSection;
  if (current === section && mode === "push") return;
  const url = new URL(location.href);
  url.hash = section === "workspaceHome" ? "" : `admin=${encodeURIComponent(section)}`;
  const previousDepth = Math.max(0, Number(history.state?.adminDepth || 0));
  const payload = { ...(history.state || {}), adminSection: section, adminDepth: mode === "replace" ? previousDepth : previousDepth + 1 };
  history[mode === "replace" ? "replaceState" : "pushState"](payload, "", url);
}
function showWorkspaceHome({ historyMode = "push" } = {}) {
  closeScanner();
  if (state.role === "cashier") return void showSection("calendar", { historyMode: "replace" });
  state.hub = "";
  state.section = "workspaceHome";
  $("#adminApp").dataset.hub = "";
  commitAdminHistory("workspaceHome", historyMode);
  $("#adminApp")?.classList.add("portal-mode");
  $$(".admin-section").forEach(section => section.classList.toggle("active", section.id === "workspaceHome"));
  $$("[data-section]").forEach(button => button.classList.remove("active"));
  $("#pageTitle").textContent = sectionTitles.workspaceHome;
  const hasSocial = availableHubSections("social").length > 0;
  const socialGate = $('[data-open-hub="social"]');
  if (socialGate) socialGate.hidden = !hasSocial;
  closeAdminMenu();
}
async function openHub(hub) {
  const sections = availableHubSections(hub);
  if (!sections.length) return toast("لا توجد صلاحيات متاحة في هذا القسم", true);
  state.hub = hub;
  $("#adminApp").dataset.hub = hub;
  $("#adminApp")?.classList.remove("portal-mode");
  applyAccess();
  const preferred = state.role === "worker" ? "worker" : hub === "management" && sections.includes("dashboard") ? "dashboard" : sections[0];
  await showSection(preferred);
}

function setupPanels() {
  $$('entity-panel').forEach(panel => {
    const collection = panel.dataset.collection;
    const readonly = panel.dataset.readonly === "true";
    const inventoryView = panel.dataset.inventoryView || "";
    const listKey = inventoryView ? `${collection}-${inventoryView}` : collection;
    const addLabel = collection === "staff" ? "+ إضافة عضو فريق باسمه وصورته" : collection === "drinks" ? "+ إضافة مشروب" : inventoryView === "products" ? "+ إضافة صنف بضاعة" : collection === "inventoryItems" ? "+ إضافة صنف" : collection === "reviews" ? "+ إضافة تقييم يدوي" : "+ إضافة جديد";
    const reviewFilter = collection === "reviews" ? '<select id="reviewStatusFilter"><option value="all">كل التقييمات</option><option value="pending">بانتظار المراجعة</option><option value="published">المنشورة</option><option value="rejected">المرفوضة</option><option value="featured">المميزة</option></select>' : "";
    const customerFilter = collection === "customers" ? '<select id="customerSegmentFilter" aria-label="شريحة العملاء"><option value="all">كل العملاء</option><option value="recent">زاروا مؤخرًا</option><option value="inactive">لم يزوروا منذ 60 يومًا</option><option value="vip">الأعلى إنفاقًا</option><option value="rewards">لديهم رصيد مكافآت</option></select>' : "";
    const presetCategory = panel.dataset.presetCategory ? ` data-preset-category="${escapeAttr(panel.dataset.presetCategory)}"` : "";
    const viewAttribute = inventoryView ? ` data-entity-view="${escapeAttr(inventoryView)}"` : "";
    const hint = collection === "drinks" ? "قسم مستقل عن البضاعة والمخزون؛ المشروب يظهر تلقائيًا في حجز الفرع ونقطة البيع." : inventoryView === "products" ? "البضاعة ومستلزمات التشغيل لها مخزون وتكلفة شراء مستقلة." : collection === "reviews" ? "راجع التقييمات وانشرها أو ارفضها وثبّت الأفضل ورد على العميل." : readonly ? "عرض البيانات المسجلة." : "إضافة وتعديل وإخفاء وحذف العناصر.";
    const requiredPackages = collection === "packages" ? '<div class="required-packages-status" id="requiredPackagesStatus" hidden><div><b>الباقات الجديدة غير مكتملة في Firestore</b><span id="requiredPackagesMessage"></span></div><button class="small-button primary" type="button" data-install-required-packages>إضافة الباقات الناقصة بأمان</button></div>' : "";
    panel.innerHTML = `<article class="admin-panel"><div class="panel-head wrap"><div><h2>${escapeHtml(panel.dataset.title)}</h2><p>${hint}</p></div><div class="toolbar"><input data-entity-search="${collection}"${viewAttribute} placeholder="بحث في ${escapeAttr(panel.dataset.title)}">${reviewFilter}${customerFilter}${readonly ? "" : `<button class="small-button primary" data-new="${collection}"${presetCategory}>${addLabel}</button>`}</div></div>${collection === "customers" ? '<div class="customer-segment-summary" id="customerSegmentSummary"></div>' : ""}${requiredPackages}<div class="entity-grid" data-list="${listKey}"${viewAttribute}></div><button class="small-button load-more" type="button" data-load-more="${collection}" hidden>تحميل المزيد</button></article>`;
  });
  $$('content-panel').forEach(panel => {
    const type = panel.dataset.type;
    const hint = type === "hair-system" ? "ارفع فيديو MP4 بترميز H.264 لعرضه سريعًا داخل صفحة التركيبات." : type === "result" ? "ارفع تصميم قبل وبعد جاهزًا، وحدد الفرع ثم انشره." : type === "news" ? "أضف صورة أو فيديو، وحدد الفرع الذي يظهر فيه المنشور." : "حدد الفرع وارفع صورة واضحة ومحسنة للهاتف.";
    panel.innerHTML = `<article class="admin-panel"><div class="panel-head"><div><h2>${escapeHtml(panel.dataset.title)}</h2><p>${hint}</p></div><button class="small-button primary" data-new="content" data-preset-type="${type}" data-preset-media="${type === "hair-system" ? "video" : "image"}">+ إضافة</button></div><div class="entity-grid" data-list="content-${type}"></div></article>`;
  });
  const rewardsForm=$("#rewardsSettings");if(rewardsForm&&!rewardsForm.elements.whatsappReceiptsEnabled){rewardsForm.querySelector('button[type="submit"]')?.insertAdjacentHTML("beforebegin",'<label>درج الكاش والورديات<select name="cashDrawerEnabled"><option value="false">متوقف (تشغيل آمن)</option><option value="true">مفعل وإلزامي للنقدي</option></select></label><label>إرسال شيكات واتساب<select name="whatsappReceiptsEnabled"><option value="false">متوقف</option><option value="true">مفعل</option></select></label><label>قالب الشيك في Meta<input name="whatsappReceiptTemplate" pattern="[a-z0-9_]*"></label><label>حملات واتساب<select name="whatsappCampaignsEnabled"><option value="false">متوقفة</option><option value="true">مفعلة</option></select></label><label class="full">Customer IDs للاختبار بفواصل<input name="whatsappTestCustomerIds"></label>')}
  const discountLabel=$("#posDiscount")?.closest("label");if(discountLabel&&!$("#posRedeemPoints"))discountLabel.insertAdjacentHTML("afterend",'<div class="pos-customer-fields"><label>استبدال نقاط<input id="posRedeemPoints" type="number" min="0" step="1" value="0"></label><label>استبدال كاش باك<input id="posRedeemCashback" type="number" min="0" step="0.01" value="0"></label></div>');
}

function toast(message, error = false) {
  const el = $("#adminToast");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function setTheme(theme) {
  theme = "light"; // Admin v4.1 uses the reference's light palette even with an old saved preference.
  document.documentElement.dataset.theme = theme;
  saveStaffTabPreference("mz-admin-theme", theme);
  $("#adminTheme").innerHTML = theme === "dark"
    ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>'
    : '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z"/></svg>';
  const mobile = $("#mobileThemeToggle");
  if (mobile) {
    mobile.innerHTML = `${$("#adminTheme").innerHTML}<span>${theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}</span>`;
    mobile.setAttribute("aria-pressed", String(theme === "dark"));
  }
}

async function showSection(id, { historyMode = "push" } = {}) {
  if (id === "workspaceHome") return showWorkspaceHome({ historyMode });
  if (!canOpenSection(id)) return toast("لا تملك صلاحية هذا القسم", true);
  if (id !== state.section) closeScanner();
  if (state.hub && sectionHub(id) && sectionHub(id) !== state.hub) return toast("ارجع للبوابات لاختيار مساحة العمل", true);
  state.section = id;
  if (id === "pos") setPosView("receipts");
  commitAdminHistory(id, historyMode);
  $("#adminApp")?.classList.remove("portal-mode");
  $$('.admin-section').forEach(section => section.classList.toggle("active", section.id === id));
  $$('[data-section]').forEach(button => button.classList.toggle("active", button.dataset.section === id));
  $$('#sidebar .sidebar-primary [data-go="cash"]').forEach(button => button.classList.toggle("active", id === "cash"));
  $$('#sidebar .sidebar-primary [data-cashier-target]').forEach(button => button.classList.remove("active"));
  if (id === "cashierGoals") $$('#cashierSidebarItems [data-cashier-target]').forEach(button => button.classList.add("active"));
  $("#pageTitle").textContent = sectionTitles[id] || id;
  if ($("#cashierPageTitle")) $("#cashierPageTitle").textContent = id === "cash" ? "إحصائيات الشيفت" : sectionTitles[id] || id;
  closeAdminMenu();
  const activeSection = $("#" + id);
  activeSection?.classList.add("section-loading");
  const tasks = [];
  if (id === "pos" || (id === "bookings" && state.role === "cashier")) {
    if (id === "bookings" || Date.now() - state.loadedAt.cashier > 60_000) tasks.push(loadCashierDashboard());
    if (id === "pos" && state.role === "cashier" && Date.now() - state.loadedAt.cash > 60_000) tasks.push(loadCashOperations(true));
  } else if (["dashboard", "bookings", "revenue", "expenses"].includes(id) && (id === "bookings" || Date.now() - state.loadedAt.dashboard > 45_000)) tasks.push(loadDashboard());
  if (["bookings", "staff"].includes(id) && (state.role === "admin" || state.permissions.has("attendance")) && Date.now() - state.loadedAt.attendance > 45_000) tasks.push(loadAttendance(true));
  const map = { pos: ["categories", "services", "packages", "staff", "inventoryItems", "drinks"], revenue: ["services", "staff"], attendance: ["staff"], tasks: ["staff"], inventory: [], drinks: [], expenses: [], payroll: ["staff", "services", "packages", "offers"], reviews: ["reviews"], packages: ["packages"], offers: ["offers"], coupons: ["coupons"], staff: ["staff"], customers: ["customers"], rewards: ["customers","walletTransactions","settings"], campaigns: ["campaigns"], schedule: ["holidays", "workerLeaves", "staff", "settings"], gallery: ["content"], results: ["content"], hairMedia: ["content"], celebrities: ["content"], posts: ["content"], mobileContent: ["content", ...(canManageContent("offer") ? ["offers"] : [])], faqs: ["faqs"], settings: state.role === "admin" ? ["settings", "branches"] : ["settings"], activity: [], users: ["users", "staff"], services: ["categories", "services"] };
  tasks.push(...(map[id] || []).map(collection => loadCollection(collection)));
  if (state.role === "cashier" && ["bookings", "calendar"].includes(id)) tasks.push(loadCollection("staff"));
  if (id === "pos") tasks.push(loadPosOffers());
  if (id === "cash") tasks.push(loadCollection("staff"));
  if (["expenses", "payroll", "inventory", "drinks"].includes(id) && Date.now() - state.loadedAt.business > 45_000) tasks.push(loadBusiness());
  try { await Promise.all(tasks); } finally { activeSection?.classList.remove("section-loading"); }
  if (id === "mobileContent") renderMobileContent();
  if (id === "revenue" && state.role === "admin" && adminMobileViewport.matches) {
    const selector = $("#ownerSalesFilters [name=staffId]");
    selector.innerHTML = '<option value="all">كل العاملين</option>' + (state.collections.get("staff") || []).filter(worker => $("#dashboardBranchFilter").value === "all" || worker.branchIds?.includes($("#dashboardBranchFilter").value)).map(worker => `<option value="${escapeAttr(worker.id)}">${escapeHtml(worker.nameAr || worker.id)}</option>`).join("");
  }
  if (state.role === "admin" && adminMobileViewport.matches && ["revenue", "expenses"].includes(id)) void loadOwnerHistory(id === "revenue" ? "sales" : "expenses");
  if (id === "revenue") renderRevenue();
  if (id === "pos") { renderPos(); setPosView("receipts"); }
  if (id === "payroll") renderServiceTargets();
  if (id === "users") { renderUserAccounts(); syncWorkerAccountFields($("#accountRole")?.value || "cashier"); }
  if (id === "campaigns") { await loadCampaignOptions(); renderCampaigns(); }
  if (id === "calendar") {
    $("#calendarBranchFilter").value = $("#dashboardBranchFilter")?.value || "all";
    await loadCalendar();
    if (state.role === "cashier") await loadCashierTeam();
  }
  if (id === "bookings" && state.role === "cashier") await loadCashierTeam();
  if (id === "cash") await loadCashOperations(false, state.role === "cashier");
  if (id === "cashierGoals") await loadCashierGoals();
  if (id === "activity") await loadAuditEvents("");
  if (["attendance", "tasks"].includes(id)) await loadAttendance();
  if (id === "staff") renderStaffSummary();
  if (id === "worker") await loadWorkerWorkspace();
}

let campaignOptions = null;
async function loadCampaignOptions() {
  campaignOptions = await getWhatsappCampaignOptions();
  const form = $("#campaignForm");
  form.elements.offerId.innerHTML = '<option value="">اختر عرضًا محفوظًا</option>' + campaignOptions.offers.map(offer => `<option value="${escapeAttr(offer.id)}">${escapeHtml(offer.nameAr)} — ${escapeHtml(branchScopeLabel(offer.branchIds))}</option>`).join("");
  form.elements.templateName.innerHTML = '<option value="">اختر قالبًا</option>' + campaignOptions.templates.map(template => `<option value="${escapeAttr(template.name)}">${escapeHtml(template.name)} (${template.headerType === "image" ? "صورة" : "نص فقط"})</option>`).join("");
  [...form.elements.branchId.options].forEach(option => { option.hidden = option.value === "all" ? state.role !== "admin" : state.role !== "admin" && !campaignOptions.branchIds.includes(option.value); });
  if (state.role !== "admin") form.elements.branchId.value = campaignOptions.branchIds[0] || "";
  $("#campaignPreview").textContent = campaignOptions.enabled ? "اختر عرضًا وقالبًا وفرعًا ثم اعرض المعاينة." : "إرسال الحملات متوقف من إعدادات النظام.";
}
function renderCampaigns() {
  const target = $("#campaignList"); if (!target) return;
  const branch = $("#campaignBranchFilter")?.value || "all";
  const status = $("#campaignStateFilter")?.value || "all";
  const date = $("#campaignDateFilter")?.value || "";
  const items = (state.collections.get("campaigns") || []).filter(item => (branch === "all" || item.branchId === branch) && (status === "all" || item.state === status) && (!date || String(item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toISOString().slice(0, 10) : item.createdAt || "").startsWith(date)));
  const counts = { total: items.length, sending: items.filter(item => ["QUEUED", "SENDING"].includes(item.state)).length, completed: items.filter(item => item.state === "COMPLETED").length, paused: items.filter(item => item.state === "PAUSED").length, partial: items.filter(item => item.state === "PARTIAL").length };
  $("#campaignSummary").innerHTML = Object.entries({ total: "الحملات المعروضة", sending: "قيد الإرسال", completed: "مكتملة", paused: "متوقفة", partial: "فشل جزئي" }).map(([key, label]) => `<article class="metric-card"><span>${label}</span><strong>${counts[key]}</strong></article>`).join("");
  target.innerHTML = items.map(item => `<article class="entity-card"><h3>${escapeHtml(item.name || item.id)}</h3><p>${escapeHtml(item.offerName || "عرض") } • ${escapeHtml(branchLabel(item.branchId))} • ${escapeHtml(item.state || "QUEUED")} • ${item.testMode !== false ? "اختبار" : "فعلي"}</p><p>المؤهلون ${Number(item.eligibleCount || 0)} • المستهدفون ${Number(item.targetedCount || 0)}/${Number(item.recipientCap || 0)} • المرسل ${Number(item.sentCount || 0)} • الفاشل ${Number(item.failedCount || 0)} • المتجاوز ${Number(item.skippedCount || 0)}</p><footer><button data-campaign-recipients="${escapeAttr(item.id)}">المستلمون</button>${["QUEUED", "SENDING"].includes(item.state) ? `<button data-campaign-action="PAUSE" data-campaign-id="${escapeAttr(item.id)}">إيقاف مؤقت</button>` : ""}${item.state === "PAUSED" ? `<button data-campaign-action="RESUME" data-campaign-id="${escapeAttr(item.id)}">استكمال</button>` : ""}${["QUEUED", "SENDING", "PAUSED"].includes(item.state) ? `<button class="delete" data-campaign-action="CANCEL" data-campaign-id="${escapeAttr(item.id)}">إلغاء</button>` : ""}</footer></article>`).join("") || '<div class="entity-card"><p>لا توجد حملات.</p></div>';
}
async function showCampaignRecipients(id, cursor = "") {
  const [result, stats] = await Promise.all([getWhatsappCampaignRecipients(id, cursor), getWhatsappCampaignStats(id)]);
  const target = $("#campaignRecipientList"); target.hidden = false;
  target.innerHTML = `<h3>مستلمو الحملة</h3><p>المؤهلون ${stats.eligible} • المستهدفون ${stats.targeted} • المرسل ${stats.sent} • تم التسليم ${stats.delivered} • تمت القراءة ${stats.read} • فشل ${stats.failed} • تم التخطي ${stats.skipped} • المتبقي ${stats.remaining}</p><div class="table-scroll"><table><thead><tr><th>المستلم</th><th>الحالة</th><th>التسليم</th><th>الخطأ</th></tr></thead><tbody>${result.items.map(item => `<tr><td>${escapeHtml(item.customerName || item.customerId.slice(0, 8) + "…")}<small> ${escapeHtml(item.phoneMasked || "")}</small></td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.deliveryStatus || "—")}</td><td>${escapeHtml(item.failureCode || "—")}</td></tr>`).join("") || '<tr><td colspan="4">لا توجد نتائج.</td></tr>'}</tbody></table></div>${result.nextCursor ? `<button type="button" data-more-campaign-recipients="${escapeAttr(id)}" data-cursor="${escapeAttr(result.nextCursor)}">التالي</button>` : ""}`;
}


function applyAccess() {
  $$('[data-open-hub]').forEach(button => { button.hidden = availableHubSections(button.dataset.openHub).length === 0; });
  $$('[data-section]').forEach(button => {
    const id = button.dataset.section;
    const hubMismatch = state.hub && sectionHub(id) && sectionHub(id) !== state.hub;
    button.hidden = !canOpenSection(id) || hubMismatch || (id === "worker" && state.role !== "worker");
  });
  $$('[data-new-pos]').forEach(button => { button.hidden = state.role !== "admin" && !state.permissions.has("pos"); });
  $$('[data-go]').forEach(button => { button.hidden = !canOpenSection(button.dataset.go); });
  $$('[data-dashboard-permission]').forEach(element => { element.hidden = state.role !== "admin" && !state.permissions.has(element.dataset.dashboardPermission); });
  if ($("[data-dashboard-attendance]")) $("[data-dashboard-attendance]").hidden = !canOpenSection("attendance");
  if ($("#editBranchTarget")) $("#editBranchTarget").hidden = state.role !== "admin";
  if ($("#openAdminPassword")) $("#openAdminPassword").hidden = !["admin", "manager"].includes(state.role);
  if ($("#reportRebuild")) $("#reportRebuild").hidden = state.role !== "admin";
  if ($("#cashierReportsPanel")) $("#cashierReportsPanel").hidden = state.role !== "cashier" || !state.permissions.has("pos");
  $$("[data-cashier-content]").forEach(button => { button.hidden = state.role !== "cashier" || !hasContentWorkspace(); });
  $$("[data-cashier-offers]").forEach(button => { button.hidden = state.role !== "cashier" || !state.permissions.has("offers"); });
  $$("[data-cashier-campaigns]").forEach(button => { button.hidden = state.role !== "cashier" || !state.permissions.has("campaigns"); });
  if (state.role !== "admin" && $("#reportBranch")) {
    $("#reportBranch").querySelector('option[value="all"]')?.remove();
    $("#reportBranch").value = state.branchIds[0] || "";
  }
  $$('[data-cashier-target]').forEach(button => { button.hidden = state.role !== "cashier" || !state.permissions.has("dashboard"); });
  syncAdminMobileVisibility();
  if ($("#branchLocationPanel")) $("#branchLocationPanel").hidden = state.role !== "admin";
  if (state.role !== "admin") $$('select').forEach(select => [...select.options].forEach(option => { if (["talkha", "mashaya"].includes(option.value) && !state.branchIds.includes(option.value)) option.remove(); }));
  refreshSidebarGroups();
}

const cashierHeaderHomes = {
  menu: $("#adminMenu").parentElement,
  bell: $("#pushButton").parentElement,
  branch: $("#cashierBranchLabel").parentElement
};
function renderRoleShell() {
  const cashier = state.role === "cashier";
  const mobileNav = $(".cashier-mobile-nav");
  if (cashier) mobileNav.innerHTML = '<button type="button" data-section="pos">المعاملات</button><button type="button" data-section="bookings">الحجوزات</button><button type="button" data-cashier-jump="team">الفريق</button><button type="button" data-cashier-jump="tasks">المهام</button><button type="button" data-cashier-more>المزيد</button>';
  if (state.role === "manager") mobileNav.innerHTML = '<button type="button" data-section="dashboard">الرئيسية</button><button type="button" data-section="bookings">الحجوزات</button><button type="button" data-section="attendance">الفريق</button><button type="button" data-section="mobileContent">المحتوى</button><button type="button" data-open-workspace-home>المزيد</button>';
  if (state.role === "worker") mobileNav.innerHTML = '<button type="button" data-section="worker">الرئيسية</button><button type="button" data-worker-jump="attendance">الحضور</button><button type="button" data-worker-jump="bookings">مواعيدي</button><button type="button" data-worker-jump="tasks">المهام</button><button type="button" data-worker-jump="profile">حسابي</button>';
  const adminNav = $('#sidebar nav[aria-label="أقسام لوحة الإدارة"]');
  adminNav.hidden = cashier;
  $("#cashierSidebarNav").hidden = !cashier;
  $(".admin-header").hidden = cashier;
  $("#cashierHeader").hidden = !cashier;
  $(".desktop-primary-nav").hidden = cashier;
  mobileNav.hidden = false;
  if ($("#ownerMobileNav")) $("#ownerMobileNav").hidden = state.role !== "admin";
  $("#sidebarCollapse").hidden = cashier;
  if (cashier) {
    const primary = adminNav.querySelector(".sidebar-primary");
    const selectors = ['[data-section="pos"]', '[data-section="calendar"]', '[data-section="bookings"]', '[data-go="cash"]', '[data-cashier-target]'];
    $("#cashierSidebarItems").replaceChildren(...selectors.map(selector => primary.querySelector(selector)?.cloneNode(true)).filter(Boolean));
    const marketing = [["offers", "العروض"], ["campaigns", "حملات واتساب"]].filter(([id]) => state.permissions.has(id));
    $("#cashierMarketingLinks").hidden = !marketing.length;
    $("#cashierMarketingLinks").innerHTML = marketing.length ? '<span class="sidebar-menu-label">صلاحيات إضافية</span>' + marketing.map(([id, label]) => `<button type="button" data-section="${id}">${label}</button>`).join("") : "";
    $("#cashierHeaderMenuSlot").append($("#adminMenu"));
    $("#cashierHeaderBellSlot").append($("#pushButton"));
    $("#cashierHeaderBranchSlot").append($("#cashierBranchLabel"));
  } else {
    cashierHeaderHomes.menu.append($("#adminMenu"));
    cashierHeaderHomes.bell.append($("#pushButton"));
    cashierHeaderHomes.branch.append($("#cashierBranchLabel"));
    $("#cashierSidebarItems").replaceChildren();
    $("#cashierMarketingLinks").replaceChildren();
  }
}

const adminMobileViewport = matchMedia("(max-width: 720px)");
function syncAdminMobileVisibility() {
  const visible = state.role === "admin" && adminMobileViewport.matches;
  $$('[data-admin-mobile-only], .workspace-mobile-admin-links, .mobile-admin-menu, .mobile-quick-actions').forEach(element => { element.hidden = !visible; });
  if ($(".workspace-mobile-admin-links") && state.role === "manager" && adminMobileViewport.matches) $(".workspace-mobile-admin-links").hidden = false;
  if ($("#ownerMobileHome")) $("#ownerMobileHome").hidden = !visible;
  if ($("#managerBranchOpen")) $("#managerBranchOpen").hidden = state.role !== "manager" || !adminMobileViewport.matches;
  if ($("#ownerMobileNav")) $("#ownerMobileNav").hidden = !visible;
  if ($("#ownerSalesMobile")) $("#ownerSalesMobile").hidden = !visible;
  if ($("#ownerExpensesMobile")) $("#ownerExpensesMobile").hidden = !visible;
  $(".cashier-mobile-nav")?.classList.toggle("manager-mobile-nav", state.role === "manager");
}
adminMobileViewport.addEventListener?.("change", syncAdminMobileVisibility);

function initializeLineIcons() {
  $$(".sidebar nav svg, .desktop-primary-nav svg, .header-icon-button svg, .workspace-gate svg, .workspace-mobile-admin-links svg, .mobile-admin-menu svg, .mobile-quick-actions svg, .cashier-mobile-nav svg").forEach(svg => {
    svg.setAttribute("width", "30");
    svg.setAttribute("height", "30");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
  });
}

function renderPermissionPicker(role = $("#accountRole")?.value || "cashier") {
  const selected = new Set(roleDefaults[role] || []);
  const entries = Object.entries(permissionLabels).filter(([value]) => (ROLE_CAPABILITY_CEILINGS[role] || []).includes(value));
  $("#permissionPicker").innerHTML = entries.map(([value, label]) => `<label><input type="checkbox" name="permissions" value="${value}" ${selected.has(value) ? "checked" : ""}> ${label}</label>`).join("");
}

function renderAccessPermissionPicker(role, values = roleDefaults[role] || []) {
  const selected = new Set(values);
  const entries = Object.entries(permissionLabels).filter(([value]) => (ROLE_CAPABILITY_CEILINGS[role] || []).includes(value));
  $("#accessPermissionPicker").innerHTML = entries.map(([value, label]) => `<label><input type="checkbox" name="permissions" value="${value}" ${selected.has(value) ? "checked" : ""}> ${label}</label>`).join("");
}

function openAccessEditor(id) {
  const item = (state.collections.get("users") || []).find(user => user.id === id);
  if (!item || item.role === "admin" || item.id === state.user?.uid) return toast("لا يمكن تعديل هذا الحساب من هنا", true);
  state.editingUserId = id;
  $("#accessName").value = item.name || "";
  $("#accessEmail").value = item.email || "";
  $("#accessRole").value = ["manager", "cashier", "worker"].includes(item.role) ? item.role : "cashier";
  $$('#accessForm input[name="branchIds"]').forEach(input => { input.checked = (item.branchIds || []).includes(input.value); });
  renderAccessPermissionPicker($("#accessRole").value, item.permissions || roleDefaults[$("#accessRole").value]);
  syncAccessWorkerField($("#accessRole").value, item.staffId || "");
  $("#accessDialog").showModal();
}

async function submitAccessEdit(event) {
  event.preventDefault();
  const item = (state.collections.get("users") || []).find(user => user.id === state.editingUserId);
  if (!item) return toast("الحساب غير موجود", true);
  const form = new FormData(event.currentTarget);
  const button = $("#accessSave");
  await withButtonBusy(button, async () => {
    await changeUserRole(item.id, item.email || "", form.get("role"), form.getAll("permissions"), form.getAll("branchIds"), form.get("staffId") || "");
    await loadCollection("users", true);
    renderUserAccounts();
    $("#accessDialog").close();
    toast("تم تحديث الصلاحيات وتسجيل العملية");
  }).catch(error => toast(error.message || "تعذر تحديث الصلاحيات", true));
}

function renderUserAccounts() {
  const items = state.collections.get("users") || [];
  $("#userAccountsList").innerHTML = items.map(item => `<article class="entity-card user-access-card"><h3>${escapeHtml(item.name || item.email || item.id)}</h3><p>${escapeHtml(item.email || "—")} • ${escapeHtml(({ admin: "أدمن", manager: "مدير", cashier: "كاشير", worker: "عامل" })[item.role] || item.role || "—")}</p><p><b>الفروع:</b> ${item.role === "admin" ? "كل الفروع" : (item.branchIds || []).map(value => value === "talkha" ? "طلخا" : value === "mashaya" ? "المشاية" : value).join("، ") || "غير محدد"}</p>${item.staffId ? `<p><b>عضو الفريق:</b> ${escapeHtml((state.collections.get("staff") || []).find(member => member.id === item.staffId)?.nameAr || item.staffId)}</p>` : ""}<div class="permission-tags">${(item.role === "admin" ? ["كل الصلاحيات"] : item.permissions || []).map(value => `<span>${escapeHtml(permissionLabels[value] || value)}</span>`).join("")}</div>${state.role === "admin" && item.role !== "admin" && item.id !== state.user?.uid ? `<div class="entity-actions"><button class="small-button" type="button" data-edit-user-access="${escapeAttr(item.id)}">تعديل الصلاحيات</button><button class="small-button danger" type="button" data-secure-delete-user="${escapeAttr(item.id)}" data-secure-delete-label="حساب ${escapeAttr(item.name || item.email || "العامل")}">حذف الحساب</button></div>` : ""}</article>`).join("") || '<div class="empty-state">لا توجد حسابات مسجلة.</div>';
}

function workerSelectOptions(selected = "", branchId = "") {
  return (state.collections.get("staff") || []).filter(item => item.active !== false && (!branchId || (item.branchIds || []).includes(branchId))).map(item => `<option value="${escapeAttr(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.nameAr || item.id)} • ${(item.branchIds || []).map(branchLabel).join(" / ")}</option>`).join("");
}

function syncWorkerAccountFields(role, selectedStaffId = "") {
  const create = role === "worker";
  const field = $("#accountStaffField");
  if (field) field.hidden = !create;
  if ($("#accountStaff")) {
    $("#accountStaff").required = create;
    $("#accountStaff").innerHTML = `<option value="">اختر العامل</option>${workerSelectOptions(selectedStaffId)}`;
  }
}

function syncAccessWorkerField(role, selectedStaffId = "") {
  const worker = role === "worker";
  const field = $("#accessStaffField");
  if (field) field.hidden = !worker;
  if ($("#accessStaff")) {
    $("#accessStaff").required = worker;
    $("#accessStaff").innerHTML = `<option value="">اختر العامل</option>${workerSelectOptions(selectedStaffId)}`;
  }
}

function renderAttendance() {
  const rows = state.attendance.rows || [];
  const isToday = state.attendance.dateKey === cairoDateKey();
  $("#attendancePresentLabel").textContent = isToday ? "الموجودون الآن" : "الحضور في هذا اليوم";
  $("#attendancePresentCount").textContent = String(isToday ? state.attendance.presentCount || 0 : rows.filter(item => item.attendance).length);
  $("#attendanceStaffCount").textContent = String(rows.length);
  $("#attendanceGrid").innerHTML = rows.map(item => {
    const record = item.attendance;
    const present = isToday && item.status === "PRESENT";
    const statusText = item.status === "PRESENT" ? (isToday ? "موجود الآن" : "حضر ولم يسجل الانصراف") : item.status === "CHECKED_OUT" ? "حضر وانصرف" : "غير حاضر";
    return `<article class="attendance-card ${present ? "present" : ""}"><header><img src="${escapeAttr(safeMediaUrl(item.imageUrl) || "/assets/el-mezaen-mark-v2.webp")}" alt=""><div><b>${escapeHtml(item.nameAr)}</b><small>${(item.branchIds || []).map(id => escapeHtml(branchLabel(id))).join(" • ")}</small></div></header><span class="attendance-state">${statusText}</span>${record ? `<small>الحضور ${escapeHtml(record.checkInTime || dateTime(record.checkInAt))}${record.checkOutTime ? ` • الانصراف ${escapeHtml(record.checkOutTime)}` : ""}</small><small>المسافة المسجلة: ${Number(record.locationEvidence?.distanceMeters || 0)} متر</small>` : ""}<footer>${present && (state.permissions.has("tasks") || state.permissions.has("bookings") || state.role === "admin") ? `<button class="small-button" type="button" data-notify-worker="${escapeAttr(item.staffId)}" data-notify-branch="${escapeAttr(record?.branchId || item.branchIds?.[0] || "")}">تنبيه ${escapeHtml(item.nameAr)}</button>` : ""}</footer></article>`;
  }).join("") || '<div class="empty-state">لا يوجد عمال مطابقون للفرع والتاريخ.</div>';
  renderStaffSummary();
}

function renderStaffSummary() {
  const staff = state.collections.get("staff") || [];
  const presentIds = new Set((state.attendance.rows || []).filter(item => item.status === "PRESENT").map(item => item.staffId));
  const inBranch = (item, id) => item.branchId === id || (item.branchIds || []).includes(id);
  const values = {
    staffTotalCount: staff.length,
    staffActiveCount: staff.filter(item => item.active !== false).length,
    staffPresentCount: staff.filter(item => presentIds.has(item.id)).length,
    staffUnlinkedCount: staff.filter(item => !item.userUid).length,
    staffTalkhaCount: staff.filter(item => inBranch(item, "talkha")).length,
    staffMashayaCount: staff.filter(item => inBranch(item, "mashaya")).length
  };
  Object.entries(values).forEach(([id, value]) => { const target = $("#" + id); if (target) target.textContent = String(value); });
}

function taskStatusLabel(status) { return ({ NEW: "جديدة", SEEN: "تمت المشاهدة", IN_PROGRESS: "قيد التنفيذ", DONE: "تمت", CANCELLED: "ملغاة" })[status] || status || "جديدة"; }
function renderTaskCard(item, workerView = false, actionsEnabled = true) {
  const actions = actionsEnabled && workerView && !["DONE", "CANCELLED"].includes(item.status) ? `<footer>${item.status === "NEW" ? `<button data-worker-task-status="SEEN" data-task-id="${escapeAttr(item.id)}">شاهدتها</button>` : ""}${["NEW", "SEEN"].includes(item.status) ? `<button data-worker-task-status="IN_PROGRESS" data-task-id="${escapeAttr(item.id)}">بدء التنفيذ</button>` : ""}${item.status === "IN_PROGRESS" ? `<button data-worker-task-status="DONE" data-task-id="${escapeAttr(item.id)}">تم التنفيذ</button>` : ""}</footer>` : actionsEnabled && !workerView && !["DONE", "CANCELLED"].includes(item.status) ? `<footer><button data-admin-task-cancel="${escapeAttr(item.id)}">إلغاء المهمة</button></footer>` : "";
  return `<article class="task-card"><header><div><b>${escapeHtml(item.title || "مهمة")}</b><small>${escapeHtml(item.assigneeNameAr || "")} • ${escapeHtml(branchLabel(item.branchId))}</small></div><span class="task-priority ${escapeAttr(item.priority || "normal")}">${escapeHtml(item.priority === "urgent" ? "عاجلة" : item.priority === "high" ? "مهمة" : "عادية")}</span></header>${item.details ? `<p>${escapeHtml(item.details)}</p>` : ""}<small>${taskStatusLabel(item.status)}${item.dueAt ? ` • ${dateTime(item.dueAt)}` : ""}${item.bookingId ? ` • حجز ${escapeHtml(item.bookingId)}` : ""}</small>${actions}</article>`;
}

function renderAdminTasks() {
  const tasks = state.attendance.tasks || [];
  $("#adminTaskGrid").innerHTML = tasks.map(item => renderTaskCard(item)).join("") || '<div class="empty-state">لا توجد مهام مفتوحة.</div>';
  const branch = $("#taskBranch")?.value || state.branchIds[0] || "talkha";
  if ($("#taskStaff")) $("#taskStaff").innerHTML = `<option value="">اختر العامل</option>${workerSelectOptions("", branch)}`;
}

async function loadAttendance(silent = false) {
  const dateKey = $("#attendanceDate")?.value || cairoDateKey();
  const branchId = $("#attendanceBranch")?.value || "all";
  const version = ++attendanceRequestVersion;
  try {
    const result = await getAttendanceDashboard(dateKey, branchId);
    if (version !== attendanceRequestVersion || branchId !== $("#attendanceBranch")?.value) return;
    state.attendance = result;
    state.loadedAt.attendance = Date.now();
    renderAttendance();
    renderAdminTasks();
    renderBookings();
    renderDashboardAttendanceSummary();
  } catch (error) { if (!silent) toast(error.message || "تعذر تحميل الحضور", true); }
}

async function loadCashierTeam() {
  if (state.role !== "cashier") return;
  const panel = $("#cashierTeamPanel");
  panel.hidden = false;
  const branchId = state.branchIds[0];
  const version = ++teamRequestVersion;
  $("#cashierTeamGrid").textContent = "جاري تحميل حالة الفريق…";
  try {
    const result = await getAttendanceDashboard(cairoDateKey(), branchId);
    if (version !== teamRequestVersion || !["calendar", "bookings"].includes(state.section)) return;
    state.attendance = result;
    renderCashierTeam();
    if (state.section === "bookings") renderBookings();
  } catch (error) {
    if (version === teamRequestVersion) $("#cashierTeamGrid").textContent = error.message || "تعذر تحميل الفريق. حاول التحديث.";
  }
}

function renderCashierTeam() {
  const panel = $("#cashierTeamPanel");
  if (!panel || state.role !== "cashier" || !state.attendance.rows) return;
  const branchId = state.branchIds[0];
  const today = cairoDateKey();
  const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const active = new Set((state.calendar.bookings || []).filter(booking => booking.branchId === branchId && booking.bookingDate === today && ["arrived", "in_progress", "started"].includes(String(booking.status || "").toLowerCase()) && String(booking.bookingTime || "") <= now).flatMap(booking => [booking.staffId, ...(booking.workerIds || [])]));
  const rows = (state.attendance.rows || []).filter(row => row.branchIds?.includes(branchId));
  $("#cashierTeamGrid").innerHTML = rows.map(row => {
    const label = row.status === "CHECKED_OUT" ? "خرج" : row.status !== "PRESENT" ? "غائب" : active.has(row.staffId) ? "مشغول" : "متاح";
    return `<article class="team-now-card"><img src="${escapeAttr(safeMediaUrl(row.imageUrl) || "/assets/el-mezaen-mark-v2.webp")}" alt=""><div><b>${escapeHtml(row.nameAr)}</b><small>${escapeHtml(label)} • ${escapeHtml(row.attendance?.checkInTime || "—")}</small></div><button type="button" class="small-button" data-notify-worker="${escapeAttr(row.staffId)}" data-notify-branch="${escapeAttr(branchId)}">تنبيه</button></article>`;
  }).join("") || '<p class="empty-state">لا يوجد عاملون في هذا الفرع.</p>';
  const select = $("#cashierTaskForm [name=staffId]");
  select.innerHTML = '<option value="">اختر العامل</option>' + rows.map(row => `<option value="${escapeAttr(row.staffId)}">${escapeHtml(row.nameAr)}</option>`).join("");
  $("#cashierTeamTasks").innerHTML = (state.attendance.tasks || []).filter(task => task.branchId === branchId).map(task => renderTaskCard(task)).join("") || '<p class="empty-state">لا توجد مهام مفتوحة.</p>';
}

async function submitCashierTask(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  await withButtonBusy(button, async () => {
    const data = Object.fromEntries(new FormData(form));
    if (data.dueAt) data.dueAt = new Date(data.dueAt).toISOString();
    await createWorkerTask({ ...data, branchId: state.branchIds[0], idempotencyKey: form.dataset.key ||= crypto.randomUUID() });
    form.reset(); form.dataset.key = "";
    toast("تم إرسال المهمة للعامل");
    await loadCashierTeam();
  }).catch(error => toast(error.message || "تعذر إرسال المهمة", true));
}

function geolocationPosition() {
  if (!navigator.geolocation) return Promise.reject(new Error("المتصفح لا يدعم تحديد الموقع"));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, error => reject(new Error(error.code === 1 ? "اسمح للموقع باستخدام GPS ثم حاول مرة أخرى" : "تعذر تحديد موقعك بدقة")), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
}

async function submitAttendance(action, button) {
  await withButtonBusy(button, async () => {
    const position = await geolocationPosition();
    const branchId = $("#workerAttendanceBranch").value;
    const result = await recordWorkerAttendance({ action, branchId, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
    toast(result.idempotent ? "الحالة مسجلة بالفعل" : action === "checkIn" ? "تم تسجيل حضورك داخل الفرع" : "تم تسجيل الانصراف");
    await loadWorkerWorkspace();
  }).catch(error => toast(error.message || "تعذر تسجيل الحضور", true));
}

function renderWorkerWorkspace() {
  const worker = state.worker || {};
  const staff = worker.staff || {};
  $("#workerProfileName").textContent = staff.nameAr || state.user?.displayName || "العامل";
  $("#workerProfileBranch").textContent = (staff.branchIds || state.branchIds).map(branchLabel).join(" • ");
  $("#workerProfilePhoto").src = staff.imageUrl || "/assets/el-mezaen-mark-v2.webp";
  const attendance = worker.attendance;
  $("#workerAttendanceState").textContent = attendance?.status === "PRESENT" ? "موجود في المحل" : attendance?.status === "CHECKED_OUT" ? "تم تسجيل الانصراف" : "غير مسجل اليوم";
  $("#workerAttendanceDetails").textContent = attendance ? `${branchLabel(attendance.branchId)} • ${attendance.checkInTime || dateTime(attendance.checkInAt)}` : "اضغط عند وصولك للفرع وسنطابق موقعك.";
  $("#workerCheckIn").disabled = Boolean(attendance);
  $("#workerCheckOut").disabled = !attendance || attendance.status === "CHECKED_OUT";
  const target = worker.target || {};
  $("#workerTargetPercent").textContent = `${Number(target.progressPercent || 0)}%`;
  $("#workerTargetProgress").value = Number(target.progressPercent || 0);
  $("#workerTargetTotal").textContent = money(target.target);
  $("#workerTargetAchieved").textContent = money(target.achieved);
  $("#workerTargetRemaining").textContent = money(target.remaining);
  $("#workerBookings").innerHTML = (worker.bookings || []).map(item => `<article class="worker-booking-card"><time>${escapeHtml(item.bookingDate || "")} • ${escapeHtml(item.bookingTime || "")}</time><b>${escapeHtml(item.customerName || "عميل")}</b><span>${escapeHtml((item.serviceNamesAr || []).join(" + "))}</span><small>${escapeHtml(statusLabel(item.status))} • ${escapeHtml(branchLabel(item.branchId))}</small></article>`).join("") || '<div class="empty-state">لا توجد مواعيد قادمة.</div>';
  const notifications = (worker.notifications || []).map(item => ({ ...item, id: item.id, title: item.title || "تنبيه", details: item.body || "", assigneeNameAr: staff.nameAr, status: item.read ? "SEEN" : "NEW", priority: item.type === "alert" ? "urgent" : "normal" }));
  $("#workerTaskGrid").innerHTML = [...notifications.map(item => renderTaskCard(item, false, false)), ...(worker.tasks || []).map(item => renderTaskCard(item, true))].join("") || '<div class="empty-state">لا توجد مهام أو تنبيهات.</div>';
  const branchSelect = $("#workerAttendanceBranch");
  if (branchSelect) {
    [...branchSelect.options].forEach(option => { option.hidden = !state.branchIds.includes(option.value); });
    if (!state.branchIds.includes(branchSelect.value)) branchSelect.value = state.branchIds[0] || "talkha";
  }
}

async function loadWorkerWorkspace(silent = false) {
  try { state.worker = await getWorkerWorkspace(); state.loadedAt.worker = Date.now(); renderWorkerWorkspace(); }
  catch (error) { if (!silent) toast(error.message || "تعذر تحميل حساب العامل", true); }
}

async function submitWorkerTask(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  await withButtonBusy(button, async () => {
    await createWorkerTask({ ...data, idempotencyKey: form.dataset.key ||= crypto.randomUUID() });
    form.reset(); form.dataset.key = "";
    if ($("#taskBranch option")) $("#taskBranch").value = state.branchIds[0] || "talkha";
    await loadAttendance();
    toast("تم إرسال المهمة للعامل");
  }).catch(error => toast(error.message || "تعذر إرسال المهمة", true));
}

async function sendWorkerAlert(button) {
  const staffId = button.dataset.notifyWorker;
  const branchId = button.dataset.notifyBranch;
  const bookingId = button.dataset.notifyBooking || "";
  const defaultMessage = bookingId ? "عندك ميعاد الآن، راجع تفاصيل الحجز" : "مطلوب تواجدك الآن في منطقة العمل";
  const message = prompt("رسالة التنبيه للعامل", defaultMessage)?.trim();
  if (!message) return;
  await withButtonBusy(button, async () => {
    await notifyWorker({ staffId, branchId, bookingId, message, idempotencyKey: crypto.randomUUID() });
    toast("تم إرسال التنبيه للعامل");
  }).catch(error => toast(error.message || "تعذر إرسال التنبيه", true));
}

async function assignBookingToWorker(bookingId, staffId, button) {
  const item = state.dashboard.bookings.find(value => value.id === bookingId);
  if (!item || !staffId) return toast("اختر العامل أولًا", true);
  await withButtonBusy(button, async () => {
    const result = await rescheduleBooking({ id: item.id, date: item.bookingDate, time: item.bookingTime, staffId, requestId: crypto.randomUUID() });
    Object.assign(item, { staffId: result.workerId, staffNameAr: result.workerNameAr });
    renderBookings();
    toast(`تم تحويل الحجز إلى ${result.workerNameAr}`);
  }).catch(error => toast(error.message || "تعذر تحويل الحجز", true));
}

async function updateWorkerPhoto(file, input) {
  if (!file) return;
  input.disabled = true;
  input.closest("label")?.classList.add("is-busy");
  try {
    const url = await uploadImage(file, `staff/${state.staffId}`);
    await updateWorkerProfilePhoto(url);
    state.worker.staff.imageUrl = url;
    renderWorkerWorkspace();
    toast("تم تحديث الصورة");
  } catch (error) { toast(error.message || "تعذر تحديث الصورة", true); }
  finally { input.disabled = false; input.value = ""; input.closest("label")?.classList.remove("is-busy"); }
}

async function submitUserAccount(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const button = formElement.querySelector('button[type="submit"]');
  const form = new FormData(formElement);
  const payload = { name: form.get("name"), email: form.get("email"), password: form.get("password"), role: form.get("role"), staffId: form.get("staffId") || "", permissions: form.getAll("permissions"), branchIds: form.getAll("branchIds") };
  button.disabled = true;
  try {
    const result = await createUserAccount(payload);
    formElement.reset();
    renderPermissionPicker("cashier");
    syncWorkerAccountFields("cashier");
    const talkha = formElement.querySelector('input[name="branchIds"][value="talkha"]');
    if (talkha) talkha.checked = true;
    await loadCollection("users", true);
    renderUserAccounts();
    if (result.activationLink) {
      await navigator.clipboard?.writeText(result.activationLink).catch(() => {});
      prompt("تم إنشاء الحساب. انسخ رابط التفعيل وأرسله للمستخدم (تمت محاولة نسخه تلقائيًا):", result.activationLink);
    }
    toast("تم إنشاء الحساب وتطبيق الصلاحيات");
  } catch (error) { toast(error.message || "تعذر إنشاء الحساب", true); }
  finally { button.disabled = false; }
}

async function loadDashboard(silent = false) {
  const requestVersion = ++dashboardRequestVersion;
  $("#dashboard")?.setAttribute("aria-busy", "true");
  $(".mobile-monthly-target")?.setAttribute("aria-busy", "true");
  $(".desktop-monthly-target")?.setAttribute("aria-busy", "true");
  if (!state.loadedAt.dashboard) setDashboardMetricsUnavailable();
  $("#dashboardDataError").hidden = true;
  try {
    const branchId = $("#dashboardBranchFilter")?.value || "all";
    const result = await getDashboard(branchId);
    if (requestVersion !== dashboardRequestVersion || branchId !== $("#dashboardBranchFilter")?.value) return;
    detectNewBookings(result.bookings || []);
    state.dashboard = result;
    state.loadedAt.dashboard = Date.now();
    renderDashboard();
    $("#headerBranchLabel").textContent = branchLabel(branchId);
    void loadDashboardShiftState(branchId);
    if (canOpenSection("attendance")) void loadDashboardAttendance(branchId);
  } catch (error) {
    if (requestVersion !== dashboardRequestVersion) return;
    setDashboardMetricsUnavailable(error.message || "تعذر تحميل لوحة الإدارة");
    if (!silent) toast(error.message || "تعذر تحميل لوحة الإدارة", true);
  } finally { if (requestVersion === dashboardRequestVersion) { $("#dashboard")?.removeAttribute("aria-busy"); $(".mobile-monthly-target")?.removeAttribute("aria-busy"); $(".desktop-monthly-target")?.removeAttribute("aria-busy"); } }
}

async function loadDashboardAttendance(branchId) {
  if (state.attendance.dateKey === cairoDateKey() && state.attendance.branchId === branchId && Date.now() - state.loadedAt.attendance < 45_000) return renderDashboardAttendanceSummary();
  try {
    const result = await getAttendanceDashboard(cairoDateKey(), branchId);
    if (branchId !== $("#dashboardBranchFilter")?.value) return;
    state.attendance = result;
    state.loadedAt.attendance = Date.now();
    renderDashboardAttendanceSummary();
  } catch { $("#dashboardAttendanceSummary").textContent = "تعذر تحديث الحضور لهذا الفرع."; }
}

function setDashboardMetricsUnavailable(message = "") {
  ["statTodayRevenue", "statTodayBookings", "statCompletedToday", "statUpcomingBookings", "statTodayReceipts", "statTodayCash", "statUnpaid", "statAverageTicket", "statTodayExpenses", "statTodayNet"].forEach(id => { const element = $("#" + id); if (element) element.textContent = "—"; });
  if ($("#dashboardUpcomingList")) $("#dashboardUpcomingList").innerHTML = '<p class="empty-state">تعذر تحميل الحجوزات القادمة.</p>';
  if ($("#dashboardAlertsPreview")) $("#dashboardAlertsPreview").innerHTML = '<p class="empty-state">تعذر تحميل التنبيهات.</p>';
  ["dashboardMonthTargetPercent", "dashboardMonthTargetTotal", "dashboardMonthTargetAchieved", "dashboardMonthTargetRemaining", "desktopMonthTargetPercent", "desktopMonthTargetTotal", "desktopMonthTargetAchieved", "desktopMonthTargetRemaining"].forEach(id => { const element = $("#" + id); if (element) element.textContent = "—"; });
  ["dashboardMonthTargetProgress", "desktopMonthTargetProgress"].forEach(id => { const progress = $("#" + id); if (progress) { progress.value = 0; progress.textContent = "0%"; } });
  const errorState = $("#dashboardDataError");
  if (!errorState) return;
  errorState.hidden = !message;
  errorState.querySelector("span").textContent = message ? `لم يتم استبدال البيانات بأصفار: ${message}` : "لم يتم استبدال البيانات بأصفار.";
}

async function loadCashierDashboard(silent = false) {
  const requestVersion = ++cashierRequestVersion;
  try {
    const selectedBranch = $("#dashboardBranchFilter")?.value || "all";
    const result = await getCashierSnapshot(selectedBranch);
    if (requestVersion !== cashierRequestVersion || selectedBranch !== ($("#dashboardBranchFilter")?.value || "all")) return;
    const nextBookings = Array.isArray(result.bookings) ? result.bookings : [];
    const scopedBookings = selectedBranch === "all" ? nextBookings : nextBookings.filter(item => item.branchId === selectedBranch);
    detectNewBookings(scopedBookings);
    state.dashboard = { ...state.dashboard, bookings: scopedBookings, stats: { ...state.dashboard.stats, ...(result.stats || {}) } };
    state.loadedAt.cashier = Date.now();
    renderDashboard();
  } catch (error) { if (!silent) toast(error.message || "تعذر تحميل شاشة الكاشير", true); }
}

async function refreshCashierOperations() {
  if (state.role !== "cashier") return;
  await Promise.allSettled([loadCashOperations(true), loadCashierDashboard(true)]);
}

async function loadBusiness(silent = false) {
  const month = $("#payrollMonth")?.value || cairoDateKey().slice(0, 7);
  try {
    const [business, serviceTargets] = await Promise.all([
      getBusinessDashboard(month),
      state.role === "admin" || state.permissions.has("payroll") ? getServiceTargetsDashboard(month) : Promise.resolve({ targets: [] })
    ]);
    state.business = { ...business, serviceTargets: serviceTargets.targets || [] };
    state.loadedAt.business = Date.now();
    state.collections.set("inventoryItems", state.business.inventory || []);
    state.collections.set("drinks", state.business.drinks || []);
    renderBusiness();
  } catch (error) { if (!silent) toast(error.message || "تعذر تحميل بيانات تشغيل المحل", true); }
}

async function loadCalendar(silent = false) {
  const requestVersion = ++calendarRequestVersion;
  const from = $("#calendarDate")?.value || cairoDateKey();
  const view = $("#calendarView")?.value || "day";
  const branchId = $("#calendarBranchFilter")?.value || "all";
  const end = new Date(`${from}T12:00:00Z`);
  if (view === "week") end.setUTCDate(end.getUTCDate() + 6);
  const to = end.toISOString().slice(0, 10);
  try { const result = await getBookingCalendar(from, to, branchId);
    if (requestVersion !== calendarRequestVersion || branchId !== $("#calendarBranchFilter")?.value || from !== $("#calendarDate")?.value || view !== $("#calendarView")?.value) return;
    state.calendar = result; state.loadedAt.calendar = Date.now();
    const staffFilter = $("#calendarStaffFilter");
    if (staffFilter) { const current = staffFilter.value; staffFilter.innerHTML = '<option value="all">كل الموظفين</option>' + (state.calendar.staff || []).map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nameAr || item.id)}</option>`).join(""); staffFilter.value = [...staffFilter.options].some(option => option.value === current) ? current : "all"; }
    renderCalendar(); }
  catch (error) { if (requestVersion === calendarRequestVersion && !silent) toast(error.message || "تعذر تحميل التقويم", true); }
}

function renderCalendar() {
  const target = $("#bookingCalendar");
  if (!target) return;
  const query = $("#calendarSearch")?.value.trim().toLowerCase() || "";
  const branch = $("#calendarBranchFilter")?.value || "all";
  const staff = $("#calendarStaffFilter")?.value || "all";
  const payment = $("#calendarPaymentFilter")?.value || "all";
  const bookings = (state.calendar.bookings || []).filter(item =>
    (branch === "all" || item.branchId === branch) && (staff === "all" || item.staffId === staff) &&
    (payment === "all" || item.paymentStatus === payment) &&
    (!query || [item.code, item.customerName, item.phone].some(value => String(value || "").toLowerCase().includes(query))));
  const workers = new Map((state.calendar.staff || []).map(item => [item.id, item.nameAr || item.id]));
  const boardQuickActions = item => {
    if (!["pending", "confirmed", "arrived"].includes(item.status)) return "";
    const action = (name, label) => `<button type="button" class="small-button" data-booking-action="${name}" data-booking-id="${escapeAttr(item.id)}">${label}</button>`;
    const main = item.status === "pending" ? action("confirmed", "تأكيد") : item.status === "confirmed" ? action("arrived", "وصل") : "";
    const noShow = ["confirmed", "arrived"].includes(item.status) ? action("no_show", "لم يحضر") : "";
    const complete = item.status === "arrived" ? action(item.paymentStatus === "paid" ? "completed" : "checkout", item.paymentStatus === "paid" ? "اكتملت" : "تحصيل وإكمال") : "";
    const invoice = state.permissions.has("pos") ? `<button type="button" class="small-button" data-booking-pos="${escapeAttr(item.id)}">فتح الفاتورة</button>` : "";
    return `<div class="booking-board-actions">${main}${noShow}${complete}${invoice}</div>`;
  };
  const groups = [{ key: "pending", label: "قيد المراجعة", color: "warning" }, { key: "confirmed", label: "مؤكدة", color: "primary", statuses: ["confirmed", "arrived"] }, { key: "completed", label: "اكتملت", color: "success" }, { key: "cancelled", label: "ملغاة", color: "danger", statuses: ["cancelled", "rejected"] }, { key: "no_show", label: "لم تحضر", color: "muted" }];
  target.innerHTML = groups.map(group => {
    const items = bookings.filter(item => (group.statuses || [group.key]).includes(item.status));
    return `<section class="booking-board-column"><header><span><i class="board-status-dot ${group.color}"></i>${group.label}<b>${items.length}</b></span><small>${money(items.reduce((sum, item) => sum + Number(item.total || 0), 0))}</small></header><div class="booking-board-items">${items.map(item => `<article class="booking-board-card"><button type="button" class="booking-board-card-main" data-calendar-booking="${escapeAttr(item.id)}"><time>${escapeHtml(item.bookingDate || "")} · ${escapeHtml(item.bookingTime || "—")}</time><b>${escapeHtml(item.customerName || "عميل")}</b><span>${escapeHtml((item.serviceNamesAr || []).join(" + "))}</span><small>${item.status === "arrived" ? "وصل · " : ""}${escapeHtml(workers.get(item.staffId) || item.staffNameAr || "بدون عامل")} · ${escapeHtml(branchLabel(item.branchId))}</small></button>${boardQuickActions(item)}</article>`).join("") || '<p class="booking-board-empty">لا توجد حجوزات هنا</p>'}</div></section>`;
  }).join("");
}

function cashBranch() { return state.role === "cashier" ? state.branchIds[0] : $("#openShiftForm [name=branchId]")?.value || state.branchIds[0]; }

let cashRequestVersion = 0;
async function loadCashOperations(silent = false, includeReports = false) {
  const requestVersion = ++cashRequestVersion;
  const branchId = cashBranch();
  try {
    const result = await getCashOperations(branchId, { includeReports });
    if (requestVersion !== cashRequestVersion || branchId !== cashBranch()) return;
    state.cash = { ...result, recentReports: result.recentReports ?? state.cash.recentReports ?? [] };
    state.loadedAt.cash = Date.now();
    renderCashOperations();
  } catch (error) {
    if (requestVersion !== cashRequestVersion) return;
    state.cash = { state: null, shift: null, snapshot: null, movements: [] };
    state.loadedAt.cash = 0;
    renderCashOperations();
    if ($(".sidebar-end-shift")) $(".sidebar-end-shift").textContent = "إعادة محاولة الوردية";
    if (!silent) toast(error.message || "تعذر تحميل وردية الكاش", true);
  }
}

function renderCashOperations() {
  const shift = state.cash.shift || {};
  const snapshot = state.cash.snapshot || null;
  const isOpen = state.cash.state?.status === "OPEN" && shift.status === "OPEN";
  const shiftShortcut = $(".sidebar-end-shift");
  if (shiftShortcut) shiftShortcut.textContent = isOpen ? "إنهاء الشيفت" : "بدء الشيفت";
  if ($("#cashierNoShiftNotice")) $("#cashierNoShiftNotice").hidden = state.role !== "cashier" || isOpen;
  $("#cashOpening").textContent = shift.id ? money(shift.openingCash) : "—";
  $("#cashSales").textContent = shift.id ? money(shift.cashSales) : "—";
  $("#cashInOut").textContent = shift.id ? `${money(shift.cashIn)} / ${money(shift.cashOut)}` : "—";
  $("#cashExpected").textContent = shift.id ? money(shift.expectedCash) : "—";
  $("#posTodayCash").textContent = isOpen ? money(shift.expectedCash) : "—";
  renderShiftKpis();
  $("#cashShiftStatus").textContent = isOpen ? `${branchLabel(shift.branchId)} • ${shift.cashierName || "الكاشير"} • منذ ${dateTime(shift.openedAt)} • رصيد البداية ${money(shift.openingCash)}` : shift.status === "CLOSED" ? `لا توجد وردية مفتوحة. آخر وردية أُغلقت في ${dateTime(shift.closedAt)}.` : "لا توجد وردية مفتوحة.";
  const report = shift.status === "CLOSED" ? shift.report : null;
  for (const [id, key, isCount] of [["cashShiftCard", "cardSales"], ["cashShiftTransfer", "transferSales"], ["cashShiftExpenses", "expenses"], ["cashShiftAdvances", "advances"], ["cashShiftRefunds", "refunds"], ["cashShiftTransactions", "transactionsCount", true], ["cashShiftCompleted", "completedBookings", true]]) {
    const value = snapshot?.[key] ?? (report ? report[key === "cardSales" ? "card" : key === "transferSales" ? "transfer" : key === "transactionsCount" ? "transactions" : key === "completedBookings" ? "completed" : key] : null);
    $("#" + id).textContent = value == null ? "—" : isCount ? String(value) : money(value);
  }
  $("#cashShiftNet").textContent = snapshot ? money(snapshot.netRevenue) : report ? money(report.netCollected) : "—";
  $("#cashShiftAverage").textContent = snapshot ? money(snapshot.averageTicket) : report?.averageTicket == null ? "—" : money(report.averageTicket);
  const staff = (state.collections.get("staff") || []).filter(item => item.active !== false && item.branchIds?.includes(cashBranch()));
  $("#advanceStaff").innerHTML = '<option value="">اختر الموظف</option>' + staff.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nameAr || item.id)}</option>`).join("");
  if (shift.id && shift.report && (state.role !== "cashier" || shift.cashierUid === state.user?.uid)) {
    $("#shiftReportId").value = shift.id;
    showShiftReport(shift.report);
  }
  $("#openShiftTrigger").hidden = isOpen;
  $("#cashMovementForm").hidden = !isOpen;
  $(".cash-movement-actions").hidden = !isOpen;
  $("#closeShiftForm").hidden = !isOpen;
  $("#cashMovements").innerHTML = (state.cash.movements || []).map(item => `<article class="entity-card"><h3>${item.category === "advance" ? "سلفة موظف" : escapeHtml(({ CASH_IN: "إيداع", CASH_OUT: "سحب", CASH_SALE: "بيع نقدي", CASH_REFUND: "استرداد نقدي" })[item.type] || item.type)}</h3><p>${money(item.amount)} • ${escapeHtml(item.staffNameAr || item.reason || item.receiptNumber || item.bookingId || "")}</p><small>${escapeHtml(dateTime(item.createdAt))}</small></article>`).join("") || '<div class="empty-state">لا توجد حركات.</div>';
  const previous = $("#previousShiftReports");
  if (previous) {
    const selected = previous.value;
    previous.innerHTML = '<option value="">اختر وردية سابقة</option>' + (state.cash.recentReports || []).filter(item => item.hasReport).map(item => `<option value="${escapeAttr(item.shiftId)}">${escapeHtml(item.businessDate || "—")} · ${escapeHtml(dateTime(item.closedAt))}</option>`).join("");
    if ([...previous.options].some(option => option.value === selected)) previous.value = selected;
  }
}

function renderShiftKpis() {
  if (state.role !== "cashier") return;
  const current = state.cash.snapshot;
  const values = { posTodayRevenue: current?.netRevenue, posTodayOrders: current?.transactionsCount,
    posTodayCash: current?.expectedCash, posTodayCard: current?.cardSales, posTodayTransfer: current?.transferSales,
    posTodayWithdrawals: current?.cashOut, posTodayOutgoings: current ? current.expenses + current.advances : null };
  for (const [id, value] of Object.entries(values)) $("#" + id).textContent = value == null ? "—" : id === "posTodayOrders" ? String(value) : money(value);
}

async function loadDashboardShiftState(branchId = "all") {
  const label = $("#dashboardShiftLabel");
  const details = $("#dashboardShiftDetails");
  if (!label || !details) return;
  if (!canOpenSection("cash")) return;
  if (branchId === "all") {
    const count = Number(state.dashboard.stats?.openShifts || 0);
    label.textContent = count ? `${count} وردية مفتوحة` : "لا توجد وردية مفتوحة";
    details.textContent = count ? `النقدي المتوقع ${money(state.dashboard.stats?.expectedCash)}` : "افتح الوردية قبل بدء البيع النقدي";
    $("#dashboardShiftState").classList.toggle("open", count > 0);
    return;
  }
  try {
    const result = await getCashOperations(branchId);
    if (branchId !== $("#dashboardBranchFilter")?.value) return;
    const shift = result.shift || {};
    const open = result.state?.status === "OPEN" && shift.status === "OPEN";
    label.textContent = open ? `وردية ${branchLabel(branchId)} مفتوحة` : `لا توجد وردية مفتوحة في ${branchLabel(branchId)}`;
    details.textContent = open ? `${shift.cashierName || "الكاشير"} • منذ ${dateTime(shift.openedAt)} • المتوقع ${money(shift.expectedCash)}` : "افتح الوردية قبل بدء البيع النقدي";
    $("#dashboardShiftState").classList.toggle("open", open);
  } catch (error) {
    if (branchId !== $("#dashboardBranchFilter")?.value) return;
    label.textContent = "تعذر التحقق من الوردية";
    details.textContent = error.message || "افتح قسم الورديات للمراجعة";
  }
}

async function submitOpenShift(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  if (state.role === "cashier") data.branchId = state.branchIds[0];
  await withButtonBusy(form.querySelector('[type="submit"]'), async () => {
    try { await openCashShift({ ...data, openingCash: Number(data.openingCash), idempotencyKey: form.dataset.key ||= crypto.randomUUID() }); $("#openShiftDialog").close(); form.reset(); form.elements.branchId.value = cashBranch(); form.dataset.key = ""; await loadCashOperations(); toast("تم فتح الوردية"); }
    catch (error) { toast(error.message || "تعذر فتح الوردية", true); }
  });
}

async function submitCashMovement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const advance = form.dataset.mode === "advance";
  if (advance) { data.type = "CASH_OUT"; data.category = "advance"; data.staffId = $("#advanceStaff").value; if (!data.staffId) return toast("حدد الموظف", true); }
  else delete data.staffId;
  if (!confirm(`تأكيد ${advance ? "سلفة الموظف" : data.type === "CASH_OUT" ? "السحب" : "الإيداع"} ${money(data.amount)}؟`)) return;
  await withButtonBusy(form.querySelector('[type="submit"]'), async () => {
    try { await addCashMovement({ ...data, branchId: cashBranch(), amount: Number(data.amount), idempotencyKey: form.dataset.key ||= crypto.randomUUID() }); $("#cashMovementDialog").close(); form.reset(); form.dataset.key = ""; form.dataset.mode = ""; await loadCashOperations(); toast(advance ? "تم تسجيل السلفة كخروج نقدي؛ تسوية الراتب تتم بواسطة الإدارة" : "تم تسجيل حركة الدرج"); }
    catch (error) { toast(error.message || "تعذر تسجيل الحركة", true); }
  });
}

function openCloseShiftDialog() {
  const expected = Number(state.cash.shift?.expectedCash);
  $("#closeShiftExpected").textContent = Number.isFinite(expected) ? money(expected) : "—";
  $("#closeShiftForm").elements.actualCash.value = Number.isFinite(expected) ? expected.toFixed(2) : "";
  $("#closeShiftVariance").textContent = "0 ج.م";
  $("#closeShiftForm").elements.reason.setCustomValidity("");
  $("#closeShiftDialog").showModal();
}

async function submitCloseShift(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const variance = cashVariance(data.actualCash, state.cash.shift?.expectedCash);
  if (variance === null) return toast("أدخل الرصيد الفعلي", true);
  if (closeShiftReasonMissing(data.actualCash, state.cash.shift?.expectedCash, data.reason)) { form.elements.reason.setCustomValidity("سبب العجز أو الزيادة مطلوب"); form.reportValidity(); return; }
  form.elements.reason.setCustomValidity("");
  if (!confirm("تأكيد إغلاق وردية الكاش؟")) return;
  await withButtonBusy(form.querySelector('[type="submit"]'), async () => {
    try {
      const result = await closeCashShift({ ...data, branchId: cashBranch(), actualCash: Number(data.actualCash), idempotencyKey: form.dataset.key ||= crypto.randomUUID() });
      $("#closeShiftDialog").close(); form.reset(); form.dataset.key = "";
      await loadCashOperations();
      $("#shiftReportId").value = result.shiftId;
      if (result.report) showShiftReport(result.report);
      toast("تم إغلاق الشيفت؛ يمكنك عرض التقرير وطباعته");
    } catch (error) { toast(error.message || "تعذر إغلاق الوردية", true); }
  });
}

const reportLabels = { grossRevenue: "إجمالي التحصيل قبل الاسترداد", netRevenue: "صافي التحصيل بعد الاسترداد", cash: "نقدي (صافي)", card: "بطاقة", transfer: "تحويل إلكتروني", other: "طرق أخرى", expenses: "المصروفات", advances: "سلف الموظفين (ضمن الخارج من الدرج)", cashIn: "إضافة كاش", cashOut: "الخارج من الدرج شاملًا السلف والمصروفات النقدية", refunds: "الاسترداد", transactions: "المعاملات", bookings: "الحجوزات", completed: "مكتملة", cancelled: "ملغاة", noShow: "لم يحضر", averageTicket: "متوسط الشيك" };
function reportPrintHeader(title, branch, period, generated) {
  return `<header class="v7-print-heading"><img src="/assets/el-mezaen-logo.jpeg" alt="El Mezaen"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(branch || "—")} • ${escapeHtml(period || "—")}</p><small>أُنشئ: ${escapeHtml(dateTime(generated))}</small></div></header>`;
}
function printReport(element) {
  element.classList.add("v7-print-active");
  window.addEventListener("afterprint", () => element.classList.remove("v7-print-active"), { once: true });
  window.print();
}
function reportNumbers(totals) {
  return `<dl class="v7-report-numbers">${Object.entries(reportLabels).filter(([key]) => key in (totals || {})).map(([key, label]) => `<div><dt>${label}</dt><dd>${totals[key] == null ? "غير متاح" : ["transactions", "bookings", "completed", "cancelled", "noShow"].includes(key) ? Number(totals[key]) : money(totals[key])}</dd></div>`).join("")}</dl>`;
}
function showShiftReport(report) {
  const result = $("#shiftReportResult");
  result.innerHTML = `${reportPrintHeader("تقرير إغلاق الشيفت", report.branchName || branchLabel(report.branchId), report.businessDate, report.closedAt)}<p>الكاشير: ${escapeHtml(report.cashierName || report.cashierUid)} • الوردية: ${escapeHtml(report.shiftId)}</p><p>من ${escapeHtml(dateTime(report.openedAt))} إلى ${escapeHtml(dateTime(report.closedAt))}</p>${reportNumbers({ grossRevenue: report.grossRevenue, netRevenue: report.netCollected, cash: report.cash, card: report.card, transfer: report.transfer, other: report.other, refunds: report.refunds, expenses: report.expenses, advances: report.advances, transactions: report.transactions, cashIn: report.cashIn, cashOut: report.cashOut })}<p>رصيد البداية ${money(report.openingCash)} • المتوقع ${money(report.expectedCash)} • الفعلي ${money(report.actualCash)} • الفرق ${money(report.variance)}</p>${report.notes ? `<p>الملاحظة: ${escapeHtml(report.notes)}</p>` : ""}`;
  $("#shiftReportPrint").disabled = false;
}
function showCurrentShiftReport() {
  const shift = state.cash.shift;
  const live = state.cash.snapshot;
  if (!shift || !live || shift.status !== "OPEN") return toast("ابدأ الشيفت أو اختر تقرير وردية مغلقة", true);
  $("#shiftReportResult").innerHTML = `${reportPrintHeader("ملخص الوردية الحالية · مبدئي", branchLabel(shift.branchId), shift.businessDate, new Date().toISOString())}<p>${escapeHtml(shift.cashierName || "الكاشير")} • منذ ${escapeHtml(dateTime(shift.openedAt))}</p>${reportNumbers({ grossRevenue: live.grossRevenue, netRevenue: live.netRevenue, cash: live.cashSales, card: live.cardSales, transfer: live.transferSales, other: live.otherSales, refunds: live.refunds, expenses: live.expenses, advances: live.advances, cashIn: live.cashIn, cashOut: live.cashOut, transactions: live.transactionsCount })}<p>الرصيد المتوقع ${money(live.expectedCash)}. الأرقام مبدئية حتى إغلاق الشيفت.</p>`;
  $("#shiftReportPrint").disabled = false;
}
async function loadShiftReport(button = $("#shiftReportLoad")) {
  const shiftId = $("#shiftReportId").value.trim();
  if (!shiftId) return toast("اكتب معرّف الوردية", true);
  await withButtonBusy(button, async () => {
    try { const { report } = await getBusinessReport({ type: "shift", shiftId }); showShiftReport(report); }
    catch (error) { $("#shiftReportResult").textContent = error.message; $("#shiftReportPrint").disabled = true; }
  });
}
function reportKey() {
  const type = $("#reportType").value;
  const date = $("#reportDate").value;
  return type === "monthly" ? $("#reportMonth").value : type === "weekly" && date ? weekStart(date) : date;
}
function showBusinessReports(reports, missingBranches, combined = null, resultNode = $("#reportResult"), printButton = $("#reportPrint")) {
  if (combined) reports = [combined, ...reports];
  const body = reports.map(report => `${reportPrintHeader(`تقرير ${({ daily: "يومي", weekly: "أسبوعي", monthly: "شهري" })[report.type]}`, report.branchName || branchLabel(report.branchId), `${report.periodStart} — ${report.periodEnd}`, report.generatedAt)}${reportNumbers(report.totals)}${report.attendance ? `<p>عدد الحضور المسجل: ${Number(report.attendance.checkedIn || 0)}</p>` : ""}${report.target ? `<p>الهدف ${money(report.target.amount)} • المحقق ${money(report.target.actual)} • المتبقي ${money(report.target.remaining)} • الإنجاز ${report.target.percent}%</p>` : ""}${report.days?.length ? `<div class="v7-report-days">${report.days.map(day => `<span>${escapeHtml(day.key)}: ${day.available ? money(day.netRevenue) : "تقرير يومي ناقص"}</span>`).join("")}</div>` : ""}`);
  resultNode.innerHTML = `${missingBranches.length ? `<p class="v7-report-warning">لا يوجد تقرير محفوظ: ${missingBranches.map(branchLabel).map(escapeHtml).join("، ")}</p>` : ""}${body.join("") || "لم يُنشأ هذا التقرير بعد."}`;
  printButton.disabled = !reports.length;
}
async function loadBusinessReport(button = $("#reportLoad")) {
  const periodKey = reportKey();
  if (!periodKey) return toast("حدد تاريخ التقرير", true);
  await withButtonBusy(button, async () => {
    try { const result = await getBusinessReport({ type: $("#reportType").value, branchId: $("#reportBranch").value, periodKey }); showBusinessReports(result.reports, result.missingBranches, result.combined); }
    catch (error) { $("#reportResult").textContent = error.message; $("#reportPrint").disabled = true; }
  });
}
async function loadCashierPeriodReport(button = $("#cashierReportLoad")) {
  if (state.role !== "cashier" || !state.permissions.has("pos")) return;
  const type = $("#cashierReportType").value;
  const date = $("#cashierReportDate").value;
  const periodKey = type === "monthly" ? $("#cashierReportMonth").value : type === "weekly" && date ? weekStart(date) : date;
  if (!periodKey) return toast("حدد فترة التقرير", true);
  await withButtonBusy(button, async () => {
    try {
      const result = await getBusinessReport({ type, branchId: state.branchIds[0], periodKey });
      showBusinessReports(result.reports, result.missingBranches, null, $("#cashierReportResult"), $("#cashierReportPrint"));
    } catch (error) { $("#cashierReportResult").textContent = error.message; $("#cashierReportPrint").disabled = true; }
  });
}
function selectCashierReportTab(type) {
  if (type === "shift") { $(".v7-shift-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (!["daily", "weekly", "monthly"].includes(type)) return;
  $("#cashierReportType").value = type;
  $("#cashierReportType").dispatchEvent(new Event("change"));
  $("#cashierReportsPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
let auditCursor = null;
async function loadAuditEvents(cursor = "") {
  if (state.role !== "admin") return;
  const params = { cursor, branchId: $("#auditBranch").value, actorUid: $("#auditActor").value.trim(), role: $("#auditRole").value, action: $("#auditAction").value.trim(), entityType: $("#auditEntity").value.trim(), date: $("#auditDate").value, limit: 50 };
  try {
    const result = await getAuditEvents(params);
    const cards = result.items.map(activityCard).join("");
    $("#auditResults").innerHTML = cursor ? $("#auditResults").innerHTML + cards : cards || '<p class="empty-state">لا توجد أحداث ضمن هذه الصفحة.</p>';
    auditCursor = result.nextCursor;
    $("#auditNext").hidden = !auditCursor;
  } catch (error) { toast(error.message || "تعذر تحميل سجل النشاط", true); }
}
async function submitOwnPassword(event) {
  event.preventDefault();
  if (!["admin", "manager", "cashier"].includes(state.role)) return;
  const form = event.currentTarget, data = new FormData(form);
  if (data.get("newPassword") !== data.get("confirmPassword")) return toast("تأكيد كلمة المرور لا يطابق الجديدة", true);
  await withButtonBusy(form.querySelector('[type="submit"]'), async () => {
    try { await changeOwnPassword(data.get("currentPassword"), data.get("newPassword")); form.reset(); form.closest("dialog")?.close(); toast("تم تغيير كلمة مرور حسابك"); }
    catch (error) { toast(error?.code === "auth/wrong-password" || error?.code === "auth/invalid-credential" ? "كلمة المرور الحالية غير صحيحة" : error?.code === "auth/weak-password" ? "اختر كلمة مرور أقوى" : "تعذر تغيير كلمة المرور؛ تحقق من البيانات ثم حاول مرة أخرى", true); }
  });
}

async function submitDailyClosing(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  if (!confirm(`إغلاق يوم ${data.businessDate} للفرع؟ لن تُقبل حركات مالية جديدة على التاريخ.`)) return;
  try {
    const result = await closeBusinessDay({ ...data, actualCash: Number(data.actualCash), idempotencyKey: form.dataset.key ||= crypto.randomUUID() });
    const closing = result.closing || {};
    $("#dailyClosingResult").innerHTML = `<h3>تم إغلاق اليوم</h3><p>إجمالي البيع: ${money(closing.grossSales)} • الصافي: ${money(closing.netSales)} • المصروفات: ${money(closing.expenses)} • الاستردادات: ${money(closing.refunds)}</p><p>المتوقع: ${money(closing.expectedCash)} • الفعلي: ${money(closing.actualCash)} • الفرق: ${money(closing.variance)}</p>`;
    form.dataset.key = "";
    toast("تم إغلاق يوم الفرع وتسجيل تقرير التسوية");
  } catch (error) { toast(error.message || "تعذر إغلاق اليوم", true); }
}

function renderRecentOperations() {
  const target = $("#recentBookings");
  if (!target) return;
  const query = $("#dashboardOperationSearch")?.value.trim().toLowerCase() || "";
  let canonicalQuery = ""; try { canonicalQuery = normalizePhone(query); } catch {}
  const filter = $("#dashboardOperationFilter")?.value || "all";
  const method = $("#dashboardPaymentMethodFilter")?.value || "all";
  const date = $("#dashboardDateFilter")?.value || "";
  const staffId = $("#dashboardStaffFilter")?.value || "all";
  const filtered = state.dashboard.bookings.filter(item => {
    if (filter === "receipts" && item.source !== "pos") return false;
    if (filter === "bookings" && item.source === "pos") return false;
    if (["paid", "unpaid"].includes(filter) && item.paymentStatus !== filter) return false;
    if (method !== "all" && item.paymentMethod !== method) return false;
    if (date && (item.bookingDate || String(item.createdAt || "").slice(0, 10)) !== date) return false;
    if (staffId !== "all" && item.staffId !== staffId && !(item.items || []).some(line => line.workerId === staffId)) return false;
    return !query || [item.code, item.customerName, item.phone, ...(item.serviceNamesAr || [])].some(value => String(value || "").toLowerCase().includes(query)) || Boolean(canonicalQuery && (() => { try { return normalizePhone(item.phone) === canonicalQuery; } catch { return false; } })());
  });
  const pageSize = Math.max(10, Math.min(50, Number($("#dashboardPageSize")?.value || 25)));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  dashboardPage = Math.max(1, Math.min(pageCount, dashboardPage));
  const start = (dashboardPage - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);
  target.innerHTML = rows.map(bookingRowMini).join("") || emptyRow(8);
  if ($("#dashboardRowsSummary")) $("#dashboardRowsSummary").textContent = filtered.length ? `عرض ${start + 1}–${Math.min(start + pageSize, filtered.length)} من ${filtered.length}` : "لا توجد نتائج";
  if ($("#dashboardPageLabel")) $("#dashboardPageLabel").textContent = `${dashboardPage} / ${pageCount}`;
  if ($("#dashboardPagePrev")) $("#dashboardPagePrev").disabled = dashboardPage <= 1;
  if ($("#dashboardPageNext")) $("#dashboardPageNext").disabled = dashboardPage >= pageCount;
}

function syncDashboardTargetBranchOptions() {
  const allowed = state.branchIds.length ? state.branchIds : ["talkha", "mashaya"];
  [$("#dashboardTargetBranch"), $("#desktopTargetBranch")].filter(Boolean).forEach(select => {
    const current = select.value;
    select.innerHTML = `${allowed.length > 1 ? '<option value="all">جميع الفروع</option>' : ""}${allowed.map(id => `<option value="${escapeAttr(id)}">${escapeHtml(branchLabel(id))}</option>`).join("")}`;
    select.value = [...select.options].some(option => option.value === current) ? current : allowed.length > 1 ? "all" : allowed[0];
  });
}

function renderMonthlyRevenueTarget(stats = {}) {
  syncDashboardTargetBranchOptions();
  const selectedDashboardBranch = $("#dashboardBranchFilter")?.value || "all";
  [$("#dashboardTargetBranch"), $("#desktopTargetBranch")].filter(Boolean).forEach(select => {
    if ([...select.options].some(option => option.value === selectedDashboardBranch)) select.value = selectedDashboardBranch;
  });
  const byBranch = stats.monthlyTargetByBranch && typeof stats.monthlyTargetByBranch === "object" ? stats.monthlyTargetByBranch : {};
  const combinedAchieved = Object.values(byBranch).reduce((sum, item) => sum + Math.max(0, Number(item?.achieved || 0)), 0);
  [{ select: $("#dashboardTargetBranch"), prefix: "dashboardMonthTarget" }, { select: $("#desktopTargetBranch"), prefix: "desktopMonthTarget" }].forEach(({ select, prefix }) => {
    if (!select) return;
    const selected = select.value || "all";
    const branchSummary = selected === "all" ? null : byBranch[selected];
    const monthlyTarget = Math.max(0, Number(selected === "all" ? stats.monthlyRevenueTarget : branchSummary?.target || 0));
    const monthAchieved = Math.max(0, Number(selected === "all" ? combinedAchieved : branchSummary?.achieved || 0));
    const summaryAvailable = selected === "all" || Boolean(branchSummary);
    const monthRemaining = monthlyTarget ? Math.max(0, monthlyTarget - monthAchieved) : 0;
    const targetPercent = monthlyTarget ? Math.min(100, Math.round(monthAchieved / monthlyTarget * 100)) : 0;
    $("#" + prefix + "Percent").textContent = summaryAvailable && monthlyTarget ? `${targetPercent}%` : "—";
    $("#" + prefix + "Progress").value = summaryAvailable ? targetPercent : 0;
    $("#" + prefix + "Progress").textContent = `${summaryAvailable ? targetPercent : 0}%`;
    $("#" + prefix + "Total").textContent = summaryAvailable && monthlyTarget ? money(monthlyTarget) : "غير محدد";
    $("#" + prefix + "Achieved").textContent = summaryAvailable ? money(monthAchieved) : "—";
    $("#" + prefix + "Remaining").textContent = summaryAvailable && monthlyTarget ? money(monthRemaining) : "—";
  });
}

function openBranchTargetEditor() {
  if (state.role !== "admin") return toast("تعديل الهدف متاح للمدير فقط", true);
  const form = $("#branchTargetForm");
  const selected = $("#dashboardBranchFilter")?.value;
  form.elements.branchId.value = selected && selected !== "all" ? selected : "talkha";
  form.elements.month.value = state.dashboard.stats?.targetMonth || cairoDateKey().slice(0, 7);
  form.elements.targetAmount.value = state.dashboard.stats?.monthlyTargetByBranch?.[form.elements.branchId.value]?.target ?? 0;
  $("#branchTargetDialog").showModal();
}

async function submitBranchTarget(event) {
  event.preventDefault();
  if (state.role !== "admin") return toast("تعديل الهدف متاح للمدير فقط", true);
  const form = event.currentTarget;
  const branchId = form.elements.branchId.value;
  const month = form.elements.month.value;
  const targetAmount = Number(form.elements.targetAmount.value);
  if (!["talkha", "mashaya"].includes(branchId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isFinite(targetAmount) || targetAmount < 0) return toast("بيانات الهدف غير صحيحة", true);
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await setBranchMonthlyTarget({ branchId, month, targetAmount });
    $("#branchTargetDialog").close();
    await loadDashboard();
    toast("تم حفظ هدف الفرع لهذا الشهر");
  } catch (error) { toast(error.message || "تعذر حفظ الهدف", true); }
  finally { button.disabled = false; }
}

async function loadCashierGoals() {
  if (state.role !== "cashier" || !state.permissions.has("dashboard")) return;
  const panel = $("#cashierShiftTargets");
  panel.hidden = false;
  const branchId = state.branchIds[0];
  const list = $("#cashierShiftTargetsList");
  list.innerHTML = '<p class="empty-state">جارٍ تحميل أهداف الخدمات…</p>';
  try {
    const result = await getServiceTargetsDashboard(cairoDateKey().slice(0, 7), branchId);
    const targets = result.targets || [];
    const completed = targets.filter(item => Number(item.targetCount) > 0 && Number(item.achievedCount) >= Number(item.targetCount)).length;
    list.innerHTML = `<div class="cashier-target-summary">${[["الأهداف النشطة", targets.length], ["المكتملة", completed], ["جاري التنفيذ", targets.length - completed]].map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`).join("")}</div>` + (targets.map(item => `<article class="cashier-target-row"><b>${escapeHtml(item.nameAr || item.itemId)}</b><span>${Number(item.achievedCount || 0)} / ${Number(item.targetCount || 0)}</span><progress value="${Number(item.progressPercent || 0)}" max="100"></progress></article>`).join("") || '<p class="empty-state">لا توجد أهداف خدمات محددة لهذا الفرع.</p>');
  } catch (error) { list.innerHTML = `<p class="empty-state">${escapeHtml(error.message || "تعذر تحميل الأهداف")}</p>`; }
}

async function openCashierTargets() { await showSection("cashierGoals"); }

function renderDashboard() {
  const s = state.dashboard.stats || {};
  if (state.role === "admin") {
    const branch = $("#dashboardBranchFilter").value;
    $("#ownerBranchLabel").textContent = branchLabel(branch);
    $("#ownerMonthTitle").textContent = `أداؤك خلال ${new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric", timeZone: "Africa/Cairo" }).format(new Date())}`;
    $("#ownerMonthRevenue").textContent = money(s.monthRevenue);
    $("#ownerMonthTransactions").textContent = s.ownerMonthTransactions == null ? "—" : String(s.ownerMonthTransactions);
    $("#ownerMonthAverage").textContent = s.ownerMonthTransactions ? money(Number(s.monthRevenue || 0) / s.ownerMonthTransactions) : "—";
    $("#ownerMonthCustomers").textContent = s.ownerNewCustomers == null ? "—" : String(s.ownerNewCustomers);
    const target = Number(s.monthlyRevenueTarget || 0);
    const progress = target > 0 ? Math.min(100, Math.round(Number(s.monthRevenue || 0) / target * 100)) : 0;
    $("#ownerTargetProgress").textContent = target ? `${progress}%` : "غير محدد";
    $("#ownerTargetBar").value = progress;
    $("#ownerTargetDetail").textContent = target ? `${money(s.monthRevenue)} من ${money(target)} · المتبقي ${money(Math.max(0, target - Number(s.monthRevenue || 0)))}` : "لم يحدد هدف لهذه الفترة";
    renderOwnerMobileLists();
  }
  $("#dashboardDataError").hidden = true;
  $("#statTodayRevenue").textContent = money(s.todayRevenue);
  $("#statTodayBookings").textContent = String(s.todayBookings ?? "—");
  $("#statCompletedToday").textContent = String(s.completedToday ?? "—");
  $("#statUpcomingBookings").textContent = String(s.upcomingBookings ?? "—");
  const todayKey = cairoDateKey();
  const todayItems = state.dashboard.bookings.filter(item => item.dateKey === todayKey || item.bookingDate === todayKey);
  const todayReceipts = todayItems.filter(item => item.source === "pos");
  const todayCash = todayReceipts.filter(item => item.paymentStatus === "paid" && (item.paymentMethod || "cash") === "cash").reduce((sum, item) => sum + Number(item.total || 0), 0);
  $("#statTodayReceipts").textContent = s.ordersToday ?? todayReceipts.length;
  $("#statTodayCash").textContent = money(s.cashSalesToday ?? todayCash);
  $("#statUnpaid").textContent = s.unpaidCount || 0;
  const paidToday = todayItems.filter(item => item.paymentStatus === "paid");
  const receiptCount = Number(s.ordersToday ?? todayReceipts.length);
  const averageTicket = receiptCount ? Number(s.todayRevenue || 0) / receiptCount : paidToday.length ? paidToday.reduce((sum, item) => sum + Number(item.total || 0), 0) / paidToday.length : 0;
  $("#statAverageTicket").textContent = money(averageTicket);
  $("#statTodayExpenses").textContent = money(s.todayExpenses);
  $("#statTodayNet").textContent = money(Number(s.todayRevenue || 0) - Number(s.todayExpenses || 0));
  if ($("#posTodayRevenue")) $("#posTodayRevenue").textContent = money(s.todayRevenue);
  if ($("#posTodayOrders")) $("#posTodayOrders").textContent = String(s.ledgerTransactions ?? s.ordersToday ?? todayReceipts.length);
  if ($("#posTodayCash")) $("#posTodayCash").textContent = state.cash.state?.status === "OPEN" && state.cash.shift?.status === "OPEN" ? money(state.cash.shift.expectedCash) : "—";
  if ($("#posTodayUnpaid")) $("#posTodayUnpaid").textContent = String(s.unpaidCount ?? "—");
  $("#posTodayCard").textContent = "—"; // A bounded booking snapshot is not the full ledger.
  $("#posTodayTransfer").textContent = "—";
  $("#posTodayWithdrawals").textContent = "—";
  $("#posTodayOutgoings").textContent = "—"; // The cashier snapshot has no combined expenses and advances metric.
  renderShiftKpis();
  renderMonthlyRevenueTarget(s);
  $("#revenueToday").textContent = money(s.todayRevenue);
  $("#revenueMonth").textContent = money(s.monthRevenue);
  $("#revenueTotal").textContent = money(s.totalRevenue);
  $("#revenueLast").textContent = money(s.lastCollected);
  renderBranchFilters();
  renderRecentOperations();
  renderDashboardUpcoming();
  renderDashboardAttendanceSummary();
  renderBookings();
  renderPosReceipts();
  renderCashierTransactions();
  renderRevenue();
  renderAdminAlerts();
}

function renderOwnerMobileLists() {
  // Dashboard's bounded recent rows are deliberately excluded from mobile history.
}

let ownerHistoryVersion = 0;
const ownerHistory = { sales: { items: [], cursor: null }, expenses: { items: [], cursor: null } };
function ownerHistoryOptions(kind) {
  const form = kind === "sales" ? $("#ownerSalesFilters") : $("#ownerExpenseFilters");
  return { kind, branchId: $("#dashboardBranchFilter").value, ...Object.fromEntries(new FormData(form).entries()) };
}
async function loadOwnerHistory(kind, more = false) {
  if (state.role !== "admin" || !adminMobileViewport.matches) return;
  const version = ++ownerHistoryVersion;
  const existing = ownerHistory[kind];
  const options = ownerHistoryOptions(kind);
  const target = kind === "sales" ? $("#ownerSalesCards") : $("#ownerExpenseCards");
  if (!more) target.textContent = "جارٍ تحميل النتائج…";
  try {
    const result = await getOwnerMobileHistory({ ...options, ...(more ? { cursor: existing.cursor } : {}) });
    if (version !== ownerHistoryVersion || state.section !== (kind === "sales" ? "revenue" : "expenses") || options.branchId !== $("#dashboardBranchFilter").value) return;
    ownerHistory[kind] = { items: more ? [...existing.items, ...result.items] : result.items, cursor: result.nextCursor };
    if (kind === "sales") {
      $("#ownerSalesTotal").textContent = money(result.totals.amount);
      $("#ownerSalesCount").textContent = `${result.totals.count} عملية في نطاق الفلتر`;
      target.innerHTML = ownerHistory.sales.items.map(item => `<button type="button" data-owner-sale-detail="${escapeAttr(item.id)}" class="owner-list-card"><b>${escapeHtml(item.bookingCode || item.id)}<small>${escapeHtml(item.customerName || "عميل غير مسجل")}</small></b><strong>${money(item.amount)}</strong><small>${escapeHtml(branchLabel(item.branchId))} • ${escapeHtml(paymentMethod(item.paymentMethod))} • ${escapeHtml(item.type === "refund" ? "استرداد" : "دفع")} • ${escapeHtml(item.dateKey || "")}</small></button>`).join("") || '<p class="empty-state">لا توجد معاملات.</p>';
      $("#ownerSalesMore").hidden = !result.nextCursor;
    } else {
      $("#ownerExpenseTotal").textContent = money(result.totals.amount);
      $("#ownerExpenseCount").textContent = `${result.totals.count} مصروف في نطاق الفلتر`;
      target.innerHTML = ownerHistory.expenses.items.map(item => `<article class="owner-list-card"><b>${escapeHtml(item.category || "مصروف")}</b><strong>${money(item.amount)}</strong><small>${escapeHtml(branchLabel(item.branchId))} • ${escapeHtml(item.dateKey)} • ${escapeHtml(item.description || "")}</small></article>`).join("") || '<p class="empty-state">لا توجد مصروفات.</p>';
      $("#ownerExpenseMore").hidden = !result.nextCursor;
      const chart = $("#ownerExpenseChart");
      const categories = Object.entries(result.categoryTotals || {}).filter(([, row]) => row.count);
      const categoryGrandTotal = categories.reduce((total, [, row]) => total + Number(row.amount || 0), 0);
      chart.innerHTML = categories.map(([name, row]) => `<div><span>${escapeHtml(name)}</span><meter min="0" max="${Math.max(1, categoryGrandTotal)}" value="${Math.max(0, row.amount)}"></meter><b>${money(row.amount)}</b></div>`).join("") || '<p class="empty-state">لا توجد بيانات للتحليل.</p>';
    }
  } catch (error) { if (version === ownerHistoryVersion) target.textContent = error.message || "تعذر تحميل السجل. أعد المحاولة."; }
}

function renderMobileContent() {
  if (state.section !== "mobileContent") return;
  const type = $("#mobileContentType").value, status = $("#mobileContentStatus").value;
  const branch = $("#dashboardBranchFilter").value;
  const rows = [...(state.collections.get("content") || []).filter(row => canManageContent(row.type)).map(row => ({ ...row, collection: "content" })),
    ...(canManageContent("offer") ? (state.collections.get("offers") || []).map(row => ({ ...row, type: "offer", collection: "offers" })) : [])]
    .filter(row => (type === "all" || row.type === type) && (status === "all" || (status === "published") === (row.active !== false)) && (branch === "all" || row.branchIds?.includes(branch)));
  $("#mobileContentCards").innerHTML = rows.map(row => `<article class="mobile-content-card"><div class="entity-media">${row.imageUrl ? `<img src="${escapeAttr(safeMediaUrl(row.imageUrl))}" alt="" loading="lazy" decoding="async">` : "▧"}</div><div><small>${escapeHtml(row.type)} • ${escapeHtml(branchScopeLabel(row.branchIds))}</small><h3>${escapeHtml(row.titleAr || row.nameAr || "بدون عنوان")}</h3><p>${row.active === false ? "مسودة / مخفي" : "منشور"} • ${escapeHtml(dateTime(row.updatedAt || row.createdAt))}</p></div><footer><button data-content-preview="${row.collection}:${escapeAttr(row.id)}">معاينة</button><button data-edit-collection="${row.collection}" data-edit-id="${escapeAttr(row.id)}">تعديل</button><button data-toggle-collection="${row.collection}" data-toggle-id="${escapeAttr(row.id)}">${row.active === false ? "نشر" : "إخفاء"}</button><button data-delete-collection="${row.collection}" data-delete-id="${escapeAttr(row.id)}">حذف</button></footer></article>`).join("") || '<p class="empty-state">لا يوجد محتوى لهذا الفرع والنوع.</p>';
  $("#mobileContentMore").hidden = !(state.collectionCursors.get("content") || state.collectionCursors.get("offers"));
}

function renderDashboardUpcoming() {
  const target = $("#dashboardUpcomingList");
  if (!target) return;
  const nowKey = cairoDateKey();
  const nowTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const items = (state.dashboard.bookings || []).filter(item => item.source !== "pos" && ["pending", "confirmed", "arrived"].includes(item.status) && item.bookingDate && (item.bookingDate > nowKey || (item.bookingDate === nowKey && String(item.bookingTime || "") >= nowTime))).sort((a, b) => String(a.bookingDate).localeCompare(String(b.bookingDate)) || String(a.bookingTime).localeCompare(String(b.bookingTime))).slice(0, 5);
  target.innerHTML = items.map(item => `<div class="dashboard-upcoming-item"><time><b>${escapeHtml(item.bookingTime || "—")}</b><small>${escapeHtml(item.bookingDate)}</small></time><div><b>${escapeHtml(item.customerName || "عميل")}</b><small>${escapeHtml((item.serviceNamesAr || []).join(" + ") || "خدمة")} • ${escapeHtml(item.staffNameAr || "لم يحدد عامل")}</small></div><span class="status-pill" data-status="${escapeAttr(item.status)}">${escapeHtml(statusLabel(item.status))}</span></div>`).join("") || '<p class="empty-state">لا توجد حجوزات قادمة ضمن أحدث السجلات المحمّلة.</p>';
}

function renderDashboardAttendanceSummary() {
  const target = $("#dashboardAttendanceSummary");
  if (!target) return;
  const branch = $("#dashboardBranchFilter")?.value || "all";
  const attendance = state.attendance || {};
  if (!state.loadedAt.attendance || attendance.dateKey !== cairoDateKey() || (attendance.branchId || "all") !== branch) {
    target.textContent = "افتح الحضور لعرض الحالة الحالية لهذا النطاق.";
    return;
  }
  const present = (attendance.rows || []).filter(item => item.status === "PRESENT");
  target.innerHTML = `<strong>${present.length}</strong><span>موجودون الآن</span><div class="dashboard-present-staff">${present.slice(0, 6).map(item => `<span>${escapeHtml(item.nameAr || "عامل")}</span>`).join("") || '<small>لا يوجد عامل مسجل حضورًا في هذا النطاق.</small>'}</div>`;
}

function bookingRowMini(item) {
  return `<tr><td><b>${escapeHtml(item.code)}</b></td><td><span class="branch-pill">${escapeHtml(item.branchNameAr || branchLabel(item.branchId))}</span></td><td>${escapeHtml(item.customerName)}<br><small>${escapeHtml(item.phone)}</small></td><td>${escapeHtml((item.serviceNamesAr || []).join(" + "))}<br><small>${money(item.total)}</small></td><td>${escapeHtml(item.staffNameAr)}</td><td>${escapeHtml(item.bookingDate || "طلب منتجات")}<br><small>${escapeHtml(item.bookingTime || "")}</small></td><td><span class="status-pill" data-status="${escapeAttr(item.status)}">${statusLabel(item.status)}</span></td><td>${paymentLabel(item.paymentStatus)}</td></tr>`;
}

function receiptActionButtons(id, printLabel = "طباعة الإيصال", includeDetails = true) {
  const safeId = escapeAttr(id);
  return `${includeDetails ? `<button class="receipt-action receipt-details" data-open-receipt="${safeId}">تفاصيل</button>` : ""}<button class="receipt-action receipt-print" data-print-booking="${safeId}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/></svg>${escapeHtml(printLabel)}</button>${includeDetails ? "" : `<button type="button" class="receipt-action" data-reprint-booking="${safeId}">إعادة طباعة الإيصال</button>`}<button class="receipt-action receipt-whatsapp" data-whatsapp-receipt="${safeId}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.8a8 8 0 0 1-11.9 7L4 20l1.2-4A8 8 0 1 1 20 11.8Z"/><path d="M9 8c.5 3 2 4.5 5 5l1-1 2 1"/></svg>إرسال واتساب</button>`;
}

function canRefundBooking(item) { return item.paymentStatus === "paid" && Boolean(item.paymentMethod) && (state.role === "admin" || state.permissions.has("revenue") || state.permissions.has("refundTransactions")); }

function receiptDrawerOperations(item) {
  const id = escapeAttr(item.id);
  const action = (name, label) => `<button type="button" class="small-button" data-booking-action="${name}" data-booking-id="${id}">${label}</button>`;
  if (item.source === "pos") {
    return canRefundBooking(item) ? action("refund", "استرداد") : item.paymentStatus === "unpaid" && state.permissions.has("revenue") ? action("markPaid", "تسجيل الدفع") : item.paymentStatus === "paid" && state.role === "cashier" ? '<small>الاسترداد يتطلب مديرًا أو صلاحية استرداد.</small>' : "";
  }
  if (!state.permissions.has("bookings")) return "";
  const states = { pending: [["confirmed", "تأكيد"], ["rejected", "رفض"], ["cancelled", "إلغاء"]], confirmed: [["arrived", "وصل للفرع"], ["no_show", "لم يحضر"], ["cancelled", "إلغاء"]], arrived: [["no_show", "لم يحضر"]] };
  const actions = (states[item.status] || []).map(([name, label]) => action(name, label)).join("");
  const reschedule = ["pending", "confirmed"].includes(item.status) ? `<button type="button" class="small-button" data-reschedule-booking="${id}">إعادة جدولة</button>` : "";
  const pos = states[item.status] && state.permissions.has("pos") ? `<button type="button" class="small-button primary" data-booking-pos="${id}">فتح الفاتورة</button>` : "";
  const checkout = states[item.status] && state.permissions.has("pos") ? action(item.paymentStatus === "paid" ? "completed" : "checkout", item.paymentStatus === "paid" ? "إكمال الحجز" : "تحصيل وإكمال") : "";
  const refund = canRefundBooking(item) ? action("refund", "استرداد") : item.paymentStatus === "paid" && state.role === "cashier" ? '<small>الاسترداد يتطلب مديرًا أو صلاحية استرداد.</small>' : "";
  return actions + reschedule + pos + checkout + refund;
}

function openReceiptDrawer(id) {
  const item = state.dashboard.bookings.find(value => value.id === id);
  if (!item) return toast("تعذر العثور على الشيك", true);
  $("#receiptDrawerTitle").textContent = `${item.source === "pos" ? "شيك" : "حجز"} ${item.code || item.receiptNumber || item.id}`;
  const lines = item.items || [];
  $("#receiptDrawerBody").innerHTML = `<section class="receipt-drawer-summary"><div><span>رقم العملية</span><b>${escapeHtml(item.receiptNumber || item.code || item.id)}</b><small>${escapeHtml(dateTime(item.createdAt || item.bookingDate))}</small></div><div><span>العميل</span><b>${escapeHtml(item.customerName || "عميل نقدي")}</b><small>${escapeHtml(item.phone || "لا يوجد رقم")}</small></div><div><span>الفرع</span><b>${escapeHtml(branchLabel(item.branchId))}</b><small>${escapeHtml(item.bookingDate || String(item.createdAt || "").slice(0, 10))} ${escapeHtml(item.bookingTime || "")}</small></div><div><span>الحالة</span><b>${escapeHtml(statusLabel(item.status))}</b><small>${escapeHtml(paymentLabel(item.paymentStatus))} • ${escapeHtml(paymentMethod(item.paymentMethod))}</small></div><div><span>الإجمالي</span><b>${money(item.total)}</b><small>الخصم ${money(item.discountAmount)}</small></div></section><div class="receipt-drawer-lines">${lines.map(line => `<article><div><b>${escapeHtml(line.nameAr || "بند")}</b><small>${escapeHtml(line.workerNameAr || item.staffNameAr || "بدون عامل")} • الكمية ${Number(line.qty || 1)}</small></div><strong>${money(line.lineTotal ?? Number(line.price || 0) * Number(line.qty || 1))}</strong></article>`).join("") || '<p>تفاصيل البنود غير متاحة لهذا السجل القديم.</p>'}</div><footer class="receipt-drawer-actions">${item.source === "pos" && item.paymentStatus === "unpaid" && state.permissions.has("revenue") ? `<label>طريقة الدفع<select data-payment-method="${escapeAttr(item.id)}"><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="vodafone_cash">فودافون كاش</option><option value="instapay">إنستاباي</option><option value="other">أخرى</option></select></label>` : ""}${receiptDrawerOperations(item)}${receiptActionButtons(item.id, "طباعة الإيصال", false)}</footer>`;
  if (!$("#receiptDrawer").open) $("#receiptDrawer").showModal();
}

function branchLabel(id) { return ({ talkha: "فرع طلخا", mashaya: "فرع المشاية", all: "كل الفروع" })[id] || id || "فرع طلخا"; }

function staffOperationalLabel(worker, branchId) {
  if (!availableAtBranch(worker, branchId) || worker.active === false || worker.available === false) return "غير متاح";
  const next = [...(state.dashboard.bookings || []), ...(state.calendar.bookings || [])]
    .filter(item => item.branchId === branchId && item.staffId === worker.id && item.bookingDate === cairoDateKey() && ["confirmed", "arrived"].includes(item.status) && item.bookingTime)
    .sort((a, b) => String(a.bookingTime).localeCompare(String(b.bookingTime)))[0];
  return next ? `حجز اليوم ${next.bookingTime}` : "متاح حسب الجدول";
}

function renderBranchFilters() {
  const allowedBranches = state.branchIds.length ? state.branchIds : ["talkha", "mashaya"];
  const branches = new Map(allowedBranches.map(id => [id, branchLabel(id)]));
  state.dashboard.bookings.forEach(item => branches.set(item.branchId || "talkha", item.branchNameAr || branchLabel(item.branchId)));
  [["#bookingBranchFilter", "كل الفروع"], ["#revenueBranch", "كل الفروع"], ["#dashboardBranchFilter", "كل الفروع"], ["#headerBranchFilter", "كل الفروع"]].forEach(([selector, allLabel]) => {
    const select = $(selector);
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="all">${allLabel}</option>` + [...branches].map(([id, name]) => `<option value="${escapeAttr(id)}">${escapeHtml(name)}</option>`).join("");
    select.value = branches.has(current) ? current : state.role === "cashier" && allowedBranches.length === 1 ? allowedBranches[0] : "all";
  });
  if ($("#headerBranchFilter") && $("#dashboardBranchFilter")) $("#headerBranchFilter").value = $("#dashboardBranchFilter").value;
  const staffFilter = $("#dashboardStaffFilter");
  if (staffFilter) {
    const current = staffFilter.value;
    const workers = new Map();
    state.dashboard.bookings.forEach(item => {
      if (item.staffId && item.staffId !== "none") workers.set(item.staffId, item.staffNameAr || item.staffId);
      (item.items || []).forEach(line => { if (line.workerId && line.workerId !== "none") workers.set(line.workerId, line.workerNameAr || line.workerId); });
    });
    staffFilter.innerHTML = '<option value="all">كل العاملين</option>' + [...workers].map(([id, name]) => `<option value="${escapeAttr(id)}">${escapeHtml(name)}</option>`).join("");
    staffFilter.value = workers.has(current) ? current : "all";
  }
}

function renderBookings() {
  const query = $("#bookingSearch").value.trim().toLowerCase();
  let canonicalQuery = ""; try { canonicalQuery = normalizePhone(query); } catch {}
  const filter = $("#bookingStatusFilter").value;
  const branchFilter = $("#bookingBranchFilter").value;
  const paymentFilter = $("#bookingPaymentFilter")?.value || "all";
  const activeStatuses = new Set(["pending", "confirmed", "arrived"]);
  const dateFilter = $("#bookingDateFilter")?.value || "";
  const sourceBookings = state.dashboard.bookings.filter(item => item.source !== "pos" && (branchFilter === "all" || item.branchId === branchFilter) && (!dateFilter || (item.bookingDate || item.dateKey) === dateFilter));
  const counts = { all: sourceBookings.length, confirmed: 0, completed: 0, cancelled: 0, no_show: 0, arrived: 0 };
  sourceBookings.forEach(item => { if (item.status in counts) counts[item.status] += 1; });
  const summary = $("#bookingListSummary");
  if (summary) summary.innerHTML = [["عدد الحجوزات", counts.all], ["مؤكدة", counts.confirmed], ["اكتملت", counts.completed], ["ملغاة", counts.cancelled], ["لم تحضر", counts.no_show], ["في الفرع الآن", counts.arrived], ["في الخدمة الآن", "—"]].map(([label, number], index) => `<article class="metric-card ${index === 0 ? "primary-metric" : ""}"><span>${label}</span><strong>${number}</strong></article>`).join("");
  const bookings = sourceBookings.filter(item => (filter === "all" || (filter === "active" ? activeStatuses.has(item.status) : item.status === filter)) && (paymentFilter === "all" || item.paymentStatus === paymentFilter) && (!query || [item.id, item.code, item.customerName, item.phone, item.branchNameAr].some(value => String(value || "").toLowerCase().includes(query)) || (canonicalQuery && whatsappPhone(item.phone) === `2${canonicalQuery}`)));
  $("#bookingsTable").innerHTML = bookings.map(item => {
    const branchName = item.branchNameAr || branchLabel(item.branchId);
    const terminal = ["completed", "no_show", "rejected", "cancelled"].includes(item.status);
    const canCheckout = state.permissions.has("pos") || state.permissions.has("revenue");
    const canRefund = canRefundBooking(item);
    const presentWorkers = state.attendance.dateKey === cairoDateKey() && (state.attendance.branchId === item.branchId || state.attendance.branchId === "all") ? (state.attendance.rows || []).filter(worker => worker.status === "PRESENT" && (worker.branchIds || []).includes(item.branchId)) : [];
    const workerOptions = presentWorkers.map(worker => `<option value="${escapeAttr(worker.staffId)}" ${worker.staffId === item.staffId ? "selected" : ""}>${escapeHtml(worker.nameAr)} · ${escapeHtml(staffOperationalLabel({ ...worker, id: worker.staffId }, item.branchId))}</option>`).join("");
    const workerControls = !terminal && ["pending", "confirmed"].includes(item.status) && (state.permissions.has("bookings") || state.role === "admin") ? `<div class="booking-worker-controls"><select data-assign-worker-select="${escapeAttr(item.id)}"><option value="">${state.role === "cashier" ? "اختر عاملًا · التواجد غير مؤكد" : "اختر الموجود بالمحل"}</option>${workerOptions}</select><button type="button" data-assign-booking="${escapeAttr(item.id)}">تحويل</button></div>` : "";
    const workerAlert = !terminal && item.staffId && item.staffId !== "none" && (state.permissions.has("tasks") || state.permissions.has("bookings") || state.role === "admin") ? `<button type="button" data-notify-worker="${escapeAttr(item.staffId)}" data-notify-branch="${escapeAttr(item.branchId)}" data-notify-booking="${escapeAttr(item.id)}">تنبيه ${escapeHtml(item.staffNameAr || "العامل")}</button>` : "";
    const checkout = !terminal && canCheckout ? `<button class="pay booking-checkout" data-booking-action="${item.paymentStatus === "paid" ? "completed" : "checkout"}" data-booking-id="${escapeAttr(item.id)}">${item.paymentStatus === "paid" ? "إكمال وإخفاء" : "تحصيل وإكمال"}</button>` : "";
    const stateActions = item.status === "pending" ? `<button data-booking-action="confirmed" data-booking-id="${escapeAttr(item.id)}">تأكيد</button><button data-booking-action="rejected" data-booking-id="${escapeAttr(item.id)}">رفض</button><button data-booking-action="cancelled" data-booking-id="${escapeAttr(item.id)}">إلغاء</button>` : item.status === "confirmed" ? `<button data-booking-action="arrived" data-booking-id="${escapeAttr(item.id)}">وصل</button><button data-booking-action="no_show" data-booking-id="${escapeAttr(item.id)}">عدم حضور</button><button data-booking-action="cancelled" data-booking-id="${escapeAttr(item.id)}">إلغاء</button>` : item.status === "arrived" ? `<button data-booking-action="no_show" data-booking-id="${escapeAttr(item.id)}">عدم حضور</button>` : "";
    return `<tr data-booking-row="${escapeAttr(item.code)}"><td><b>${escapeHtml(item.code)}</b><br><small>${escapeHtml(item.createdAt || "")}</small></td><td><span class="branch-pill">${escapeHtml(branchName)}</span></td><td>${escapeHtml(item.customerName)}<br><small>${escapeHtml(item.phone)}</small><br><small>${item.partySize || 1} فرد</small></td><td>${escapeHtml((item.serviceNamesAr || []).join(" + "))}<br><strong>${money(item.total)}</strong></td><td>${escapeHtml(item.staffNameAr)}${workerControls}${workerAlert}</td><td>${escapeHtml(item.bookingDate || "طلب منتجات")}<br>${escapeHtml(item.bookingTime || "")}</td><td><span class="status-pill">${statusLabel(item.status)}</span></td><td><div class="payment-controls"><b>${paymentLabel(item.paymentStatus)}</b>${!terminal ? `<select data-payment-method="${escapeAttr(item.id)}"><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="vodafone_cash">فودافون كاش</option><option value="instapay">إنستاباي</option><option value="other">أخرى</option></select>` : ""}<div class="row-actions">${checkout}${canRefund ? `<button class="refund" data-booking-action="refund" data-booking-id="${escapeAttr(item.id)}">استرداد</button>` : ""}</div></div></td><td><div class="row-actions">${!terminal && canCheckout ? `<button data-booking-pos="${escapeAttr(item.id)}">فتح في نقطة البيع</button>` : ""}${receiptActionButtons(item.id)}${["pending", "confirmed"].includes(item.status) ? `<button data-reschedule-booking="${escapeAttr(item.id)}">إعادة جدولة</button>` : ""}${stateActions}${state.role === "admin" && item.paymentStatus !== "paid" && item.source !== "pos" ? `<button class="delete" data-secure-delete-booking="${escapeAttr(item.id)}" data-secure-delete-label="الحجز ${escapeAttr(item.code)} للعميل ${escapeAttr(item.customerName)}">حذف نهائي</button>` : ""}</div></td></tr>`;
  }).join("") || emptyRow(9);
}

function renderPosReceipts() {
  const target = $("#posReceipts");
  if (!target) return;
  const query = $("#posReceiptSearch")?.value.trim().toLowerCase() || "";
  const receipts = state.dashboard.bookings.filter(item => item.source === "pos" && (!query || [item.code, item.customerName, item.phone, ...(item.serviceNamesAr || [])].some(value => String(value || "").toLowerCase().includes(query)))).slice(0, 30);
  target.innerHTML = receipts.map(item => `<tr><td><b>${escapeHtml(item.receiptNumber || item.code || item.id)}</b><br><small>${escapeHtml(item.createdAt || "")}</small></td><td>${escapeHtml(item.customerName || "عميل نقدي")}<br><small>${escapeHtml(item.phone || "")}</small></td><td>${escapeHtml((item.serviceNamesAr || []).join(" + "))}</td><td>${escapeHtml(item.staffNameAr || "—")}</td><td><b>${money(item.total)}</b></td><td>${paymentLabel(item.paymentStatus)}</td><td><div class="row-actions">${receiptActionButtons(item.id, "طباعة الإيصال")}${item.paymentStatus === "unpaid" && (state.permissions.has("revenue") || state.role === "admin") ? `<button class="delete" data-booking-action="void" data-booking-id="${escapeAttr(item.id)}">إلغاء الشيك</button>` : ""}</div></td></tr>`).join("") || emptyRow(7);
}

let cashierTransactionsPage = 1;
function renderCashierTransactions() {
  const target = $("#cashierTransactionsTable");
  if (!target) return;
  const query = $("#cashierTransactionSearch")?.value.trim().toLowerCase() || "";
  const type = $("#cashierTransactionType")?.value || "all";
  const method = $("#cashierTransactionPayment")?.value || "all";
  const staff = $("#cashierTransactionStaff")?.value || "all";
  const select = $("#cashierTransactionStaff");
  const workers = new Map((state.dashboard.bookings || []).filter(item => item.staffId).map(item => [item.staffId, item.staffNameAr || item.staffId]));
  if (select) { select.innerHTML = '<option value="all">كل العاملين</option>' + [...workers].map(([id, name]) => `<option value="${escapeAttr(id)}">${escapeHtml(name)}</option>`).join(""); select.value = workers.has(staff) ? staff : "all"; }
  const rows = (state.dashboard.bookings || []).filter(item =>
    (type === "all" || (type === "pos" ? item.source === "pos" : item.source !== "pos")) &&
    (method === "all" || item.paymentMethod === method) &&
    (staff === "all" || item.staffId === staff) &&
    (!query || [item.code, item.receiptNumber, item.customerName, item.phone].some(value => String(value || "").toLowerCase().includes(query))));
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  cashierTransactionsPage = Math.min(Math.max(1, cashierTransactionsPage), pages);
  target.innerHTML = rows.slice((cashierTransactionsPage - 1) * pageSize, cashierTransactionsPage * pageSize).map((item, index) => `<tr><td>${(cashierTransactionsPage - 1) * pageSize + index + 1}</td><td><b>${escapeHtml(item.receiptNumber || item.code || item.id)}</b></td><td>${escapeHtml(dateTime(item.createdAt || item.bookingDate))}</td><td>${escapeHtml(item.customerName || "عميل")}<small>${escapeHtml(item.staffNameAr || "")}</small></td><td><span class="status-pill">${item.source === "pos" ? "شيك" : "حجز"}</span></td><td>${escapeHtml(item.paymentMethod ? paymentMethod(item.paymentMethod) : paymentLabel(item.paymentStatus))}</td><td><b>${money(item.total)}</b></td><td><button class="transaction-view-button" type="button" data-open-receipt="${escapeAttr(item.id)}" aria-label="عرض العملية">◉</button></td></tr>`).join("") || emptyRow(8);
  $("#cashierTransactionsCount").textContent = rows.length ? `عرض ${(cashierTransactionsPage - 1) * pageSize + 1} إلى ${Math.min(rows.length, cashierTransactionsPage * pageSize)} من ${rows.length} نتيجة` : "0 نتيجة";
  $("#cashierTransactionsPage").textContent = `${cashierTransactionsPage} / ${pages}`;
  $("#cashierTransactionsPrev").disabled = cashierTransactionsPage <= 1;
  $("#cashierTransactionsNext").disabled = cashierTransactionsPage >= pages;
}

function setPosView(view = "new") {
  const pos = $("#pos");
  if (!pos) return;
  pos.dataset.posView = view === "receipts" ? "receipts" : "new";
  if (state.role === "cashier") $("#cashierPageTitle").textContent = pos.dataset.posView === "new" ? "فاتورة جديدة" : "المعاملات";
  pos.classList.remove("mobile-ticket-open");
  $$('#pos [data-pos-view], #pos [data-new-pos]').forEach(button => button.classList.toggle("active", (button.hasAttribute("data-new-pos") ? "new" : button.dataset.posView) === pos.dataset.posView));
  if (pos.dataset.posView === "receipts") renderPosReceipts();
}

function hasPosDraft() {
  return Boolean(state.posCart.length || $("#posPhone")?.value.trim() || $("#posFirstName")?.value.trim() || Number($("#posDiscount")?.value || 0));
}

function resetPosDraft({ focus = true } = {}) {
  const form = $("#posForm");
  if (!form) return;
  const branchId = $("#posBranch")?.value || state.branchIds[0] || "talkha";
  form.reset();
  if ($(`#posBranch option[value="${CSS.escape(branchId)}"]`)) $("#posBranch").value = branchId;
  $("#posCustomer").value = "";
  $("#posPhone").value = "";
  $("#posFirstName").value = "";
  $("#posLastName").value = "";
  $("#posStaff").value = "none";
  $("#posDiscount").value = "0";
  if ($("#posCouponCode")) $("#posCouponCode").value = "";
  $("#posPaymentMethod").value = "cash";
  $("#posPaid").checked = true;
  if ($("#posRedeemPoints")) $("#posRedeemPoints").value = "0";
  if ($("#posRedeemCashback")) $("#posRedeemCashback").value = "0";
  if ($("#posItemSearch")) $("#posItemSearch").value = "";
  if ($("#posSectionFilter")) $("#posSectionFilter").value = "service";
  if ($("#posCategoryFilter")) $("#posCategoryFilter").value = "";
  const details = $(".pos-extra-details");
  if (details) details.open = false;
  state.posCart = [];
  state.posIdempotencyKey = "";
  state.posBookingId = "";
  $("#posSubmit").textContent = "حفظ الطلب وتجهيز الشيك";
  setPosView("new");
  renderPos();
  if (focus) requestAnimationFrame(() => $("#posPhone")?.focus());
}

async function openNewPosDraft() {
  if (hasPosDraft() && !confirm("يوجد شيك غير محفوظ. هل تريد مسحه وفتح شيك جديد؟")) return;
  resetPosDraft({ focus: false });
  await showSection("pos");
  setPosView("new");
  requestAnimationFrame(() => $("#posPhone")?.focus());
}

async function openBookingInPos(id) {
  const booking = state.dashboard.bookings.find(item => item.id === id) || state.calendar.bookings.find(item => item.id === id);
  if (!booking) return toast("الحجز غير موجود", true);
  await showSection("pos");
  resetPosDraft({ focus: false });
  state.posBookingId = id;
  $("#posBranch").value = booking.branchId || "talkha";
  $("#posPhone").value = booking.phone || "";
  $("#posFirstName").value = booking.customer?.firstName || String(booking.customerName || "عميل").split(" ")[0];
  $("#posLastName").value = booking.customer?.lastName || String(booking.customerName || "").split(" ").slice(1).join(" ");
  $("#posStaff").value = booking.staffId || "none";
  state.posCart = (booking.items || []).map(item => ({ id: item.id, kind: item.kind, qty: Number(item.qty || 1), option: item.option || "", workerId: item.workerId || booking.staffId || "none", choices: Array.isArray(item.choices) ? Object.fromEntries(item.choices.map(choice => [choice.groupId, choice.optionId])) : item.choices || {} }));
  $("#posSubmit").textContent = "تحصيل الحجز وتجهيز الشيك";
  renderPos();
  toast(`تم فتح الحجز ${booking.code} بدون إنشاء حجز جديد`);
}

function rememberPosCustomer(customer) {
  if (!customer?.id) return;
  const customers = state.collections.get("customers") || [];
  state.collections.set("customers", [customer, ...customers.filter(item => item.id !== customer.id)]);
  renderPos();
  $("#posCustomer").value = customer.id;
  selectPosCustomer(customer.id);
}

function applyPosReceiptLocally(receipt) {
  if (!receipt?.id && !receipt?.code) return false;
  const id = receipt.id || receipt.code;
  receipt.id = id;
  const alreadyPresent = state.dashboard.bookings.some(item => item.id === id || item.code === receipt.code);
  state.dashboard.bookings = [receipt, ...state.dashboard.bookings.filter(item => item.id !== id && item.code !== receipt.code)];
  state.lastBookingCount = state.dashboard.bookings.length;
  state.loadedAt.cashier = Date.now();
  if (!alreadyPresent) {
    const stats = state.dashboard.stats || (state.dashboard.stats = {});
    stats.bookingCount = Number(stats.bookingCount || 0) + 1;
    stats.todayBookings = Number(stats.todayBookings || 0) + 1;
    if (receipt.paymentStatus === "paid") {
      stats.paidCount = Number(stats.paidCount || 0) + 1;
      stats.todayRevenue = Number(stats.todayRevenue || 0) + Number(receipt.total || 0);
      stats.monthRevenue = Number(stats.monthRevenue || 0) + Number(receipt.total || 0);
      stats.totalRevenue = Number(stats.totalRevenue || 0) + Number(receipt.total || 0);
      stats.monthNetProfit = Number(stats.monthNetProfit || 0) + Number(receipt.total || 0);
      stats.lastCollected = Number(receipt.total || 0);
    } else stats.unpaidCount = Number(stats.unpaidCount || 0) + 1;
    const sold = new Map((receipt.items || []).filter(item => item.kind === "inventory").map(item => [item.id, Number(item.qty || 1)]));
    for (const source of [state.collections.get("inventoryItems"), state.business.inventory]) {
      if (!Array.isArray(source)) continue;
      source.forEach(item => { if (sold.has(item.id)) item.stockQty = Math.max(0, Number(item.stockQty || 0) - sold.get(item.id)); });
    }
  }
  renderDashboard();
  return true;
}

function whatsappPhone(value) {
  try { return `2${normalizePhone(value)}`; } catch { return ""; }
}

async function createReceiptCanvas(item) {
  const lines = Array.isArray(item.items) ? item.items : [];
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 995 + lines.length * 94;
  const context = canvas.getContext("2d");
  context.direction = "rtl";
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#071a2c";
  context.fillRect(0, 0, canvas.width, 165);
  const logo = new Image();
  logo.src = "/assets/el-mezaen-logo.jpeg";
  await new Promise(resolve => { logo.onload = resolve; logo.onerror = resolve; });
  if (logo.complete && logo.naturalWidth) context.drawImage(logo, 65, 28, 108, 108);
  const branch = item.branchNameAr || branchLabel(item.branchId);
  context.textAlign = "right";
  context.fillStyle = "#fff";
  context.font = "700 42px Tajawal, Arial";
  context.fillText("مزين مصر", 835, 70);
  context.font = "500 24px Tajawal, Arial";
  context.fillText(`${branch} — ${item.source === "pos" ? "شيك بيع" : "شيك حجز"}`, 835, 116);
  let y = 220;
  const meta = [
    `رقم الشيك: ${item.code || item.id}`,
    `الكاشير: ${item.cashierName || item.finalizedBy || item.createdBy || "—"}`,
    `العميل: ${item.customerName || "عميل نقدي"}`,
    `الهاتف: ${item.phone || "—"}`,
    `التاريخ: ${item.bookingDate || String(item.createdAt || "").slice(0, 10) || cairoDateKey()} ${item.bookingTime || ""}`,
    `العامل: ${item.staffNameAr || "حسب كل خدمة"}`
  ];
  context.fillStyle = "#172b38";
  context.font = "600 24px Tajawal, Arial";
  for (const text of meta) { context.fillText(text, 835, y); y += 40; }
  context.strokeStyle = "#d7e3e8";
  context.beginPath(); context.moveTo(65, y); context.lineTo(835, y); context.stroke(); y += 45;
  context.font = "700 23px Tajawal, Arial";
  context.fillText("الخدمة / العامل", 835, y);
  context.textAlign = "left";
  context.fillText("السعر", 65, y);
  y += 28;
  for (const line of lines) {
    y += 43;
    context.textAlign = "right";
    context.fillStyle = "#172b38";
    context.font = "600 22px Tajawal, Arial";
    const worker = line.workerNameAr || item.staffNameAr || "";
    const label = `${line.nameAr || "بند"} × ${line.qty || 1}`;
    context.fillText(label.length > 48 ? `${label.slice(0, 45)}…` : label, 835, y);
    context.textAlign = "left";
    context.fillText(money(line.lineTotal ?? line.price), 65, y);
    y += 31;
    context.textAlign = "right";
    context.fillStyle = "#607681";
    context.font = "500 18px Tajawal, Arial";
    context.fillText([line.option ? `التحضير: ${line.option}` : "", worker ? `العامل: ${worker}` : ""].filter(Boolean).join(" • ") || " ", 835, y);
    context.strokeStyle = "#edf2f4";
    context.beginPath(); context.moveTo(65, y + 19); context.lineTo(835, y + 19); context.stroke();
  }
  y += 65;
  context.textAlign = "right";
  context.fillStyle = "#526b78";
  context.font = "500 22px Tajawal, Arial";
  context.fillText(`المجموع الفرعي: ${money(item.subtotal)}`, 835, y);
  y += 39;
  context.fillText(`الخصم: ${money(item.discountAmount)}`, 835, y);
  if (Number(item.walletRedemptionAmount || 0) > 0) {
    y += 39;
    context.fillText(`نقاط / كاش باك مستخدم: ${money(item.walletRedemptionAmount)}`, 835, y);
  }
  y += 54;
  context.fillStyle = "#007f99";
  context.font = "700 37px Tajawal, Arial";
  context.fillText(`الإجمالي: ${money(item.total)}`, 835, y);
  y += 45;
  context.fillStyle = "#172b38";
  context.font = "600 22px Tajawal, Arial";
  context.fillText(`حالة الدفع: ${paymentLabel(item.paymentStatus)} • ${paymentMethod(item.paymentMethod)}`, 835, y);
  const barcode = document.createElement("canvas");
  barcode.width = 640;
  barcode.height = 125;
  try {
    const { default: JsBarcode } = await import("jsbarcode");
    JsBarcode(barcode, String(item.code || item.id), { format: "CODE128", displayValue: true, height: 64, fontSize: 18, margin: 6, background: "#ffffff", lineColor: "#071a2c" });
    context.drawImage(barcode, 130, y + 28, 640, 125);
  } catch {}
  context.textAlign = "center";
  context.fillStyle = "#6a7f89";
  context.font = "500 18px Tajawal, Arial";
  context.fillText(globalThis.__SITE_URL__ || "https://el-mezaen-talkha.vercel.app", 450, canvas.height - 38);
  return canvas;
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("تعذر إنشاء صورة الشيك")), "image/png"));
}

async function openReceiptInWhatsapp(id) {
  const item = state.dashboard.bookings.find(value => value.id === id);
  if (!item) return toast("تعذر العثور على الشيك", true);
  const phone = whatsappPhone(item.phone);
  if (!phone) return toast("رقم واتساب العميل غير صحيح", true);
  const message = `أهلًا ${item.customerName || "عميلنا"}، صورة شيك مزين مصر رقم ${item.code || item.id}.`;
  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const nativeFileShare = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && typeof navigator.share === "function";
  const whatsappWindow = nativeFileShare ? null : window.open("about:blank", "_blank");
  if (whatsappWindow) {
    whatsappWindow.document.write('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>فتح واتساب</title><body style="font-family:Arial;text-align:center;padding:40px">جارٍ تجهيز صورة الشيك وفتح واتساب…</body></html>');
    whatsappWindow.document.close();
    whatsappWindow.blur();
    window.focus();
  }
  try {
    const canvas = await createReceiptCanvas(item);
    const blob = await canvasBlob(canvas);
    const file = new File([blob], `el-mezaen-receipt-${item.code || item.id}.png`, { type: "image/png" });
    if (nativeFileShare && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `شيك مزين مصر ${item.code || ""}`, text: message }); return; }
      catch (error) { if (error?.name === "AbortError") return; }
    }
    let copied = false;
    if (globalThis.ClipboardItem && navigator.clipboard?.write) try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); copied = true; } catch {}
    if (!copied) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }
    if (whatsappWindow) whatsappWindow.location.replace(whatsappUrl);
    else window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    toast(copied ? "تم نسخ نفس صورة الشيك وفتح رقم العميل؛ اضغط Ctrl+V داخل واتساب ثم إرسال" : "تم تنزيل نفس صورة الشيك وفتح رقم العميل؛ أرفق الصورة ثم أرسل");
  } catch (error) {
    whatsappWindow?.close();
    toast(error.message || "تعذر تجهيز صورة الشيك لواتساب", true);
  }
}

async function printReceipt(id) {
  const item = state.dashboard.bookings.find(value => value.id === id);
  if (!item) return toast("تعذر العثور على الشيك", true);
  const popup = window.open("", "_blank", "width=460,height=760");
  if (!popup) return toast("اسمح بالنوافذ المنبثقة لطباعة الشيك", true);
  popup.document.write('<!doctype html><html lang="ar" dir="rtl"><head><title>تجهيز الشيك</title></head><body style="font-family:Arial;text-align:center;padding:30px">جارٍ تجهيز صورة الشيك…</body></html>');
  popup.document.close();
  try {
    const canvas = await createReceiptCanvas(item);
    const imageUrl = canvas.toDataURL("image/png");
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(item.code || item.id)}</title><style>@page{margin:4mm}*{box-sizing:border-box}body{margin:0;background:#eef2f4;font-family:Arial;text-align:center}main{width:min(100%,420px);margin:auto;padding:12px;background:#fff}img{display:block;width:100%;height:auto}button{margin:12px;padding:10px 26px;border:0;border-radius:8px;background:#007f99;color:#fff;font-weight:700}@media print{body,main{width:100%;background:#fff;padding:0}button{display:none}}</style></head><body><main><img src="${imageUrl}" alt="شيك مزين مصر"><button type="button" onclick="print()">طباعة</button></main></body></html>`);
    popup.document.close();
  } catch (error) {
    popup.close();
    toast(error.message || "تعذر تجهيز صورة الشيك", true);
  }
}

let scanStream;let scanControls;let scanLocked=false;let scanLastValue="";let scanLastAt=0;let scanGeneration=0;
async function acceptScannedValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized || scanLocked || (normalized === scanLastValue && Date.now() - scanLastAt < 3000)) return;
  scanLastValue = normalized; scanLastAt = Date.now(); scanLocked = true;
  $("#scannerCode").value = normalized;
  await findScanned();
}
async function openScanner() {
  if (!$("#scannerDialog").open) $("#scannerDialog").showModal();
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("UNSUPPORTED_CAMERA"), { name: "NotSupportedError" });
    closeScanner(false);
    const generation = scanGeneration;
    scanLocked=false;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: $("#scannerCamera").value || "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (generation !== scanGeneration) { stream.getTracks().forEach(track => track.stop()); return; }
    scanStream = stream;
    const video = $("#scannerVideo"); video.srcObject = scanStream; await video.play();
    if ("BarcodeDetector" in window) {
      const detector = new BarcodeDetector({ formats: ["code_128", "qr_code"] });
      const tick = async () => { if (!scanStream || scanLocked) return; const codes = await detector.detect(video).catch(() => []); await acceptScannedValue(codes[0]?.rawValue); if (scanStream && !scanLocked) requestAnimationFrame(tick); }; tick();
    } else {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (generation !== scanGeneration) return;
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromStream(scanStream, video, (result) => { if (result && generation === scanGeneration) acceptScannedValue(result.getText()); });
      if (generation !== scanGeneration) controls?.stop?.(); else scanControls = controls;
    }
  } catch (error) {
    scanControls?.stop?.(); scanControls = null; scanStream?.getTracks().forEach(track => track.stop()); scanStream = null;
    const message = error?.name === "NotAllowedError" ? "تم رفض إذن الكاميرا؛ فعّله من إعدادات الموقع أو استخدم الإدخال اليدوي" : error?.name === "NotFoundError" ? "لا توجد كاميرا متاحة على هذا الجهاز؛ استخدم الإدخال اليدوي" : error?.name === "NotReadableError" ? "الكاميرا مستخدمة في تطبيق آخر؛ أغلق التطبيق ثم حاول مجددًا" : "هذا المتصفح لا يسمح بالكاميرا هنا؛ افتح الموقع في Chrome أو Safari واستخدم الإدخال اليدوي";
    toast(message, true);
  }
}
function closeScanner(closeDialog = true) { ++scanGeneration; scanControls?.stop?.(); scanControls = null; scanStream?.getTracks().forEach(track => track.stop()); scanStream = null;scanLocked=false; const video=$("#scannerVideo");if(video)video.srcObject=null; if(closeDialog && $("#scannerDialog").open)$("#scannerDialog").close(); }
async function findScanned() { const raw=$("#scannerCode").value.trim();if(!raw){scanLocked=false;return}if(raw.toLowerCase().startsWith("mzc_")){try{const result=await scanCustomerCode(raw);closeScanner();await showSection("pos");rememberPosCustomer(result.customer);toast(`تم فتح العميل ${result.customer.firstName||""}`)}catch(error){scanLocked=false;toast(error.message||"كود العميل غير صحيح",true)}return}const code=raw.toUpperCase();const found=state.dashboard.bookings.find(item=>String(item.code).toUpperCase()===code);if(!found){scanLocked=false;return toast("لم يتم العثور على الحجز أو المنتج",true)}closeScanner();$("#bookingSearch").value=found.code;renderBookings();document.querySelector(`[data-booking-row="${CSS.escape(found.code)}"]`)?.scrollIntoView({behavior:"smooth",block:"center"});toast("تم فتح الحجز");}

function renderRevenue() {
  const serviceSelect = $("#revenueService");
  const selectedService = serviceSelect.value || "all";
  const services = (state.collections.get("services") || []).filter(item => item.active !== false);
  serviceSelect.innerHTML = '<option value="all">كل الخدمات</option>' + services.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nameAr || item.id)}</option>`).join("");
  serviceSelect.value = services.some(item => item.id === selectedService) ? selectedService : "all";

  const staffSelect = $("#revenueStaff");
  const selectedStaff = staffSelect.value || "all";
  const staffMembers = (state.collections.get("staff") || []).filter(item => item.active !== false);
  const bookingStaff = new Map(state.dashboard.bookings.filter(item => item.staffId).map(item => [item.staffId, item.staffNameAr || item.staffId]));
  staffMembers.forEach(item => bookingStaff.set(item.id, item.nameAr || item.id));
  staffSelect.innerHTML = '<option value="all">كل العاملين</option>' + [...bookingStaff].map(([id, name]) => `<option value="${escapeAttr(id)}">${escapeHtml(name)}</option>`).join("");
  staffSelect.value = bookingStaff.has(selectedStaff) ? selectedStaff : "all";

  const from = $("#revenueFrom").value;
  const to = $("#revenueTo").value;
  const branch = $("#revenueBranch").value;
  const staff = staffSelect.value;
  const service = serviceSelect.value;
  const rows = state.dashboard.ledger.filter(item => (!from || item.dateKey >= from) && (!to || item.dateKey <= to) && (branch === "all" || (item.branchId || "talkha") === branch) && (staff === "all" || item.staffId === staff) && (service === "all" || (item.itemIds || []).includes(service)));
  $("#revenueTable").innerHTML = rows.map(item => {
    const breakdown = item.revenueBreakdown || {};
    const details = [`خدمات: ${money(breakdown.services)}`, `بضاعة: ${money(breakdown.products)}`, `مشروبات: ${money(breakdown.drinks)}`].join("<br>");
    return `<tr><td>${escapeHtml(item.dateKey || item.createdAt)}</td><td><span class="branch-pill">${escapeHtml(branchLabel(item.branchId))}</span></td><td>${escapeHtml(item.bookingCode)}</td><td>${item.type === "refund" ? "استرداد" : "دفع"}</td><td>${paymentMethod(item.paymentMethod)}</td><td>${escapeHtml(bookingStaff.get(item.staffId) || item.staffId || "—")}</td><td><small>${details}</small></td><td style="color:${Number(item.amount) < 0 ? "var(--danger)" : "var(--success)"}"><b>${money(item.amount)}</b></td><td>سجل مالي محفوظ</td></tr>`;
  }).join("") || emptyRow(9);
}

function expenseLabel(value) { if (value === "inventory") return "مشتريات / شراء مخزون"; return ({ electricity: "كهرباء", water: "مياه", rent: "إيجار", salary: "رواتب", maintenance: "صيانة", tools: "أدوات ومستلزمات", marketing: "تسويق", other: "بند آخر" })[value] || value || "—"; }
function inventoryCategory(value) { return ({ product: "بضاعة", supply: "مستلزم" })[value] || value || "صنف"; }
function drinkType(value) { return ({ hot: "ساخن", cold: "بارد", "soft-drink": "مشروب غازي", other: "أخرى" })[value] || "أخرى"; }

function renderExpenses() {
  if (!$("#expensesTable")) return;
  const from = $("#expenseFrom")?.value || "";
  const to = $("#expenseTo")?.value || "";
  const branch = $("#expenseBranchFilter")?.value || "all";
  const category = $("#expenseCategoryFilter")?.value || "all";
  const items = (state.business.expenses || []).filter(item => (!from || item.dateKey >= from) && (!to || item.dateKey <= to) && (branch === "all" || item.branchId === branch) && (category === "all" || item.category === category));
  $("#expensesTable").innerHTML = items.map(item => {
    const label = item.description || expenseLabel(item.category);
    const editButton = item.payrollPaymentId ? "" : `<button type="button" data-edit-expense="${escapeAttr(item.id)}">تعديل</button>`;
    const deleteButton = state.role === "admin" ? `<button type="button" class="delete" data-secure-delete-expense="${escapeAttr(item.id)}" data-secure-delete-label="الحركة المالية ${escapeAttr(label)}">حذف</button>` : "";
    return `<tr><td data-label="التاريخ">${escapeHtml(item.dateKey)}</td><td data-label="الحركة"><span class="status-pill">${item.kind === "purchase" || item.category === "inventory" ? "مشتريات" : "مصروف"}</span></td><td data-label="التصنيف">${escapeHtml(expenseLabel(item.category))}</td><td data-label="الفرع">${escapeHtml(branchLabel(item.branchId))}</td><td data-label="البيان">${escapeHtml(label)}${item.notes ? `<br><small>${escapeHtml(item.notes)}</small>` : ""}</td><td data-label="الدفع">${escapeHtml(paymentMethod(item.paymentMethod))}</td><td data-label="المسجل">${escapeHtml(item.createdByName || item.createdByEmail || item.createdBy || "—")}</td><td data-label="القيمة"><b>${money(item.amount)}</b></td><td data-label="إجراء"><div class="row-actions">${editButton}${deleteButton || "—"}</div></td></tr>`;
  }).join("") || emptyRow(9);
}

function refreshExpenseInventoryOptions() {
  if (!$("#expenseInventoryItem")) return;
  const current = $("#expenseInventoryItem").value;
  const branchId = $("#expenseBranch")?.value || "talkha";
  const inventory = state.business.inventory || state.collections.get("inventoryItems") || [];
  const filtered = inventory.filter(item => item.branchId === branchId);
  $("#expenseInventoryItem").innerHTML = '<option value="">شراء عام بدون إضافة رصيد</option>' + filtered.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nameAr)} • ${escapeHtml(inventoryCategory(item.category))}</option>`).join("");
  $("#expenseInventoryItem").value = filtered.some(item => item.id === current) ? current : "";
}

function renderBusiness() {
  const s = state.business.stats || {};
  if ($("#businessGross")) $("#businessGross").textContent = money(s.grossRevenue);
  if ($("#businessExpenses")) $("#businessExpenses").textContent = money(s.totalExpenses);
  if ($("#businessNet")) $("#businessNet").textContent = money(s.netProfit);
  if ($("#businessStockValue")) $("#businessStockValue").textContent = money(s.inventoryValue);
  if ($("#productPurchaseCost")) $("#productPurchaseCost").textContent = money(s.productPurchaseCost);
  if ($("#productStockValue")) $("#productStockValue").textContent = money(s.productStockValue);
  if ($("#productLowStock")) $("#productLowStock").textContent = Number(s.productLowStock || 0);
  if ($("#drinkRevenue")) $("#drinkRevenue").textContent = money(s.drinkRevenue);
  if ($("#drinkCount")) $("#drinkCount").textContent = Number(s.drinkCount || 0);
  renderExpenses();
  refreshExpenseInventoryOptions();
  renderPayroll();
  renderServiceTargets();
  if (state.section === "pos") renderPos();
  if (state.section === "inventory") renderCollection("inventoryItems");
  if (state.section === "drinks") renderCollection("drinks");
}

function renderPayroll() {
  if (!$("#payrollGrid")) return;
  $("#payrollGrid").innerHTML = (state.business.payroll || []).filter(item => item.active !== false).map(item => {
    const paid = item.payment?.status === "paid";
    const progress = Number(item.progressPercent || 0);
    return `<article class="payroll-card"><header><div class="customer-avatar">${escapeHtml(String(item.nameAr || "ع").charAt(0))}</div><div><h3>${escapeHtml(item.nameAr || item.id)}</h3><span>${escapeHtml(branchScopeLabel(item.branchIds))}</span></div><b class="${item.targetAchieved ? "target-hit" : ""}">${item.targetAchieved ? "تم تحقيق التارجت" : `${progress}% من التارجت`}</b></header><div class="target-progress"><i style="width:${progress}%"></i></div><dl><div><dt>إيراد الشهر</dt><dd>${money(item.revenue)}</dd></div><div><dt>التارجت</dt><dd>${money(item.monthlyTarget)}</dd></div><div><dt>الأساسي</dt><dd>${money(item.baseSalary)}</dd></div><div><dt>زيادة ${Number(item.targetBonusPercent || 0)}%</dt><dd>${money(item.bonus)}</dd></div></dl><div class="payroll-total"><span>الراتب المتوقع</span><strong>${money(item.netSalary)}</strong></div>${paid ? `<p class="salary-paid">تم الصرف: ${money(item.payment.netSalary)} • ${escapeHtml(dateTime(item.payment.paidAt))}</p>` : state.role === "admin" ? `<div class="payroll-actions"><label>تسوية + أو -<input type="number" step="any" value="0" data-payroll-adjustment="${escapeAttr(item.id)}"></label><select data-payroll-method="${escapeAttr(item.id)}"><option value="cash">نقدي</option><option value="vodafone_cash">فودافون كاش</option><option value="instapay">إنستاباي</option></select><button class="small-button primary" data-pay-salary="${escapeAttr(item.id)}">تسجيل صرف الراتب</button></div>` : ""}</article>`;
  }).join("") || '<div class="entity-card"><p>أضف بيانات الراتب والتارجت من قسم فريق العمل.</p></div>';
}

function serviceTargetCatalogItems() {
  const kind = $("#serviceTargetKind")?.value || "service";
  const branchId = $("#serviceTargetBranch")?.value || "talkha";
  const collection = kind === "package" ? "packages" : kind === "offer" ? "offers" : "services";
  return (state.collections.get(collection) || []).filter(item => item.active !== false && (kind !== "service" || item.type !== "product") && availableAtBranch(item, branchId)).sort((a, b) => String(a.nameAr || "").localeCompare(String(b.nameAr || ""), "ar"));
}

function refreshServiceTargetItems(selected = "") {
  const target = $("#serviceTargetItem");
  if (!target) return;
  const items = serviceTargetCatalogItems();
  target.innerHTML = items.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nameAr || item.id)}</option>`).join("") || '<option value="">لا توجد عناصر متاحة لهذا الفرع</option>';
  if (items.some(item => item.id === selected)) target.value = selected;
}

function renderServiceTargets() {
  const grid = $("#serviceTargetGrid");
  if (!grid) return;
  const form = $("#serviceTargetForm");
  const adminOnly = state.role === "admin";
  form.hidden = !adminOnly;
  $("#serviceTargetAdminNote").hidden = adminOnly;
  const allTargets = state.business.serviceTargets || [];
  const itemFilter = $("#serviceTargetItemFilter");
  const selectedItem = itemFilter?.value || "all";
  if (itemFilter) {
    const items = [...new Map(allTargets.map(item => [item.itemId, item.nameAr || item.itemId])).entries()].sort((a, b) => a[1].localeCompare(b[1], "ar"));
    itemFilter.innerHTML = '<option value="all">كل الخدمات والباقات</option>' + items.map(([id, name]) => `<option value="${escapeAttr(id)}">${escapeHtml(name)}</option>`).join("");
    itemFilter.value = items.some(([id]) => id === selectedItem) ? selectedItem : "all";
  }
  const branchId = $("#serviceTargetBranchFilter")?.value || "all";
  const itemId = itemFilter?.value || "all";
  const targets = allTargets.filter(item => (branchId === "all" || item.branchId === branchId) && (itemId === "all" || item.itemId === itemId));
  grid.innerHTML = targets.map(item => {
    const progress = Math.max(0, Math.min(100, Number(item.progressPercent || 0)));
    return `<article class="service-target-card"><header><div><small>${escapeHtml(branchLabel(item.branchId))} • ${item.kind === "package" ? "باقة" : item.kind === "offer" ? "عرض" : "خدمة"}</small><h3>${escapeHtml(item.nameAr || item.itemId)}</h3></div><b>${progress}%</b></header><div class="target-progress" role="progressbar" aria-label="نسبة تحقيق ${escapeAttr(item.nameAr || item.itemId)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><i style="width:${progress}%"></i></div><dl><div><dt>المستهدف</dt><dd>${Number(item.targetCount || 0)}</dd></div><div><dt>المحقق</dt><dd>${Number(item.achievedCount || 0)}</dd></div><div><dt>المتبقي</dt><dd>${Number(item.remainingCount || 0)}</dd></div></dl>${adminOnly ? `<button type="button" class="small-button" data-edit-service-target="${escapeAttr(item.id)}">تعديل التارجت</button>` : ""}</article>`;
  }).join("") || '<div class="empty-state">لا يوجد تارجت خدمات مسجل لهذا الشهر والفرع.</div>';
  refreshServiceTargetItems();
}

async function submitServiceTarget(event) {
  event.preventDefault();
  if (state.role !== "admin") return toast("إضافة التارجت متاحة للأدمن فقط", true);
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(form));
  payload.month = $("#payrollMonth").value;
  payload.targetCount = Number(payload.targetCount);
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try { await upsertServiceTarget(payload); await loadBusiness(true); toast("تم حفظ تارجت الخدمة"); }
  catch (error) { toast(error.message || "تعذر حفظ التارجت", true); }
  finally { button.disabled = false; button.removeAttribute("aria-busy"); }
}

function posCatalogItems() {
  const branchId = $("#posBranch")?.value || "talkha";
  const categories = new Map((state.collections.get("categories") || []).map(item => [item.id, item.nameAr || item.id]));
  const services = (state.collections.get("services") || []).filter(item => item.active !== false && availableAtBranch(item, branchId)).map(item => ({ id: item.id, kind: item.type === "product" ? "product" : "service", section: item.type === "product" ? "product" : "service", categoryId: item.categoryId || "", nameAr: item.nameAr, price: Number(item.price || 0), category: item.type === "product" ? "بضاعة" : categories.get(item.categoryId) || "بدون تصنيف" }));
  const packages = (state.collections.get("packages") || []).filter(item => item.active !== false && item.status !== "expired" && availableAtBranch(item, branchId)).map(item => ({ id: item.id, kind: "package", section: "package", categoryId: "", nameAr: item.nameAr, price: Number(item.price || 0), choiceGroups: Array.isArray(item.choiceGroups) ? item.choiceGroups : [], category: "باقة" }));
  const offers = state.posOffers.filter(item => item.active !== false && availableAtBranch(item, branchId)).map(item => ({ id: item.id, kind: "offer", section: "package", categoryId: "", nameAr: item.nameAr, price: Number(item.newPrice || 0), choiceGroups: Array.isArray(item.choiceGroups) ? item.choiceGroups : [], category: "عرض" }));
  const inventory = (state.collections.get("inventoryItems") || state.business.inventory || []).filter(item => item.active !== false && item.category === "product" && item.branchId === branchId).map(item => ({ id: item.id, kind: "inventory", section: "product", categoryId: "", nameAr: item.nameAr, price: Number(item.sellingPrice || 0), stockQty: Number(item.stockQty || 0), category: inventoryCategory(item.category) }));
  const drinks = (state.collections.get("drinks") || state.business.drinks || []).filter(item => item.active !== false && [branchId, "all"].includes(item.branchId)).map(item => ({ id: item.id, kind: "drink", section: "drink", categoryId: "", nameAr: item.nameAr, price: Number(item.price || 0), drinkOptions: Array.isArray(item.drinkOptions) ? item.drinkOptions : [], category: `${drinkType(item.type)}${item.branchId === "all" ? " • كل الفروع" : ""}` }));
  return [...services, ...packages, ...offers, ...inventory, ...drinks];
}

function fillCategoryFilter(selector, currentValue = "") {
  const select = $(selector);
  if (!select) return;
  const categories = (state.collections.get("categories") || []).filter(item => item.active !== false).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const firstLabel = selector === "#posCategoryFilter" ? "اختر تصنيف الخدمات" : "اختر التصنيف لعرض خدماته";
  select.innerHTML = `<option value="">${firstLabel}</option><option value="all">كل التصنيفات</option>${categories.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nameAr || item.id)}</option>`).join("")}`;
  select.value = categories.some(item => item.id === currentValue) || currentValue === "all" ? currentValue : "";
}

function renderPos() {
  if (!$("#posItems")) return;
  const customers = state.collections.get("customers") || [];
  const customerValue = $("#posCustomer").value;
  $("#posCustomer").innerHTML = '<option value="">عميل جديد</option>' + customers.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(`${item.firstName || ""} ${item.lastName || ""}`.trim() || item.phone)} • ${escapeHtml(item.phone)} • ${Number(item.pointsBalance||0)} نقطة • ${money(item.cashbackBalance)}</option>`).join("");
  $("#posCustomer").value = customers.some(item => item.id === customerValue) ? customerValue : "";
  const branchId = $("#posBranch").value;
  const staffValue = $("#posStaff").value;
  const staff = (state.collections.get("staff") || []).filter(item => item.active !== false && item.available !== false && availableAtBranch(item, branchId));
  $("#posStaff").innerHTML = '<option value="none">بدون عامل</option>' + staff.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nameAr)} · ${escapeHtml(staffOperationalLabel(item, branchId))}</option>`).join("");
  $("#posStaff").value = staff.some(item => item.id === staffValue) ? staffValue : "none";
  const currentCategory = $("#posCategoryFilter")?.value || "";
  fillCategoryFilter("#posCategoryFilter", currentCategory);
  const section = $("#posSectionFilter")?.value || "service";
  const category = $("#posCategoryFilter")?.value || "";
  $("#posCategoryFilter").hidden = section !== "service";
  const rail = $("#posCategoryRail");
  if (rail) {
    const categories = (state.collections.get("categories") || []).filter(item => item.active !== false).sort((a,b)=>Number(a.sortOrder||0)-Number(b.sortOrder||0));
    rail.hidden = section !== "service";
    rail.innerHTML = section === "service" ? `<button class="${category === "all" ? "active" : ""}" data-pos-category="all">كل الخدمات</button>${categories.map(item=>`<button class="${category === item.id ? "active" : ""}" data-pos-category="${escapeAttr(item.id)}">${escapeHtml(item.nameAr||item.id)}</button>`).join("")}` : "";
  }
  const query = $("#posItemSearch").value.trim().toLowerCase();
  if (section === "service" && !category && !query) {
    $("#posItems").innerHTML = '<div class="filter-empty"><b>اختر تصنيف الخدمات</b><p>أو اكتب اسم الخدمة في البحث لعرضها مباشرة.</p></div>';
  } else {
    const visible = posCatalogItems().filter(item => item.section === section && (section !== "service" || !category || category === "all" || item.categoryId === category) && (!query || `${item.nameAr} ${item.category}`.toLowerCase().includes(query))).slice(0, 30);
    $("#posItems").innerHTML = visible.map(item => `<button type="button" class="pos-item ${item.kind === "inventory" && item.stockQty <= 0 ? "out" : ""}" data-pos-add="${escapeAttr(item.id)}" data-pos-kind="${escapeAttr(item.kind)}" ${item.kind === "inventory" && item.stockQty <= 0 ? "disabled" : ""}><span>${escapeHtml(item.category)}</span><b>${escapeHtml(item.nameAr)}</b><strong>${money(item.price)}</strong>${item.kind === "inventory" ? `<small>المتاح: ${Number(item.stockQty || 0)}</small>` : ""}</button>`).join("") || '<div class="filter-empty"><b>لا توجد نتائج</b><p>غيّر التصنيف أو اكتب جزءًا من الاسم.</p></div>';
  }
  renderPosCart();
}

function renderPosCart() {
  if ($("#posCouponStatus")) $("#posCouponStatus").textContent = "يتحقق الخادم نهائيًا من الكود والفرع والحدود عند حفظ الفاتورة.";
  if (!$("#posCart")) return;
  const index = new Map(posCatalogItems().map(item => [`${item.kind}:${item.id}`, item]));
  state.posCart = state.posCart.filter(line => index.has(`${line.kind}:${line.id}`));
  $("#posCart").innerHTML = state.posCart.map(line => {
    const item = index.get(`${line.kind}:${line.id}`);
    const options = item.section === "drink" && item.drinkOptions?.length ? `<select data-pos-option="${escapeAttr(line.id)}" data-pos-kind="${escapeAttr(line.kind)}" aria-label="تحضير ${escapeAttr(item.nameAr)}">${item.drinkOptions.map(option => `<option value="${escapeAttr(option)}" ${option === line.option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>` : "";
    const quantity = ["inventory", "product", "drink"].includes(line.kind) ? `<input type="number" min="1" max="${line.kind === "inventory" ? Math.max(1, item.stockQty) : 20}" value="${line.qty}" data-pos-qty="${escapeAttr(line.id)}" data-pos-kind="${escapeAttr(line.kind)}" aria-label="الكمية">` : "";
    const staff=(state.collections.get("staff")||[]).filter(member=>member.active!==false&&member.available!==false&&availableAtBranch(member,$("#posBranch").value));const needsWorker=["service","package","offer"].includes(line.kind);const worker=needsWorker?`<select data-pos-worker="${escapeAttr(line.id)}" data-pos-kind="${escapeAttr(line.kind)}" aria-label="العامل لخدمة ${escapeAttr(item.nameAr)}"><option value="none">بدون عامل</option>${staff.map(member=>`<option value="${escapeAttr(member.id)}" ${member.id===(line.workerId||$("#posStaff").value)?"selected":""}>${escapeHtml(member.nameAr)}</option>`).join("")}</select>`:"";
    const packageChoices = item.choiceGroups?.length ? `<div class="pos-package-choices">${item.choiceGroups.map(group => `<label><span>${escapeHtml(group.labelAr || "اختيار الباقة")}${group.required === false ? "" : " *"}</span><select data-pos-choice="${escapeAttr(line.id)}" data-pos-kind="${escapeAttr(line.kind)}" data-choice-group="${escapeAttr(group.id)}" aria-label="${escapeAttr(group.labelAr || "اختيار الباقة")}" ${group.required === false ? "" : "required"}><option value="">اختر واحدًا</option>${(group.options || []).map(option => `<option value="${escapeAttr(option.id)}" ${line.choices?.[group.id] === option.id ? "selected" : ""}>${escapeHtml(option.labelAr || option.id)}</option>`).join("")}</select></label>`).join("")}</div>` : "";
    return `<div class="pos-cart-line"><div><b>${escapeHtml(item.nameAr)}</b><small>${money(item.price)} × ${line.qty}${line.option ? ` • ${escapeHtml(line.option)}` : ""}</small></div><div class="pos-line-controls">${worker}${options}${quantity}${packageChoices}</div><strong>${money(item.price * line.qty)}</strong><button type="button" data-pos-remove="${escapeAttr(line.id)}" data-pos-kind="${escapeAttr(line.kind)}" aria-label="حذف ${escapeAttr(item.nameAr)}">×</button></div>`;
  }).join("") || '<p>لم تتم إضافة أصناف بعد.</p>';
  const subtotal = state.posCart.reduce((sum, line) => sum + Number(index.get(`${line.kind}:${line.id}`)?.price || 0) * line.qty, 0);
  const discount = Math.max(0, Math.min(subtotal, Number($("#posDiscount").value || 0)));
  const total = money(subtotal - discount);
  const count = state.posCart.reduce((sum, line) => sum + Number(line.qty || 1), 0);
  $("#posTotal").textContent = total;
  if ($("#posMobileTotal")) $("#posMobileTotal").textContent = total;
  if ($("#posMobileCount")) $("#posMobileCount").textContent = `${count} ${count === 1 ? "صنف" : "أصناف"}`;
  if ($("#posCartCount")) $("#posCartCount").textContent = `${count} ${count === 1 ? "صنف" : "أصناف"}`;
}

async function applyPosCoupon(button) {
  const code = $("#posCouponCode").value.trim().toUpperCase();
  const status = $("#posCouponStatus");
  if (!code || !state.posCart.length) return toast("أضف صنفًا وكود الخصم أولًا", true);
  if (state.posCart.some(item => !["service", "product", "package", "offer"].includes(item.kind))) {
    status.textContent = "هذه الفاتورة تحتوي أصنافًا تتطلب مراجعة الكود عند الحفظ؛ لن يُحتسب الخصم محليًا.";
    return;
  }
  await withButtonBusy(button, async () => {
    const result = await previewPosCoupon({ code, phone: $("#posPhone").value, branchId: $("#posBranch").value, items: state.posCart.map(item => ({ id: item.id, kind: item.kind, qty: item.qty, choices: item.choices })) });
    status.textContent = result.valid ? `الخصم المتوقع ${money(result.discountAmount)}؛ يراجع الخادم الصلاحية والحدود مرة أخرى عند الحفظ.` : "الكود غير صالح لهذه الأصناف أو لهذا الفرع.";
  }).catch(error => { status.textContent = "تعذر فحص الكود الآن. حاول مرة أخرى قبل الحفظ."; toast(error.message || "تعذر فحص الكود", true); });
}

function addPosItem(id, kind) {
  const item = posCatalogItems().find(value => value.id === id && value.kind === kind);
  if (!item) return;
  const existing = state.posCart.find(line => line.id === id && line.kind === kind);
  if (existing && ["inventory", "product", "drink"].includes(kind)) existing.qty = Math.min(kind === "inventory" ? item.stockQty : 20, existing.qty + 1);
  else if (!existing) state.posCart.push({ id, kind, qty: 1, option: item.section === "drink" ? item.drinkOptions?.[0] || "" : "", choices: {} });
  renderPosCart();
}

async function submitPosOrder(event) {
  event.preventDefault();
  if (!state.posCart.length) return toast("أضف خدمة أو منتجًا للشيك", true);
  const posIndex = new Map(posCatalogItems().map(item => [`${item.kind}:${item.id}`, item]));
  const incompletePackage = state.posCart.find(line => (posIndex.get(`${line.kind}:${line.id}`)?.choiceGroups || []).some(group => group.required !== false && !(group.options || []).some(option => option.id === line.choices?.[group.id])));
  if (incompletePackage) return toast("اختر بديلًا واحدًا من كل مجموعة داخل الباقة", true);
  if (!$("#posFirstName").value.trim()) { $(".pos-extra-details").open = true; $("#posFirstName").focus(); return toast("اكتب اسم العميل لإكمال الشيك", true); }
  const button = $("#posSubmit");
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  state.posIdempotencyKey ||= crypto.randomUUID();
  try {
    if (state.posBookingId) {
      const booking = state.dashboard.bookings.find(item => item.id === state.posBookingId);
      const result = await changeBooking(state.posBookingId, booking?.paymentStatus === "paid" ? "completed" : "checkout", $("#posPaymentMethod").value);
      if (booking) Object.assign(booking, { status: "completed", paymentStatus: "paid", paymentMethod: $("#posPaymentMethod").value, orderState: "PAID" });
      const receiptId = state.posBookingId;
      resetPosDraft();
      renderDashboard();
      toast(result.idempotent ? "تم حفظ وطباعة الشيك بالفعل" : "تم تحصيل الحجز وتجهيز الشيك مرة واحدة");
      await refreshCashierOperations();
      await printReceipt(receiptId);
      return;
    }
    const result = await createPosOrder({ idempotencyKey: state.posIdempotencyKey, branchId: $("#posBranch").value, customer: { firstName: $("#posFirstName").value, lastName: $("#posLastName").value, phone: $("#posPhone").value }, staffId: $("#posStaff").value, items: state.posCart.map(line=>({...line,workerId:line.workerId||$("#posStaff").value})), discountAmount: Number($("#posDiscount").value || 0), couponCode: $("#posCouponCode")?.value.trim(), redeemPoints:Number($("#posRedeemPoints")?.value||0), redeemCashback:Number($("#posRedeemCashback")?.value||0), paymentMethod: $("#posPaymentMethod").value, paid: $("#posPaid").checked });
    const receipt = result.receipt || { id: result.bookingCode, code: result.bookingCode, source: "pos", total: result.total, paymentStatus: result.paymentStatus, bookingDate: cairoDateKey(), createdAt: new Date().toISOString(), items: [] };
    applyPosReceiptLocally(receipt);
    resetPosDraft();
    toast(`تم حفظ الطلب ${result.bookingCode} وتجهيز الشيك`);
    await refreshCashierOperations();
    await printReceipt(receipt.id || result.bookingCode);
  } catch (error) { toast(error.message || "تعذر حفظ طلب المحل", true); }
  finally { button.disabled = false; button.removeAttribute("aria-busy"); }
}

function selectPosCustomer(id) {
  const customer = (state.collections.get("customers") || []).find(item => item.id === id);
  if (!customer) {
    $("#posFirstName").value = "";
    $("#posLastName").value = "";
    $("#posPhone").value = "";
    return;
  }
  $("#posFirstName").value = customer.firstName || "";
  $("#posLastName").value = customer.lastName || "";
  $("#posPhone").value = customer.phone || "";
}

function toggleExpenseInventory() {
  const visible = $("#expenseCategory").value === "inventory";
  $("#expenseInventoryWrap").hidden = !visible;
  $("#expenseQuantityWrap").hidden = !visible;
  if (!visible) { $("#expenseInventoryItem").value = ""; const qty = $('#expenseForm [name="stockQuantity"]'); if (qty) qty.value = "0"; }
}

function resetExpenseForm() {
  const form = $("#expenseForm");
  form.reset();
  form.dataset.idempotencyKey = "";
  form.dataset.submitting = "";
  state.editingExpenseId = "";
  $("#expenseDate").value = cairoDateKey();
  $("#expenseFormTitle").textContent = "تسجيل مصروف أو عملية شراء";
  $("#expenseSubmit").textContent = "تسجيل الحركة";
  $("#expenseCancelEdit").hidden = true;
  toggleExpenseInventory();
  refreshExpenseInventoryOptions();
}

function startExpenseEdit(id) {
  const item = (state.business.expenses || []).find(value => value.id === id);
  if (!item) return toast("المصروف غير موجود أو تم حذفه", true);
  if (item.payrollPaymentId) return toast("عدّل عملية الراتب من قسم الرواتب", true);
  const form = $("#expenseForm");
  state.editingExpenseId = id;
  form.elements.category.value = item.category || "other";
  form.elements.amount.value = Number(item.amount || 0);
  form.elements.branchId.value = item.branchId || "talkha";
  form.elements.dateKey.value = item.dateKey || cairoDateKey();
  form.elements.description.value = item.description || "";
  form.elements.paymentMethod.value = item.paymentMethod || "cash";
  form.elements.notes.value = item.notes || "";
  toggleExpenseInventory();
  refreshExpenseInventoryOptions();
  form.elements.inventoryItemId.value = item.inventoryItemId || "";
  form.elements.stockQuantity.value = Number(item.stockQuantity || 0);
  $("#expenseFormTitle").textContent = "تعديل الحركة المالية";
  $("#expenseSubmit").textContent = "حفظ التعديل";
  $("#expenseCancelEdit").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function submitExpense(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"], button:not([type])');
  if (!button || form.dataset.submitting === "true") return;
  if (!form.reportValidity()) return;
  form.dataset.submitting = "true";
  button.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form));
    if (state.editingExpenseId) await updateExpense({ ...payload, id: state.editingExpenseId });
    else {
      form.dataset.idempotencyKey ||= crypto.randomUUID();
      await recordExpense({ ...payload, idempotencyKey: form.dataset.idempotencyKey });
    }
    const wasEditing = Boolean(state.editingExpenseId);
    resetExpenseForm();
    await Promise.all([loadDashboard(), loadBusiness(true)]);
    await refreshCashierOperations();
    toast(wasEditing ? "تم تعديل الحركة وتحديث الحسابات" : "تم تسجيل الحركة وخصمها من صافي دخل الفرع");
  } catch (error) { toast(error.message || "تعذر تسجيل المصروف", true); }
  finally { form.dataset.submitting = ""; button.disabled = false; }
}

async function paySalary(staffId) {
  if (state.role !== "admin") return toast("صرف الرواتب متاح للأدمن فقط", true);
  const item = (state.business.payroll || []).find(value => value.id === staffId);
  if (!item || !confirm(`تسجيل صرف راتب ${item.nameAr} عن ${state.business.month}؟`)) return;
  const adjustment = Number(document.querySelector(`[data-payroll-adjustment="${CSS.escape(staffId)}"]`)?.value || 0);
  const paymentMethod = document.querySelector(`[data-payroll-method="${CSS.escape(staffId)}"]`)?.value || "cash";
  try {
    await recordPayrollPayment({ month: state.business.month, staffId, adjustment, paymentMethod });
    await Promise.all([loadDashboard(), loadBusiness(true)]);
    toast("تم تسجيل صرف الراتب وإضافته للمصروفات");
  } catch (error) { toast(error.message || "تعذر تسجيل صرف الراتب", true); }
}

async function loadCollection(collection, refresh = false) {
  if (!refresh && state.collections.has(collection)) return renderCollection(collection);
  try {
    const result = await getCollection(collection, 100);
    state.collections.set(collection, result.items || []);
    state.collectionCursors.set(collection, result.nextCursor || null);
    renderCollection(collection);
    $$(`[data-load-more="${CSS.escape(collection)}"]`).forEach(button => { button.hidden = !result.nextCursor; });
  } catch (error) { toast(`تعذر تحميل ${collection}: ${error.message}`, true); }
}

async function loadPosOffers() {
  const branchId = state.role === "cashier" ? state.branchIds[0] : $("#posBranch").value;
  if (!branchId) return;
  if (state.posOffersBranch === branchId && Date.now() - state.posOffersLoadedAt < 60_000) return;
  if (state.posOffersBranch !== branchId) { state.posOffers = []; renderPos(); }
  try {
    const result = await getPosOffers(branchId);
    if ((state.role === "cashier" ? state.branchIds[0] : $("#posBranch").value) !== branchId) return;
    state.posOffers = result.items || [];
    state.posOffersBranch = branchId; state.posOffersLoadedAt = Date.now();
    renderPos();
  } catch (error) {
    state.posOffers = []; state.posOffersBranch = ""; state.posOffersLoadedAt = 0;
    toast(`تعذر تحميل عروض البيع: ${error.message}`, true);
  }
}

function renderRequiredPackageStatus() {
  const panel = $("#requiredPackagesStatus");
  if (!panel) return;
  const packages = state.collections.get("packages") || [];
  const existingIds = new Set(packages.map(item => item.id));
  const missing = newMashayaPackages.filter(item => !existingIds.has(item.id));
  panel.hidden = state.role !== "admin";
  if (panel.hidden) return;
  const states = newMashayaPackages.map(item => `${item.nameAr}: ${existingIds.has(item.id) ? "موجودة" : "ناقصة"}`);
  $("#requiredPackagesMessage").textContent = `إجمالي الباقات: ${packages.length}. ${states.join(" • ")}. لن تُحذف أو تُستبدل أي باقة قديمة.`;
  const button = panel.querySelector("[data-install-required-packages]");
  button.hidden = missing.length === 0;
  panel.querySelector("b").textContent = missing.length ? `الباقات المطلوبة: ${3 - missing.length}/3 موجودة` : "الباقات المطلوبة الثلاث موجودة";
}

async function installRequiredPackages(button) {
  if (state.role !== "admin") return toast("إضافة الباقات متاحة للأدمن فقط", true);
  const existingIds = new Set((state.collections.get("packages") || []).map(item => item.id));
  const missing = newMashayaPackages.filter(item => !existingIds.has(item.id));
  if (!missing.length) return toast("الباقات الثلاث موجودة بالفعل");
  if (!confirm(`سيتم إنشاء ${missing.length} باقات ناقصة بفرع المشاية فقط، دون تعديل الباقات الحالية. متابعة؟`)) return;
  await withButtonBusy(button, async () => {
    await Promise.all(missing.map(item => saveEntity("packages", item.id, item)));
    await loadCollection("packages", true);
    toast("تمت إضافة الباقات الناقصة بالتفاصيل والاختيارات والأسعار");
  }).catch(error => toast(error.message || "تعذر إضافة الباقات", true));
}

async function loadMoreCollection(collection, button) {
  const cursor = state.collectionCursors.get(collection);
  if (!cursor) return;
  await withButtonBusy(button, async () => {
    const result = await getCollection(collection, 100, cursor);
    const current = state.collections.get(collection) || [];
    const merged = new Map([...current, ...(result.items || [])].map(item => [item.id, item]));
    state.collections.set(collection, [...merged.values()]);
    state.collectionCursors.set(collection, result.nextCursor || null);
    button.hidden = !result.nextCursor;
    renderCollection(collection);
  }).catch(error => toast(error.message || "تعذر تحميل المزيد", true));
}

function renderCollection(collection) {
  const query = document.querySelector(`[data-entity-search="${CSS.escape(collection)}"]`)?.value.trim().toLowerCase() || "";
  let canonicalQuery = ""; try { canonicalQuery = normalizePhone(query); } catch {}
  let items = (state.collections.get(collection) || []).filter(item => !query || [item.nameAr, item.nameEn, item.name, item.comment, item.titleAr, item.titleEn, item.specialtyAr, item.code, item.bookingCode, item.id, item.firstName, item.lastName, item.phone, `${item.firstName || ""} ${item.lastName || ""}`].some(value => String(value || "").toLowerCase().includes(query)) || (canonicalQuery && whatsappPhone(item.phone) === `2${canonicalQuery}`)).sort((a, b) => Number(b.featured || 0) - Number(a.featured || 0) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.nameAr || a.name || a.titleAr || `${a.firstName || ""} ${a.lastName || ""}`.trim() || a.id || "").localeCompare(String(b.nameAr || b.name || b.titleAr || `${b.firstName || ""} ${b.lastName || ""}`.trim() || b.id || ""), "ar"));
  if (collection === "inventoryItems") {
    const allItems = state.collections.get(collection) || [];
    $$('entity-panel[data-collection="inventoryItems"]').forEach(panel => {
      const view = panel.dataset.inventoryView || "all";
      const viewQuery = panel.querySelector('[data-entity-search="inventoryItems"]')?.value.trim().toLowerCase() || "";
      const visible = allItems.filter(item => (!viewQuery || [item.nameAr, item.nameEn, item.id, item.branchId, inventoryCategory(item.category)].some(value => String(value || "").toLowerCase().includes(viewQuery)))).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.nameAr || a.id).localeCompare(String(b.nameAr || b.id), "ar"));
      const target = panel.querySelector(`[data-list="inventoryItems-${CSS.escape(view)}"]`) || panel.querySelector('[data-list="inventoryItems"]');
      if (target) target.innerHTML = visible.map(item => entityCard("inventoryItems", item)).join("") || '<div class="entity-card filter-empty"><p>لا توجد بضاعة مطابقة للبحث.</p></div>';
    });
    return;
  }
  if (collection === "categories") {
    fillCategoryFilter("#serviceCategoryFilter", $("#serviceCategoryFilter")?.value || "");
  }
  if (collection === "services") {
    const category = $("#serviceCategoryFilter")?.value || "";
    if (!query && !category) items = [];
    else if (category && category !== "all") items = items.filter(item => item.categoryId === category);
    items = items.slice(0, 40);
    if ($("#servicesVisibleCount")) $("#servicesVisibleCount").textContent = items.length ? `${items.length} خدمة ظاهرة` : (!query && !category ? "اختر تصنيفًا أو ابحث" : "لا توجد نتائج");
  }
  if (collection === "reviews") {
    const filter = $("#reviewStatusFilter")?.value || "all";
    if (filter !== "all") items = items.filter(item => filter === "featured" ? item.featured === true : (item.status || (item.active ? "published" : "pending")) === filter);
  }
  if (collection === "customers") {
    const allCustomers = state.collections.get("customers") || [];
    const segment = $("#customerSegmentFilter")?.value || "all";
    const cutoff = Date.now() - 60 * 86400000;
    if (segment === "recent") items = items.filter(item => new Date(item.lastBookingAt || 0).getTime() >= cutoff);
    if (segment === "inactive") items = items.filter(item => !item.lastBookingAt || new Date(item.lastBookingAt).getTime() < cutoff);
    if (segment === "vip") items = items.filter(item => Number(item.totalSpent || 0) > 0).sort((a, b) => Number(b.totalSpent || 0) - Number(a.totalSpent || 0)).slice(0, 50);
    if (segment === "rewards") items = items.filter(item => Number(item.pointsBalance || 0) > 0 || Number(item.cashbackBalance || 0) > 0);
    const summary = $("#customerSegmentSummary");
    if (summary) summary.innerHTML = `<span><b>${items.length}</b> نتيجة ظاهرة</span><span><b>${allCustomers.length}</b> عميل في الصفحة الحالية</span><span>البحث والتصفية فوريان بدون طلبات إضافية</span>`;
  }
  if (collection === "settings") { fillSettings(items[0] || {}); return; }
  const targets = $$(`[data-list="${collection}"]`);
  targets.forEach(target => { target.innerHTML = items.map(item => entityCard(collection, item, ["customers", "activityLogs", "users"].includes(collection))).join("") || `<div class="entity-card filter-empty"><p>${collection === "services" && !query && !$("#serviceCategoryFilter")?.value ? "اختر تصنيفًا من القائمة أو ابحث باسم الخدمة." : "لا توجد بيانات."}</p></div>`; });
  if (collection === "packages") renderRequiredPackageStatus();
  if (collection === "staff") renderStaffSummary();
  if (collection === "content") {
    ["gallery", "result", "hair-system", "celebrity", "news"].forEach(type => {
      const target = $(`[data-list="content-${type}"]`);
      if (target) target.innerHTML = items.filter(item => item.type === type).map(item => entityCard("content", item)).join("") || '<div class="entity-card"><p>لا توجد بيانات.</p></div>';
    });
  }
}

function entityCard(collection, item, readonly = false) {
  if (collection === "customers") return customerCard(item);
  if (collection === "activityLogs") return activityCard(item);
  if (collection === "reviews") return reviewCard(item);
  const title = item.nameAr || item.name || item.titleAr || item.code || item.date || item.key || item.customerName || item.email || item.action || item.id;
  const category = collection === "services" ? (state.collections.get("categories") || []).find(value => value.id === item.categoryId) : null;
  const detail = collection === "services" ? `${category?.nameAr || item.categoryId || "بدون تصنيف"} • ${money(item.price)}${Number(item.duration) ? ` • ${Number(item.duration)} دقيقة` : ""}`
    : collection === "categories" ? `ترتيب الظهور: ${Number(item.sortOrder || 0)}`
    : collection === "packages" ? `${money(item.price)}${Number(item.duration) ? ` • ${Number(item.duration)} دقيقة` : ""}`
    : collection === "offers" ? `${money(item.newPrice)}${Number(item.oldPrice || 0) > Number(item.newPrice || 0) ? ` • التوفير ${money(Number(item.oldPrice) - Number(item.newPrice))}` : ""}${item.endAt ? " • عرض محدد المدة" : ""}`
    : collection === "inventoryItems" ? `${inventoryCategory(item.category)} • بيع ${money(item.sellingPrice)} • رصيد ${Number(item.stockQty || 0)} ${item.unit || "قطعة"} • ${branchLabel(item.branchId)}`
    : collection === "drinks" ? `${drinkType(item.type)} • ${money(item.price)} • ${branchLabel(item.branchId)}${item.drinkOptions?.length ? ` • التحضير: ${item.drinkOptions.join("، ")}` : ""}`
    : collection === "reviews" ? `${"★".repeat(Math.max(1, Math.min(5, Number(item.rating || 5))))} • ${item.comment || "بدون تعليق"}${item.verified ? " • حجز موثّق" : ""}`
    : collection === "branches" ? `${item.addressAr || "بدون عنوان"} • GPS ${item.latitude ?? "غير مضبوط"}, ${item.longitude ?? "غير مضبوط"} • نطاق ${Number(item.attendanceRadiusMeters || 0) || "غير مضبوط"} متر`
    : item.addressAr || item.specialtyAr || item.reasonAr || item.bodyAr || item.phone || item.collection || item.role || item.id;
  const contentPreview = collection === "content" ? `<div class="entity-media">${item.imageUrl ? `<img src="${escapeAttr(safeMediaUrl(item.imageUrl))}" alt="" loading="lazy" decoding="async">` : `<span>${isVideoContent(item) ? "▶" : "▧"}</span>`}${isVideoContent(item) ? '<b>فيديو</b>' : ""}</div><p class="entity-branch">${escapeHtml(branchScopeLabel(item.branchIds))}</p>` : "";
  const packageDetails = collection === "packages" ? `<div class="admin-package-details">
    <span class="admin-package-branch">${escapeHtml(item.branchLabelAr || branchScopeLabel(item.branchIds))}</span>
    ${Number(item.originalPrice || 0) > Number(item.price || 0) ? `<p class="admin-package-price"><del>${money(item.originalPrice)}</del><b>${money(item.price)}</b></p>` : ""}
    ${Array.isArray(item.includedItemsAr) && item.includedItemsAr.length ? `<ul>${item.includedItemsAr.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : '<p class="admin-package-warning">الخدمات المضمنة لم تُحدد بعد.</p>'}
    ${(item.choiceGroups || []).map(group => `<p class="admin-package-choice"><b>${escapeHtml(group.labelAr || "اختيار مطلوب")}:</b> ${(group.options || []).map(option => escapeHtml(option.labelAr || option.id)).join(" أو ")}</p>`).join("")}
    ${item.termsAr ? `<small>${escapeHtml(item.termsAr)}</small>` : ""}
  </div>` : "";
  const actions = collection === "branches" ? `<footer><button data-edit-collection="branches" data-edit-id="${escapeAttr(item.id)}">تعديل الموقع والنطاق</button></footer>` : `<footer>${collection === "offers" ? `${state.permissions.has("campaigns") || state.role === "admin" ? `<button data-offer-campaign="${escapeAttr(item.id)}">إرسال العرض للعملاء</button>` : ""}${(state.permissions.has("campaigns") && state.permissions.has("customers")) || state.role === "admin" ? `<button class="offer-send" data-prepare-offer-messages="${escapeAttr(item.id)}">إرسال للعملاء يدويًا</button>` : ""}` : ""}${collection === "offers" ? `<button data-preview-offer="${escapeAttr(item.id)}">معاينة</button><button data-book-offer="${escapeAttr(item.id)}">احجز العرض</button>` : ""}${collection === "categories" ? `<button class="category-view" data-service-category="${escapeAttr(item.id)}">عرض الخدمات</button>` : ""}<button data-edit-collection="${collection}" data-edit-id="${escapeAttr(item.id)}">تعديل</button>${"active" in item ? `<button data-toggle-collection="${collection}" data-toggle-id="${escapeAttr(item.id)}">${collection === "reviews" ? item.active ? "إخفاء" : "نشر" : item.active === false ? "تفعيل" : "إيقاف"}</button>` : ""}<button class="delete" data-delete-collection="${collection}" data-delete-id="${escapeAttr(item.id)}">حذف</button></footer>`;
  return `<article class="entity-card ${item.active === false || item.available === false ? "inactive" : ""}">${collection === "staff" ? `<img class="entity-avatar" src="${escapeAttr(safeMediaUrl(item.imageUrl) || "/assets/el-mezaen-logo.jpeg")}" alt="" loading="lazy" decoding="async">` : ""}${contentPreview}<h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p>${packageDetails}${collection === "coupons" ? `<p>استخدام: ${Number(item.usageCount || 0)} • خصومات: ${money(item.discountTotal || 0)}</p>` : ""}${collection === "staff" ? `<p>حجوزات: ${Number(item.bookingCount || 0)} • إيراد: ${money(item.revenueTotal || 0)}<br>راتب: ${money(item.baseSalary)} • تارجت: ${money(item.monthlyTarget)} • زيادة: ${Number(item.targetBonusPercent || 0)}%</p>` : ""}${collection === "inventoryItems" && Number(item.stockQty || 0) <= Number(item.minStock || 0) ? '<b class="stock-warning">⚠ الرصيد منخفض</b>' : ""}${collection === "reviews" ? `<b class="review-state">${item.active ? "منشور على الموقع" : "بانتظار المراجعة"}</b>` : ""}${readonly ? "" : actions}</article>`;
}

function activityCard(item) {
  const actions = { create: "إضافة سجل", update: "تعديل سجل", delete: "حذف سجل", "booking-created": "إنشاء حجز", "booking-confirmed": "تأكيد حجز", "booking-cancelled": "إلغاء حجز", "booking-completed": "إكمال حجز", "booking-no_show": "عدم حضور", "reschedule-booking": "تغيير موعد حجز", "customer-cancel-booking": "إلغاء العميل للحجز", "open-cash-shift": "فتح وردية", "close-cash-shift": "إغلاق وردية", "cash-in": "إضافة كاش", "cash-out": "سحب كاش", "record-expense": "تسجيل مصروف", "update-expense": "تعديل مصروف", "set-branch-monthly-target": "تعديل هدف الفرع", "report-rebuilt": "إعادة بناء تقرير", "password-change-client-confirmed": "تأكيد تغيير كلمة المرور من التطبيق", "set-user-role": "تعديل صلاحيات حساب", "create-user-account": "إنشاء حساب", "secure-delete-user": "حذف حساب", "wallet-adjustment": "تعديل محفظة", "mark-paid": "تسجيل دفع", "refund-order": "استرداد مبلغ", "create-pos-order": "إنشاء شيك", "checkout-booking": "دفع وإكمال حجز" };
  const actor = item.actorName || item.userName || item.userEmail || item.actorUid || item.userId || "عميل الموقع";
  const actorId = item.actorUid || item.userId;
  const actorDetail = [item.actorRole || "", actorId ? `UID: ${actorId}` : "", item.branchId ? branchLabel(item.branchId) : ""].filter(Boolean).join(" • ");
  const target = item.targetUserName || item.targetUserEmail || item.deletedUserName || item.deletedUserEmail || item.entityId || item.targetId || "—";
  const change = item.action === "set-user-role" ? `${({ manager: "مدير", cashier: "كاشير" })[item.beforeRole] || item.beforeRole || "—"} ← ${({ manager: "مدير", cashier: "كاشير" })[item.afterRole] || item.afterRole || "—"}` : (item.collection || "");
  return `<article class="activity-card"><div class="activity-action"><b>${escapeHtml(actions[item.action] || item.action || "نشاط")}</b><time>${escapeHtml(dateTime(item.createdAt))}</time></div><div><span>نفّذه</span><strong>${escapeHtml(actor)}</strong>${actorDetail ? `<small>${escapeHtml(actorDetail)}</small>` : ""}</div><div><span>على</span><strong>${escapeHtml(target)}</strong><small>${escapeHtml(change)}</small></div></article>`;
}

function reviewCard(item) {
  const status = item.status || (item.active ? "published" : "pending");
  const statusText = ({ pending: "بانتظار المراجعة", published: "منشور", rejected: "مرفوض" })[status] || status;
  return `<article class="entity-card review-admin-card ${status !== "published" ? "inactive" : ""}"><header><div class="customer-avatar">${escapeHtml(String(item.name || "ع").charAt(0))}</div><div><h3>${escapeHtml(item.name || "عميل")}</h3><span class="review-stars">${"★".repeat(Math.max(1, Math.min(5, Number(item.rating || 5))))}${"☆".repeat(5 - Math.max(1, Math.min(5, Number(item.rating || 5))))}</span></div>${item.featured ? '<b class="featured-review">★ مميز</b>' : ""}</header><p>${escapeHtml(item.comment || "")}</p><div class="review-meta"><span>${escapeHtml(statusText)}</span>${item.verified ? "<b>✓ حجز موثّق</b>" : ""}${item.bookingCode ? `<small>${escapeHtml(item.bookingCode)}</small>` : ""}</div>${item.adminReply ? `<blockquote><b>رد الإدارة:</b> ${escapeHtml(item.adminReply)}</blockquote>` : ""}<footer><button data-edit-collection="reviews" data-edit-id="${escapeAttr(item.id)}">تعديل ورد</button>${status !== "published" ? `<button class="approve" data-review-action="publish" data-review-id="${escapeAttr(item.id)}">نشر</button>` : ""}${status !== "rejected" ? `<button class="delete" data-review-action="reject" data-review-id="${escapeAttr(item.id)}">رفض</button>` : ""}${status === "published" ? `<button data-review-action="feature" data-review-id="${escapeAttr(item.id)}" data-review-featured="${item.featured ? "true" : "false"}">${item.featured ? "إلغاء التثبيت" : "تثبيت كمميز"}</button>` : ""}<button class="delete" data-delete-collection="reviews" data-delete-id="${escapeAttr(item.id)}">حذف</button></footer></article>`;
}

function customerCard(item) {
  const name = `${item.firstName || ""} ${item.lastName || ""}`.trim() || "عميل بدون اسم";
  const initial = name.replace(/^ال/, "").trim().charAt(0) || "ع";
  const phone = String(item.phone || "");
  return `<article class="entity-card customer-card"><div class="customer-avatar">${escapeHtml(initial)}</div><div class="customer-identity"><h3>${escapeHtml(name)}</h3><p><a href="tel:+2${escapeAttr(phone)}">${escapeHtml(phone || "لا يوجد رقم")}</a></p></div><dl class="customer-details"><div><dt>الفرع</dt><dd>${escapeHtml(item.lastBranchId ? branchLabel(item.lastBranchId) : "—")}</dd></div><div><dt>الحجوزات</dt><dd>${Number(item.bookingCount || 0)}</dd></div><div><dt>إجمالي المدفوع</dt><dd>${money(item.totalSpent)}</dd></div><div><dt>آخر زيارة</dt><dd>${escapeHtml(dateTime(item.lastBookingAt))}</dd></div><div><dt>النقاط</dt><dd>${Number(item.pointsBalance||0)}</dd></div><div><dt>الكاش باك</dt><dd>${money(item.cashbackBalance)}</dd></div></dl><footer><button class="customer-open" data-open-customer="${escapeAttr(item.id)}">فتح</button>${(state.permissions.has("campaigns") && state.permissions.has("customers")) || state.role === "admin" ? `<button data-manual-whatsapp-offer="${escapeAttr(item.id)}">إرسال عرض يدوي</button>` : ""}${state.role==="admin"?`<button data-wallet-adjust="${escapeAttr(item.id)}">المحفظة</button>`:""}${state.role==="admin"?`<button data-whatsapp-consent="${escapeAttr(item.id)}" data-current-consent="${item.whatsappOptIn===true}">${item.whatsappOptIn===true?"إلغاء التسويق":"موافقة واتساب"}</button>`:""}</footer></article>`;
}

async function openManualWhatsappOffer(customerId) {
  const customer = (state.collections.get("customers") || []).find(item => item.id === customerId);
  if (!customer) return toast("تعذر العثور على العميل", true);
  const phone = whatsappPhone(customer.phone);
  if (!phone) return toast("رقم واتساب العميل غير صحيح", true);
  const name = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "عميلنا";
  const initial = `أهلًا ${name} 👋\nعندنا عرض جديد من مزين مصر.\nللتفاصيل والحجز: https://el-mezaen-talkha.vercel.app/`;
  const message = prompt("راجع رسالة العرض قبل فتح واتساب", initial);
  if (!message?.trim()) return;
  await openCheckedWhatsapp(phone, message.trim(), customerId);
  toast("تم فتح محادثة العميل؛ راجع الرسالة واضغط إرسال يدويًا");
}

async function openCheckedWhatsapp(phone, message, customerId, offerId = "") {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  try { await checkWhatsappMarketingRecipient(customerId, offerId); }
  catch (error) { tab?.close(); throw error; }
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  if (tab && !tab.closed) tab.location.href = url;
  else location.href = url;
}

function manualOfferMessage(offer) {
  const endDate = offer.endAt ? new Date(offer.endAt) : null;
  const end = endDate && Number.isFinite(endDate.getTime()) ? new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeZone: "Africa/Cairo" }).format(endDate) : "";
  const price = Number(offer.oldPrice || 0) > Number(offer.newPrice || 0) ? `بدل ${money(offer.oldPrice)} — الآن ${money(offer.newPrice)}` : `السعر ${money(offer.newPrice)}`;
  return [`أهلًا {{name}} 👋`, `عرض جديد من مزين مصر: ${offer.nameAr || "عرض خاص"}`, offer.descriptionAr || "", price, end ? `العرض ساري حتى ${end}` : "", "للتفاصيل والحجز: https://el-mezaen-talkha.vercel.app/"].filter(Boolean).join("\n");
}

function renderManualOfferDialog() {
  const { offer, recipients, nextCursor, opened, message } = state.manualOffer;
  if (!offer) return;
  const valid = recipients.filter(customer => whatsappPhone(customer.phone) && customer.whatsappOptIn === true);
  const consented = valid.filter(customer => customer.whatsappOptIn === true).length;
  const openedCount = valid.filter(customer => opened.has(customer.id)).length;
  $("#manualOfferTitle").textContent = offer.nameAr || "العرض";
  $("#manualOfferMessage").value = message;
  $("#manualOfferSummary").innerHTML = `<b>${valid.length}</b> عميل برقم صالح • <b>${consented}</b> لديهم موافقة تسويق • تم فتح <b>${openedCount}</b> محادثة${nextCursor ? " • توجد دفعة أخرى" : ""}`;
  $("#manualOfferRecipients").innerHTML = valid.map(customer => {
    const name = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "عميلنا";
    const wasOpened = opened.has(customer.id);
    return `<article class="manual-offer-recipient ${wasOpened ? "opened" : ""}"><div><b>${escapeHtml(name)}</b><small>${escapeHtml(customer.phone || "")}</small></div><span>${customer.whatsappOptIn === true ? "✓ موافقة مسجلة" : "⚠ بلا موافقة مسجلة"}</span><button type="button" data-open-offer-recipient="${escapeAttr(customer.id)}">${wasOpened ? "فتح مرة أخرى" : "فتح واتساب"}</button></article>`;
  }).join("") || '<p class="empty-state">لا توجد أرقام واتساب صالحة في هذه الدفعة.</p>';
  $("#manualOfferLoadMore").hidden = !nextCursor;
  $("#manualOfferNext").disabled = !valid.some(customer => !opened.has(customer.id));
}

async function loadManualOfferRecipients(cursor = "") {
  const result = await getCollection("customers", 100, cursor);
  const offerBranches = Array.isArray(state.manualOffer.offer?.branchIds) ? state.manualOffer.offer.branchIds : [];
  const eligible = (result.items || []).filter(customer => customer.whatsappOptIn === true && customer.lastBranchId && offerBranches.includes(customer.lastBranchId));
  const merged = new Map([...state.manualOffer.recipients, ...eligible].map(customer => [customer.id, customer]));
  state.manualOffer.recipients = [...merged.values()];
  state.manualOffer.nextCursor = result.nextCursor || null;
  renderManualOfferDialog();
}

async function prepareManualOfferMessages(offerId) {
  const offer = (state.collections.get("offers") || []).find(item => item.id === offerId);
  if (!offer) return toast("تعذر العثور على العرض", true);
  if (offer.active === false || ["expired", "stopped"].includes(offer.status)) return toast("فعّل العرض أولًا قبل تجهيز رسائل العملاء", true);
  if (offer.status === "scheduled" && !confirm("هذا العرض مجدول ولم يصبح نشطًا بعد. هل تريد تجهيز رسائله الآن؟")) return;
  state.manualOffer = { offer, recipients: [], nextCursor: null, opened: new Set(), message: manualOfferMessage(offer) };
  $("#manualOfferTitle").textContent = offer.nameAr || "العرض";
  $("#manualOfferSummary").textContent = "جارٍ تحميل أول دفعة من العملاء…";
  $("#manualOfferRecipients").innerHTML = '<p class="empty-state">جارٍ التحميل…</p>';
  $("#manualOfferMessage").value = state.manualOffer.message;
  if (!$("#manualOfferDialog").open) $("#manualOfferDialog").showModal();
  try { await loadManualOfferRecipients(); }
  catch (error) { toast(error.message || "تعذر تحميل العملاء", true); $("#manualOfferSummary").textContent = "تعذر تحميل العملاء."; }
}

async function openManualOfferRecipient(customerId) {
  const customer = state.manualOffer.recipients.find(item => item.id === customerId);
  if (!customer) return toast("تعذر العثور على العميل", true);
  const phone = whatsappPhone(customer.phone);
  if (!phone) return toast("رقم واتساب العميل غير صحيح", true);
  const name = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "عميلنا";
  const message = state.manualOffer.message.replaceAll("{{name}}", name).replaceAll("{name}", name).trim();
  if (!message) return toast("اكتب رسالة العرض أولًا", true);
  await openCheckedWhatsapp(phone, message, customerId, state.manualOffer.offer.id);
  state.manualOffer.opened.add(customer.id);
  renderManualOfferDialog();
  toast("تم فتح المحادثة فقط؛ الكاشير يراجع الرسالة ويضغط إرسال");
}

async function openNextManualOfferRecipient() {
  const next = state.manualOffer.recipients.find(customer => whatsappPhone(customer.phone) && !state.manualOffer.opened.has(customer.id));
  if (!next) return toast(state.manualOffer.nextCursor ? "حمّل الدفعة التالية أولًا" : "تم فتح كل محادثات القائمة الحالية");
  await openManualOfferRecipient(next.id);
}

async function openCustomerDrawer(id) {
  const item = (state.collections.get("customers") || []).find(value => value.id === id);
  if (!item) return toast("تعذر العثور على العميل", true);
  const name = `${item.firstName || ""} ${item.lastName || ""}`.trim() || "عميل بدون اسم";
  $("#customerDrawerTitle").textContent = name;
  $("#customerDrawerBody").innerHTML = '<div class="empty-state">جارٍ تحميل ملف العميل…</div>';
  if (!$("#customerDrawer").open) $("#customerDrawer").showModal();
  let profile;
  try { profile = await getCustomer360(id); }
  catch (error) { return void ($("#customerDrawerBody").innerHTML = `<div class="empty-state">${escapeHtml(error.message || "تعذر تحميل الملف")}</div>`); }
  const customer = profile.customer || item;
  const overview = profile.overview || {};
  const token = customer.qrToken || customer.customerQrToken || "";
  let qr = "";
  if (token) try { const { default: QRCode } = await import("qrcode"); qr = await QRCode.toDataURL(token, { width: 180, margin: 1 }); } catch {}
  const noShowWarning = Number(overview.noShows || 0) >= 3 ? `<p class="customer-warning">⚠ هذا العميل لديه ${Number(overview.noShows)} حالات عدم حضور سابقة</p>` : "";
  const bookingList = items => items.map(row => `<li><b>${escapeHtml(row.code || row.receiptNumber || row.id)}</b><span>${escapeHtml(row.bookingDate || "")} ${escapeHtml(row.bookingTime || "")} • ${escapeHtml(statusLabel(row.status))} • ${money(row.total)}</span></li>`).join("") || "<li>لا توجد بيانات.</li>";
  $("#customerDrawerBody").innerHTML = `<section class="customer-drawer-hero"><div class="customer-avatar">${escapeHtml(name.charAt(0))}</div><div><b>${escapeHtml(name)}</b><a href="tel:+2${escapeAttr(customer.phone || "")}">${escapeHtml(customer.phone || "لا يوجد رقم")}</a><small>ID: ${escapeHtml(customer.id)}</small></div>${qr ? `<img src="${qr}" alt="QR العميل" width="110" height="110">` : ""}</section>${noShowWarning}<dl class="customer-drawer-stats"><div><dt>الفرع المفضل</dt><dd>${escapeHtml(overview.preferredBranch ? branchLabel(overview.preferredBranch) : "—")}</dd></div><div><dt>إجمالي الزيارات</dt><dd>${Number(overview.totalVisits || 0)}</dd></div><div><dt>الزيارات المكتملة</dt><dd>${Number(overview.completedVisits || 0)}</dd></div><div><dt>أول زيارة</dt><dd>${escapeHtml(dateTime(customer.firstVisitAt || customer.createdAt))}</dd></div><div><dt>آخر زيارة</dt><dd>${escapeHtml(dateTime(customer.lastVisitAt || customer.lastBookingAt))}</dd></div><div><dt>الإلغاءات</dt><dd>${Number(overview.cancellations || 0)}</dd></div><div><dt>عدم الحضور</dt><dd>${Number(overview.noShows || 0)}</dd></div><div><dt>إجمالي المدفوع</dt><dd>${money(overview.totalSpent)}</dd></div><div><dt>متوسط الشيك</dt><dd>${money(overview.averageTicket)}</dd></div><div><dt>النقاط</dt><dd>${Number(customer.pointsBalance || 0)}</dd></div><div><dt>الكاش باك</dt><dd>${money(customer.cashbackBalance)}</dd></div><div><dt>الحلاق المفضل</dt><dd>${escapeHtml(customer.favoriteStaffNameAr || overview.favoriteWorkerId || "—")}</dd></div><div><dt>موافقة واتساب</dt><dd>${customer.whatsappOptIn === true ? "مسجلة" : "غير مسجلة"}</dd></div></dl><div class="customer-360-lists"><details open><summary>الحجوزات القادمة (${profile.upcoming.length})</summary><ul>${bookingList(profile.upcoming)}</ul></details><details><summary>آخر الحجوزات</summary><ul>${bookingList(profile.bookingHistory)}</ul></details><details><summary>آخر الشيكات</summary><ul>${bookingList(profile.orders)}</ul></details><details><summary>حركات المحفظة</summary><ul>${(profile.wallet || []).map(row => `<li><b>${escapeHtml(row.type || "حركة")}</b><span>${Number(row.points || 0)} نقطة • ${money(row.cashback)} • ${escapeHtml(dateTime(row.createdAt))}</span></li>`).join("") || "<li>لا توجد حركات.</li>"}</ul></details></div><div class="customer-drawer-actions"><button data-customer-pos="${escapeAttr(customer.id)}">فتح في نقطة البيع</button>${(state.permissions.has("campaigns") && state.permissions.has("customers")) || state.role === "admin" ? `<button data-manual-whatsapp-offer="${escapeAttr(customer.id)}">إرسال عرض يدوي</button>` : ""}${state.role==="admin"?`<button data-rotate-customer-qr="${escapeAttr(customer.id)}">تجديد QR</button>`:""}${state.role==="admin"?`<button data-wallet-adjust="${escapeAttr(customer.id)}">تعديل المحفظة</button>`:""}</div>`;
}

function branchScopeLabel(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 1) return "كل الفروع";
  return branchLabel(ids[0]);
}

function openEditor(collection, id = "", preset = {}) {
  const item = id ? (state.collections.get(collection) || []).find(value => value.id === id) || {} : {};
  state.editor = { collection, id, preset };
  $("#editorCollectionLabel").textContent = collection;
  $("#editorTitle").textContent = id ? "تعديل العنصر" : "إضافة عنصر جديد";
  const schema = fields[collection];
  if (!schema) return toast("هذا القسم للعرض فقط", true);
  const editorItem = { active: true, available: true, closed: true, mediaType: "image", status: collection === "content" ? "draft" : undefined, ...preset, ...item };
  if (collection === "content" && !item.status && id) editorItem.status = item.active === false ? "hidden" : "published";
  $("#editorFields").innerHTML = schema.map(definition => renderField(definition, editorItem)).join("") + (collection === "content" ? '<div class="editor-media-preview full" id="editorMediaPreview"><span>ستظهر معاينة الصورة أو الفيديو هنا</span></div>' : "");
  if (collection === "content") {
    for (const name of ["beforeFile", "afterFile"]) $("#editorFields").querySelector(`[name="${name}"]`)?.closest("label")?.toggleAttribute("hidden", editorItem.type !== "result");
    $("#editorFields").addEventListener("input", updateEditorMediaPreview);
    $("#editorFields").addEventListener("change", updateEditorMediaPreview);
    updateEditorMediaPreview();
  }
  $("#editorDialog").showModal();
}

function renderField([name, label, type, required = false, options = null, full = false], item) {
  const value = type === "json" ? JSON.stringify(item[name] || [], null, 2) : Array.isArray(item[name]) ? item[name].join(",") : item[name] ?? "";
  const className = full ? "full" : "";
  if (type === "hidden") return `<input name="${name}" type="hidden" value="${escapeAttr(value)}">`;
  if (type === "textarea") return `<label class="${className}">${label}<textarea name="${name}" ${required ? "required" : ""}>${escapeHtml(value)}</textarea></label>`;
  if (type === "json") return `<label class="${className}">${label}<textarea class="json-editor" name="${name}" dir="ltr" spellcheck="false" ${required ? "required" : ""}>${escapeHtml(value)}</textarea><small>كل مجموعة: id وlabelAr وoptions؛ وكل بديل: id وlabelAr وserviceId.</small></label>`;
  if (type === "select") return `<label class="${className}">${label}<select name="${name}" ${required ? "required" : ""}>${options.map(([key, text]) => `<option value="${escapeAttr(key)}" ${String(value) === String(key) ? "selected" : ""}>${text}</option>`).join("")}</select></label>`;
  if (type === "category-select") {
    const categories = (state.collections.get("categories") || []).filter(category => category.active !== false);
    return `<label class="${className}">${label}<select name="${name}" ${required ? "required" : ""}><option value="">اختر التصنيف</option>${categories.map(category => `<option value="${escapeAttr(category.id)}" ${String(value) === category.id ? "selected" : ""}>${escapeHtml(category.nameAr || category.id)}</option>`).join("")}</select></label>`;
  }
  if (type === "staff-select") {
    const staff = (state.collections.get("staff") || []).filter(member => member.active !== false);
    return `<label class="${className}">${label}<select name="${name}" ${required ? "required" : ""}><option value="">اختر العامل</option>${staff.map(member => `<option value="${escapeAttr(member.id)}" ${String(value) === member.id ? "selected" : ""}>${escapeHtml(member.nameAr || member.id)}</option>`).join("")}</select></label>`;
  }
  if (type === "branch-scope") {
    const scope = Array.isArray(item[name]) ? item[name].join(",") : String(value);
    const allowed = state.role === "admin" ? ["talkha", "mashaya"] : state.branchIds;
    const options = state.role === "admin" || allowed.length > 1 ? [["talkha,mashaya", "طلخا والمشاية"], ...allowed.map(id => [id, branchLabel(id)])] : allowed.map(id => [id, branchLabel(id)]);
    return `<label class="${className}">${label}<select name="${name}" ${required ? "required" : ""}>${options.map(([id, title]) => `<option value="${escapeAttr(id)}" ${scope === id || (!scope && id === allowed[0]) ? "selected" : ""}>${escapeHtml(title)}</option>`).join("")}</select></label>`;
  }
  if (type === "branch-select") return `<label class="${className}">${label}<select name="${name}" ${required ? "required" : ""}><option value="talkha" ${value === "talkha" ? "selected" : ""}>فرع طلخا</option><option value="mashaya" ${value === "mashaya" ? "selected" : ""}>فرع المشاية</option></select></label>`;
  if (type === "drink-branch-select") return `<label class="${className}">${label}<select name="${name}" ${required ? "required" : ""}><option value="talkha" ${value === "talkha" ? "selected" : ""}>فرع طلخا</option><option value="mashaya" ${value === "mashaya" ? "selected" : ""}>فرع المشاية</option>${state.role === "admin" ? `<option value="all" ${value === "all" ? "selected" : ""}>كل الفروع</option>` : ""}</select></label>`;
  if (type === "boolean") return `<label class="${className}">${label}<select name="${name}"><option value="true" ${value !== false ? "selected" : ""}>نعم</option><option value="false" ${value === false ? "selected" : ""}>لا</option></select></label>`;
  const dateValue = type === "datetime-local" && value ? String(value).slice(0, 16) : value;
  const inputType = ["video-file", "media-file"].includes(type) ? "file" : type;
  const accept = type === "file" ? 'accept="image/jpeg,image/png,image/webp,image/avif"' : type === "video-file" ? 'accept="video/*"' : type === "media-file" ? 'accept="image/*,video/*"' : "";
  const uploadClass = inputType === "file" ? "media-upload-field full" : className;
  const hint = type === "file" ? "JPG أو PNG أو WebP أو AVIF — يتم ضغط الصورة تلقائيًا" : type === "video-file" ? "اختر الفيديو من الهاتف؛ سيتم إنشاء صورة غلاف وحفظ الرابط تلقائيًا" : type === "media-file" ? "صورة، أو فيديو MP4 (H.264) / WebM أقل من 30MB — للفيديو تُنشأ صورة غلاف تلقائيًا" : "";
  return `<label class="${uploadClass}">${label}<input name="${name}" type="${inputType}" value="${inputType === "file" ? "" : escapeAttr(dateValue)}" ${required ? "required" : ""} ${type === "number" ? 'step="any"' : ""} ${accept}>${hint ? `<small>${hint}</small>` : ""}</label>`;
}

let editorPreviewUrls = [];
function updateEditorMediaPreview() {
  const preview = $("#editorMediaPreview");
  if (!preview) return;
  editorPreviewUrls.forEach(url => URL.revokeObjectURL(url)); editorPreviewUrls = [];
  const localUrl = file => { const url = URL.createObjectURL(file); editorPreviewUrls.push(url); return url; };
  const mediaFile = $('#editorFields input[name="mediaFile"]')?.files?.[0];
  const imageFile = mediaFile?.type?.startsWith("image/") ? mediaFile : $('#editorFields input[name="imageFile"]')?.files?.[0];
  const videoFile = mediaFile?.type?.startsWith("video/") ? mediaFile : $('#editorFields input[name="videoFile"]')?.files?.[0];
  const imageUrl = imageFile ? localUrl(imageFile) : $('#editorFields [name="imageUrl"]')?.value.trim();
  const rawVideoUrl = videoFile ? localUrl(videoFile) : $('#editorFields [name="videoUrl"]')?.value.trim();
  const beforeFile = $('#editorFields input[name="beforeFile"]')?.files?.[0];
  const afterFile = $('#editorFields input[name="afterFile"]')?.files?.[0];
  const beforeUrl = beforeFile ? localUrl(beforeFile) : $('#editorFields [name="beforeImageUrl"]')?.value.trim();
  const afterUrl = afterFile ? localUrl(afterFile) : $('#editorFields [name="afterImageUrl"]')?.value.trim();
  const source = videoSource(rawVideoUrl);
  if (beforeUrl && afterUrl && (beforeFile || safeMediaUrl(beforeUrl)) && (afterFile || safeMediaUrl(afterUrl))) preview.innerHTML = `<div class="editor-before-after"><figure><img src="${escapeAttr(beforeFile ? beforeUrl : safeMediaUrl(beforeUrl))}" alt="قبل"><figcaption>قبل</figcaption></figure><figure><img src="${escapeAttr(afterFile ? afterUrl : safeMediaUrl(afterUrl))}" alt="بعد"><figcaption>بعد</figcaption></figure></div>`;
  else if (videoFile || source.kind === "direct") preview.innerHTML = `<video src="${escapeAttr(videoFile ? rawVideoUrl : source.url)}" poster="${escapeAttr(imageFile ? imageUrl : safeMediaUrl(imageUrl))}" controls playsinline preload="metadata"></video>`;
  else if (source.kind === "embed") preview.innerHTML = `<iframe src="${escapeAttr(source.url)}" title="معاينة الفيديو" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  else if (source.kind === "external") preview.innerHTML = `<a href="${escapeAttr(source.url)}" target="_blank" rel="noopener">فتح ومعاينة رابط الفيديو ↗</a>`;
  else if (imageFile || safeMediaUrl(imageUrl)) preview.innerHTML = `<img src="${escapeAttr(imageFile ? imageUrl : safeMediaUrl(imageUrl))}" alt="معاينة الصورة">`;
  else preview.innerHTML = "<span>ستظهر معاينة الصورة أو الفيديو هنا</span>";
}

async function saveEditor(event) {
  event.preventDefault();
  const { collection, id } = state.editor;
  const formData = new FormData(event.currentTarget);
  const media = formData.get("mediaFile");
  const image = media?.type?.startsWith("image/") ? media : formData.get("imageFile");
  const video = media?.type?.startsWith("video/") ? media : formData.get("videoFile");
  const beforeFile = formData.get("beforeFile"), afterFile = formData.get("afterFile");
  formData.delete("beforeFile"); formData.delete("afterFile");
  formData.delete("mediaFile");
  formData.delete("imageFile");
  formData.delete("videoFile");
  const payload = Object.fromEntries(formData.entries());
  const existing = id ? (state.collections.get(collection) || []).find(item => item.id === id) || {} : {};
  if (collection === "packages" && payload.choiceGroups) {
    try { payload.choiceGroups = JSON.parse(payload.choiceGroups); }
    catch { return toast("صيغة JSON لاختيارات الباقة غير صحيحة", true); }
  }
  if (["services", "packages"].includes(collection)) {
    const normalizeName = value => String(value || "").trim().replace(/^ال/, "").replace(/\s+/g, " ").toLowerCase();
    const normalizedName = normalizeName(payload.nameAr || existing.nameAr);
    const scope = String(payload.branchIds ?? (existing.branchIds || []).join(",")).split(",").filter(Boolean).sort().join(",");
    const category = String(payload.categoryId || existing.categoryId || "");
    const duplicate = (state.collections.get(collection) || []).find(item => item.id !== id && normalizeName(item.nameAr) === normalizedName && String(item.categoryId || "") === category && (item.branchIds || []).slice().sort().join(",") === scope);
    if (duplicate && !confirm(`يوجد عنصر باسم مطابق في نفس الفرع والتصنيف: ${duplicate.nameAr}. هل تريد الحفظ رغم ذلك؟`)) return;
  }
  if (collection === "content" && !image?.size && !video?.size && !beforeFile?.size && !payload.imageUrl && !payload.videoUrl && !payload.beforeImageUrl && !existing.imageUrl && !existing.videoUrl && !existing.beforeImageUrl) return toast("اختر صورة أو فيديو من الجهاز أولًا", true);
  if (collection === "content" && (beforeFile?.size || afterFile?.size) && payload.type !== "result") return toast("صور قبل وبعد مخصصة لنتائج الشغل", true);
  [["nameAr", "nameEn"], ["descriptionAr", "descriptionEn"], ["titleAr", "titleEn"], ["bodyAr", "bodyEn"], ["specialtyAr", "specialtyEn"], ["bioAr", "bioEn"], ["reasonAr", "reasonEn"]].forEach(([ar, en]) => { if (payload[ar] != null) payload[en] = existing[en] || payload[ar]; });
  const saveButton = $("#editorSave");
  const saveLabel = saveButton.textContent;
  saveButton.disabled = true;
  saveButton.textContent = image?.size || video?.size ? "جاري الرفع…" : "جاري الحفظ…";
  try {
    if (image?.size) {
      const offerBranches = String(payload.branchIds || (existing.branchIds || []).join(",")).split(/[،,]/).map(value => value.trim()).filter(Boolean);
      const folder = collection === "offers" ? `offers/${offerBranches.length === 1 ? offerBranches[0] : "all"}` : collection === "content" ? `content/${payload.type}/${offerBranches[0]}` : collection;
      payload.imageUrl = await uploadImage(image, folder, collection === "content" ? percent => { saveButton.textContent = `جاري رفع الصورة ${percent}%`; } : null);
      if (collection === "content") { $("#editorFields [name=imageUrl]").value = payload.imageUrl; $("#editorFields [name=mediaFile]").value = ""; }
    }
    if (video?.size) {
      await validateVideoFile(video);
      saveButton.textContent = "جاري تجهيز صورة الفيديو…";
      let poster;
      try { poster = await createVideoPoster(video); }
      catch { throw new Error("الفيديو لا يعمل داخل المتصفح أو ترميزه غير مدعوم. اختر MP4 بترميز H.264 (وليس HEVC/MOV)"); }
      const folder = collection === "content" ? `content/${payload.type}/${String(payload.branchIds).split(",")[0]}` : `${collection}/posters`;
      payload.imageUrl = await uploadImage(poster, folder);
      saveButton.textContent = "جاري رفع الفيديو…";
      payload.videoUrl = await uploadVideo(video, collection === "content" ? folder : collection, collection === "content" ? percent => { saveButton.textContent = `جاري رفع الفيديو ${percent}%`; } : null);
      if (collection === "content") { $("#editorFields [name=videoUrl]").value = payload.videoUrl; $("#editorFields [name=imageUrl]").value = payload.imageUrl; $("#editorFields [name=mediaFile]").value = ""; }
      payload.mediaType = "video";
    }
    if (collection === "content" && (beforeFile?.size || afterFile?.size)) {
      const folder = `content/result/${String(payload.branchIds).split(",")[0]}`;
      if (beforeFile?.size) payload.beforeImageUrl = await uploadImage(beforeFile, folder);
      if (afterFile?.size) payload.afterImageUrl = await uploadImage(afterFile, folder);
      if (payload.afterImageUrl) payload.imageUrl = payload.afterImageUrl;
      for (const name of ["before", "after"]) if (payload[`${name}ImageUrl`]) { $("#editorFields [name=" + name + "ImageUrl]").value = payload[`${name}ImageUrl`]; $("#editorFields [name=" + name + "File]").value = ""; }
      if (payload.imageUrl) $("#editorFields [name=imageUrl]").value = payload.imageUrl;
    }
    await saveEntity(collection, id, payload);
    $("#editorDialog").close();
    await loadCollection(collection, true);
    if (state.section === "mobileContent") renderMobileContent();
    if (["inventoryItems", "drinks", "staff"].includes(collection)) await loadBusiness(true);
    toast("تم الحفظ بنجاح");
  } catch (error) { toast(error.message || "تعذر الحفظ", true); }
  finally { saveButton.disabled = false; saveButton.textContent = saveLabel; }
}

async function deleteItem(collection, id) {
  if (!confirm("هل تريد حذف هذا العنصر؟ لا يمكن التراجع بعد الحذف.")) return;
  try { await deleteEntity(collection, id); await loadCollection(collection, true); if (state.section === "mobileContent") renderMobileContent(); if (["inventoryItems", "drinks", "staff", "reviews"].includes(collection)) await loadBusiness(true); toast("تم الحذف"); }
  catch (error) { toast(error.message || "تعذر الحذف", true); }
}

function openSecureDelete(kind, id, label) {
  if (state.role !== "admin") return toast("الحذف النهائي متاح للأدمن فقط", true);
  state.secureDelete = { kind, id, label };
  $("#secureDeleteMessage").textContent = `سيتم حذف ${label} نهائيًا وتحديث الحسابات المرتبطة به. هذه العملية لا يمكن التراجع عنها.`;
  $("#secureDeletePassword").value = "";
  $("#secureDeleteReason").value = "";
  $("#secureDeleteDialog").showModal();
  setTimeout(() => $("#secureDeletePassword").focus(), 50);
}

function closeSecureDelete() {
  if ($("#secureDeleteDialog").open) $("#secureDeleteDialog").close();
  $("#secureDeletePassword").value = "";
  $("#secureDeleteReason").value = "";
  state.secureDelete = { kind: "", id: "", label: "" };
}

function secureDeleteError(error) {
  const code = String(error?.code || "");
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("invalid-login-credentials")) return "باسورد الأدمن غير صحيح";
  if (code.includes("too-many-requests")) return "محاولات كثيرة؛ انتظر قليلًا ثم حاول مرة أخرى";
  if (code.includes("unauthenticated")) return "انتهت صلاحية التأكيد؛ اكتب الباسورد مرة أخرى";
  return error?.message || "تعذر تنفيذ الحذف";
}

async function submitSecureDelete(event) {
  event.preventDefault();
  const password = $("#secureDeletePassword").value;
  const reason = $("#secureDeleteReason").value.trim();
  const pending = { ...state.secureDelete };
  if (!pending.id || !password || (["booking", "expense"].includes(pending.kind) && !reason)) return toast("اكتب سبب الحذف لتسجيل العملية", true);
  $("#secureDeleteConfirm").disabled = true;
  try {
    await verifyAdminPassword(password);
    await secureDeleteRecord(pending.kind, pending.id, reason);
    closeSecureDelete();
    if (pending.kind === "expense" && state.editingExpenseId === pending.id) resetExpenseForm();
    await loadDashboard();
    if (pending.kind === "expense") await loadBusiness(true);
    if (pending.kind === "user") { await loadCollection("users", true); renderUserAccounts(); }
    if (state.collections.has("customers")) await loadCollection("customers", true);
    toast(pending.kind === "booking" ? "تم حذف الحجز وتحديث بيانات العميل والإيرادات" : pending.kind === "expense" ? "تم حذف المصروف وتحديث صافي الربح" : pending.kind === "user" ? "تم حذف حساب العامل وصلاحياته نهائيًا" : "تم حذف عملية الإيراد وتحديث الحسابات");
  } catch (error) { toast(secureDeleteError(error), true); }
  finally { $("#secureDeleteConfirm").disabled = false; }
}

async function toggleItem(collection, id) {
  const item = (state.collections.get(collection) || []).find(value => value.id === id);
  if (!item) return;
  try { await saveEntity(collection, id, { active: item.active === false }); await loadCollection(collection, true); if (state.section === "mobileContent") renderMobileContent(); if (["inventoryItems", "drinks", "staff", "reviews"].includes(collection)) await loadBusiness(true); toast(item.active === false ? "تم التفعيل" : "تم الإيقاف"); }
  catch (error) { toast(error.message || "تعذر تعديل الحالة", true); }
}

async function updateReview(id, action, featured = false) {
  const payload = action === "publish" ? { status: "published" } : action === "reject" ? { status: "rejected", featured: false } : { featured: !featured };
  try { await saveEntity("reviews", id, payload); await loadCollection("reviews", true); toast(action === "publish" ? "تم نشر التقييم على الموقع" : action === "reject" ? "تم رفض التقييم" : featured ? "تم إلغاء تثبيت التقييم" : "تم تثبيت التقييم كمميز"); }
  catch (error) { toast(error.message || "تعذر تحديث التقييم", true); }
}

function openRefundDialog(id) {
  const item = state.dashboard.bookings.find(value => value.id === id);
  if (!item || !canRefundBooking(item)) return toast("الاسترداد يتطلب مديرًا أو صلاحية استرداد، ومعاملة مدفوعة", true);
  const form = $("#cashierRefundForm");
  form.dataset.bookingId = id;
  form.elements.reason.value = "";
  $("#cashierRefundSummary").textContent = `${item.code || item.id} • ${money(item.total)} • ${paymentMethod(item.paymentMethod)}`;
  $("#cashierRefundDialog").showModal();
}

async function submitRefund(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.dataset.bookingId;
  const reason = form.elements.reason.value.trim();
  if (!reason) return form.reportValidity();
  if (!confirm(`تأكيد استرداد ${$("#cashierRefundSummary").textContent}؟`)) return;
  await withButtonBusy(form.querySelector('[type="submit"]'), async () => {
    if (await updateBookingAction(id, "refund", { reason })) { $("#cashierRefundDialog").close(); form.reset(); }
  });
}

async function updateBookingAction(id, action, options = {}) {
  if (action === "refund" && !options.reason) return openRefundDialog(id);
  const original = state.dashboard.bookings.find(value => value.id === id);
  const method = action === "refund" ? original?.paymentMethod : (($("#receiptDrawer")?.open ? $("#receiptDrawer").querySelector(`[data-payment-method="${CSS.escape(id)}"]`) : null) || document.querySelector(`[data-payment-method="${CSS.escape(id)}"]`))?.value || "cash";
  try {
    let reason = "";
    let idempotencyKey = "";
    if (["refund", "void"].includes(action)) {
      if (action === "void" && !confirm("تأكيد إلغاء الشيك غير المدفوع؟")) return;
      reason = action === "refund" ? options.reason.trim() : prompt("اكتب سبب العملية (إلزامي)")?.trim() || "";
      if (!reason) return toast("سبب العملية مطلوب", true);
      const operationKey = `${action}:${id}`;
      idempotencyKey = state.bookingActionKeys.get(operationKey) || crypto.randomUUID();
      state.bookingActionKeys.set(operationKey, idempotencyKey);
    }
    const item = state.dashboard.bookings.find(value => value.id === id);
    const wasPaid = item?.paymentStatus === "paid";
    const result = await changeBooking(id, action, method, reason, idempotencyKey);
    if (idempotencyKey) state.bookingActionKeys.delete(`${action}:${id}`);
    if (item) {
      if (["pending", "confirmed", "arrived", "no_show", "rejected", "cancelled", "completed", "void"].includes(action)) item.status = result.status || (action === "void" ? "cancelled" : action);
      if (action === "checkout") { item.status = "completed"; item.paymentStatus = "paid"; item.paymentMethod = method; }
      if (action === "markPaid") { item.paymentStatus = "paid"; item.paymentMethod = method; }
      if (action === "refund") item.paymentStatus = "refunded";
      if (action === "refund" && wasPaid) {
        const stats = state.dashboard.stats || (state.dashboard.stats = {});
        stats.paidCount = Math.max(0, Number(stats.paidCount || 0) - 1);
        stats.todayRevenue = Number(stats.todayRevenue || 0) - Number(item.total || 0);
        stats.monthRevenue = Number(stats.monthRevenue || 0) - Number(item.total || 0);
        stats.totalRevenue = Number(stats.totalRevenue || 0) - Number(item.total || 0);
        stats.monthNetProfit = Number(stats.monthNetProfit || 0) - Number(item.total || 0);
      }
      if (!wasPaid && ["checkout", "markPaid"].includes(action)) {
        const stats = state.dashboard.stats || (state.dashboard.stats = {});
        stats.unpaidCount = Math.max(0, Number(stats.unpaidCount || 0) - 1);
        stats.paidCount = Number(stats.paidCount || 0) + 1;
        stats.todayRevenue = Number(stats.todayRevenue || 0) + Number(item.total || 0);
        stats.monthRevenue = Number(stats.monthRevenue || 0) + Number(item.total || 0);
        stats.totalRevenue = Number(stats.totalRevenue || 0) + Number(item.total || 0);
        stats.monthNetProfit = Number(stats.monthNetProfit || 0) + Number(item.total || 0);
        stats.lastCollected = Number(item.total || 0);
      }
    }
    state.loadedAt.cashier = Date.now();
    renderDashboard();
    await refreshCashierOperations();
    if (state.section === "calendar") await loadCalendar(true);
    if ($("#receiptDrawer")?.open) openReceiptDrawer(id);
    toast(action === "checkout" ? "تم التحصيل وإكمال الحجز ونقله إلى السجل" : action === "markPaid" ? "تم تسجيل الدفع مرة واحدة" : action === "refund" ? "تم الاسترداد وعكس الآثار المالية والمخزون" : action === "void" ? "تم إلغاء الشيك مع تسجيل السبب" : action === "completed" ? "تم إكمال الحجز ونقله إلى السجل" : "تم تحديث حالة الحجز");
    return true;
  }
  catch (error) { toast(error.message || "تعذر تحديث الحجز", true); return false; }
}

async function promptRescheduleBooking(id) {
  const item = state.dashboard.bookings.find(value => value.id === id);
  if (!item) return;
  const date = prompt("التاريخ الجديد YYYY-MM-DD", item.bookingDate || cairoDateKey())?.trim();
  if (!date) return;
  const time = prompt("الوقت الجديد HH:MM", item.bookingTime || "11:00")?.trim();
  if (!time) return;
  const staffId = prompt("معرّف العامل", item.staffId || "")?.trim();
  if (!staffId || !confirm(`تأكيد نقل الحجز إلى ${date} الساعة ${time}؟`)) return;
  try {
    const result = await rescheduleBooking({ id, date, time, staffId, requestId: crypto.randomUUID() });
    Object.assign(item, { bookingDate: result.date, bookingTime: result.time, staffId: result.workerId, staffNameAr: result.workerNameAr });
    renderDashboard();
    toast("تم تأمين الموعد الجديد ثم تحرير الموعد القديم");
  } catch (error) { toast(error.message || "تعذر إعادة الجدولة", true); }
}

function fillSettings(item) {
  [$("#scheduleSettings"), $("#contactSettings"), $("#siteSettings"), $("#rewardsSettings")].forEach(form => {
    if (!form) return;
    [...form.elements].forEach(input => { if (input.name && item[input.name] != null) input.value = input.name === "whatsappMarketingTemplates" ? JSON.stringify(item[input.name], null, 2) : item[input.name]; });
  });
}

async function saveSettingsForm(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"], button:not([type])');
  if (button?.disabled) return;
  if (button) button.disabled = true;
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  const existing = (state.collections.get("settings") || [])[0] || {};
  if (payload.businessNameAr != null) payload.businessNameEn = existing.businessNameEn || payload.businessNameAr;
  if (payload.aboutAr != null) payload.aboutEn = existing.aboutEn || payload.aboutAr;
  if (payload.whatsappMarketingTemplates != null) { try { payload.whatsappMarketingTemplates = JSON.parse(payload.whatsappMarketingTemplates || "[]"); } catch { return toast("صيغة JSON لقوالب واتساب غير صحيحة", true); } }
  try { await saveEntity("settings", "public", payload); await loadCollection("settings", true); toast("تم حفظ الإعدادات"); }
  catch (error) { toast(error.message || "تعذر الحفظ", true); }
  finally { if (button) button.disabled = false; }
}

function exportCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function detectNewBookings(items) {
  const active = items.filter(item => item.source !== "pos" && ["pending", "confirmed"].includes(item.status));
  if (!state.lastBookingIds.size) { state.lastBookingIds = new Set(active.map(item => item.id)); return; }
  const fresh = active.find(item => !state.lastBookingIds.has(item.id));
  active.forEach(item => state.lastBookingIds.add(item.id));
  if (state.lastBookingIds.size > 500) state.lastBookingIds = new Set([...state.lastBookingIds].slice(-300));
  if (fresh) notifyNewBooking(fresh);
}

let adminNotificationAudio;
function playAdminNotificationSound() {
  try {
    adminNotificationAudio ||= new AudioContext();
    if (adminNotificationAudio.state === "suspended") void adminNotificationAudio.resume();
    [0, .13].forEach((delay, index) => {
      const oscillator = adminNotificationAudio.createOscillator();
      const gain = adminNotificationAudio.createGain();
      const startsAt = adminNotificationAudio.currentTime + delay;
      oscillator.frequency.value = index ? 1046 : 784;
      gain.gain.setValueAtTime(.0001, startsAt);
      gain.gain.exponentialRampToValueAtTime(.075, startsAt + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, startsAt + .12);
      oscillator.connect(gain).connect(adminNotificationAudio.destination);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + .13);
    });
  } catch {}
}
document.addEventListener("pointerdown", () => {
  try { adminNotificationAudio ||= new AudioContext(); if (adminNotificationAudio.state === "suspended") void adminNotificationAudio.resume(); } catch {}
}, { once: true, passive: true });

function notifyNewBooking(item = {}) {
  toast(`حجز جديد: ${item.customerName || "عميل"} • ${item.bookingTime || ""} • ${item.code || ""}`);
  if ("Notification" in window && Notification.permission === "granted") new Notification("حجز جديد وصل الآن", { body: `${item.customerName || "عميل"} • ${item.bookingTime || ""} • ${branchLabel(item.branchId)}`, icon: "/assets/el-mezaen-logo.jpeg", tag: item.id || item.code || "booking" });
  playAdminNotificationSound();
}

let pushRegistrationReady = false;
let pushSyncing = false;
let pushConnectionPromise;
const connectAdminPush = () => pushConnectionPromise ||= enablePush().finally(() => { pushConnectionPromise = null; });
function renderAdminAlerts() {
  const stats = state.dashboard.stats || {};
  const alerts = [];
  if (Number(stats.unpaidCount || 0) > 0 && canOpenSection("bookings")) alerts.push({ type: "warning", title: `${Number(stats.unpaidCount)} عملية غير مدفوعة`, body: "راجع الحجوزات والشيكات المفتوحة.", section: "bookings" });
  if (Number(stats.lowStockCount || 0) > 0 && canOpenSection("inventory")) alerts.push({ type: "danger", title: `${Number(stats.lowStockCount)} صنف منخفض المخزون`, body: "راجع حد إعادة الطلب قبل نفاد الصنف.", section: "inventory" });
  if (Number(stats.openShifts || 0) === 0 && canOpenSection("cash")) alerts.push({ type: "warning", title: "لا توجد وردية كاش مفتوحة", body: "افتح الوردية قبل بدء التحصيل النقدي.", section: "cash" });
  if (Number(stats.noShowToday || 0) > 0 && canOpenSection("bookings")) alerts.push({ type: "info", title: `${Number(stats.noShowToday)} حالة عدم حضور اليوم`, body: "راجع الحجوزات والعملاء المتأثرين.", section: "bookings" });
  const now = cairoDateKey();
  const currentTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const bookingNotices = canOpenSection("bookings") ? (state.dashboard.bookings || [])
    .filter(item => item.source !== "pos" && (item.status === "pending" || (item.status === "confirmed" && item.bookingDate === now) || (item.status === "no_show" && item.bookingDate === now)))
    .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || `${a.bookingDate || ""} ${a.bookingTime || ""}`.localeCompare(`${b.bookingDate || ""} ${b.bookingTime || ""}`))
    .slice(0, 15) : [];
  const count = $("#adminAlertsCount");
  if (count) { count.textContent = String(bookingNotices.length); count.hidden = bookingNotices.length === 0; count.setAttribute("aria-label", `${bookingNotices.length} حجوزات للمتابعة`); }
  if ($("#adminAlertsNewCount")) $("#adminAlertsNewCount").textContent = `${bookingNotices.length} حجوزات للمتابعة`;
  const target = $("#adminAlertsList");
  if (target) target.innerHTML = bookingNotices.map(item => { const attention = item.status === "pending" ? item.source === "website" ? "حجز جديد من الموقع · يحتاج تأكيد" : "يحتاج تأكيد" : item.status === "no_show" ? "لم يحضر · متابعة" : item.bookingTime < currentTime ? "موعد متأخر" : "موعد اليوم"; return `<button type="button" class="admin-alert-item booking-notice" data-calendar-booking="${escapeAttr(item.id)}"><b>${escapeHtml(item.customerName || "عميل")} <small>${escapeHtml(attention)}</small></b><span>${escapeHtml(item.phone || "")} · ${escapeHtml(item.bookingDate || "—")} ${escapeHtml(item.bookingTime || "")} · ${escapeHtml(branchLabel(item.branchId))} · ${Number(item.serviceNamesAr?.length || 0)} خدمات</span></button>`; }).join("") || '<p class="empty-state">لا توجد إشعارات حجوزات في السجلات المحمّلة.</p>';
  const preview = $("#dashboardAlertsPreview");
  if (preview) preview.innerHTML = alerts.slice(0, 3).map(item => `<button type="button" class="admin-alert-item ${item.type}" data-go="${escapeAttr(item.section)}"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.body)}</span></button>`).join("") || '<p class="empty-state">لا توجد تنبيهات تشغيلية حاليًا.</p>';
  const health = $("#pushHealth");
  if (health) {
    const permission = "Notification" in window ? Notification.permission : "unsupported";
    health.hidden = permission === "granted" && pushRegistrationReady;
    health.innerHTML = health.hidden ? "" : `<b>${permission === "granted" ? "الإذن متاح ويحتاج إعادة ربط" : permission === "denied" ? "إشعارات المتصفح محظورة" : permission === "default" ? "إشعارات المتصفح لم تُفعّل بعد" : "المتصفح لا يدعم الإشعارات"}</b><span>تظل إشعارات الحجوزات داخل اللوحة متاحة هنا.</span>`;
  }
}
function syncPushButtons() {
  const supported = "Notification" in window && "serviceWorker" in navigator;
  const permission = supported ? Notification.permission : "unsupported";
  const copy = pushSyncing ? "جارٍ ربط الإشعارات…" : permission === "granted" && pushRegistrationReady ? "الإشعارات مفعلة" : permission === "granted" ? "إعادة ربط الإشعارات" : permission === "denied" ? "الإشعارات محظورة من إعدادات المتصفح" : permission === "default" ? "تفعيل الإشعارات" : "الإشعارات غير مدعومة";
  const disabled = pushSyncing || ["denied", "unsupported"].includes(permission);
  const mobile = $("#mobilePushButton");
  if (mobile) {
    const label = mobile.querySelector("span"); if (label) label.textContent = copy;
    mobile.disabled = disabled;
    mobile.toggleAttribute("aria-busy", pushSyncing);
    mobile.dataset.permission = permission;
  }
  const desktop = $("#pushButton");
  if (desktop) {
    desktop.disabled = false;
    desktop.title = "إشعارات الحجوزات";
    desktop.setAttribute("aria-label", "إشعارات الحجوزات");
    desktop.dataset.permission = permission;
  }
  renderAdminAlerts();
}

async function testLocalNotification(button) {
  if (!("Notification" in window)) return toast("الإشعارات غير مدعومة في هذا المتصفح", true);
  if (Notification.permission !== "granted") await requestAdminPush(button);
  if (Notification.permission !== "granted") return;
  new Notification("اختبار إشعارات مزين مصر", { body: "هذا الجهاز جاهز لاستقبال تنبيهات لوحة الإدارة.", icon: "/assets/icon-192.png", tag: "admin-notification-test" });
  playAdminNotificationSound();
  toast("تم إرسال إشعار اختبار محلي لهذا الجهاز");
}

async function requestAdminPush(button) {
  if (!("Notification" in window)) return toast("الإشعارات غير مدعومة في هذا المتصفح", true);
  if (Notification.permission === "denied") return toast("الإشعارات محظورة من إعدادات المتصفح", true);
  if (pushSyncing) return;
  pushSyncing = true;
  syncPushButtons();
  try { await connectAdminPush(); pushRegistrationReady = true; toast("تم تفعيل الإشعارات وربط هذا الجهاز"); }
  catch (error) {
    const message = ({ PUSH_NOT_CONFIGURED: "الإشعارات غير متاحة على هذا المتصفح أو إعداداتها غير مكتملة", PUSH_DENIED: "الإشعارات محظورة من إعدادات المتصفح", PUSH_TOKEN_FAILED: "تعذر إنشاء رمز الإشعارات؛ أعد المحاولة" })[error.message] || error.message || "تعذر تفعيل الإشعارات الآن";
    toast(message, true);
  }
  finally { pushSyncing = false; syncPushButtons(); }
}

async function handlePushButton(button) {
  if (state.role === "cashier" && Date.now() - state.loadedAt.cashier > 30_000) await loadCashierDashboard(true);
  else if (state.role !== "cashier" && Date.now() - state.loadedAt.dashboard > 30_000) await loadDashboard(true);
  renderAdminAlerts();
  if (!$("#adminAlertsDialog").open) $("#adminAlertsDialog").showModal();
}

function goBackInAdmin() {
  if (Math.max(0, Number(history.state?.adminDepth || 0)) > 0) return history.back();
  if (state.section !== "workspaceHome") return showWorkspaceHome({ historyMode: "replace" });
}

function statusLabel(value) { return ({ pending: "جديد", confirmed: "مؤكد", arrived: "وصل", no_show: "عدم حضور", rejected: "مرفوض", cancelled: "ملغي", completed: "مكتمل" })[value] || value || "—"; }
function paymentLabel(value) { return ({ unpaid: "لم يدفع", paid: "مدفوع", refunded: "مسترد" })[value] || value || "—"; }
function paymentMethod(value) { return ({ cash: "نقدي", card: "بطاقة", vodafone_cash: "فودافون كاش", instapay: "إنستاباي", other: "أخرى" })[value] || value || "—"; }
function emptyRow(columns) { return `<tr><td colspan="${columns}">لا توجد بيانات.</td></tr>`; }

async function withButtonBusy(button, task) {
  if (!button || button.disabled) return;
  const label = button.innerHTML;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span><span>جارٍ...</span>';
  try { return await task(); }
  finally { button.disabled = false; button.removeAttribute("aria-busy"); button.innerHTML = label; }
}

function renderAdminSearch() {
  const input = $("#adminGlobalSearch");
  const results = $("#adminSearchResults");
  const query = input.value.trim().toLowerCase();
  let canonicalQuery = ""; try { canonicalQuery = normalizePhone(query); } catch {}
  if (!query) { results.hidden = true; results.innerHTML = ""; return; }
  const sections = Object.entries(sectionTitles).filter(([id, label]) => $("#" + id) && (state.role === "admin" || state.permissions.has(id)) && label.toLowerCase().includes(query)).slice(0, 5);
  const customers = (state.collections.get("customers") || []).filter(item => [item.firstName, item.lastName, item.phone, `${item.firstName || ""} ${item.lastName || ""}`].some(value => String(value || "").toLowerCase().includes(query)) || (canonicalQuery && whatsappPhone(item.phone) === `2${canonicalQuery}`)).slice(0, 5);
  const operations = state.dashboard.bookings.filter(item => [item.code, item.customerName, item.phone].some(value => String(value || "").toLowerCase().includes(query))).slice(0, 6);
  results.innerHTML = sections.map(([id, label]) => `<button type="button" data-admin-search-section="${escapeAttr(id)}"><span>قسم</span><b>${escapeHtml(label)}</b></button>`).join("") + customers.map(item => `<button type="button" data-admin-search-customer="${escapeAttr(item.id)}"><span>عميل</span><b>${escapeHtml(`${item.firstName || ""} ${item.lastName || ""}`.trim() || item.phone)}</b><small>${escapeHtml(item.phone || "")}</small></button>`).join("") + operations.map(item => `<button type="button" data-admin-search-operation="${escapeAttr(item.id)}" data-operation-kind="${item.source === "pos" ? "pos" : "booking"}"><span>${item.source === "pos" ? "شيك" : "حجز"}</span><b>${escapeHtml(item.code || item.id)}</b><small>${escapeHtml(item.customerName || item.phone || "")}</small></button>`).join("") || '<p>لا توجد نتيجة. جرّب اسم قسم أو رقم عميل أو شيك أو حجز.</p>';
  results.hidden = false;
}

document.addEventListener("click", async event => {
  const cashierJump = event.target.closest("[data-cashier-jump]");
  if (cashierJump && state.role === "cashier") {
    if (state.section !== "calendar") await showSection("calendar");
    (cashierJump.dataset.cashierJump === "tasks" ? $("#cashierTaskForm") : $("#cashierTeamGrid"))?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (cashierJump.dataset.cashierJump === "tasks") $("#cashierTaskForm")?.closest("details")?.setAttribute("open", "");
    return;
  }
  const workerJump = event.target.closest("[data-worker-jump]");
  if (workerJump && state.role === "worker") {
    if (state.section !== "worker") await showSection("worker");
    const target = ({ attendance: ".worker-attendance-card", bookings: ".worker-bookings-panel", tasks: ".worker-tasks-panel", profile: ".worker-profile-card" })[workerJump.dataset.workerJump];
    $(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (event.target.closest("#ownerBranchOpen, #managerBranchOpen") && ["admin", "manager"].includes(state.role)) {
    $$("[data-owner-branch]").forEach(button => { button.hidden = state.role === "manager" && (button.dataset.ownerBranch === "all" ? state.branchIds.length < 2 : !state.branchIds.includes(button.dataset.ownerBranch)); });
    $("#ownerBranchSheet").showModal();
  }
  const ownerBranch = event.target.closest("[data-owner-branch]");
  if (ownerBranch && ["admin", "manager"].includes(state.role)) {
    const branchId = ownerBranch.dataset.ownerBranch;
    if (state.role === "manager" && (branchId === "all" ? state.branchIds.length < 2 : !state.branchIds.includes(branchId))) return toast("هذا الفرع غير مصرح به", true);
    $("#ownerBranchSheet").close();
    if (branchId !== $("#dashboardBranchFilter").value) {
      ++dashboardRequestVersion; ++calendarRequestVersion; ++teamRequestVersion; ++attendanceRequestVersion;
      ++ownerHistoryVersion;
      state.dashboard = { bookings: [], ledger: [], expenses: [], stats: {} };
      $("#ownerMonthRevenue").textContent = $("#ownerMonthTransactions").textContent = $("#ownerMonthAverage").textContent = $("#ownerMonthCustomers").textContent = "—";
      $("#ownerSalesCards").textContent = $("#ownerExpenseCards").textContent = "جاري تحميل الفرع…";
      $("#ownerBranchLabel").textContent = branchLabel(branchId);
      $("#managerBranchLabel").textContent = branchLabel(branchId);
      $("#dashboardBranchFilter").value = branchId;
      $("#headerBranchFilter").value = branchId;
      $("#calendarBranchFilter").value = branchId;
      $("#bookingBranchFilter").value = branchId;
      $("#attendanceBranch").value = branchId;
      if ($("#revenueBranch")) $("#revenueBranch").value = branchId;
      if ($("#expenseBranchFilter")) $("#expenseBranchFilter").value = branchId;
      if (branchId !== "all" && $("#expenseBranch")) $("#expenseBranch").value = branchId;
      await loadDashboard();
      if (state.section === "expenses") renderExpenses();
      if (state.section === "revenue") renderRevenue();
      if (state.section === "calendar") await loadCalendar();
      if (state.section === "attendance") await loadAttendance();
      if (["revenue", "expenses"].includes(state.section)) await loadOwnerHistory(state.section === "revenue" ? "sales" : "expenses");
    }
  }
  if (event.target.closest("[data-cashier-more]") && state.role === "cashier") { $("#cashierMoreSheet").showModal(); return; }
  if (event.target.closest("[data-cashier-password]") && state.role === "cashier") { $("#cashierMoreSheet").close(); $("#staffPasswordDialog").showModal(); return; }
  if (event.target.closest("#ownerMoreNotifications")) return void $("#pushButton").click();
  if (event.target.closest("#mobileContentAdd")) return void $("#mobileContentTypes").showModal();
  const contentTypeButton = event.target.closest("[data-mobile-content-create]");
  if (contentTypeButton) {
    const type = contentTypeButton.dataset.mobileContentCreate;
    if (!canManageContent(type)) return toast("لا تملك صلاحية هذا النوع من المحتوى", true);
    $("#mobileContentTypes").close();
    const branch = $("#dashboardBranchFilter").value;
    openEditor(type === "offer" ? "offers" : "content", "", type === "offer" ? { branchIds: [branch === "all" ? (state.branchIds[0] || "talkha") : branch] } : { type, branchIds: [branch === "all" ? (state.branchIds[0] || "talkha") : branch], mediaType: type === "hair-system" ? "video" : "image" });
    return;
  }
  const saleDetail = event.target.closest("[data-owner-sale-detail]");
  if (saleDetail) {
    const row = ownerHistory.sales.items.find(item => item.id === saleDetail.dataset.ownerSaleDetail);
    if (!row) return;
    $("#receiptDrawerTitle").textContent = row.bookingCode || row.id;
    $("#receiptDrawerBody").innerHTML = `<dl class="receipt-details"><div><dt>العميل</dt><dd>${escapeHtml(row.customerName || "—")}</dd></div><div><dt>الفرع</dt><dd>${escapeHtml(branchLabel(row.branchId))}</dd></div><div><dt>الخدمات</dt><dd>${escapeHtml((row.itemNames || []).join("، ") || "—")}</dd></div><div><dt>التاريخ</dt><dd>${escapeHtml(dateTime(row.createdAt))}</dd></div><div><dt>طريقة الدفع</dt><dd>${escapeHtml(paymentMethod(row.paymentMethod))}</dd></div><div><dt>النوع</dt><dd>${row.type === "refund" ? "استرداد" : "دفع"}</dd></div><div><dt>القيمة</dt><dd>${money(row.amount)}</dd></div></dl>`;
    $("#receiptDrawer").showModal(); return;
  }
  const previewContent = event.target.closest("[data-content-preview]");
  if (previewContent) {
    const [collection, id] = previewContent.dataset.contentPreview.split(":");
    const row = (state.collections.get(collection) || []).find(item => item.id === id);
    if (!row || (collection === "content" && !canManageContent(row.type)) || (collection === "offers" && !canManageContent("offer"))) return;
    const media = row.beforeImageUrl && row.afterImageUrl ? `<div class="editor-before-after"><figure><img src="${escapeAttr(safeMediaUrl(row.beforeImageUrl))}" alt="قبل"><figcaption>قبل</figcaption></figure><figure><img src="${escapeAttr(safeMediaUrl(row.afterImageUrl))}" alt="بعد"><figcaption>بعد</figcaption></figure></div>` : row.videoUrl ? `<video src="${escapeAttr(videoSource(row.videoUrl).kind === "direct" ? videoSource(row.videoUrl).url : "")}" poster="${escapeAttr(safeMediaUrl(row.imageUrl))}" controls playsinline preload="metadata"></video>` : row.imageUrl ? `<img src="${escapeAttr(safeMediaUrl(row.imageUrl))}" alt="${escapeAttr(row.titleAr || row.nameAr)}">` : "";
    $("#mobileContentPreviewBody").innerHTML = `${media}<h3>${escapeHtml(row.titleAr || row.nameAr || "")}</h3><p>${escapeHtml(row.bodyAr || row.descriptionAr || "")}</p><small>${escapeHtml(branchScopeLabel(row.branchIds))} • ${row.active === false ? "مسودة / مخفي" : "منشور"}</small>`;
    $("#mobileContentPreview").showModal(); return;
  }
  const adminBack = event.target.closest("[data-admin-back]"); if (adminBack) return goBackInAdmin();
  const workspaceHome = event.target.closest("[data-open-workspace-home]"); if (workspaceHome) return showWorkspaceHome();
  const hub = event.target.closest("[data-open-hub]"); if (hub) return withButtonBusy(hub, () => openHub(hub.dataset.openHub));
  const shiftShortcut = event.target.closest(".sidebar-end-shift"); if (shiftShortcut) {
    if (!canOpenSection("cash")) return;
    state.hub = "management"; $("#adminApp").dataset.hub = "management"; applyAccess();
    return withButtonBusy(shiftShortcut, async () => {
      const selected = $("#dashboardBranchFilter")?.value;
      if (selected && selected !== "all" && state.branchIds.includes(selected)) $("#openShiftForm [name=branchId]").value = selected;
      await showSection("cash");
      if (!state.loadedAt.cash) return toast("تعذر تحميل حالة الوردية؛ أعد المحاولة", true);
      if (state.cash.state?.status === "OPEN" && state.cash.shift?.status === "OPEN") openCloseShiftDialog();
      else $("#openShiftDialog").showModal();
    });
  }
  const startShift = event.target.closest("[data-start-shift]"); if (startShift) { await showSection("cash"); if (state.loadedAt.cash && state.cash.state?.status !== "OPEN") $("#openShiftDialog").showModal(); return; }
  const searchSection = event.target.closest("[data-admin-search-section]"); if (searchSection) { $("#adminSearchResults").hidden = true; $("#adminGlobalSearch").value = ""; await showSection(searchSection.dataset.adminSearchSection); }
  const searchCustomer = event.target.closest("[data-admin-search-customer]"); if (searchCustomer) { $("#adminSearchResults").hidden = true; $("#adminGlobalSearch").value = ""; await showSection("customers"); openCustomerDrawer(searchCustomer.dataset.adminSearchCustomer); }
  const searchOperation = event.target.closest("[data-admin-search-operation]"); if (searchOperation) { $("#adminSearchResults").hidden = true; $("#adminGlobalSearch").value = ""; if (searchOperation.dataset.operationKind === "pos") { await showSection("pos"); setPosView("receipts"); $("#posReceiptSearch").value = searchOperation.querySelector("b")?.textContent || ""; renderPosReceipts(); } else { await showSection("bookings"); $("#bookingSearch").value = searchOperation.querySelector("b")?.textContent || ""; renderBookings(); } }
  const section = event.target.closest("[data-section]"); if (section) await withButtonBusy(section, async()=>{if (section.dataset.section === "expenses") state.expenseInventoryKind = "all";await showSection(section.dataset.section)});
  const publicBooking = event.target.closest("[data-open-public-booking]"); if (publicBooking) { window.open("/booking/", "_blank", "noopener"); return; }
  const todayBookings = event.target.closest("[data-booking-today]"); if (todayBookings) { $("#bookingDateFilter").value = cairoDateKey(); renderBookings(); return; }
  const cashShortcut = event.target.closest("[data-cash-shortcut]"); if (cashShortcut) { await showSection("cash"); $(`[data-cash-movement="${cashShortcut.dataset.cashShortcut}"]`)?.click(); return; }
  const cashierPayments = event.target.closest("[data-cashier-payments]"); if (cashierPayments) { await showSection("bookings"); $("#bookingPaymentFilter").value = "unpaid"; $("#bookingStatusFilter").value = "active"; renderBookings(); return; }
  const go = event.target.closest("[data-go]"); if (go) { go.closest("dialog")?.close(); await withButtonBusy(go,()=>showSection(go.dataset.go)); }
  const cashierTarget = event.target.closest("[data-cashier-target]"); if (cashierTarget) await withButtonBusy(cashierTarget, openCashierTargets);
  const todayCalendar = event.target.closest("[data-calendar-today]"); if (todayCalendar) { $("#calendarDate").value = cairoDateKey(); $("#calendarView").value = "day"; await loadCalendar(); }
  const cashMovement = event.target.closest("[data-cash-movement]"); if (cashMovement) {
    if (state.cash.state?.status !== "OPEN" || state.cash.shift?.status !== "OPEN") return toast("افتح الوردية أولًا", true);
    const type = cashMovement.dataset.cashMovement;
    const form = $("#cashMovementForm");
    const mode = type === "ADVANCE" ? "advance" : type;
    if (form.dataset.mode !== mode) form.dataset.key = "";
    form.dataset.mode = mode;
    form.elements.type.value = type === "ADVANCE" ? "CASH_OUT" : type;
    $("#advanceStaffRow").hidden = type !== "ADVANCE";
    $("#advanceStaff").required = type === "ADVANCE";
    form.elements.category.closest("label").hidden = type === "ADVANCE";
    $("#cashMovementTitle").textContent = type === "ADVANCE" ? "سلفة موظف" : type === "CASH_IN" ? "إضافة كاش" : "سحب كاش";
    form.querySelector('[type="submit"]').className = `small-button ${type === "CASH_IN" ? "success" : "danger"}`;
    $("#cashMovementDialog").showModal();
  }
  const openReceipts = event.target.closest("[data-open-receipts]"); if (openReceipts) await withButtonBusy(openReceipts, async () => { await showSection("pos"); setPosView("receipts"); });
  const newPos = event.target.closest("[data-new-pos]"); if (newPos) await withButtonBusy(newPos, openNewPosDraft);
  const installPackages = event.target.closest("[data-install-required-packages]"); if (installPackages) await installRequiredPackages(installPackages);
  const loadMore = event.target.closest("[data-load-more]"); if (loadMore) await loadMoreCollection(loadMore.dataset.loadMore, loadMore);
  const calendarBooking = event.target.closest("[data-calendar-booking]"); if (calendarBooking) { calendarBooking.closest("dialog")?.close(); await showSection("bookings"); $("#bookingSearch").value = calendarBooking.dataset.calendarBooking; $("#bookingStatusFilter").value = "all"; renderBookings(); }
  const posView = event.target.closest("#pos [data-pos-view]"); if (posView) setPosView(posView.dataset.posView);
  const add = event.target.closest("[data-new]"); if (add) openEditor(add.dataset.new, "", add.dataset.presetType ? { type: add.dataset.presetType, mediaType: add.dataset.presetMedia || "image" } : add.dataset.presetCategory ? { category: add.dataset.presetCategory } : {});
  const stockExpense = event.target.closest("[data-open-stock-expense]"); if (stockExpense) { state.expenseInventoryKind = stockExpense.dataset.openStockExpense; await showSection("expenses"); $("#expenseCategory").value = "inventory"; toggleExpenseInventory(); renderBusiness(); $("#expenseForm")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  const edit = event.target.closest("[data-edit-collection]"); if (edit) openEditor(edit.dataset.editCollection, edit.dataset.editId);
  const remove = event.target.closest("[data-delete-collection]"); if (remove) await withButtonBusy(remove,()=>deleteItem(remove.dataset.deleteCollection, remove.dataset.deleteId));
  const toggle = event.target.closest("[data-toggle-collection]"); if (toggle) await withButtonBusy(toggle,()=>toggleItem(toggle.dataset.toggleCollection, toggle.dataset.toggleId));
  const booking = event.target.closest("[data-booking-action]"); if (booking) await withButtonBusy(booking,()=>updateBookingAction(booking.dataset.bookingId, booking.dataset.bookingAction));
  const notify = event.target.closest("[data-notify-worker]"); if (notify) await sendWorkerAlert(notify);
  const assign = event.target.closest("[data-assign-booking]"); if (assign) { const select = document.querySelector(`[data-assign-worker-select="${CSS.escape(assign.dataset.assignBooking)}"]`); await assignBookingToWorker(assign.dataset.assignBooking, select?.value || "", assign); }
  const workerTaskStatus = event.target.closest("[data-worker-task-status]"); if (workerTaskStatus) await withButtonBusy(workerTaskStatus, async () => { await updateWorkerTask(workerTaskStatus.dataset.taskId, workerTaskStatus.dataset.workerTaskStatus); await loadWorkerWorkspace(); toast("تم تحديث حالة المهمة"); });
  const adminTaskCancel = event.target.closest("[data-admin-task-cancel]"); if (adminTaskCancel && confirm("إلغاء هذه المهمة؟")) await withButtonBusy(adminTaskCancel, async () => { await updateWorkerTask(adminTaskCancel.dataset.adminTaskCancel, "CANCELLED"); await loadAttendance(); toast("تم إلغاء المهمة"); });
  const reschedule = event.target.closest("[data-reschedule-booking]"); if (reschedule) await withButtonBusy(reschedule,()=>promptRescheduleBooking(reschedule.dataset.rescheduleBooking));
  const bookingPos = event.target.closest("[data-booking-pos]"); if (bookingPos) await withButtonBusy(bookingPos,()=>openBookingInPos(bookingPos.dataset.bookingPos));
  const printButton = event.target.closest("[data-print-booking]"); if (printButton) await withButtonBusy(printButton, () => printReceipt(printButton.dataset.printBooking));
  const reprintButton = event.target.closest("[data-reprint-booking]"); if (reprintButton) await withButtonBusy(reprintButton, () => printReceipt(reprintButton.dataset.reprintBooking));
  const reportTab = event.target.closest("[data-cashier-report-tab]"); if (reportTab) selectCashierReportTab(reportTab.dataset.cashierReportTab);
  const dialogClose = event.target.closest("[data-close-dialog]"); if (dialogClose) $("#" + dialogClose.dataset.closeDialog)?.close();
  const receipt=event.target.closest("[data-whatsapp-receipt]");if(receipt)await withButtonBusy(receipt,()=>openReceiptInWhatsapp(receipt.dataset.whatsappReceipt));
  const receiptDetails=event.target.closest("[data-open-receipt]");if(receiptDetails)openReceiptDrawer(receiptDetails.dataset.openReceipt);
  const manualOffer=event.target.closest("[data-manual-whatsapp-offer]");if(manualOffer)await withButtonBusy(manualOffer,()=>openManualWhatsappOffer(manualOffer.dataset.manualWhatsappOffer)).catch(error=>toast(error.message,true));
  const offerPreview=event.target.closest("[data-preview-offer]");if(offerPreview){const offer=(state.collections.get("offers")||[]).find(item=>item.id===offerPreview.dataset.previewOffer);if(offer)alert(`${offer.nameAr}\n${offer.descriptionAr||""}\n${branchScopeLabel(offer.branchIds)}\nالسعر: ${money(offer.newPrice)}`);}
  const bookOffer=event.target.closest("[data-book-offer]");if(bookOffer){const offer=(state.collections.get("offers")||[]).find(item=>item.id===bookOffer.dataset.bookOffer);const selected=$("#headerBranchFilter")?.value;const branchId=offer?.branchIds?.includes(selected)?selected:offer?.branchIds?.[0];if(offer&&branchId){sessionStorage.setItem("mz-repeat-booking",JSON.stringify({branchId,staffId:"any",items:[{id:offer.id,kind:"offer",qty:1}]}));location.href="/#services";}}
  const offerCampaign=event.target.closest("[data-offer-campaign]");if(offerCampaign){await showSection("campaigns");$("#campaignForm").elements.offerId.value=offerCampaign.dataset.offerCampaign;const selectedOffer=campaignOptions?.offers.find(item=>item.id===offerCampaign.dataset.offerCampaign);$("#campaignForm").elements.name.value=(selectedOffer?.nameAr||"عرض")+" — واتساب";if(selectedOffer)$("#campaignForm").elements.branchId.value=state.role==="admin"&&selectedOffer.branchIds?.length===2?"all":selectedOffer.branchIds?.[0]||"";}
  const prepareOffer=event.target.closest("[data-prepare-offer-messages]");if(prepareOffer)await withButtonBusy(prepareOffer,()=>prepareManualOfferMessages(prepareOffer.dataset.prepareOfferMessages));
  const offerRecipient=event.target.closest("[data-open-offer-recipient]");if(offerRecipient)await withButtonBusy(offerRecipient,()=>openManualOfferRecipient(offerRecipient.dataset.openOfferRecipient)).catch(error=>toast(error.message,true));
  if(event.target.closest("#manualOfferNext"))await withButtonBusy(event.target.closest("#manualOfferNext"),()=>openNextManualOfferRecipient()).catch(error=>toast(error.message,true));
  const loadOfferRecipients=event.target.closest("#manualOfferLoadMore");if(loadOfferRecipients)await withButtonBusy(loadOfferRecipients,()=>loadManualOfferRecipients(state.manualOffer.nextCursor));
  const openCustomer=event.target.closest("[data-open-customer]");if(openCustomer)openCustomerDrawer(openCustomer.dataset.openCustomer);
  const customerPos=event.target.closest("[data-customer-pos]");if(customerPos){$("#customerDrawer").close();await showSection("pos");$("#posCustomer").value=customerPos.dataset.customerPos;$("#posCustomer").dispatchEvent(new Event("change"))}
  const posCategory=event.target.closest("[data-pos-category]");if(posCategory){$("#posCategoryFilter").value=posCategory.dataset.posCategory;renderPos()}
  const deleteBooking = event.target.closest("[data-secure-delete-booking]"); if (deleteBooking) openSecureDelete("booking", deleteBooking.dataset.secureDeleteBooking, deleteBooking.dataset.secureDeleteLabel);
  const deleteRevenue = event.target.closest("[data-secure-delete-revenue]"); if (deleteRevenue) openSecureDelete("revenue", deleteRevenue.dataset.secureDeleteRevenue, deleteRevenue.dataset.secureDeleteLabel);
  const deleteExpense = event.target.closest("[data-secure-delete-expense]"); if (deleteExpense) openSecureDelete("expense", deleteExpense.dataset.secureDeleteExpense, deleteExpense.dataset.secureDeleteLabel);
  const deleteUser = event.target.closest("[data-secure-delete-user]"); if (deleteUser) openSecureDelete("user", deleteUser.dataset.secureDeleteUser, deleteUser.dataset.secureDeleteLabel);
  const editUserAccess = event.target.closest("[data-edit-user-access]"); if (editUserAccess) openAccessEditor(editUserAccess.dataset.editUserAccess);
  const editExpense = event.target.closest("[data-edit-expense]"); if (editExpense) startExpenseEdit(editExpense.dataset.editExpense);
  const posAdd = event.target.closest("[data-pos-add]"); if (posAdd) addPosItem(posAdd.dataset.posAdd, posAdd.dataset.posKind);
  const posRemove = event.target.closest("[data-pos-remove]"); if (posRemove) { state.posCart = state.posCart.filter(line => line.id !== posRemove.dataset.posRemove || line.kind !== posRemove.dataset.posKind); renderPosCart(); }
  const serviceCategory = event.target.closest("[data-service-category]"); if (serviceCategory) { $("#serviceCategoryFilter").value = serviceCategory.dataset.serviceCategory; renderCollection("services"); $(".services-column")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  const salary = event.target.closest("[data-pay-salary]"); if (salary) await withButtonBusy(salary,()=>paySalary(salary.dataset.paySalary));
  const editServiceTarget = event.target.closest("[data-edit-service-target]"); if (editServiceTarget) {
    const item = (state.business.serviceTargets || []).find(value => value.id === editServiceTarget.dataset.editServiceTarget);
    const form = $("#serviceTargetForm");
    if (item && form) { form.elements.branchId.value = item.branchId; form.elements.kind.value = item.kind; refreshServiceTargetItems(item.itemId); form.elements.targetCount.value = item.targetCount; form.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }
  const review = event.target.closest("[data-review-action]"); if (review) await withButtonBusy(review,()=>updateReview(review.dataset.reviewId, review.dataset.reviewAction, review.dataset.reviewFeatured === "true"));
  const wallet=event.target.closest("[data-wallet-adjust]");if(wallet){const points=Number(prompt("تعديل النقاط (+ أو -)","0")||0);const cashback=Number(prompt("تعديل الكاش باك (+ أو -)","0")||0);const reason=prompt("سبب التعديل")||"";if(reason&&(points||cashback))await withButtonBusy(wallet,async()=>{try{await adjustCustomerWallet({customerId:wallet.dataset.walletAdjust,points,cashback,reason,idempotencyKey:crypto.randomUUID()});await loadCollection("customers",true);toast("تم تعديل المحفظة وتسجيل الحركة")}catch(error){toast(error.message||"تعذر التعديل",true)}})}
  const rotateQr=event.target.closest("[data-rotate-customer-qr]");if(rotateQr){const reason=prompt("سبب إلغاء QR القديم وإصدار كود جديد")||"";if(reason&&confirm("سيصبح QR القديم غير صالح فورًا. هل تريد المتابعة؟"))await withButtonBusy(rotateQr,async()=>{try{await rotateCustomerQr({customerId:rotateQr.dataset.rotateCustomerQr,reason,requestId:crypto.randomUUID()});await openCustomerDrawer(rotateQr.dataset.rotateCustomerQr);toast("تم إلغاء QR القديم وإصدار كود جديد")}catch(error){toast(error.message||"تعذر تجديد QR",true)}})}
  const campaignRecipients=event.target.closest("[data-campaign-recipients], [data-more-campaign-recipients]");if(campaignRecipients)await withButtonBusy(campaignRecipients,()=>showCampaignRecipients(campaignRecipients.dataset.campaignRecipients||campaignRecipients.dataset.moreCampaignRecipients,campaignRecipients.dataset.cursor||"")).catch(error=>toast(error.message,true));
  const campaignAction=event.target.closest("[data-campaign-action]");if(campaignAction)await withButtonBusy(campaignAction,async()=>{try{await updateWhatsappCampaignState(campaignAction.dataset.campaignId,campaignAction.dataset.campaignAction);await loadCollection("campaigns",true);renderCampaigns();toast("تم تحديث الحملة")}catch(error){toast(error.message,true)}});
  const consent=event.target.closest("[data-whatsapp-consent]");if(consent){const optedIn=consent.dataset.currentConsent!=="true";if(confirm(optedIn?"أكد أن العميل وافق صراحة على رسائل واتساب التسويقية":"إلغاء موافقة العميل على التسويق؟"))await withButtonBusy(consent,async()=>{try{await updateWhatsappConsent(consent.dataset.whatsappConsent,optedIn);await loadCollection("customers",true);toast("تم تحديث الموافقة وحفظ سجلها")}catch(error){toast(error.message,true)}})}
});
document.addEventListener("input", event => {
  if (event.target.id === "manualOfferMessage") state.manualOffer.message = event.target.value;
  if (event.target.id === "adminGlobalSearch") renderAdminSearch();
  if (event.target.matches("[data-entity-search]")) renderCollection(event.target.dataset.entitySearch);
  if (event.target.id === "posReceiptSearch") renderPosReceipts();
  if (event.target.id === "dashboardOperationSearch") { dashboardPage = 1; renderRecentOperations(); }
  if (event.target.id === "posItemSearch" || event.target.id === "posDiscount") event.target.id === "posItemSearch" ? renderPos() : renderPosCart();
  if (event.target.matches("[data-pos-qty]")) { const line = state.posCart.find(item => item.id === event.target.dataset.posQty && item.kind === event.target.dataset.posKind); if (line) { const catalogItem = posCatalogItems().find(item => item.id === line.id && item.kind === line.kind); const max = line.kind === "inventory" ? Math.max(1, Number(catalogItem?.stockQty || 1)) : 20; line.qty = Math.max(1, Math.min(max, Math.floor(Number(event.target.value || 1)))); renderPosCart(); } }
});
document.addEventListener("change", async event => {
  if (event.target.id === "customerSegmentFilter") renderCollection("customers");
  if(event.target.matches("[data-pos-worker]")){const line=state.posCart.find(item=>item.id===event.target.dataset.posWorker&&item.kind===event.target.dataset.posKind);if(line)line.workerId=event.target.value}
  if (event.target.matches("[data-pos-option]")) { const line = state.posCart.find(item => item.id === event.target.dataset.posOption && item.kind === event.target.dataset.posKind); if (line) { line.option = event.target.value; renderPosCart(); } }
  if (event.target.matches("[data-pos-choice]")) { const line = state.posCart.find(item => item.id === event.target.dataset.posChoice && item.kind === event.target.dataset.posKind); if (line) { line.choices ||= {}; if (event.target.value) line.choices[event.target.dataset.choiceGroup] = event.target.value; else delete line.choices[event.target.dataset.choiceGroup]; } }
  if (["expenseFrom", "expenseTo", "expenseBranchFilter", "expenseCategoryFilter"].includes(event.target.id)) renderExpenses();
  if (event.target.id === "expenseBranch") refreshExpenseInventoryOptions();
  if (["serviceTargetKind", "serviceTargetBranch"].includes(event.target.id)) refreshServiceTargetItems();
  if (["serviceTargetBranchFilter", "serviceTargetItemFilter"].includes(event.target.id)) renderServiceTargets();
  if (event.target.id === "taskBranch") renderAdminTasks();
  if (event.target.id === "dashboardBranchFilter") { dashboardPage = 1; $("#headerBranchFilter").value = event.target.value; $("#calendarBranchFilter").value = event.target.value; [$("#dashboardTargetBranch"), $("#desktopTargetBranch")].filter(Boolean).forEach(targetBranch => { if ([...targetBranch.options].some(option => option.value === event.target.value)) targetBranch.value = event.target.value; }); void loadDashboard(); }
  if (event.target.id === "headerBranchFilter") {
    $("#dashboardBranchFilter").value = event.target.value;
    $("#calendarBranchFilter").value = event.target.value;
    dashboardPage = 1;
    await loadDashboard();
    if (state.role === "cashier") await loadCashierDashboard(true);
    if (state.section === "calendar") await loadCalendar(true);
  }
  if (event.target.id === "calendarBranchFilter") {
    $("#dashboardBranchFilter").value = event.target.value;
    $("#headerBranchFilter").value = event.target.value;
    await loadDashboard(true);
    await loadCalendar();
  }
  if (["dashboardOperationFilter", "dashboardPaymentMethodFilter", "dashboardDateFilter", "dashboardStaffFilter", "dashboardPageSize"].includes(event.target.id)) { dashboardPage = 1; renderRecentOperations(); }
});

function closeAdminMenu() {
  $("#sidebar").classList.remove("open");
  $("#sidebarBackdrop").classList.remove("show");
  document.body.style.overflow = "";
}
function toggleAdminMenu() {
  const open = $("#sidebar").classList.toggle("open");
  $("#sidebarBackdrop").classList.toggle("show", open);
  document.body.style.overflow = open ? "hidden" : "";
}
function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  $("#adminApp").classList.toggle("sidebar-collapsed", collapsed);
  const button = $("#sidebarCollapse");
  button.textContent = collapsed ? "‹" : "›";
  button.title = collapsed ? "إظهار القائمة" : "إخفاء القائمة";
  button.setAttribute("aria-expanded", String(!collapsed));
  if (persist) saveStaffTabPreference("mz-admin-sidebar-collapsed", collapsed ? "true" : "false");
}
$("#adminMenu").addEventListener("click", toggleAdminMenu);
$("#sidebarCollapse").addEventListener("click", () => setSidebarCollapsed(!$("#adminApp").classList.contains("sidebar-collapsed")));
$("#sidebarBackdrop").addEventListener("click", closeAdminMenu);
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeAdminMenu();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    const input = $("#adminGlobalSearch");
    input?.focus();
    input?.select();
  }
});
$("#adminTheme").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
$("#mobileThemeToggle")?.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
$("#logoutButton").addEventListener("click", async () => { await logout(); location.replace("/login/"); });
$("#pushButton").addEventListener("click", event => handlePushButton(event.currentTarget));
$("#mobilePushButton")?.addEventListener("click", event => requestAdminPush(event.currentTarget));
$("#editorClose").addEventListener("click", () => $("#editorDialog").close());
$("#editorCancel").addEventListener("click", () => $("#editorDialog").close());
$("#accessClose").addEventListener("click", () => $("#accessDialog").close());
$("#accessCancel").addEventListener("click", () => $("#accessDialog").close());
$("#accessRole").addEventListener("change", event => { renderAccessPermissionPicker(event.target.value); syncAccessWorkerField(event.target.value); });
$("#accessForm").addEventListener("submit", submitAccessEdit);
$("#customerDrawerClose").addEventListener("click", () => $("#customerDrawer").close());
$("#receiptDrawerClose")?.addEventListener("click", () => $("#receiptDrawer").close());
$("#adminAlertsClose")?.addEventListener("click", () => $("#adminAlertsDialog").close());
$("#editBranchTarget")?.addEventListener("click", openBranchTargetEditor);
$("#branchTargetClose")?.addEventListener("click", () => $("#branchTargetDialog").close());
$("#branchTargetCancel")?.addEventListener("click", () => $("#branchTargetDialog").close());
$("#branchTargetForm")?.addEventListener("submit", submitBranchTarget);
$("#cashMovementClose")?.addEventListener("click", () => $("#cashMovementDialog").close());
$("#cashMovementCancel")?.addEventListener("click", () => $("#cashMovementDialog").close());
$("#closeShiftClose")?.addEventListener("click", () => $("#closeShiftDialog").close());
$("#closeShiftCancel")?.addEventListener("click", () => $("#closeShiftDialog").close());
$("#openShiftTrigger")?.addEventListener("click", () => $("#openShiftDialog").showModal());
$("#refreshShiftSnapshot")?.addEventListener("click", event => withButtonBusy(event.currentTarget, () => loadCashOperations()));
$("#openShiftClose")?.addEventListener("click", () => $("#openShiftDialog").close());
$("#openShiftCancel")?.addEventListener("click", () => $("#openShiftDialog").close());
$("#closeShiftForm [name=actualCash]")?.addEventListener("input", event => {
  const variance = cashVariance(event.target.value, state.cash.shift?.expectedCash);
  $("#closeShiftVariance").textContent = variance === null ? "—" : money(variance);
});
$("#closeShiftForm [name=reason]")?.addEventListener("input", event => event.target.setCustomValidity(""));
$("#branchTargetForm")?.elements.branchId.addEventListener("change", event => {
  $("#branchTargetForm").elements.targetAmount.value = state.dashboard.stats?.monthlyTargetByBranch?.[event.target.value]?.target ?? 0;
});
$("#testLocalNotification")?.addEventListener("click", event => withButtonBusy(event.currentTarget, () => testLocalNotification(event.currentTarget)));
$("#dashboardPagePrev")?.addEventListener("click", () => { dashboardPage = Math.max(1, dashboardPage - 1); renderRecentOperations(); });
$("#dashboardPageNext")?.addEventListener("click", () => { dashboardPage += 1; renderRecentOperations(); });
$("#manualOfferClose").addEventListener("click", () => $("#manualOfferDialog").close());
$("#manualOfferCancel").addEventListener("click", () => $("#manualOfferDialog").close());
$("#entityForm").addEventListener("submit", saveEditor);
[$("#scheduleSettings"), $("#siteSettings"), $("#rewardsSettings")].filter(Boolean).forEach(form => form.addEventListener("submit", saveSettingsForm));
function campaignData() { const form = $("#campaignForm"); const data = Object.fromEntries(new FormData(form)); return { ...data, testMode: data.testMode === "true", recipientCap: Number(data.recipientCap) }; }
async function previewCampaign(button) {
  return withButtonBusy(button, async () => {
    const data = campaignData();
    const preview = await previewWhatsappCampaign(data);
    $("#campaignPreview").innerHTML = `${preview.offer.imageUrl ? `<img src="${escapeAttr(safeMediaUrl(preview.offer.imageUrl))}" alt="" width="100" height="80" loading="lazy" decoding="async">` : ""}<strong>${escapeHtml(preview.offer.nameAr)}</strong><p>${escapeHtml(branchLabel(preview.branchId))} • القالب ${escapeHtml(preview.template.name)} • ${preview.imageIncluded ? "يرسل صورة العرض" : "هذا القالب لا يرسل صورة"}</p><p>المؤهلون: ${Number(preview.eligibleCount || 0)} • حد المستلمين: ${Number(data.recipientCap || 0)} • ${preview.testMode ? "وضع تجريبي للمستلمين المحددين فقط" : "إرسال فعلي"}</p><p>${preview.killSwitchEnabled ? "الحملات مفعلة" : "إرسال الحملات متوقف"} • ${preview.metaConfigured ? "Meta جاهز" : "إعداد Meta غير مكتمل"} • الموافقة مفحوصة</p>`;
    return preview;
  });
}
$("#campaignPreviewButton")?.addEventListener("click", event => previewCampaign(event.currentTarget).catch(error => toast(error.message || "تعذر معاينة الحملة", true)));
[$("#campaignBranchFilter"), $("#campaignStateFilter"), $("#campaignDateFilter")].forEach(input => input?.addEventListener("change", renderCampaigns));
$("#campaignForm")?.elements.testMode.addEventListener("change", event => { $("#campaignSubmitButton").textContent = event.target.value === "true" ? "إرسال تجريبي" : "بدء الحملة"; });
$("#campaignForm")?.addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget, button = $("#campaignSubmitButton");
  await withButtonBusy(button, async () => {
    const data = campaignData(); const preview = await previewWhatsappCampaign(data);
    if (!preview.killSwitchEnabled) throw new Error("إرسال الحملات متوقف من إعدادات النظام");
    if (!preview.metaConfigured) throw new Error("إعداد Meta غير مكتمل");
    if (!preview.recipientCapValid) throw new Error("حد المستلمين يتجاوز عدد العملاء المؤهلين أو الحد الأعلى 1000");
    if (!confirm(`تأكيد ${data.testMode ? "الإرسال التجريبي" : "بدء حملة فعلية"}؟\nالعرض: ${preview.offer.nameAr}\nالفرع: ${branchLabel(data.branchId)}\nالمؤهلون: ${preview.eligibleCount}\nحد المستلمين: ${data.recipientCap}\nالقالب: ${preview.template.name}\nالصورة: ${preview.imageIncluded ? "نعم" : "لا"}`)) return;
    const result = await createWhatsappCampaign({ ...data, idempotencyKey: form.dataset.key ||= crypto.randomUUID() });
    form.dataset.key = "";
    await loadCollection("campaigns", true); renderCampaigns(); toast(`تم وضع الحملة ${result.campaignId} في قائمة الإرسال`);
  }).catch(error => toast(error.message || "تعذر إنشاء الحملة", true));
});
$("#bookingSearch").addEventListener("input", renderBookings);
$("#bookingStatusFilter").addEventListener("change", renderBookings);
$("#bookingBranchFilter").addEventListener("change", renderBookings);
$("#bookingPaymentFilter")?.addEventListener("change", renderBookings);
$("#bookingDateFilter")?.addEventListener("change", renderBookings);
[$("#cashierTransactionSearch"), $("#cashierTransactionType"), $("#cashierTransactionPayment"), $("#cashierTransactionStaff")].filter(Boolean).forEach(input => input.addEventListener(input.tagName === "INPUT" ? "input" : "change", () => { cashierTransactionsPage = 1; renderCashierTransactions(); }));
$("#cashierTransactionsPrev")?.addEventListener("click", () => { cashierTransactionsPage--; renderCashierTransactions(); });
$("#cashierTransactionsNext")?.addEventListener("click", () => { cashierTransactionsPage++; renderCashierTransactions(); });
[$("#calendarSearch"), $("#calendarStaffFilter"), $("#calendarPaymentFilter")].filter(Boolean).forEach(input => input.addEventListener(input.tagName === "INPUT" ? "input" : "change", renderCalendar));
$("#applyRevenueFilter").addEventListener("click", renderRevenue);
$("#exportBookings").addEventListener("click", () => exportCsv("el-mezaen-bookings.csv", ["code", "branch", "customer", "phone", "items", "staff", "date", "time", "subtotal", "discount", "total", "status", "payment"], state.dashboard.bookings.map(item => [item.code, item.branchNameAr || branchLabel(item.branchId), item.customerName, item.phone, (item.serviceNamesAr || []).join(" + "), item.staffNameAr, item.bookingDate, item.bookingTime, item.subtotal, item.discountAmount, item.total, item.status, item.paymentStatus])));
$("#exportRevenue").addEventListener("click", () => exportCsv("el-mezaen-revenue.csv", ["date", "branch", "booking", "type", "method", "staff", "services", "products", "drinks", "amount"], state.dashboard.ledger.map(item => [item.dateKey, branchLabel(item.branchId), item.bookingCode, item.type, item.paymentMethod, item.staffId, item.revenueBreakdown?.services || 0, item.revenueBreakdown?.products || 0, item.revenueBreakdown?.drinks || 0, item.amount])));
$("#openScanner").addEventListener("click", openScanner);
$("#scannerClose").addEventListener("click", closeScanner);
$("#scannerDialog").addEventListener("close", () => closeScanner(false));
$("#editorDialog").addEventListener("close", () => { editorPreviewUrls.forEach(url => URL.revokeObjectURL(url)); editorPreviewUrls = []; });
window.addEventListener("pagehide", () => closeScanner(false));
$("#scannerCamera").addEventListener("change", openScanner);
$("#findScannedBooking").addEventListener("click", event => withButtonBusy(event.currentTarget, findScanned));
$("#secureDeleteClose").addEventListener("click", closeSecureDelete);
$("#secureDeleteCancel").addEventListener("click", closeSecureDelete);
$("#secureDeleteForm").addEventListener("submit", submitSecureDelete);
$("#posForm").addEventListener("submit", submitPosOrder);
$("#posApplyCoupon")?.addEventListener("click", event => applyPosCoupon(event.currentTarget));
$("#posCouponCode")?.addEventListener("input", () => { $("#posCouponStatus").textContent = "اضغط تطبيق الكود للتحقق من صلاحيته."; });
$("#cashierTaskForm")?.addEventListener("submit", submitCashierTask);
$("#ownerSalesFilters")?.addEventListener("submit", event => { event.preventDefault(); void loadOwnerHistory("sales"); });
$("#ownerExpenseFilters")?.addEventListener("submit", event => { event.preventDefault(); void loadOwnerHistory("expenses"); });
$("#ownerSalesMore")?.addEventListener("click", event => withButtonBusy(event.currentTarget, () => loadOwnerHistory("sales", true)));
$("#ownerExpenseMore")?.addEventListener("click", event => withButtonBusy(event.currentTarget, () => loadOwnerHistory("expenses", true)));
$("#mobileContentType")?.addEventListener("change", renderMobileContent);
$("#mobileContentStatus")?.addEventListener("change", renderMobileContent);
$("#mobileContentMore")?.addEventListener("click", async event => { for (const collection of ["content", "offers"]) if (state.collectionCursors.get(collection) && (collection !== "offers" || canManageContent("offer"))) await loadMoreCollection(collection, event.currentTarget); renderMobileContent(); });
$("#refreshCashierTeam")?.addEventListener("click", event => withButtonBusy(event.currentTarget, loadCashierTeam));
$("#refreshCalendar")?.addEventListener("click", () => loadCalendar());
$("#calendarView")?.addEventListener("change", () => loadCalendar());
$("#openShiftForm")?.addEventListener("submit", submitOpenShift);
$("#cashMovementForm")?.addEventListener("submit", submitCashMovement);
$("#closeShiftForm")?.addEventListener("submit", submitCloseShift);
$("#shiftReportLoad")?.addEventListener("click", event => loadShiftReport(event.currentTarget));
$("#currentShiftReport")?.addEventListener("click", showCurrentShiftReport);
$("#previousShiftReports")?.addEventListener("change", event => { if (event.currentTarget.value) { $("#shiftReportId").value = event.currentTarget.value; loadShiftReport(); } });
$("#shiftReportPrint")?.addEventListener("click", () => printReport($("#shiftReportResult")));
$("#reportType")?.addEventListener("change", () => { const monthly = $("#reportType").value === "monthly"; $("#reportMonth").hidden = !monthly; $("#reportDate").hidden = monthly; $("#reportResult").textContent = "اختر الفترة لعرض تقرير محفوظ."; $("#reportPrint").disabled = true; });
$("#reportDate").value = cairoDateKey();
$("#reportMonth").value = cairoDateKey().slice(0, 7);
$("#reportLoad")?.addEventListener("click", event => loadBusinessReport(event.currentTarget));
$("#reportRebuild")?.addEventListener("click", event => withButtonBusy(event.currentTarget, async () => {
  if (state.role !== "admin") return;
  const branchId = $("#reportBranch").value, periodKey = reportKey();
  if (branchId === "all" || !periodKey) return toast("حدد فرعًا واحدًا وفترة لإعادة البناء", true);
  try { const result = await rebuildBusinessReport({ branchId, type: $("#reportType").value, periodKey }); showBusinessReports([result.report], []); toast("تم إنشاء التقرير من مصدر البيانات"); }
  catch (error) { toast(error.message, true); }
}));
$("#reportPrint")?.addEventListener("click", () => printReport($("#reportResult")));
$("#cashierReportType")?.addEventListener("change", () => { const monthly = $("#cashierReportType").value === "monthly"; $("#cashierReportDate").hidden = monthly; $("#cashierReportMonth").hidden = !monthly; $("#cashierReportPrint").disabled = true; });
$("#cashierReportDate").value = cairoDateKey();
$("#cashierReportMonth").value = cairoDateKey().slice(0, 7);
$("#cashierReportLoad")?.addEventListener("click", event => loadCashierPeriodReport(event.currentTarget));
$("#cashierReportPrint")?.addEventListener("click", () => printReport($("#cashierReportResult")));
$("#auditRefresh")?.addEventListener("click", event => withButtonBusy(event.currentTarget, () => loadAuditEvents("")));
$("#auditNext")?.addEventListener("click", event => withButtonBusy(event.currentTarget, () => loadAuditEvents(auditCursor)));
$("#adminPasswordForm")?.addEventListener("submit", submitOwnPassword);
$("#staffPasswordForm")?.addEventListener("submit", submitOwnPassword);
$("#cashierRefundForm")?.addEventListener("submit", submitRefund);
$("#cashierAccountButton")?.addEventListener("click", () => $("#staffPasswordDialog").showModal());
$("#openAdminPassword")?.addEventListener("click", async () => { if (state.role === "admin") { await showSection("users"); $("#adminPasswordForm")?.scrollIntoView({ behavior: "smooth", block: "center" }); } else $("#staffPasswordDialog").showModal(); });
$("#dailyClosingForm")?.addEventListener("submit", submitDailyClosing);
$("#openShiftForm [name=branchId]")?.addEventListener("change", () => loadCashOperations());
$("#posMobileSummary").addEventListener("click", () => $("#pos").classList.add("mobile-ticket-open"));
$("#posTicketClose").addEventListener("click", () => $("#pos").classList.remove("mobile-ticket-open"));
$("#posBranch").addEventListener("change", () => { state.posCart = []; renderPos(); void loadPosOffers(); });
$("#posSectionFilter").addEventListener("change", () => { $("#posItemSearch").value = ""; renderPos(); });
$("#posCategoryFilter").addEventListener("change", renderPos);
$("#serviceCategoryFilter").addEventListener("change", () => renderCollection("services"));
$("#posCustomer").addEventListener("change", event => selectPosCustomer(event.target.value));
let phoneLookupTimer;$("#posPhone").addEventListener("input",event=>{clearTimeout(phoneLookupTimer);const phone=event.target.value;try{normalizePhone(phone)}catch{return}phoneLookupTimer=setTimeout(async()=>{try{const result=await findCustomerByPhone(phone);if(result.customer){rememberPosCustomer(result.customer);toast("تم العثور على العميل بدون تحميل قاعدة العملاء كاملة")}}catch{}},350)});
$("#expenseForm").addEventListener("submit", submitExpense);
$("#expenseCategory").addEventListener("change", toggleExpenseInventory);
$("#expenseCancelEdit").addEventListener("click", resetExpenseForm);
$("#clearExpenseFilters").addEventListener("click", () => { $("#expenseFrom").value = ""; $("#expenseTo").value = ""; $("#expenseBranchFilter").value = "all"; $("#expenseCategoryFilter").value = "all"; renderExpenses(); });
$("#refreshPayroll").addEventListener("click", () => loadBusiness());
$("#payrollMonth").addEventListener("change", () => loadBusiness());
$("#dashboardTargetBranch")?.addEventListener("change", event => {
  $("#dashboardBranchFilter").value = event.target.value;
  void loadDashboard();
});
$("#desktopTargetBranch")?.addEventListener("change", event => {
  const dashboardBranch = $("#dashboardBranchFilter");
  if (dashboardBranch) dashboardBranch.value = event.target.value;
  void loadDashboard();
});
$("#serviceTargetForm")?.addEventListener("submit", submitServiceTarget);
$("#exportPayroll").addEventListener("click", () => exportCsv(`el-mezaen-payroll-${state.business.month}.csv`, ["العامل", "الإيراد", "التارجت", "الأساسي", "نسبة الزيادة", "الزيادة", "الراتب", "الحالة"], (state.business.payroll || []).map(item => [item.nameAr, item.revenue, item.monthlyTarget, item.baseSalary, item.targetBonusPercent, item.bonus, item.payment?.netSalary ?? item.netSalary, item.payment ? "تم الصرف" : "لم يصرف"])));
$("#accountRole").addEventListener("change", event => { renderPermissionPicker(event.target.value); syncWorkerAccountFields(event.target.value); });
$("#userAccountForm").addEventListener("submit", submitUserAccount);
$("#refreshUsers").addEventListener("click", async () => { await loadCollection("users", true); renderUserAccounts(); });
$("#refreshAttendance")?.addEventListener("click", event => withButtonBusy(event.currentTarget, () => loadAttendance()));
$("#retryDashboard")?.addEventListener("click", event => withButtonBusy(event.currentTarget, () => loadDashboard()));
$("#attendanceDate")?.addEventListener("change", () => loadAttendance());
$("#attendanceBranch")?.addEventListener("change", () => loadAttendance());
$("#workerTaskForm")?.addEventListener("submit", submitWorkerTask);
$("#refreshTasks")?.addEventListener("click", event => withButtonBusy(event.currentTarget, () => loadAttendance()));
$("#workerCheckIn")?.addEventListener("click", event => submitAttendance("checkIn", event.currentTarget));
$("#workerCheckOut")?.addEventListener("click", event => submitAttendance("checkOut", event.currentTarget));
$("#workerPhotoInput")?.addEventListener("change", event => updateWorkerPhoto(event.target.files?.[0], event.target));
renderPermissionPicker();
syncWorkerAccountFields("cashier");

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; $("#installAdmin").hidden = false; });
window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; $("#installAdmin").hidden = true; toast("تم تثبيت لوحة الإدارة"); });
$("#installAdmin").addEventListener("click", async () => { if (!deferredInstallPrompt) return toast("استخدم تثبيت التطبيق من قائمة المتصفح", true); deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $("#installAdmin").hidden = true; });

setupPanels();
// Move secondary booking controls into a native details sheet on narrow screens.
const bookingToolbar = $("#bookings .panel-head .toolbar");
if (bookingToolbar) {
  const more = document.createElement("details");
  more.id = "bookingMobileFilters";
  more.innerHTML = '<summary>الفلاتر والإجراءات</summary><div class="booking-mobile-filter-body"></div>';
  for (const selector of ["#bookingBranchFilter", "#bookingPaymentFilter", "#openScanner", "#exportBookings"]) {
    const control = bookingToolbar.querySelector(selector);
    if (control) more.querySelector("div").append(control);
  }
  bookingToolbar.append(more);
  const viewport = matchMedia("(max-width: 720px)");
  const update = () => { more.open = !viewport.matches; };
  update(); viewport.addEventListener?.("change", update);
}
initializeLineIcons();
$("#reviewStatusFilter").addEventListener("change", () => renderCollection("reviews"));
setTheme("light");
syncPushButtons();
setSidebarCollapsed(false, { persist: false });
$("#expenseDate").value = cairoDateKey();
$("#payrollMonth").value = cairoDateKey().slice(0, 7);
$("#calendarDate").value = cairoDateKey();
$("#attendanceDate").value = cairoDateKey();
$("#dailyClosingForm [name=businessDate]").value = cairoDateKey();
toggleExpenseInventory();
const updateConnectionState = () => { const target = $("#connectionState"); if (!target) return; target.textContent = navigator.onLine ? "● متصل" : "● غير متصل"; target.classList.toggle("offline", !navigator.onLine); };
window.addEventListener("online", updateConnectionState);
window.addEventListener("offline", updateConnectionState);
window.addEventListener("popstate", event => {
  if (!state.user) return;
  const section = event.state?.adminSection || "workspaceHome";
  if (section === "workspaceHome" || !canOpenSection(section)) return state.role === "cashier" ? void showSection("calendar", { historyMode: "replace" }) : showWorkspaceHome({ historyMode: "none" });
  state.hub = sectionHub(section);
  void showSection(section, { historyMode: "none" });
});
updateConnectionState();
if ("serviceWorker" in navigator) {
  if (["localhost", "127.0.0.1"].includes(location.hostname)) navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.filter(item => new URL(item.scope).origin === location.origin).map(item => item.unregister()))).catch(() => {});
  else if (location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
}
let dashboardRefreshTimer;
async function bootstrapAdmin(user) {
  if (!user) { location.replace("/login/"); return; }
  try {
    const access = await currentAccess(user);
    if (!["admin", "manager", "cashier", "worker"].includes(access.role) || (access.role !== "admin" && !access.branchIds?.length)) {
      await logout();
      location.replace("/login/?reason=access");
      return;
    }
    state.user = user; state.role = access.role; state.staffId = access.staffId || ""; document.documentElement.dataset.adminRole = access.role || "unknown"; state.permissions = effectivePermissions(access.role, access.permissions); state.branchIds = access.role === "admin" ? ["talkha", "mashaya"] : access.branchIds;
    $$('#adminPasswordForm [name="username"], #staffPasswordForm [name="username"]').forEach(input => { input.value = user.email || ""; });
    const roleName = ({ admin: "أدمن", manager: "مدير", cashier: "كاشير", worker: "عامل" })[access.role] || access.role;
    const userName = user.displayName || user.email || "حساب مزين";
    $("#welcomeText").textContent = `مزين مصر • ${roleName}`;
    $("#workspaceUserName").textContent = userName;
    $("#workspaceRoleName").textContent = `${roleName} • ${state.branchIds.map(branchLabel).join(" / ")}`;
    $("#headerUserName").textContent = userName;
    $("#headerUserRole").textContent = roleName;
    $(".header-user-avatar").textContent = String(userName).trim().charAt(0) || "م";
    $("#headerBranchLabel").textContent = state.branchIds.length > 1 ? "طلخا والمشاية" : branchLabel(state.branchIds[0]);
    $("#cashierBranchLabel").textContent = state.branchIds.map(branchLabel).join(" / ") || "الفرع";
    $("#managerBranchLabel").textContent = state.branchIds.length === 1 ? branchLabel(state.branchIds[0]) : "الفروع المصرح بها";
    $("#cashierBranchLabel").hidden = access.role !== "cashier";
    $("#logoutButton").dataset.avatar = String(userName).trim().charAt(0) || "م";
    renderRoleShell();
    $("#authLoading").hidden = true; $("#adminApp").hidden = false;
    applyAccess();
    if (state.role === "cashier" && state.branchIds.length === 1) {
      $("#dashboardBranchFilter").value = state.branchIds[0];
      $("#headerBranchFilter").value = state.branchIds[0];
      $("#calendarBranchFilter").value = state.branchIds[0];
      $("#posBranch").value = state.branchIds[0];
      $("#posBranch").disabled = true;
      $("#openShiftForm [name=branchId]").value = state.branchIds[0];
      $("#openShiftForm [name=branchId]").disabled = true;
    }
    if (state.role === "cashier") await loadCashOperations(true);
    syncDashboardTargetBranchOptions();
    syncPushButtons();
    if ("Notification" in window && Notification.permission === "granted") void connectAdminPush().then(() => { pushRegistrationReady = true; syncPushButtons(); }).catch(error => console.debug("Push token refresh deferred", error?.message || error));
    const desktopInitialSection = access.role === "cashier" ? ["calendar", "bookings", "pos"].find(canOpenSection) : (access.role === "admin" && adminMobileViewport.matches) || (matchMedia("(min-width: 1024px)").matches && access.role !== "worker") ? ["dashboard", "pos", "bookings", "attendance", "customers"].find(canOpenSection) : "";
    const requestedSection = new URLSearchParams(location.hash.slice(1)).get("admin");
    const initialSection = requestedSection && canOpenSection(requestedSection) ? requestedSection : desktopInitialSection;
    if (initialSection) {
      state.hub = sectionHub(initialSection);
      $("#adminApp").dataset.hub = state.hub;
      applyAccess();
      await showSection(initialSection, { historyMode: "replace" });
    }
    else {
      showWorkspaceHome({ historyMode: "replace" });
      if (access.role !== "worker" && (state.role === "admin" || state.permissions.has("dashboard") || state.permissions.has("revenue") || state.permissions.has("pos"))) void loadDashboard(true);
    }
    clearInterval(dashboardRefreshTimer);
    dashboardRefreshTimer = setInterval(() => {
      if (document.hidden) return;
      if (state.section === "pos" || (state.section === "bookings" && state.role === "cashier")) loadCashierDashboard(true);
      else if (state.section === "calendar") loadCalendar(true);
      else if (["dashboard", "bookings", "revenue", "expenses"].includes(state.section)) loadDashboard(true);
      else if (["attendance", "tasks"].includes(state.section)) loadAttendance(true);
      else if (state.section === "worker") loadWorkerWorkspace(true);
    }, 60000);
  } catch (error) {
    if (isInvalidAuthSession(error)) {
      await logout(); location.replace("/login/"); return;
    }
    const loading = $("#authLoading");
    loading.hidden = false;
    loading.replaceChildren();
    const message = document.createElement("p");
    message.textContent = error?.message || "تعذر التحقق من الجلسة الآن. حاول مرة أخرى.";
    const retry = document.createElement("button");
    retry.type = "button"; retry.className = "small-button primary"; retry.id = "retryAdminSession"; retry.textContent = "إعادة المحاولة";
    retry.addEventListener("click", async () => {
      retry.disabled = true; retry.textContent = "جاري التحقق…";
      try { await ensureAdminAppCheckReady(true); await bootstrapAdmin(user); }
      catch (retryError) { message.textContent = retryError?.message || "تعذر التحقق. حاول مرة أخرى."; retry.disabled = false; retry.textContent = "إعادة المحاولة"; }
    });
    loading.append(message, retry);
    $("#adminApp").hidden = true;
  }
}
watchAuth(bootstrapAdmin);
window.addEventListener("beforeunload", () => clearInterval(dashboardRefreshTimer), { once: true });
