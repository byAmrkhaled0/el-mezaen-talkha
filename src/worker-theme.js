/* Worker-only mobile preference; desktop retains its original theme. */
(() => {
  const root = document.documentElement;
  const desktopTheme = root.dataset.theme || 'dark';
  const mobile = matchMedia('(max-width:720px)');
  const button = document.getElementById('workerThemeToggle');
  const color = document.querySelector('meta[name="theme-color"]');
  const desktopColor = color?.content;
  const key = 'mz-worker-mobile-theme';
  let preference = 'light';
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* A blocked storage API does not block theme selection. */ }
  const apply = () => {
    root.dataset.theme = preference;
    if (button) {
      button.hidden = false;
      button.setAttribute('aria-pressed', String(preference === 'dark'));
      const label = preference === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن';
      const icon = preference === 'dark'
        ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'
        : '<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>';
      button.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg><span>${label}</span>`;
      button.setAttribute('aria-label', `التبديل إلى ${label}`);
    }
    if (color) color.content = preference === 'dark' ? '#091f2d' : '#f2f6f9';
  };
  button?.addEventListener('click', () => {
    
    preference = preference === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, preference); } catch { /* Keep the in-memory choice. */ }
    apply();
  });
  mobile.addEventListener('change', apply);
  apply();
})();
