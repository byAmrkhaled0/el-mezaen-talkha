import "./styles.css";
import { getLang } from "./i18n.js";
import { getCatalog } from "./firebase-client.js";

const $ = selector => document.querySelector(selector);
const page = document.body.dataset.page;
let lang = getLang();
let catalog = { services: [], staff: [], categories: [] };
let category = "all";
const localized = (item, key = "name") => item?.[`${key}${lang === "ar" ? "Ar" : "En"}`] || item?.[`${key}Ar`] || "";
const escapeHtml = value => { const node = document.createElement("div"); node.textContent = value ?? ""; return node.innerHTML; };
const money = value => new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(value || 0));

function addCart(id) {
  const cart = JSON.parse(localStorage.getItem("mz-cart") || "[]");
  if (!cart.some(item => item.id === id)) cart.push({ id, qty: 1 });
  localStorage.setItem("mz-cart", JSON.stringify(cart));
  $("#pageToast").textContent = lang === "ar" ? "تمت الإضافة للسلة" : "Added to cart";
  $("#pageToast").classList.add("show"); setTimeout(() => $("#pageToast").classList.remove("show"), 1800);
}

function renderServices() {
  const query = $("#catalogSearch").value.trim().toLowerCase();
  const categories = new Map(catalog.categories.map(item => [item.id, localized(item)]));
  const items = catalog.services.filter(item => item.active !== false && (category === "all" || item.categoryId === category) && (!query || `${item.nameAr} ${item.nameEn}`.toLowerCase().includes(query)));
  $("#catalogFilters").innerHTML = `<button class="filter-chip ${category === "all" ? "active" : ""}" data-category="all">${lang === "ar" ? "الكل" : "All"}</button>` + catalog.categories.filter(cat => cat.active !== false && catalog.services.some(item => item.active !== false && item.categoryId === cat.id)).map(cat => `<button class="filter-chip ${category === cat.id ? "active" : ""}" data-category="${cat.id}">${escapeHtml(localized(cat))}</button>`).join("");
  $("#catalogGrid").innerHTML = items.map(item => `<article class="service-card compact-service"><span class="service-icon">✂</span><div class="service-meta"><span>${escapeHtml(categories.get(item.categoryId) || "")}</span><span>◷ ${item.duration} ${lang === "ar" ? "دقيقة" : "min"}</span></div><h3>${escapeHtml(localized(item))}</h3><div class="price-row"><div>${item.startsFrom ? `<small>${lang === "ar" ? "يبدأ من" : "From"}</small>` : ""}<strong class="price">${money(item.price)}</strong></div></div><button class="btn btn-primary" data-add="${item.id}">${lang === "ar" ? "إضافة للسلة" : "Add to cart"}</button></article>`).join("") || `<div class="empty-state">${lang === "ar" ? "لا توجد نتائج" : "No results"}</div>`;
  $("#resultCount").textContent = `${items.length} ${lang === "ar" ? "خدمة ومنتج" : "services and products"}`;
}

function renderTeam() {
  const query = $("#catalogSearch").value.trim().toLowerCase();
  const items = catalog.staff.filter(item => item.active !== false && (!query || `${item.nameAr} ${item.nameEn} ${item.specialtyAr} ${item.specialtyEn}`.toLowerCase().includes(query)));
  $("#catalogGrid").innerHTML = items.map(item => `<article class="team-card team-page-card"><img class="team-photo" src="${item.imageUrl || "/assets/el-mezaen-mark-v2.png"}" alt="${escapeHtml(localized(item))}" loading="lazy"><h3>${escapeHtml(localized(item))}</h3><p>${escapeHtml(localized(item, "specialty"))}</p><p class="team-bio">${escapeHtml(localized(item, "bio"))}</p><span class="availability ${item.available === false ? "off" : ""}">${item.available === false ? (lang === "ar" ? "غير متاح" : "Unavailable") : (lang === "ar" ? "متاح للحجز" : "Available")}</span><a class="btn btn-ghost" href="/#services">${lang === "ar" ? "احجز مع هذا العضو" : "Book this member"}</a></article>`).join("");
  $("#resultCount").textContent = `${items.length} ${lang === "ar" ? "عضو فريق" : "team members"}`;
}

function render() { page === "services" ? renderServices() : renderTeam(); }
document.addEventListener("click", event => { const filter = event.target.closest("[data-category]"); if (filter) { category = filter.dataset.category; render(); } const add = event.target.closest("[data-add]"); if (add) addCart(add.dataset.add); });
$("#catalogSearch").addEventListener("input", render);
$("#themeToggle").addEventListener("click", () => { const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = theme; localStorage.setItem("mz-theme", theme); });
$("#langToggle").addEventListener("click", () => { lang = lang === "ar" ? "en" : "ar"; localStorage.setItem("mz-lang", lang); document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"; location.reload(); });
document.documentElement.dataset.theme = localStorage.getItem("mz-theme") === "light" ? "light" : "dark";
document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
$("#langToggle").textContent = lang === "ar" ? "EN" : "ع";
if (lang === "en") {
  const copy = page === "services" ? ["All your choices in one place", "Services & Prices", "Search or choose a category, then add your selections to the booking cart.", "Search by service name..."] : ["Experience behind thousands of looks", "Meet Our Team", "Search by team member or specialty and choose the right professional for you.", "Search by name or specialty..."];
  $(".catalog-hero .section-kicker").textContent = copy[0]; $(".catalog-hero h1").textContent = copy[1]; $(".catalog-hero p").textContent = copy[2]; $("#catalogSearch").placeholder = copy[3];
  document.querySelector('.nav-actions a').textContent = "Back & Book";
}
catalog = await getCatalog(); render();
