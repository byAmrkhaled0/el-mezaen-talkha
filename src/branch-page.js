import "./styles.css";
import { getCatalog, trackEvent } from "./firebase-client.js";

const branchId = document.body.dataset.branchPage;
const book = document.querySelector("[data-choose-branch]");
book?.addEventListener("click", () => {
  localStorage.setItem("mz-branch", branchId);
  trackEvent("branch_page_booking", { branch_id: branchId });
});

getCatalog().then(catalog => {
  const branch = catalog.branches?.find(item => item.id === branchId && item.active !== false);
  if (!branch) return;
  document.querySelectorAll("[data-branch-address]").forEach(el => { el.textContent = branch.addressAr; });
  document.querySelectorAll("[data-branch-phone]").forEach(el => { el.textContent = branch.phone; el.href = `tel:+2${branch.phone}`; });
  const map = document.querySelector("[data-branch-map]");
  if (map) map.href = branch.mapsUrl;
  const whatsapp = document.querySelector("[data-branch-whatsapp]");
  if (whatsapp) whatsapp.href = `https://wa.me/${String(branch.whatsapp || branch.phone).replace(/\D/g, "").replace(/^0/, "2")}`;
}).catch(() => {});
