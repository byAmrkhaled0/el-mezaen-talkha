import "./styles.css";
import { getPublishedReviews } from "./firebase-client.js";
import { bindSafeBack } from "./navigation.js";

const $ = selector => document.querySelector(selector);
const escapeHtml = value => { const node = document.createElement("div"); node.textContent = value ?? ""; return node.innerHTML; };
const themeIcon = theme => theme === "dark" ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>' : '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z"/></svg>';
let reviews = [];
let cursor = "";
let loading = false;

function reviewDate(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(date) : "";
}

function render() {
  $("#reviewsGrid").innerHTML = reviews.map(item => { const rating = Math.max(1, Math.min(5, Number(item.rating || 5))); return `<article class="published-review panel ${item.featured ? "featured" : ""}"><header><div class="review-avatar">${escapeHtml(String(item.name || "ع").trim().charAt(0) || "ع")}</div><div><h3>${escapeHtml(item.name || "عميل مزين مصر")}</h3><span aria-label="${rating} من 5">${"★".repeat(rating)}${"☆".repeat(5 - rating)}</span></div>${item.verified ? '<b class="verified-review">حجز موثّق</b>' : ""}</header><p>${escapeHtml(item.comment || "")}</p>${item.createdAt ? `<time>${escapeHtml(reviewDate(item.createdAt))}</time>` : ""}${item.adminReply ? `<div class="review-reply"><b>رد مزين مصر</b><span>${escapeHtml(item.adminReply)}</span></div>` : ""}</article>`; }).join("") || '<div class="empty-state">لا توجد تقييمات منشورة حاليًا.</div>';
  $("#loadMoreReviews").hidden = !cursor;
}

async function loadMore() {
  if (loading) return;
  loading = true;
  const button = $("#loadMoreReviews");
  button.disabled = true; button.setAttribute("aria-busy", "true");
  try {
    const result = await getPublishedReviews(12, cursor);
    reviews.push(...(result.items || [])); cursor = result.nextCursor || ""; render();
  } catch (error) {
    if (!reviews.length) $("#reviewsGrid").innerHTML = '<div class="empty-state">تعذر تحميل التقييمات الآن. حاول مرة أخرى لاحقًا.</div>';
  } finally { loading = false; button.disabled = false; button.removeAttribute("aria-busy"); }
}

bindSafeBack();
document.documentElement.dataset.theme = localStorage.getItem("mz-theme") === "light" ? "light" : "dark";
$("#themeToggle").innerHTML = themeIcon(document.documentElement.dataset.theme);
$("#themeToggle").addEventListener("click", () => { const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = theme; localStorage.setItem("mz-theme", theme); $("#themeToggle").innerHTML = themeIcon(theme); });
$("#loadMoreReviews").addEventListener("click", loadMore);
await loadMore();
