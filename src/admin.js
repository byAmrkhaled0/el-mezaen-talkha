import "./admin.css";
import JsBarcode from "jsbarcode";
import { changeBooking, createPosOrder, createUserAccount, currentAccess, deleteEntity, enablePush, getBusinessDashboard, getCollection, getDashboard, logout, recordExpense, recordPayrollPayment, saveEntity, secureDeleteRecord, uploadImage, uploadVideo, verifyAdminPassword, watchAuth } from "./admin-api.js";
import { isVideoContent, videoSource } from "./media.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(value || 0));
const dateTime = value => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(date) : "—";
};
const cairoDateKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const escapeHtml = value => { const node = document.createElement("div"); node.textContent = value ?? ""; return node.innerHTML; };
const escapeAttr = value => escapeHtml(String(value ?? "")).replaceAll('"', "&quot;");
const state = { user: null, role: null, permissions: new Set(), branchIds: [], dashboard: { bookings: [], ledger: [], expenses: [], stats: {} }, business: { payroll: [], expenses: [], inventory: [], drinks: [], reviews: [], stats: {} }, posCart: [], collections: new Map(), section: "dashboard", expenseInventoryKind: "all", lastBookingCount: null, editor: { collection: "", id: "", preset: {} }, secureDelete: { kind: "", id: "", label: "" } };
const permissionLabels = { dashboard: "الرئيسية", pos: "نقطة البيع", bookings: "الحجوزات", revenue: "الدفع والإيرادات", expenses: "المصروفات", inventory: "البضاعة والمخزون", drinks: "المشروبات", payroll: "الرواتب والتارجت", services: "الخدمات والتصنيفات", packages: "الباقات", offers: "العروض", coupons: "أكواد الخصم", staff: "فريق العمل", customers: "العملاء", reviews: "التقييمات", schedule: "المواعيد والإجازات", gallery: "الصور والمعرض", celebrities: "صور المشاهير", posts: "الأخبار والمنشورات", settings: "إعدادات الموقع", activity: "سجل الأنشطة" };
const roleDefaults = { worker: ["pos", "bookings", "customers"], manager: Object.keys(permissionLabels).filter(value => value !== "activity"), receptionist: ["dashboard", "pos", "bookings", "customers", "reviews"], accountant: ["dashboard", "revenue", "expenses", "payroll"] };

const fields = {
  branches: [
    ["id", "معرّف الفرع بالإنجليزية بدون مسافات (مثال: talkha)", "text", true], ["nameAr", "اسم الفرع بالعربية", "text", true], ["shortNameAr", "الاسم المختصر", "text", true], ["code", "رمز الفرع في كود الحجز", "text", true],
    ["addressAr", "العنوان الكامل", "textarea", true, null, true], ["phone", "رقم الموبايل", "tel", true], ["secondaryPhone", "رقم إضافي أو أرضي", "tel"], ["whatsapp", "رقم واتساب الدولي", "tel", true],
    ["mapsUrl", "رابط خرائط Google", "url", true, null, true], ["openingTime", "بداية العمل", "time", true], ["closingTime", "نهاية العمل", "time", true], ["slotMinutes", "الفاصل بين المواعيد", "number", true],
    ["facebook", "رابط Facebook", "url", false, null, true], ["instagram", "رابط Instagram", "url", false, null, true], ["tiktok", "رابط TikTok", "url", false, null, true], ["sortOrder", "ترتيب الظهور", "number"], ["active", "متاح للحجز", "boolean"]
  ],
  categories: [
    ["nameAr", "اسم التصنيف", "text", true], ["sortOrder", "ترتيب الظهور", "number"], ["active", "الحالة", "boolean"]
  ],
  services: [
    ["nameAr", "اسم الخدمة", "text", true], ["categoryId", "التصنيف", "category-select", true],
    ["price", "السعر", "number", true], ["duration", "المدة بالدقائق", "number", true], ["branchIds", "تظهر في", "branch-scope", false, null, true], ["startsFrom", "السعر يبدأ من", "boolean"], ["type", "النوع", "select", true, [["service", "خدمة"], ["product", "منتج"]]], ["sortOrder", "ترتيب الظهور", "number"], ["active", "مفعلة", "boolean"]
  ],
  packages: [
    ["nameAr", "اسم الباقة", "text", true], ["descriptionAr", "الوصف", "textarea", false, null, true],
    ["includedServiceIds", "معرّفات الخدمات (بفواصل)", "text", false, null, true], ["branchIds", "تظهر في", "branch-scope", false, null, true], ["originalPrice", "السعر قبل الخصم", "number"], ["price", "السعر بعد الخصم", "number", true], ["duration", "المدة بالدقائق", "number", true],
    ["imageUrl", "رابط الصورة", "url", false, null, true], ["imageFile", "رفع صورة", "file", false, null, true], ["startAt", "بداية العرض", "datetime-local"], ["endAt", "نهاية العرض", "datetime-local"],
    ["status", "الحالة", "select", true, [["active", "نشطة"], ["expired", "منتهية"], ["scheduled", "مجدولة"], ["stopped", "متوقفة"]]], ["badge", "العلامة", "select", false, [["", "بدون"], ["popular", "الأكثر طلبًا"], ["special", "عرض مميز"]]], ["sortOrder", "الترتيب", "number"], ["active", "تظهر في الموقع", "boolean"]
  ],
  offers: [
    ["nameAr", "اسم العرض", "text", true], ["descriptionAr", "الوصف", "textarea", false, null, true],
    ["oldPrice", "السعر القديم", "number", true], ["newPrice", "السعر الجديد", "number", true], ["duration", "المدة", "number"], ["includedServiceIds", "الخدمات والباقات المشمولة (بفواصل)", "text", false, null, true], ["branchIds", "يظهر في", "branch-scope", false, null, true],
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
    ["branchIds", "يعمل في", "branch-scope", false, null, true], ["serviceIds", "معرّفات الخدمات التي يقدمها (بفواصل)", "text", false, null, true], ["workDays", "أيام العمل 0-6 (بفواصل)", "text"], ["shiftStart", "بداية الشيفت", "time"], ["shiftEnd", "نهاية الشيفت", "time"], ["breaks", "أوقات الراحة (بفواصل)", "text", false, null, true],
    ["baseSalary", "الراتب الأساسي الشهري", "number"], ["monthlyTarget", "تارجت الإيراد الشهري", "number"], ["targetBonusPercent", "نسبة الزيادة عند تحقيق التارجت %", "number"],
    ["available", "متاح", "boolean"], ["sortOrder", "ترتيب الظهور", "number"], ["bookingCount", "عدد الحجوزات", "number"], ["revenueTotal", "إجمالي الإيرادات", "number"], ["active", "مفعل", "boolean"]
  ],
  inventoryItems: [
    ["nameAr", "اسم الصنف", "text", true], ["category", "النوع", "select", true, [["product", "بضاعة للبيع"], ["supply", "مستلزم تشغيل"]]], ["branchId", "الفرع", "branch-select", true],
    ["costPrice", "سعر التكلفة", "number", true], ["sellingPrice", "سعر البيع", "number", true], ["stockQty", "الرصيد الحالي", "number", true], ["minStock", "حد تنبيه النقص", "number"], ["unit", "الوحدة", "text"], ["sortOrder", "الترتيب", "number"], ["active", "متاح", "boolean"]
  ],
  drinks: [
    ["nameAr", "اسم المشروب", "text", true], ["type", "النوع", "select", true, [["hot", "ساخن"], ["cold", "بارد"], ["soft-drink", "مشروب غازي"], ["other", "أخرى"]]], ["branchId", "الفرع", "branch-select", true],
    ["price", "سعر البيع", "number", true], ["drinkOptions", "اختيارات تحضير المشروب بفواصل (مثال: سادة، مظبوط، زيادة)", "text", false, null, true], ["sortOrder", "ترتيب الظهور", "number"], ["active", "متاح في الحجز", "boolean"]
  ],
  reviews: [["name", "اسم العميل", "text", true], ["rating", "التقييم من 5", "number", true], ["comment", "التعليق", "textarea", true, null, true], ["bookingCode", "كود الحجز", "text"], ["status", "حالة التقييم", "select", true, [["pending", "بانتظار المراجعة"], ["published", "منشور"], ["rejected", "مرفوض"]]], ["featured", "تقييم مميز ومثبت", "boolean"], ["adminReply", "رد الإدارة", "textarea", false, null, true]],
  holidays: [["branchId", "الفرع", "branch-select", true], ["date", "التاريخ", "date", true], ["reasonAr", "السبب", "text"], ["closed", "مغلق بالكامل", "boolean"]],
  content: [["type", "النوع", "select", true, [["gallery", "معرض"], ["celebrity", "صور مشاهير"], ["news", "خبر/منشور"]]], ["titleAr", "العنوان", "text", true], ["bodyAr", "المحتوى", "textarea", false, null, true], ["branchIds", "يظهر في", "branch-scope", false, null, true], ["mediaType", "نوع الوسائط", "select", true, [["image", "صورة"], ["video", "فيديو"]]], ["imageUrl", "رابط الصورة أو غلاف الفيديو", "url", false, null, true], ["imageFile", "رفع صورة أو غلاف", "file", false, null, true], ["videoUrl", "رابط YouTube أو Facebook أو TikTok أو MP4", "url", false, null, true], ["videoFile", "رفع فيديو MP4 أو WebM (بحد أقصى 30MB)", "video-file", false, null, true], ["linkUrl", "رابط المنشور الأصلي", "url", false, null, true], ["sortOrder", "الترتيب", "number"], ["active", "مفعل", "boolean"]],
};

const sectionTitles = Object.fromEntries($$('[data-section]').map(button => [button.dataset.section, button.textContent.trim().replace(/^[^\s]+\s/, "")]));

function setupPanels() {
  $$('entity-panel').forEach(panel => {
    const collection = panel.dataset.collection;
    const readonly = panel.dataset.readonly === "true";
    const inventoryView = panel.dataset.inventoryView || "";
    const listKey = inventoryView ? `${collection}-${inventoryView}` : collection;
    const addLabel = collection === "staff" ? "+ إضافة عضو فريق باسمه وصورته" : collection === "drinks" ? "+ إضافة مشروب" : inventoryView === "products" ? "+ إضافة صنف بضاعة" : collection === "inventoryItems" ? "+ إضافة صنف" : collection === "reviews" ? "+ إضافة تقييم يدوي" : "+ إضافة جديد";
    const reviewFilter = collection === "reviews" ? '<select id="reviewStatusFilter"><option value="all">كل التقييمات</option><option value="pending">بانتظار المراجعة</option><option value="published">المنشورة</option><option value="rejected">المرفوضة</option><option value="featured">المميزة</option></select>' : "";
    const presetCategory = panel.dataset.presetCategory ? ` data-preset-category="${escapeAttr(panel.dataset.presetCategory)}"` : "";
    const viewAttribute = inventoryView ? ` data-entity-view="${escapeAttr(inventoryView)}"` : "";
    const hint = collection === "drinks" ? "قسم مستقل عن البضاعة والمخزون؛ المشروب يظهر تلقائيًا في حجز الفرع ونقطة البيع." : inventoryView === "products" ? "البضاعة ومستلزمات التشغيل لها مخزون وتكلفة شراء مستقلة." : collection === "reviews" ? "راجع التقييمات وانشرها أو ارفضها وثبّت الأفضل ورد على العميل." : readonly ? "عرض البيانات المسجلة." : "إضافة وتعديل وإخفاء وحذف العناصر.";
    panel.innerHTML = `<article class="admin-panel"><div class="panel-head wrap"><div><h2>${escapeHtml(panel.dataset.title)}</h2><p>${hint}</p></div><div class="toolbar"><input data-entity-search="${collection}"${viewAttribute} placeholder="بحث في ${escapeAttr(panel.dataset.title)}">${reviewFilter}${readonly ? "" : `<button class="small-button primary" data-new="${collection}"${presetCategory}>${addLabel}</button>`}</div></div><div class="entity-grid" data-list="${listKey}"${viewAttribute}></div></article>`;
  });
  $$('content-panel').forEach(panel => {
    const type = panel.dataset.type;
    const hint = type === "news" ? "أضف صورة أو فيديو، وحدد الفرع الذي يظهر فيه المنشور." : "حدد الفرع وارفع صورة واضحة ومحسنة للهاتف.";
    panel.innerHTML = `<article class="admin-panel"><div class="panel-head"><div><h2>${escapeHtml(panel.dataset.title)}</h2><p>${hint}</p></div><button class="small-button primary" data-new="content" data-preset-type="${type}">+ إضافة</button></div><div class="entity-grid" data-list="content-${type}"></div></article>`;
  });
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
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("mz-admin-theme", theme);
  $("#adminTheme").textContent = theme === "dark" ? "☀" : "☾";
}

async function showSection(id) {
  if (state.role !== "admin" && !state.permissions.has(id)) return toast("لا تملك صلاحية هذا القسم", true);
  state.section = id;
  $$('.admin-section').forEach(section => section.classList.toggle("active", section.id === id));
  $$('[data-section]').forEach(button => button.classList.toggle("active", button.dataset.section === id));
  $("#pageTitle").textContent = sectionTitles[id] || id;
  closeAdminMenu();
  if (["dashboard", "bookings", "revenue", "pos", "expenses"].includes(id)) await loadDashboard();
  const map = { pos: ["categories", "services", "packages", "staff", "customers"], revenue: ["services", "staff"], inventory: [], drinks: [], expenses: [], payroll: ["staff"], reviews: ["reviews"], packages: ["packages"], offers: ["offers"], coupons: ["coupons"], staff: ["staff"], customers: ["customers"], schedule: ["holidays", "settings"], gallery: ["content"], celebrities: ["content"], posts: ["content"], settings: ["settings"], activity: ["activityLogs"], users: ["users"], services: ["categories", "services"] };
  for (const collection of map[id] || []) await loadCollection(collection, true);
  if (id === "revenue") renderRevenue();
  if (["pos", "expenses", "payroll", "inventory", "drinks"].includes(id)) await loadBusiness();
  if (id === "pos") renderPos();
  if (id === "users") renderUserAccounts();
}

function applyAccess() {
  $$('[data-section]').forEach(button => { button.hidden = state.role !== "admin" && !state.permissions.has(button.dataset.section); });
  if (state.role !== "admin") $$('select').forEach(select => [...select.options].forEach(option => { if (["talkha", "mashaya"].includes(option.value) && !state.branchIds.includes(option.value)) option.remove(); }));
}

function renderPermissionPicker(role = $("#accountRole")?.value || "worker") {
  const selected = new Set(roleDefaults[role] || []);
  $("#permissionPicker").innerHTML = Object.entries(permissionLabels).map(([value, label]) => `<label><input type="checkbox" name="permissions" value="${value}" ${selected.has(value) ? "checked" : ""}> ${label}</label>`).join("");
}

function renderUserAccounts() {
  const items = state.collections.get("users") || [];
  $("#userAccountsList").innerHTML = items.map(item => `<article class="entity-card user-access-card"><h3>${escapeHtml(item.name || item.email || item.id)}</h3><p>${escapeHtml(item.email || "—")} • ${escapeHtml(({ admin: "أدمن", manager: "مدير", worker: "عامل", receptionist: "استقبال", accountant: "محاسب" })[item.role] || item.role || "—")}</p><p><b>الفروع:</b> ${item.role === "admin" ? "كل الفروع" : (item.branchIds || []).map(value => value === "talkha" ? "طلخا" : value === "mashaya" ? "المشاية" : value).join("، ") || "غير محدد"}</p><div class="permission-tags">${(item.role === "admin" ? ["كل الصلاحيات"] : item.permissions || []).map(value => `<span>${escapeHtml(permissionLabels[value] || value)}</span>`).join("")}</div></article>`).join("") || '<div class="empty-state">لا توجد حسابات مسجلة.</div>';
}

async function submitUserAccount(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const form = new FormData(event.currentTarget);
  const payload = { name: form.get("name"), email: form.get("email"), password: form.get("password"), role: form.get("role"), permissions: form.getAll("permissions"), branchIds: form.getAll("branchIds") };
  button.disabled = true;
  try {
    await createUserAccount(payload);
    event.currentTarget.reset();
    renderPermissionPicker("worker");
    const talkha = event.currentTarget.querySelector('input[name="branchIds"][value="talkha"]');
    if (talkha) talkha.checked = true;
    await loadCollection("users", true);
    renderUserAccounts();
    toast("تم إنشاء الحساب وتطبيق الصلاحيات");
  } catch (error) { toast(error.message || "تعذر إنشاء الحساب", true); }
  finally { button.disabled = false; }
}

async function loadDashboard(silent = false) {
  try {
    const result = await getDashboard();
    if (state.lastBookingCount !== null && result.bookings.length > state.lastBookingCount) notifyNewBooking();
    state.lastBookingCount = result.bookings.length;
    state.dashboard = result;
    renderDashboard();
  } catch (error) { if (!silent) toast(error.message || "تعذر تحميل لوحة الإدارة", true); }
}

async function loadBusiness(silent = false) {
  const month = $("#payrollMonth")?.value || cairoDateKey().slice(0, 7);
  try {
    state.business = await getBusinessDashboard(month);
    state.collections.set("inventoryItems", state.business.inventory || []);
    state.collections.set("drinks", state.business.drinks || []);
    renderBusiness();
  } catch (error) { if (!silent) toast(error.message || "تعذر تحميل بيانات تشغيل المحل", true); }
}

function renderDashboard() {
  const s = state.dashboard.stats || {};
  $("#statTodayBookings").textContent = s.todayBookings || 0;
  $("#statTodayRevenue").textContent = money(s.todayRevenue);
  $("#statMonthRevenue").textContent = money(s.monthRevenue);
  $("#statMonthExpenses").textContent = money(s.monthExpenses);
  $("#statMonthNet").textContent = money(s.monthNetProfit);
  $("#statTotalRevenue").textContent = money(s.totalRevenue);
  $("#statUnpaid").textContent = s.unpaidCount || 0;
  $("#statLastCollected").textContent = money(s.lastCollected);
  $("#revenueToday").textContent = money(s.todayRevenue);
  $("#revenueMonth").textContent = money(s.monthRevenue);
  $("#revenueTotal").textContent = money(s.totalRevenue);
  $("#revenueLast").textContent = money(s.lastCollected);
  renderBranchFilters();
  $("#recentBookings").innerHTML = state.dashboard.bookings.slice(0, 8).map(bookingRowMini).join("") || emptyRow(8);
  renderBookings();
  renderRevenue();
}

function bookingRowMini(item) {
  return `<tr><td><b>${escapeHtml(item.code)}</b></td><td><span class="branch-pill">${escapeHtml(item.branchNameAr || branchLabel(item.branchId))}</span></td><td>${escapeHtml(item.customerName)}<br><small>${escapeHtml(item.phone)}</small></td><td>${escapeHtml((item.serviceNamesAr || []).join(" + "))}<br><small>${money(item.total)}</small></td><td>${escapeHtml(item.staffNameAr)}</td><td>${escapeHtml(item.bookingDate || "طلب منتجات")}<br><small>${escapeHtml(item.bookingTime || "")}</small></td><td><span class="status-pill">${statusLabel(item.status)}</span></td><td>${paymentLabel(item.paymentStatus)}</td></tr>`;
}

function branchLabel(id) { return ({ talkha: "فرع طلخا", mashaya: "فرع المشاية", all: "كل الفروع" })[id] || id || "فرع طلخا"; }

function renderBranchFilters() {
  const branches = new Map([["talkha", "فرع طلخا"], ["mashaya", "فرع المشاية"]]);
  state.dashboard.bookings.forEach(item => branches.set(item.branchId || "talkha", item.branchNameAr || branchLabel(item.branchId)));
  [["#bookingBranchFilter", "كل الفروع"], ["#revenueBranch", "كل الفروع"]].forEach(([selector, allLabel]) => {
    const select = $(selector);
    const current = select.value;
    select.innerHTML = `<option value="all">${allLabel}</option>` + [...branches].map(([id, name]) => `<option value="${escapeAttr(id)}">${escapeHtml(name)}</option>`).join("");
    select.value = branches.has(current) ? current : "all";
  });
}

function renderBookings() {
  const query = $("#bookingSearch").value.trim().toLowerCase();
  const filter = $("#bookingStatusFilter").value;
  const branchFilter = $("#bookingBranchFilter").value;
  const bookings = state.dashboard.bookings.filter(item => (branchFilter === "all" || (item.branchId || "talkha") === branchFilter) && (filter === "all" || item.status === filter) && (!query || [item.code, item.customerName, item.phone, item.branchNameAr].some(value => String(value || "").toLowerCase().includes(query))));
  $("#bookingsTable").innerHTML = bookings.map(item => {
    const branchName = item.branchNameAr || branchLabel(item.branchId);
    const waMessage = encodeURIComponent(`مرحبًا ${item.customer?.firstName || ""}، بخصوص حجزك في مزين مصر – ${branchName} رقم ${item.code}: حالته الآن ${statusLabel(item.status)}.`);
    return `<tr data-booking-row="${escapeAttr(item.code)}"><td><b>${escapeHtml(item.code)}</b><br><small>${escapeHtml(item.createdAt || "")}</small></td><td><span class="branch-pill">${escapeHtml(branchName)}</span></td><td>${escapeHtml(item.customerName)}<br><small>${escapeHtml(item.phone)}</small><br><small>${item.partySize || 1} فرد</small></td><td>${escapeHtml((item.serviceNamesAr || []).join(" + "))}<br><strong>${money(item.total)}</strong></td><td>${escapeHtml(item.staffNameAr)}</td><td>${escapeHtml(item.bookingDate || "طلب منتجات")}<br>${escapeHtml(item.bookingTime || "")}</td><td><span class="status-pill">${statusLabel(item.status)}</span></td><td><div class="payment-controls"><b>${paymentLabel(item.paymentStatus)}</b><select data-payment-method="${escapeAttr(item.id)}"><option value="cash">نقدي</option><option value="vodafone_cash">فودافون كاش</option><option value="instapay">إنستاباي</option><option value="other">أخرى</option></select><div class="row-actions">${item.paymentStatus === "unpaid" ? `<button class="pay" data-booking-action="markPaid" data-booking-id="${escapeAttr(item.id)}">تم الدفع</button>` : ""}${item.paymentStatus === "paid" ? `<button class="refund" data-booking-action="refund" data-booking-id="${escapeAttr(item.id)}">استرداد</button>` : ""}</div></div></td><td><div class="row-actions"><button data-print-booking="${escapeAttr(item.id)}">طباعة شيك</button><button data-booking-action="confirmed" data-booking-id="${escapeAttr(item.id)}">تأكيد</button><button data-booking-action="rejected" data-booking-id="${escapeAttr(item.id)}">رفض</button><button data-booking-action="cancelled" data-booking-id="${escapeAttr(item.id)}">إلغاء</button><button data-booking-action="completed" data-booking-id="${escapeAttr(item.id)}">إكمال</button>${state.role === "admin" ? `<button class="delete" data-secure-delete-booking="${escapeAttr(item.id)}" data-secure-delete-label="الحجز ${escapeAttr(item.code)} للعميل ${escapeAttr(item.customerName)}">حذف نهائي</button>` : ""}<a href="https://wa.me/2${String(item.phone || "").replace(/\D/g, "")}?text=${waMessage}" target="_blank" rel="noopener">واتساب</a></div></td></tr>`;
  }).join("") || emptyRow(9);
}

function printReceipt(id) {
  const item = state.dashboard.bookings.find(value => value.id === id);
  if (!item) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, item.code, { format: "CODE128", displayValue: true, height: 52, fontSize: 13, margin: 4 });
  const lines = (item.items || []).map(line => `<tr><td>${escapeHtml(line.nameAr)}${line.option ? `<br><small>التحضير: ${escapeHtml(line.option)}</small>` : ""}</td><td>${line.qty || 1}</td><td>${money(line.lineTotal ?? line.price)}</td></tr>`).join("");
  const popup = window.open("", "_blank", "width=420,height=700");
  if (!popup) return toast("اسمح بالنوافذ المنبثقة لطباعة الشيك", true);
  popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><title>${escapeHtml(item.code)}</title><style>body{font-family:Arial;padding:24px;color:#111}header{text-align:center;border-bottom:2px dashed #333;padding-bottom:14px}img{width:72px}table{width:100%;border-collapse:collapse;margin:18px 0}td,th{padding:8px;border-bottom:1px dashed #aaa;text-align:right}.total{font-size:22px;font-weight:bold;display:flex;justify-content:space-between}.meta{line-height:1.8}svg{max-width:100%}@media print{button{display:none}}</style></head><body><header><img src="/assets/el-mezaen-logo.jpeg"><h2>مزين مصر – ${escapeHtml(item.branchNameAr || branchLabel(item.branchId))}</h2><p>${item.source === "pos" ? "شيك بيع من المحل" : "شيك حجز"}</p>${svg.outerHTML}</header><div class="meta"><b>الفرع:</b> ${escapeHtml(item.branchNameAr || branchLabel(item.branchId))}<br><b>العميل:</b> ${escapeHtml(item.customerName)}<br><b>الهاتف:</b> ${escapeHtml(item.phone)}<br><b>عدد الأفراد:</b> ${item.partySize || 1}<br><b>العامل:</b> ${escapeHtml(item.staffNameAr)}<br><b>الموعد:</b> ${escapeHtml(item.bookingDate || "طلب منتجات")} ${escapeHtml(item.bookingTime || "")}</div><table><thead><tr><th>البند</th><th>العدد</th><th>السعر</th></tr></thead><tbody>${lines}</tbody></table><p>المجموع الفرعي: ${money(item.subtotal)}</p><p>الخصم: ${money(item.discountAmount)}</p><div class="total"><span>الإجمالي</span><span>${money(item.total)}</span></div><p>حالة الدفع: ${paymentLabel(item.paymentStatus)}</p><button onclick="print()">طباعة</button></body></html>`);
  popup.document.close();
}

let scanStream;
async function openScanner() {
  $("#scannerDialog").showModal();
  if (!("BarcodeDetector" in window)) return toast("يمكنك كتابة الكود يدويًا؛ المسح بالكاميرا غير مدعوم في هذا المتصفح", true);
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    $("#scannerVideo").srcObject = scanStream; await $("#scannerVideo").play();
    const detector = new BarcodeDetector({ formats: ["code_128", "qr_code"] });
    const tick = async () => { if (!scanStream) return; const codes = await detector.detect($("#scannerVideo")).catch(() => []); if (codes[0]?.rawValue) { $("#scannerCode").value = codes[0].rawValue; findScanned(); return; } requestAnimationFrame(tick); }; tick();
  } catch { toast("تعذر تشغيل الكاميرا؛ استخدم البحث اليدوي", true); }
}
function closeScanner() { scanStream?.getTracks().forEach(track => track.stop()); scanStream = null; $("#scannerDialog").close(); }
function findScanned() { const code = $("#scannerCode").value.trim().toUpperCase(); const found = state.dashboard.bookings.find(item => String(item.code).toUpperCase() === code); if (!found) return toast("لم يتم العثور على الحجز", true); closeScanner(); $("#bookingSearch").value = found.code; renderBookings(); document.querySelector(`[data-booking-row="${CSS.escape(found.code)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); toast("تم فتح الحجز"); }

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
  $("#revenueTable").innerHTML = rows.map(item => `<tr><td>${escapeHtml(item.dateKey || item.createdAt)}</td><td><span class="branch-pill">${escapeHtml(branchLabel(item.branchId))}</span></td><td>${escapeHtml(item.bookingCode)}</td><td>${item.type === "refund" ? "استرداد" : "دفع"}</td><td>${paymentMethod(item.paymentMethod)}</td><td>${escapeHtml(bookingStaff.get(item.staffId) || item.staffId || "—")}</td><td style="color:${Number(item.amount) < 0 ? "var(--danger)" : "var(--success)"}"><b>${money(item.amount)}</b></td><td>${state.role === "admin" ? `<div class="row-actions"><button class="delete" data-secure-delete-revenue="${escapeAttr(item.id)}" data-secure-delete-label="عملية ${item.type === "refund" ? "الاسترداد" : "الدفع"} للحجز ${escapeAttr(item.bookingCode)}">حذف</button></div>` : "—"}</td></tr>`).join("") || emptyRow(8);
}

function expenseLabel(value) { if (value === "inventory") return "شراء بضاعة"; return ({ electricity: "كهرباء", water: "مياه", rent: "إيجار", salary: "راتب", maintenance: "صيانة", marketing: "تسويق", other: "أخرى" })[value] || value || "—"; }
function inventoryCategory(value) { return ({ product: "بضاعة", supply: "مستلزم" })[value] || value || "صنف"; }
function drinkType(value) { return ({ hot: "ساخن", cold: "بارد", "soft-drink": "مشروب غازي", other: "أخرى" })[value] || "أخرى"; }

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
  if ($("#expensesTable")) $("#expensesTable").innerHTML = (state.business.expenses || []).map(item => `<tr><td>${escapeHtml(item.dateKey)}</td><td>${escapeHtml(expenseLabel(item.category, item.inventoryCategory))}</td><td>${escapeHtml(branchLabel(item.branchId))}</td><td>${escapeHtml(item.description || "—")}</td><td><b>${money(item.amount)}</b></td><td>${state.role === "admin" ? `<button class="small-button danger" data-secure-delete-expense="${escapeAttr(item.id)}" data-secure-delete-label="المصروف ${escapeAttr(item.description || expenseLabel(item.category, item.inventoryCategory))}">حذف</button>` : "—"}</td></tr>`).join("") || emptyRow(6);
  const inventory = state.business.inventory || state.collections.get("inventoryItems") || [];
  if ($("#expenseInventoryItem")) {
    const current = $("#expenseInventoryItem").value;
    const filteredInventory = inventory;
    $("#expenseInventoryItem").innerHTML = '<option value="">شراء عام بدون إضافة رصيد</option>' + filteredInventory.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nameAr)} • ${escapeHtml(inventoryCategory(item.category))} • ${escapeHtml(branchLabel(item.branchId))}</option>`).join("");
    $("#expenseInventoryItem").value = filteredInventory.some(item => item.id === current) ? current : "";
  }
  renderPayroll();
  if (state.section === "pos") renderPos();
  if (state.section === "inventory") renderCollection("inventoryItems");
  if (state.section === "drinks") renderCollection("drinks");
}

function renderPayroll() {
  if (!$("#payrollGrid")) return;
  $("#payrollGrid").innerHTML = (state.business.payroll || []).filter(item => item.active !== false).map(item => {
    const paid = item.payment?.status === "paid";
    const progress = Number(item.progressPercent || 0);
    return `<article class="payroll-card"><header><div class="customer-avatar">${escapeHtml(String(item.nameAr || "ع").charAt(0))}</div><div><h3>${escapeHtml(item.nameAr || item.id)}</h3><span>${escapeHtml(branchScopeLabel(item.branchIds))}</span></div><b class="${item.targetAchieved ? "target-hit" : ""}">${item.targetAchieved ? "✓ حقق التارجت" : `${progress}% من التارجت`}</b></header><div class="target-progress"><i style="width:${progress}%"></i></div><dl><div><dt>إيراد الشهر</dt><dd>${money(item.revenue)}</dd></div><div><dt>التارجت</dt><dd>${money(item.monthlyTarget)}</dd></div><div><dt>الأساسي</dt><dd>${money(item.baseSalary)}</dd></div><div><dt>زيادة ${Number(item.targetBonusPercent || 0)}%</dt><dd>${money(item.bonus)}</dd></div></dl><div class="payroll-total"><span>الراتب المتوقع</span><strong>${money(item.netSalary)}</strong></div>${paid ? `<p class="salary-paid">تم الصرف: ${money(item.payment.netSalary)} • ${escapeHtml(dateTime(item.payment.paidAt))}</p>` : state.role === "admin" ? `<div class="payroll-actions"><label>تسوية + أو -<input type="number" step="any" value="0" data-payroll-adjustment="${escapeAttr(item.id)}"></label><select data-payroll-method="${escapeAttr(item.id)}"><option value="cash">نقدي</option><option value="vodafone_cash">فودافون كاش</option><option value="instapay">إنستاباي</option></select><button class="small-button primary" data-pay-salary="${escapeAttr(item.id)}">تسجيل صرف الراتب</button></div>` : ""}</article>`;
  }).join("") || '<div class="entity-card"><p>أضف بيانات الراتب والتارجت من قسم فريق العمل.</p></div>';
}

function posCatalogItems() {
  const branchId = $("#posBranch")?.value || "talkha";
  const categories = new Map((state.collections.get("categories") || []).map(item => [item.id, item.nameAr || item.id]));
  const services = (state.collections.get("services") || []).filter(item => item.active !== false && (!item.branchIds?.length || item.branchIds.includes(branchId))).map(item => ({ id: item.id, kind: item.type === "product" ? "product" : "service", section: item.type === "product" ? "product" : "service", categoryId: item.categoryId || "", nameAr: item.nameAr, price: Number(item.price || 0), category: item.type === "product" ? "بضاعة" : categories.get(item.categoryId) || "بدون تصنيف" }));
  const packages = (state.collections.get("packages") || []).filter(item => item.active !== false && item.status !== "expired" && (!item.branchIds?.length || item.branchIds.includes(branchId))).map(item => ({ id: item.id, kind: "package", section: "package", categoryId: "", nameAr: item.nameAr, price: Number(item.price || 0), category: "باقة" }));
  const inventory = (state.business.inventory || state.collections.get("inventoryItems") || []).filter(item => item.active !== false && item.category === "product" && item.branchId === branchId).map(item => ({ id: item.id, kind: "inventory", section: "product", categoryId: "", nameAr: item.nameAr, price: Number(item.sellingPrice || 0), stockQty: Number(item.stockQty || 0), category: inventoryCategory(item.category) }));
  const drinks = (state.business.drinks || state.collections.get("drinks") || []).filter(item => item.active !== false && item.branchId === branchId).map(item => ({ id: item.id, kind: "drink", section: "drink", categoryId: "", nameAr: item.nameAr, price: Number(item.price || 0), drinkOptions: Array.isArray(item.drinkOptions) ? item.drinkOptions : [], category: drinkType(item.type) }));
  return [...services, ...packages, ...inventory, ...drinks];
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
  $("#posCustomer").innerHTML = '<option value="">عميل جديد</option>' + customers.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(`${item.firstName || ""} ${item.lastName || ""}`.trim() || item.phone)} • ${escapeHtml(item.phone)}</option>`).join("");
  $("#posCustomer").value = customers.some(item => item.id === customerValue) ? customerValue : "";
  const branchId = $("#posBranch").value;
  const staffValue = $("#posStaff").value;
  const staff = (state.collections.get("staff") || []).filter(item => item.active !== false && item.available !== false && (!item.branchIds?.length || item.branchIds.includes(branchId)));
  $("#posStaff").innerHTML = '<option value="none">بدون عامل</option>' + staff.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nameAr)}</option>`).join("");
  $("#posStaff").value = staff.some(item => item.id === staffValue) ? staffValue : "none";
  const currentCategory = $("#posCategoryFilter")?.value || "";
  fillCategoryFilter("#posCategoryFilter", currentCategory);
  const section = $("#posSectionFilter")?.value || "service";
  const category = $("#posCategoryFilter")?.value || "";
  $("#posCategoryFilter").hidden = section !== "service";
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
  if (!$("#posCart")) return;
  const index = new Map(posCatalogItems().map(item => [`${item.kind}:${item.id}`, item]));
  state.posCart = state.posCart.filter(line => index.has(`${line.kind}:${line.id}`));
  $("#posCart").innerHTML = state.posCart.map(line => {
    const item = index.get(`${line.kind}:${line.id}`);
    const options = item.section === "drink" && item.drinkOptions?.length ? `<select data-pos-option="${escapeAttr(line.id)}" data-pos-kind="${escapeAttr(line.kind)}" aria-label="تحضير ${escapeAttr(item.nameAr)}">${item.drinkOptions.map(option => `<option value="${escapeAttr(option)}" ${option === line.option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>` : "";
    const quantity = ["inventory", "product", "drink"].includes(line.kind) ? `<input type="number" min="1" max="${line.kind === "inventory" ? Math.max(1, item.stockQty) : 20}" value="${line.qty}" data-pos-qty="${escapeAttr(line.id)}" data-pos-kind="${escapeAttr(line.kind)}" aria-label="الكمية">` : "";
    return `<div class="pos-cart-line"><div><b>${escapeHtml(item.nameAr)}</b><small>${money(item.price)} × ${line.qty}${line.option ? ` • ${escapeHtml(line.option)}` : ""}</small></div><div class="pos-line-controls">${options}${quantity}</div><strong>${money(item.price * line.qty)}</strong><button type="button" data-pos-remove="${escapeAttr(line.id)}" data-pos-kind="${escapeAttr(line.kind)}">×</button></div>`;
  }).join("") || '<p>لم تتم إضافة أصناف بعد.</p>';
  const subtotal = state.posCart.reduce((sum, line) => sum + Number(index.get(`${line.kind}:${line.id}`)?.price || 0) * line.qty, 0);
  const discount = Math.max(0, Math.min(subtotal, Number($("#posDiscount").value || 0)));
  $("#posTotal").textContent = money(subtotal - discount);
}

function addPosItem(id, kind) {
  const item = posCatalogItems().find(value => value.id === id && value.kind === kind);
  if (!item) return;
  const existing = state.posCart.find(line => line.id === id && line.kind === kind);
  if (existing && ["inventory", "product", "drink"].includes(kind)) existing.qty = Math.min(kind === "inventory" ? item.stockQty : 20, existing.qty + 1);
  else if (!existing) state.posCart.push({ id, kind, qty: 1, option: item.section === "drink" ? item.drinkOptions?.[0] || "" : "" });
  renderPosCart();
}

async function submitPosOrder(event) {
  event.preventDefault();
  if (!state.posCart.length) return toast("أضف خدمة أو منتجًا للشيك", true);
  const button = $("#posSubmit");
  button.disabled = true;
  try {
    const result = await createPosOrder({ branchId: $("#posBranch").value, customer: { firstName: $("#posFirstName").value, lastName: $("#posLastName").value, phone: $("#posPhone").value }, staffId: $("#posStaff").value, items: state.posCart, discountAmount: Number($("#posDiscount").value || 0), paymentMethod: $("#posPaymentMethod").value, paid: $("#posPaid").checked });
    state.posCart = [];
    $("#posDiscount").value = "0";
    await Promise.all([loadDashboard(), loadBusiness(true)]);
    renderPos();
    toast(`تم حفظ الطلب ${result.bookingCode} وتجهيز الشيك`);
    printReceipt(result.bookingCode);
  } catch (error) { toast(error.message || "تعذر حفظ طلب المحل", true); }
  finally { button.disabled = false; }
}

function selectPosCustomer(id) {
  const customer = (state.collections.get("customers") || []).find(item => item.id === id);
  if (!customer) return;
  $("#posFirstName").value = customer.firstName || "";
  $("#posLastName").value = customer.lastName || "";
  $("#posPhone").value = customer.phone || "";
}

function toggleExpenseInventory() {
  const visible = $("#expenseCategory").value === "inventory";
  $("#expenseInventoryWrap").hidden = !visible;
  $("#expenseQuantityWrap").hidden = !visible;
}

async function submitExpense(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await recordExpense(Object.fromEntries(new FormData(form)));
    form.reset();
    $("#expenseDate").value = cairoDateKey();
    toggleExpenseInventory();
    await Promise.all([loadDashboard(), loadBusiness(true)]);
    toast("تم تسجيل المصروف وتحديث صافي الربح");
  } catch (error) { toast(error.message || "تعذر تسجيل المصروف", true); }
  finally { button.disabled = false; }
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
    const result = await getCollection(collection);
    state.collections.set(collection, result.items || []);
    renderCollection(collection);
  } catch (error) { toast(`تعذر تحميل ${collection}: ${error.message}`, true); }
}

function renderCollection(collection) {
  const query = document.querySelector(`[data-entity-search="${CSS.escape(collection)}"]`)?.value.trim().toLowerCase() || "";
  let items = (state.collections.get(collection) || []).filter(item => !query || [item.nameAr, item.nameEn, item.name, item.comment, item.titleAr, item.titleEn, item.specialtyAr, item.code, item.bookingCode, item.id, item.firstName, item.lastName, item.phone, `${item.firstName || ""} ${item.lastName || ""}`].some(value => String(value || "").toLowerCase().includes(query))).sort((a, b) => Number(b.featured || 0) - Number(a.featured || 0) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.nameAr || a.name || a.titleAr || `${a.firstName || ""} ${a.lastName || ""}`.trim() || a.id || "").localeCompare(String(b.nameAr || b.name || b.titleAr || `${b.firstName || ""} ${b.lastName || ""}`.trim() || b.id || ""), "ar"));
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
  if (collection === "settings") { fillSettings(items[0] || {}); return; }
  const targets = $$(`[data-list="${collection}"]`);
  targets.forEach(target => { target.innerHTML = items.map(item => entityCard(collection, item, ["customers", "activityLogs", "users"].includes(collection))).join("") || `<div class="entity-card filter-empty"><p>${collection === "services" && !query && !$("#serviceCategoryFilter")?.value ? "اختر تصنيفًا من القائمة أو ابحث باسم الخدمة." : "لا توجد بيانات."}</p></div>`; });
  if (collection === "content") {
    ["gallery", "celebrity", "news"].forEach(type => {
      const target = $(`[data-list="content-${type}"]`);
      if (target) target.innerHTML = items.filter(item => item.type === type).map(item => entityCard("content", item)).join("") || '<div class="entity-card"><p>لا توجد بيانات.</p></div>';
    });
  }
}

function entityCard(collection, item, readonly = false) {
  if (collection === "customers") return customerCard(item);
  if (collection === "reviews") return reviewCard(item);
  const title = item.nameAr || item.name || item.titleAr || item.code || item.date || item.key || item.customerName || item.email || item.action || item.id;
  const category = collection === "services" ? (state.collections.get("categories") || []).find(value => value.id === item.categoryId) : null;
  const detail = collection === "services" ? `${category?.nameAr || item.categoryId || "بدون تصنيف"} • ${money(item.price)}${Number(item.duration) ? ` • ${Number(item.duration)} دقيقة` : ""}`
    : collection === "categories" ? `ترتيب الظهور: ${Number(item.sortOrder || 0)}`
    : collection === "packages" ? `${money(item.price)}${Number(item.duration) ? ` • ${Number(item.duration)} دقيقة` : ""}`
    : collection === "offers" ? `${money(item.newPrice)}${item.endAt ? " • عرض محدد المدة" : ""}`
    : collection === "inventoryItems" ? `${inventoryCategory(item.category)} • بيع ${money(item.sellingPrice)} • رصيد ${Number(item.stockQty || 0)} ${item.unit || "قطعة"} • ${branchLabel(item.branchId)}`
    : collection === "drinks" ? `${drinkType(item.type)} • ${money(item.price)} • ${branchLabel(item.branchId)}${item.drinkOptions?.length ? ` • التحضير: ${item.drinkOptions.join("، ")}` : ""}`
    : collection === "reviews" ? `${"★".repeat(Math.max(1, Math.min(5, Number(item.rating || 5))))} • ${item.comment || "بدون تعليق"}${item.verified ? " • حجز موثّق" : ""}`
    : item.addressAr || item.specialtyAr || item.reasonAr || item.bodyAr || item.phone || item.collection || item.role || item.id;
  const contentPreview = collection === "content" ? `<div class="entity-media">${item.imageUrl ? `<img src="${escapeAttr(item.imageUrl)}" alt="" loading="lazy" decoding="async">` : `<span>${isVideoContent(item) ? "▶" : "▧"}</span>`}${isVideoContent(item) ? '<b>فيديو</b>' : ""}</div><p class="entity-branch">${branchScopeLabel(item.branchIds)}</p>` : "";
  return `<article class="entity-card ${item.active === false || item.available === false ? "inactive" : ""}">${collection === "staff" ? `<img class="entity-avatar" src="${escapeAttr(item.imageUrl || "/assets/el-mezaen-logo.jpeg")}" alt="" loading="lazy" decoding="async">` : ""}${contentPreview}<h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p>${collection === "coupons" ? `<p>استخدام: ${item.usageCount || 0} • خصومات: ${money(item.discountTotal || 0)}</p>` : ""}${collection === "staff" ? `<p>حجوزات: ${item.bookingCount || 0} • إيراد: ${money(item.revenueTotal || 0)}<br>راتب: ${money(item.baseSalary)} • تارجت: ${money(item.monthlyTarget)} • زيادة: ${Number(item.targetBonusPercent || 0)}%</p>` : ""}${collection === "inventoryItems" && Number(item.stockQty || 0) <= Number(item.minStock || 0) ? '<b class="stock-warning">⚠ الرصيد منخفض</b>' : ""}${collection === "reviews" ? `<b class="review-state">${item.active ? "منشور على الموقع" : "بانتظار المراجعة"}</b>` : ""}${readonly ? "" : `<footer>${collection === "categories" ? `<button class="category-view" data-service-category="${escapeAttr(item.id)}">عرض الخدمات</button>` : ""}<button data-edit-collection="${collection}" data-edit-id="${escapeAttr(item.id)}">تعديل</button>${"active" in item ? `<button data-toggle-collection="${collection}" data-toggle-id="${escapeAttr(item.id)}">${collection === "reviews" ? item.active ? "إخفاء" : "نشر" : item.active === false ? "تفعيل" : "إيقاف"}</button>` : ""}<button class="delete" data-delete-collection="${collection}" data-delete-id="${escapeAttr(item.id)}">حذف</button></footer>`}</article>`;
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
  return `<article class="entity-card customer-card"><div class="customer-avatar">${escapeHtml(initial)}</div><div><h3>${escapeHtml(name)}</h3><p><a href="tel:+2${escapeAttr(phone)}">${escapeHtml(phone || "لا يوجد رقم")}</a></p></div><dl class="customer-details"><div><dt>آخر فرع</dt><dd>${escapeHtml(item.lastBranchId ? branchLabel(item.lastBranchId) : "—")}</dd></div><div><dt>عدد الحجوزات</dt><dd>${Number(item.bookingCount || 0)}</dd></div><div><dt>إجمالي المدفوع</dt><dd>${money(item.totalSpent)}</dd></div><div><dt>آخر حجز</dt><dd>${escapeHtml(dateTime(item.lastBookingAt))}</dd></div></dl></article>`;
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
  const editorItem = { active: true, available: true, closed: true, mediaType: "image", ...preset, ...item };
  $("#editorFields").innerHTML = schema.map(definition => renderField(definition, editorItem)).join("") + (collection === "content" ? '<div class="editor-media-preview full" id="editorMediaPreview"><span>ستظهر معاينة الصورة أو الفيديو هنا</span></div>' : "");
  if (collection === "content") {
    $("#editorFields").addEventListener("input", updateEditorMediaPreview);
    $("#editorFields").addEventListener("change", updateEditorMediaPreview);
    updateEditorMediaPreview();
  }
  $("#editorDialog").showModal();
}

function renderField([name, label, type, required = false, options = null, full = false], item) {
  const value = Array.isArray(item[name]) ? item[name].join(",") : item[name] ?? "";
  const className = full ? "full" : "";
  if (type === "textarea") return `<label class="${className}">${label}<textarea name="${name}" ${required ? "required" : ""}>${escapeHtml(value)}</textarea></label>`;
  if (type === "select") return `<label class="${className}">${label}<select name="${name}" ${required ? "required" : ""}>${options.map(([key, text]) => `<option value="${escapeAttr(key)}" ${String(value) === String(key) ? "selected" : ""}>${text}</option>`).join("")}</select></label>`;
  if (type === "category-select") {
    const categories = (state.collections.get("categories") || []).filter(category => category.active !== false);
    return `<label class="${className}">${label}<select name="${name}" ${required ? "required" : ""}><option value="">اختر التصنيف</option>${categories.map(category => `<option value="${escapeAttr(category.id)}" ${String(value) === category.id ? "selected" : ""}>${escapeHtml(category.nameAr || category.id)}</option>`).join("")}</select></label>`;
  }
  if (type === "branch-scope") {
    const scope = Array.isArray(item[name]) ? item[name].join(",") : String(value);
    return `<label class="${className}">${label}<select name="${name}" ${required ? "required" : ""}><option value="" ${!scope ? "selected" : ""}>كل الفروع</option><option value="talkha" ${scope === "talkha" ? "selected" : ""}>فرع طلخا</option><option value="mashaya" ${scope === "mashaya" ? "selected" : ""}>فرع المشاية</option><option value="talkha,mashaya" ${scope === "talkha,mashaya" || scope === "mashaya,talkha" ? "selected" : ""}>طلخا والمشاية</option></select></label>`;
  }
  if (type === "branch-select") return `<label class="${className}">${label}<select name="${name}" ${required ? "required" : ""}><option value="talkha" ${value === "talkha" ? "selected" : ""}>فرع طلخا</option><option value="mashaya" ${value === "mashaya" ? "selected" : ""}>فرع المشاية</option></select></label>`;
  if (type === "boolean") return `<label class="${className}">${label}<select name="${name}"><option value="true" ${value !== false ? "selected" : ""}>نعم</option><option value="false" ${value === false ? "selected" : ""}>لا</option></select></label>`;
  const dateValue = type === "datetime-local" && value ? String(value).slice(0, 16) : value;
  const inputType = type === "video-file" ? "file" : type;
  const accept = type === "file" ? 'accept="image/jpeg,image/png,image/webp,image/avif"' : type === "video-file" ? 'accept="video/mp4,video/webm"' : "";
  return `<label class="${className}">${label}<input name="${name}" type="${inputType}" value="${inputType === "file" ? "" : escapeAttr(dateValue)}" ${required ? "required" : ""} ${type === "number" ? 'step="any"' : ""} ${accept}></label>`;
}

let editorPreviewUrl = "";
function updateEditorMediaPreview() {
  const preview = $("#editorMediaPreview");
  if (!preview) return;
  if (editorPreviewUrl) URL.revokeObjectURL(editorPreviewUrl);
  const imageFile = $('#editorFields input[name="imageFile"]')?.files?.[0];
  const videoFile = $('#editorFields input[name="videoFile"]')?.files?.[0];
  const imageUrl = imageFile ? (editorPreviewUrl = URL.createObjectURL(imageFile)) : $('#editorFields [name="imageUrl"]')?.value.trim();
  const rawVideoUrl = videoFile ? (editorPreviewUrl = URL.createObjectURL(videoFile)) : $('#editorFields [name="videoUrl"]')?.value.trim();
  const source = videoSource(rawVideoUrl);
  if (videoFile || source.kind === "direct") preview.innerHTML = `<video src="${escapeAttr(rawVideoUrl || editorPreviewUrl)}" poster="${escapeAttr(imageUrl || "")}" controls playsinline preload="metadata"></video>`;
  else if (source.kind === "embed") preview.innerHTML = `<iframe src="${escapeAttr(source.url)}" title="معاينة الفيديو" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  else if (source.kind === "external") preview.innerHTML = `<a href="${escapeAttr(source.url)}" target="_blank" rel="noopener">فتح ومعاينة رابط الفيديو ↗</a>`;
  else if (imageUrl) preview.innerHTML = `<img src="${escapeAttr(imageUrl)}" alt="معاينة الصورة">`;
  else preview.innerHTML = "<span>ستظهر معاينة الصورة أو الفيديو هنا</span>";
}

async function saveEditor(event) {
  event.preventDefault();
  const { collection, id } = state.editor;
  const formData = new FormData(event.currentTarget);
  const image = formData.get("imageFile");
  const video = formData.get("videoFile");
  formData.delete("imageFile");
  formData.delete("videoFile");
  const payload = Object.fromEntries(formData.entries());
  const existing = id ? (state.collections.get(collection) || []).find(item => item.id === id) || {} : {};
  [["nameAr", "nameEn"], ["descriptionAr", "descriptionEn"], ["titleAr", "titleEn"], ["bodyAr", "bodyEn"], ["specialtyAr", "specialtyEn"], ["bioAr", "bioEn"], ["reasonAr", "reasonEn"]].forEach(([ar, en]) => { if (payload[ar] != null) payload[en] = existing[en] || payload[ar]; });
  $("#editorSave").disabled = true;
  try {
    if (image?.size) payload.imageUrl = await uploadImage(image, collection);
    if (video?.size) { payload.videoUrl = await uploadVideo(video, collection); payload.mediaType = "video"; }
    await saveEntity(collection, id, payload);
    $("#editorDialog").close();
    await loadCollection(collection, true);
    if (["inventoryItems", "drinks", "staff"].includes(collection)) await loadBusiness(true);
    toast("تم الحفظ بنجاح");
  } catch (error) { toast(error.message || "تعذر الحفظ", true); }
  finally { $("#editorSave").disabled = false; }
}

async function deleteItem(collection, id) {
  if (!confirm("هل تريد حذف هذا العنصر؟ لا يمكن التراجع بعد الحذف.")) return;
  try { await deleteEntity(collection, id); await loadCollection(collection, true); if (["inventoryItems", "drinks", "staff", "reviews"].includes(collection)) await loadBusiness(true); toast("تم الحذف"); }
  catch (error) { toast(error.message || "تعذر الحذف", true); }
}

function openSecureDelete(kind, id, label) {
  if (state.role !== "admin") return toast("الحذف النهائي متاح للأدمن فقط", true);
  state.secureDelete = { kind, id, label };
  $("#secureDeleteMessage").textContent = `سيتم حذف ${label} نهائيًا وتحديث الحسابات المرتبطة به. هذه العملية لا يمكن التراجع عنها.`;
  $("#secureDeletePassword").value = "";
  $("#secureDeleteDialog").showModal();
  setTimeout(() => $("#secureDeletePassword").focus(), 50);
}

function closeSecureDelete() {
  if ($("#secureDeleteDialog").open) $("#secureDeleteDialog").close();
  $("#secureDeletePassword").value = "";
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
  const pending = { ...state.secureDelete };
  if (!pending.id || !password) return;
  $("#secureDeleteConfirm").disabled = true;
  try {
    await verifyAdminPassword(password);
    await secureDeleteRecord(pending.kind, pending.id);
    closeSecureDelete();
    await loadDashboard();
    if (pending.kind === "expense") await loadBusiness(true);
    if (state.collections.has("customers")) await loadCollection("customers", true);
    toast(pending.kind === "booking" ? "تم حذف الحجز وتحديث بيانات العميل والإيرادات" : pending.kind === "expense" ? "تم حذف المصروف وتحديث صافي الربح" : "تم حذف عملية الإيراد وتحديث الحسابات");
  } catch (error) { toast(secureDeleteError(error), true); }
  finally { $("#secureDeleteConfirm").disabled = false; }
}

async function toggleItem(collection, id) {
  const item = (state.collections.get(collection) || []).find(value => value.id === id);
  if (!item) return;
  try { await saveEntity(collection, id, { active: item.active === false }); await loadCollection(collection, true); if (["inventoryItems", "drinks", "staff", "reviews"].includes(collection)) await loadBusiness(true); toast(item.active === false ? "تم التفعيل" : "تم الإيقاف"); }
  catch (error) { toast(error.message || "تعذر تعديل الحالة", true); }
}

async function updateReview(id, action, featured = false) {
  const payload = action === "publish" ? { status: "published" } : action === "reject" ? { status: "rejected", featured: false } : { featured: !featured };
  try { await saveEntity("reviews", id, payload); await loadCollection("reviews", true); toast(action === "publish" ? "تم نشر التقييم على الموقع" : action === "reject" ? "تم رفض التقييم" : featured ? "تم إلغاء تثبيت التقييم" : "تم تثبيت التقييم كمميز"); }
  catch (error) { toast(error.message || "تعذر تحديث التقييم", true); }
}

async function updateBookingAction(id, action) {
  const method = document.querySelector(`[data-payment-method="${CSS.escape(id)}"]`)?.value || "cash";
  try { await changeBooking(id, action, method); await loadDashboard(); toast(action === "markPaid" ? "تم تسجيل الدفع مرة واحدة" : action === "refund" ? "تم تسجيل الاسترداد" : "تم تحديث حالة الحجز"); }
  catch (error) { toast(error.message || "تعذر تحديث الحجز", true); }
}

function fillSettings(item) {
  [$("#scheduleSettings"), $("#contactSettings"), $("#siteSettings")].forEach(form => {
    if (!form) return;
    [...form.elements].forEach(input => { if (input.name && item[input.name] != null) input.value = item[input.name]; });
  });
}

async function saveSettingsForm(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  const existing = (state.collections.get("settings") || [])[0] || {};
  if (payload.businessNameAr != null) payload.businessNameEn = existing.businessNameEn || payload.businessNameAr;
  if (payload.aboutAr != null) payload.aboutEn = existing.aboutEn || payload.aboutAr;
  try { await saveEntity("settings", "public", payload); await loadCollection("settings", true); toast("تم حفظ الإعدادات"); }
  catch (error) { toast(error.message || "تعذر الحفظ", true); }
}

function exportCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function notifyNewBooking() {
  toast("🔔 وصل حجز جديد");
  if (Notification.permission === "granted") new Notification("حجز جديد في مزين مصر", { body: "افتح لوحة الحجوزات للمراجعة.", icon: "/assets/el-mezaen-logo.jpeg" });
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880; gain.gain.value = .07; oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .16);
  } catch {}
}

function statusLabel(value) { return ({ pending: "جديد", confirmed: "مؤكد", rejected: "مرفوض", cancelled: "ملغي", completed: "مكتمل" })[value] || value || "—"; }
function paymentLabel(value) { return ({ unpaid: "لم يدفع", paid: "مدفوع", refunded: "مسترد" })[value] || value || "—"; }
function paymentMethod(value) { return ({ cash: "نقدي", vodafone_cash: "فودافون كاش", instapay: "إنستاباي", other: "أخرى" })[value] || value || "—"; }
function emptyRow(columns) { return `<tr><td colspan="${columns}">لا توجد بيانات.</td></tr>`; }

document.addEventListener("click", async event => {
  const section = event.target.closest("[data-section]"); if (section) { if (section.dataset.section === "expenses") state.expenseInventoryKind = "all"; showSection(section.dataset.section); }
  const go = event.target.closest("[data-go]"); if (go) showSection(go.dataset.go);
  const add = event.target.closest("[data-new]"); if (add) openEditor(add.dataset.new, "", add.dataset.presetType ? { type: add.dataset.presetType } : add.dataset.presetCategory ? { category: add.dataset.presetCategory } : {});
  const stockExpense = event.target.closest("[data-open-stock-expense]"); if (stockExpense) { state.expenseInventoryKind = stockExpense.dataset.openStockExpense; await showSection("expenses"); $("#expenseCategory").value = "inventory"; toggleExpenseInventory(); renderBusiness(); $("#expenseForm")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  const edit = event.target.closest("[data-edit-collection]"); if (edit) openEditor(edit.dataset.editCollection, edit.dataset.editId);
  const remove = event.target.closest("[data-delete-collection]"); if (remove) deleteItem(remove.dataset.deleteCollection, remove.dataset.deleteId);
  const toggle = event.target.closest("[data-toggle-collection]"); if (toggle) toggleItem(toggle.dataset.toggleCollection, toggle.dataset.toggleId);
  const booking = event.target.closest("[data-booking-action]"); if (booking) updateBookingAction(booking.dataset.bookingId, booking.dataset.bookingAction);
  const printButton = event.target.closest("[data-print-booking]"); if (printButton) printReceipt(printButton.dataset.printBooking);
  const deleteBooking = event.target.closest("[data-secure-delete-booking]"); if (deleteBooking) openSecureDelete("booking", deleteBooking.dataset.secureDeleteBooking, deleteBooking.dataset.secureDeleteLabel);
  const deleteRevenue = event.target.closest("[data-secure-delete-revenue]"); if (deleteRevenue) openSecureDelete("revenue", deleteRevenue.dataset.secureDeleteRevenue, deleteRevenue.dataset.secureDeleteLabel);
  const deleteExpense = event.target.closest("[data-secure-delete-expense]"); if (deleteExpense) openSecureDelete("expense", deleteExpense.dataset.secureDeleteExpense, deleteExpense.dataset.secureDeleteLabel);
  const posAdd = event.target.closest("[data-pos-add]"); if (posAdd) addPosItem(posAdd.dataset.posAdd, posAdd.dataset.posKind);
  const posRemove = event.target.closest("[data-pos-remove]"); if (posRemove) { state.posCart = state.posCart.filter(line => line.id !== posRemove.dataset.posRemove || line.kind !== posRemove.dataset.posKind); renderPosCart(); }
  const serviceCategory = event.target.closest("[data-service-category]"); if (serviceCategory) { $("#serviceCategoryFilter").value = serviceCategory.dataset.serviceCategory; renderCollection("services"); $(".services-column")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  const salary = event.target.closest("[data-pay-salary]"); if (salary) paySalary(salary.dataset.paySalary);
  const review = event.target.closest("[data-review-action]"); if (review) updateReview(review.dataset.reviewId, review.dataset.reviewAction, review.dataset.reviewFeatured === "true");
});
document.addEventListener("input", event => {
  if (event.target.matches("[data-entity-search]")) renderCollection(event.target.dataset.entitySearch);
  if (event.target.id === "posItemSearch" || event.target.id === "posDiscount") event.target.id === "posItemSearch" ? renderPos() : renderPosCart();
  if (event.target.matches("[data-pos-qty]")) { const line = state.posCart.find(item => item.id === event.target.dataset.posQty && item.kind === event.target.dataset.posKind); if (line) { line.qty = Math.max(1, Number(event.target.value || 1)); renderPosCart(); } }
});
document.addEventListener("change", event => {
  if (event.target.matches("[data-pos-option]")) { const line = state.posCart.find(item => item.id === event.target.dataset.posOption && item.kind === event.target.dataset.posKind); if (line) { line.option = event.target.value; renderPosCart(); } }
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
$("#adminMenu").addEventListener("click", toggleAdminMenu);
$("#sidebarBackdrop").addEventListener("click", closeAdminMenu);
document.addEventListener("keydown", event => { if (event.key === "Escape") closeAdminMenu(); });
$("#adminTheme").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
$("#logoutButton").addEventListener("click", async () => { await logout(); location.replace("/login/"); });
$("#pushButton").addEventListener("click", async () => { try { await enablePush(); toast("تم تفعيل الإشعارات"); } catch { toast("أضف VAPID Key واسمح بالإشعارات أولًا", true); } });
$("#editorClose").addEventListener("click", () => $("#editorDialog").close());
$("#editorCancel").addEventListener("click", () => $("#editorDialog").close());
$("#entityForm").addEventListener("submit", saveEditor);
[$("#scheduleSettings"), $("#siteSettings")].forEach(form => form.addEventListener("submit", saveSettingsForm));
$("#bookingSearch").addEventListener("input", renderBookings);
$("#bookingStatusFilter").addEventListener("change", renderBookings);
$("#bookingBranchFilter").addEventListener("change", renderBookings);
$("#applyRevenueFilter").addEventListener("click", renderRevenue);
$("#exportBookings").addEventListener("click", () => exportCsv("el-mezaen-bookings.csv", ["code", "branch", "customer", "phone", "items", "staff", "date", "time", "subtotal", "discount", "total", "status", "payment"], state.dashboard.bookings.map(item => [item.code, item.branchNameAr || branchLabel(item.branchId), item.customerName, item.phone, (item.serviceNamesAr || []).join(" + "), item.staffNameAr, item.bookingDate, item.bookingTime, item.subtotal, item.discountAmount, item.total, item.status, item.paymentStatus])));
$("#exportRevenue").addEventListener("click", () => exportCsv("el-mezaen-revenue.csv", ["date", "branch", "booking", "type", "method", "staff", "amount"], state.dashboard.ledger.map(item => [item.dateKey, branchLabel(item.branchId), item.bookingCode, item.type, item.paymentMethod, item.staffId, item.amount])));
$("#openScanner").addEventListener("click", openScanner);
$("#scannerClose").addEventListener("click", closeScanner);
$("#findScannedBooking").addEventListener("click", findScanned);
$("#secureDeleteClose").addEventListener("click", closeSecureDelete);
$("#secureDeleteCancel").addEventListener("click", closeSecureDelete);
$("#secureDeleteForm").addEventListener("submit", submitSecureDelete);
$("#posForm").addEventListener("submit", submitPosOrder);
$("#posBranch").addEventListener("change", renderPos);
$("#posSectionFilter").addEventListener("change", () => { $("#posItemSearch").value = ""; renderPos(); });
$("#posCategoryFilter").addEventListener("change", renderPos);
$("#serviceCategoryFilter").addEventListener("change", () => renderCollection("services"));
$("#posCustomer").addEventListener("change", event => selectPosCustomer(event.target.value));
$("#expenseForm").addEventListener("submit", submitExpense);
$("#expenseCategory").addEventListener("change", toggleExpenseInventory);
$("#refreshPayroll").addEventListener("click", () => loadBusiness());
$("#payrollMonth").addEventListener("change", () => loadBusiness());
$("#exportPayroll").addEventListener("click", () => exportCsv(`el-mezaen-payroll-${state.business.month}.csv`, ["العامل", "الإيراد", "التارجت", "الأساسي", "نسبة الزيادة", "الزيادة", "الراتب", "الحالة"], (state.business.payroll || []).map(item => [item.nameAr, item.revenue, item.monthlyTarget, item.baseSalary, item.targetBonusPercent, item.bonus, item.payment?.netSalary ?? item.netSalary, item.payment ? "تم الصرف" : "لم يصرف"])));
$("#accountRole").addEventListener("change", event => renderPermissionPicker(event.target.value));
$("#userAccountForm").addEventListener("submit", submitUserAccount);
$("#refreshUsers").addEventListener("click", async () => { await loadCollection("users", true); renderUserAccounts(); });
renderPermissionPicker();

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; $("#installAdmin").hidden = false; });
window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; $("#installAdmin").hidden = true; toast("تم تثبيت لوحة الإدارة"); });
$("#installAdmin").addEventListener("click", async () => { if (!deferredInstallPrompt) return toast("استخدم تثبيت التطبيق من قائمة المتصفح", true); deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $("#installAdmin").hidden = true; });

setupPanels();
$("#reviewStatusFilter").addEventListener("change", () => renderCollection("reviews"));
setTheme(localStorage.getItem("mz-admin-theme") === "light" ? "light" : "dark");
$("#expenseDate").value = cairoDateKey();
$("#payrollMonth").value = cairoDateKey().slice(0, 7);
toggleExpenseInventory();
if ("serviceWorker" in navigator && location.protocol !== "http:") navigator.serviceWorker.register("/sw.js").catch(() => {});
watchAuth(async user => {
  if (!user) { location.replace("/login/"); return; }
  try {
    const access = await currentAccess(user);
    if (!access.role) { await logout(); location.replace("/login/"); return; }
    state.user = user; state.role = access.role; state.permissions = new Set(access.role === "admin" ? Object.keys(permissionLabels).concat("users") : access.permissions); state.branchIds = access.role === "admin" ? ["talkha", "mashaya"] : access.branchIds;
    $("#welcomeText").textContent = `لوحة إدارة مزين مصر • ${access.role}`;
    $("#authLoading").hidden = true; $("#adminApp").hidden = false;
    applyAccess();
    const firstSection = state.role === "admin" ? "dashboard" : ([...state.permissions].find(value => $(`#${value}`)) || "pos");
    await showSection(firstSection);
    setInterval(() => { if (["dashboard", "bookings", "revenue", "pos", "expenses"].includes(state.section)) loadDashboard(true); }, 20000);
  } catch { location.replace("/login/"); }
});
