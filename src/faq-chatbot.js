const $ = selector => document.querySelector(selector);
const escapeHtml = value => { const node = document.createElement("div"); node.textContent = value ?? ""; return node.innerHTML; };
const escapeAttr = value => escapeHtml(String(value ?? "")).replaceAll('"', "&quot;");

let state = { faqs: [], lang: "ar", branch: null };
let bound = false;

const localized = (item, key) => item?.[`${key}${state.lang === "ar" ? "Ar" : "En"}`] || item?.[`${key}Ar`] || "";
const whatsappNumber = value => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("0") ? `2${digits}` : digits;
};

function actionLabel(value) {
  const ar = { book: "ابدأ الحجز", services: "الخدمات والأسعار", hair: "تركيب الشعر", branch: "اختر الفرع", whatsapp: "واتساب الفرع", manage: "إدارة الحجز" };
  const en = { book: "Start booking", services: "Services & prices", hair: "Hair systems", branch: "Choose branch", whatsapp: "Branch WhatsApp", manage: "Manage booking" };
  return (state.lang === "ar" ? ar : en)[value] || value;
}

function renderQuestions(query = "") {
  const normalized = query.trim().toLowerCase();
  const items = state.faqs.filter(item => !normalized || `${localized(item, "question")} ${localized(item, "answer")} ${(item.keywords || []).join(" ")}`.toLowerCase().includes(normalized));
  $("#faqChatQuestions").innerHTML = items.map(item => `<button type="button" data-faq-id="${escapeAttr(item.id)}">${escapeHtml(localized(item, "question"))}</button>`).join("") || `<p class="faq-chat-empty">${state.lang === "ar" ? "لا توجد إجابة مطابقة. تواصل مع الفرع عبر واتساب." : "No matching answer. Contact the branch on WhatsApp."}</p>`;
}

function showAnswer(id) {
  const item = state.faqs.find(value => value.id === id);
  if (!item) return;
  $("#faqChatAnswer").innerHTML = `<div class="faq-message bot"><b>${escapeHtml(localized(item, "question"))}</b><p>${escapeHtml(localized(item, "answer"))}</p>${(item.actions || []).length ? `<div class="faq-answer-actions">${item.actions.map(action => `<button type="button" data-faq-action="${escapeAttr(action)}">${escapeHtml(actionLabel(action))}</button>`).join("")}</div>` : ""}</div>`;
  $("#faqChatAnswer").focus();
}

function close() {
  const panel = $("#faqChatPanel");
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  $("[data-open-faq-chat]")?.setAttribute("aria-expanded", "false");
  $("[data-open-faq-chat]")?.focus();
}

function runAction(action) {
  if (action === "book") { close(); $("[data-open-booking]")?.click(); return; }
  if (action === "branch") { close(); $("[data-open-branch]")?.click(); return; }
  if (action === "manage") { close(); $("#manage-booking")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (action === "services") { location.href = "/services/"; return; }
  if (action === "hair") { location.href = "/hair-systems/"; return; }
  if (action === "whatsapp") {
    const number = whatsappNumber(state.branch?.whatsapp || state.branch?.phone || "01101006961");
    window.open(`https://wa.me/${number}`, "_blank", "noopener,noreferrer");
  }
}

function bind() {
  if (bound) return;
  bound = true;
  $("#faqChatClose").addEventListener("click", close);
  $("#faqChatSearch").addEventListener("input", event => renderQuestions(event.target.value));
  $("#faqChatPanel").addEventListener("click", event => {
    const question = event.target.closest("[data-faq-id]");
    if (question) showAnswer(question.dataset.faqId);
    const action = event.target.closest("[data-faq-action]");
    if (action) runAction(action.dataset.faqAction);
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("#faqChatPanel").hidden) close(); });
}

export function openFaqChat(options = {}) {
  state = { faqs: Array.isArray(options.faqs) ? options.faqs : [], lang: options.lang === "en" ? "en" : "ar", branch: options.branch || null };
  bind();
  const panel = $("#faqChatPanel");
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  $("[data-open-faq-chat]")?.setAttribute("aria-expanded", "true");
  $("#faqChatTitle").textContent = state.lang === "ar" ? "مساعد مزين مصر" : "El Mezaen Assistant";
  $("#faqChatIntro").textContent = state.lang === "ar" ? "اختر سؤالًا سريعًا. لا يتم حفظ المحادثة أو أي بيانات شخصية." : "Choose a quick question. No chat or personal data is stored.";
  $("#faqChatSearch").placeholder = state.lang === "ar" ? "ابحث عن سؤال…" : "Search questions…";
  $("#faqChatSearch").value = "";
  $("#faqChatAnswer").innerHTML = `<div class="faq-message bot"><p>${state.lang === "ar" ? "أهلًا بك 👋 أقدر أساعدك في الحجز والفروع والخدمات والباقات وتركيب الشعر." : "Welcome 👋 I can help with bookings, branches, services, packages and hair systems."}</p></div>`;
  renderQuestions();
  $("#faqChatSearch").focus();
}
