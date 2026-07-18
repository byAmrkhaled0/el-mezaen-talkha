import "./admin.css";
import JsBarcode from "jsbarcode";
import { changeBooking, currentRole, deleteEntity, enablePush, getCollection, getDashboard, logout, saveEntity, uploadImage, uploadVideo, watchAuth } from "./admin-api.js";
import { isVideoContent, videoSource } from "./media.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(value || 0));
const escapeHtml = value => { const node = document.createElement("div"); node.textContent = value ?? ""; return node.innerHTML; };
const escapeAttr = value => escapeHtml(String(value ?? "")).replaceAll('"', "&quot;");
const state = { user: null, role: null, dashboard: { bookings: [], ledger: [], stats: {} }, collections: new Map(), section: "dashboard", lastBookingCount: null, editor: { collection: "", id: "", preset: {} } };

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
    ["available", "متاح", "boolean"], ["sortOrder", "ترتيب الظهور", "number"], ["bookingCount", "عدد الحجوزات", "number"], ["revenueTotal", "إجمالي الإيرادات", "number"], ["active", "مفعل", "boolean"]
  ],
  holidays: [["branchId", "الفرع", "branch-select", true], ["date", "التاريخ", "date", true], ["reasonAr", "السبب", "text"], ["closed", "مغلق بالكامل", "boolean"]],
  content: [["type", "النوع", "select", true, [["gallery", "معرض"], ["celebrity", "صور مشاهير"], ["news", "خبر/منشور"]]], ["titleAr", "العنوان", "text", true], ["bodyAr", "المحتوى", "textarea", false, null, true], ["branchIds", "يظهر في", "branch-scope", false, null, true], ["mediaType", "نوع الوسائط", "select", true, [["image", "صورة"], ["video", "فيديو"]]], ["imageUrl", "رابط الصورة أو غلاف الفيديو", "url", false, null, true], ["imageFile", "رفع صورة أو غلاف", "file", false, null, true], ["videoUrl", "رابط YouTube أو Facebook أو TikTok أو MP4", "url", false, null, true], ["videoFile", "رفع فيديو MP4 أو WebM (بحد أقصى 30MB)", "video-file", false, null, true], ["linkUrl", "رابط المنشور الأصلي", "url", false, null, true], ["sortOrder", "الترتيب", "number"], ["active", "مفعل", "boolean"]],
};

const sectionTitles = Object.fromEntries($$('[data-section]').map(button => [button.dataset.section, button.textContent.trim().replace(/^[^\s]+\s/, "")]));

function setupPanels() {
  $$('entity-panel').forEach(panel => {
    const collection = panel.dataset.collection;
    const readonly = panel.dataset.readonly === "true";
    const addLabel = collection === "staff" ? "+ إضافة عضو فريق باسمه وصورته" : "+ إضافة جديد";
    panel.innerHTML = `<article class="admin-panel"><div class="panel-head wrap"><div><h2>${escapeHtml(panel.dataset.title)}</h2><p>${readonly ? "عرض البيانات المسجلة." : "إضافة وتعديل وإخفاء وحذف العناصر."}</p></div><div class="toolbar"><input data-entity-search="${collection}" placeholder="بحث في ${escapeAttr(panel.dataset.title)}">${readonly ? "" : `<button class="small-button primary" data-new="${collection}">${addLabel}</button>`}</div></div><div class="entity-grid" data-list="${collection}"></div></article>`;
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
  state.section = id;
  $$('.admin-section').forEach(section => section.classList.toggle("active", section.id === id));
  $$('[data-section]').forEach(button => button.classList.toggle("active", button.dataset.section === id));
  $("#pageTitle").textContent = sectionTitles[id] || id;
  closeAdminMenu();
  if (id === "dashboard" || id === "bookings" || id === "revenue") await loadDashboard();
  const map = { packages: ["packages"], offers: ["offers"], coupons: ["coupons"], staff: ["staff"], customers: ["customers"], schedule: ["holidays", "settings"], gallery: ["content"], celebrities: ["content"], posts: ["content"], settings: ["settings"], activity: ["activityLogs"], services: ["categories", "services"] };
  for (const collection of map[id] || []) await loadCollection(collection, true);
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

function renderDashboard() {
  const s = state.dashboard.stats || {};
  $("#statTodayBookings").textContent = s.todayBookings || 0;
  $("#statTodayRevenue").textContent = money(s.todayRevenue);
  $("#statMonthRevenue").textContent = money(s.monthRevenue);
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

function branchLabel(id) { return ({ talkha: "فرع طلخا", mashaya: "فرع المشاية" })[id] || id || "فرع طلخا"; }

function renderBranchFilters() {
  const branches = [...new Map(state.dashboard.bookings.map(item => [item.branchId || "talkha", item.branchNameAr || branchLabel(item.branchId)])).entries()];
  [["#bookingBranchFilter", "كل الفروع"], ["#revenueBranch", "كل الفروع"]].forEach(([selector, allLabel]) => {
    const select = $(selector);
    const current = select.value;
    select.innerHTML = `<option value="all">${allLabel}</option>` + branches.map(([id, name]) => `<option value="${escapeAttr(id)}">${escapeHtml(name)}</option>`).join("");
    select.value = branches.some(([id]) => id === current) ? current : "all";
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
    return `<tr data-booking-row="${escapeAttr(item.code)}"><td><b>${escapeHtml(item.code)}</b><br><small>${escapeHtml(item.createdAt || "")}</small></td><td><span class="branch-pill">${escapeHtml(branchName)}</span></td><td>${escapeHtml(item.customerName)}<br><small>${escapeHtml(item.phone)}</small><br><small>${item.partySize || 1} فرد</small></td><td>${escapeHtml((item.serviceNamesAr || []).join(" + "))}<br><strong>${money(item.total)}</strong></td><td>${escapeHtml(item.staffNameAr)}</td><td>${escapeHtml(item.bookingDate || "طلب منتجات")}<br>${escapeHtml(item.bookingTime || "")}</td><td><span class="status-pill">${statusLabel(item.status)}</span></td><td><div class="payment-controls"><b>${paymentLabel(item.paymentStatus)}</b><select data-payment-method="${escapeAttr(item.id)}"><option value="cash">نقدي</option><option value="vodafone_cash">فودافون كاش</option><option value="instapay">إنستاباي</option><option value="other">أخرى</option></select><div class="row-actions">${item.paymentStatus === "unpaid" ? `<button class="pay" data-booking-action="markPaid" data-booking-id="${escapeAttr(item.id)}">تم الدفع</button>` : ""}${item.paymentStatus === "paid" ? `<button class="refund" data-booking-action="refund" data-booking-id="${escapeAttr(item.id)}">استرداد</button>` : ""}</div></div></td><td><div class="row-actions"><button data-print-booking="${escapeAttr(item.id)}">طباعة شيك</button><button data-booking-action="confirmed" data-booking-id="${escapeAttr(item.id)}">تأكيد</button><button data-booking-action="rejected" data-booking-id="${escapeAttr(item.id)}">رفض</button><button data-booking-action="cancelled" data-booking-id="${escapeAttr(item.id)}">إلغاء</button><button data-booking-action="completed" data-booking-id="${escapeAttr(item.id)}">إكمال</button><a href="https://wa.me/2${String(item.phone || "").replace(/\D/g, "")}?text=${waMessage}" target="_blank" rel="noopener">واتساب</a></div></td></tr>`;
  }).join("") || emptyRow(9);
}

function printReceipt(id) {
  const item = state.dashboard.bookings.find(value => value.id === id);
  if (!item) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, item.code, { format: "CODE128", displayValue: true, height: 52, fontSize: 13, margin: 4 });
  const lines = (item.items || []).map(line => `<tr><td>${escapeHtml(line.nameAr)}</td><td>${line.qty || 1}</td><td>${money(line.lineTotal ?? line.price)}</td></tr>`).join("");
  const popup = window.open("", "_blank", "width=420,height=700");
  popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><title>${escapeHtml(item.code)}</title><style>body{font-family:Arial;padding:24px;color:#111}header{text-align:center;border-bottom:2px dashed #333;padding-bottom:14px}img{width:72px}table{width:100%;border-collapse:collapse;margin:18px 0}td,th{padding:8px;border-bottom:1px dashed #aaa;text-align:right}.total{font-size:22px;font-weight:bold;display:flex;justify-content:space-between}.meta{line-height:1.8}svg{max-width:100%}@media print{button{display:none}}</style></head><body><header><img src="/assets/el-mezaen-logo.jpeg"><h2>مزين مصر – ${escapeHtml(item.branchNameAr || branchLabel(item.branchId))}</h2><p>شيك حجز</p>${svg.outerHTML}</header><div class="meta"><b>الفرع:</b> ${escapeHtml(item.branchNameAr || branchLabel(item.branchId))}<br><b>العميل:</b> ${escapeHtml(item.customerName)}<br><b>الهاتف:</b> ${escapeHtml(item.phone)}<br><b>عدد الأفراد:</b> ${item.partySize || 1}<br><b>العامل:</b> ${escapeHtml(item.staffNameAr)}<br><b>الموعد:</b> ${escapeHtml(item.bookingDate || "طلب منتجات")} ${escapeHtml(item.bookingTime || "")}</div><table><thead><tr><th>البند</th><th>العدد</th><th>السعر</th></tr></thead><tbody>${lines}</tbody></table><p>المجموع الفرعي: ${money(item.subtotal)}</p><p>الخصم: ${money(item.discountAmount)}</p><div class="total"><span>الإجمالي</span><span>${money(item.total)}</span></div><p>حالة الدفع: ${paymentLabel(item.paymentStatus)}</p><button onclick="print()">طباعة</button></body></html>`);
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
  const from = $("#revenueFrom").value;
  const to = $("#revenueTo").value;
  const branch = $("#revenueBranch").value;
  const staff = $("#revenueStaff").value;
  const service = $("#revenueService").value.trim();
  const rows = state.dashboard.ledger.filter(item => (!from || item.dateKey >= from) && (!to || item.dateKey <= to) && (branch === "all" || (item.branchId || "talkha") === branch) && (staff === "all" || item.staffId === staff) && (!service || (item.itemIds || []).includes(service)));
  $("#revenueTable").innerHTML = rows.map(item => `<tr><td>${escapeHtml(item.dateKey || item.createdAt)}</td><td><span class="branch-pill">${escapeHtml(branchLabel(item.branchId))}</span></td><td>${escapeHtml(item.bookingCode)}</td><td>${item.type === "refund" ? "استرداد" : "دفع"}</td><td>${paymentMethod(item.paymentMethod)}</td><td>${escapeHtml(item.staffId || "—")}</td><td style="color:${Number(item.amount) < 0 ? "var(--danger)" : "var(--success)"}"><b>${money(item.amount)}</b></td></tr>`).join("") || emptyRow(7);
  const staffIds = [...new Set(state.dashboard.bookings.map(item => item.staffId).filter(Boolean))];
  const current = $("#revenueStaff").value;
  $("#revenueStaff").innerHTML = '<option value="all">كل العاملين</option>' + staffIds.map(id => `<option value="${escapeAttr(id)}">${escapeHtml(id)}</option>`).join("");
  $("#revenueStaff").value = staffIds.includes(current) ? current : "all";
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
  const items = (state.collections.get(collection) || []).filter(item => !query || [item.nameAr, item.nameEn, item.titleAr, item.titleEn, item.specialtyAr, item.code, item.id].some(value => String(value || "").toLowerCase().includes(query))).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.nameAr || a.titleAr || a.id || "").localeCompare(String(b.nameAr || b.titleAr || b.id || ""), "ar"));
  if (collection === "settings") { fillSettings(items[0] || {}); return; }
  const targets = $$(`[data-list="${collection}"]`);
  targets.forEach(target => { target.innerHTML = items.map(item => entityCard(collection, item, ["customers", "activityLogs", "users"].includes(collection))).join("") || '<div class="entity-card"><p>لا توجد بيانات.</p></div>'; });
  if (collection === "content") {
    ["gallery", "celebrity", "news"].forEach(type => {
      const target = $(`[data-list="content-${type}"]`);
      if (target) target.innerHTML = items.filter(item => item.type === type).map(item => entityCard("content", item)).join("") || '<div class="entity-card"><p>لا توجد بيانات.</p></div>';
    });
  }
}

function entityCard(collection, item, readonly = false) {
  const title = item.nameAr || item.titleAr || item.code || item.date || item.key || item.customerName || item.email || item.action || item.id;
  const category = collection === "services" ? (state.collections.get("categories") || []).find(value => value.id === item.categoryId) : null;
  const detail = collection === "services" ? `${category?.nameAr || item.categoryId || "بدون تصنيف"} • ${money(item.price)}${Number(item.duration) ? ` • ${Number(item.duration)} دقيقة` : ""}`
    : collection === "categories" ? `ترتيب الظهور: ${Number(item.sortOrder || 0)}`
    : collection === "packages" ? `${money(item.price)}${Number(item.duration) ? ` • ${Number(item.duration)} دقيقة` : ""}`
    : collection === "offers" ? `${money(item.newPrice)}${item.endAt ? " • عرض محدد المدة" : ""}`
    : item.addressAr || item.specialtyAr || item.reasonAr || item.bodyAr || item.phone || item.collection || item.role || item.id;
  const contentPreview = collection === "content" ? `<div class="entity-media">${item.imageUrl ? `<img src="${escapeAttr(item.imageUrl)}" alt="">` : `<span>${isVideoContent(item) ? "▶" : "▧"}</span>`}${isVideoContent(item) ? '<b>فيديو</b>' : ""}</div><p class="entity-branch">${branchScopeLabel(item.branchIds)}</p>` : "";
  return `<article class="entity-card ${item.active === false || item.available === false ? "inactive" : ""}">${collection === "staff" ? `<img class="entity-avatar" src="${escapeAttr(item.imageUrl || "/assets/el-mezaen-logo.jpeg")}" alt="">` : ""}${contentPreview}<h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p>${collection === "coupons" ? `<p>استخدام: ${item.usageCount || 0} • خصومات: ${money(item.discountTotal || 0)}</p>` : ""}${collection === "staff" ? `<p>حجوزات: ${item.bookingCount || 0} • إيراد: ${money(item.revenueTotal || 0)}</p>` : ""}${readonly ? "" : `<footer><button data-edit-collection="${collection}" data-edit-id="${escapeAttr(item.id)}">تعديل</button>${"active" in item ? `<button data-toggle-collection="${collection}" data-toggle-id="${escapeAttr(item.id)}">${item.active === false ? "تفعيل" : "إيقاف"}</button>` : ""}<button class="delete" data-delete-collection="${collection}" data-delete-id="${escapeAttr(item.id)}">حذف</button></footer>`}</article>`;
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
    toast("تم الحفظ بنجاح");
  } catch (error) { toast(error.message || "تعذر الحفظ", true); }
  finally { $("#editorSave").disabled = false; }
}

async function deleteItem(collection, id) {
  if (!confirm("هل تريد حذف هذا العنصر؟ لا يمكن التراجع بعد الحذف.")) return;
  try { await deleteEntity(collection, id); await loadCollection(collection, true); toast("تم الحذف"); }
  catch (error) { toast(error.message || "تعذر الحذف", true); }
}

async function toggleItem(collection, id) {
  const item = (state.collections.get(collection) || []).find(value => value.id === id);
  if (!item) return;
  try { await saveEntity(collection, id, { active: item.active === false }); await loadCollection(collection, true); toast(item.active === false ? "تم التفعيل" : "تم الإيقاف"); }
  catch (error) { toast(error.message || "تعذر تعديل الحالة", true); }
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
  const section = event.target.closest("[data-section]"); if (section) showSection(section.dataset.section);
  const go = event.target.closest("[data-go]"); if (go) showSection(go.dataset.go);
  const add = event.target.closest("[data-new]"); if (add) openEditor(add.dataset.new, "", add.dataset.presetType ? { type: add.dataset.presetType } : {});
  const edit = event.target.closest("[data-edit-collection]"); if (edit) openEditor(edit.dataset.editCollection, edit.dataset.editId);
  const remove = event.target.closest("[data-delete-collection]"); if (remove) deleteItem(remove.dataset.deleteCollection, remove.dataset.deleteId);
  const toggle = event.target.closest("[data-toggle-collection]"); if (toggle) toggleItem(toggle.dataset.toggleCollection, toggle.dataset.toggleId);
  const booking = event.target.closest("[data-booking-action]"); if (booking) updateBookingAction(booking.dataset.bookingId, booking.dataset.bookingAction);
  const printButton = event.target.closest("[data-print-booking]"); if (printButton) printReceipt(printButton.dataset.printBooking);
});
document.addEventListener("input", event => { if (event.target.matches("[data-entity-search]")) renderCollection(event.target.dataset.entitySearch); });

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

setupPanels();
setTheme(localStorage.getItem("mz-admin-theme") === "light" ? "light" : "dark");
watchAuth(async user => {
  if (!user) { location.replace("/login/"); return; }
  try {
    const role = await currentRole(user);
    if (!role) { await logout(); location.replace("/login/"); return; }
    state.user = user; state.role = role;
    $("#welcomeText").textContent = `لوحة إدارة مزين مصر • ${role}`;
    $("#authLoading").hidden = true; $("#adminApp").hidden = false;
    await loadDashboard();
    setInterval(() => loadDashboard(true), 20000);
  } catch { location.replace("/login/"); }
});
