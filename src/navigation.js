function hasSafeInternalHistory() {
  if (!document.referrer) return false;
  try {
    const previous = new URL(document.referrer);
    return previous.origin === location.origin && previous.href !== location.href;
  } catch { return false; }
}

export function bindSafeBack(selector = "[data-safe-back]", defaultFallback = "/") {
  document.querySelectorAll(selector).forEach(control => {
    control.addEventListener("click", event => {
      event.preventDefault();
      if (hasSafeInternalHistory()) history.back();
      else location.assign(control.dataset.backFallback || control.getAttribute("href") || defaultFallback);
    });
  });
}
