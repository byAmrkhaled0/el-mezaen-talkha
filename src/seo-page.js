import "./styles.css";
import { bindSafeBack } from "./navigation.js";

bindSafeBack();

document.documentElement.dataset.theme = localStorage.getItem("mz-theme") === "light" ? "light" : "dark";

document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("mz-theme", theme);
});

document.querySelectorAll("[data-book-branch]").forEach(link => {
  link.addEventListener("click", () => {
    localStorage.setItem("mz-branch", link.dataset.bookBranch);
  });
});
