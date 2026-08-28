(() => {
  try {
    const admin = location.pathname.startsWith("/admin") || location.pathname.startsWith("/login");
    const key = admin ? "mz-admin-theme" : "mz-theme";
    const fallback = admin ? "light" : "dark";
    const saved = localStorage.getItem(key);
    document.documentElement.dataset.theme = saved === "light" || saved === "dark" ? saved : fallback;
  } catch {
    document.documentElement.dataset.theme = location.pathname.startsWith("/admin") || location.pathname.startsWith("/login") ? "light" : "dark";
  }
})();
