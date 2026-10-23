/* Initial visible copy only; no inline execution or additional data request. */
if (document.documentElement.lang === 'en') {
  document.querySelectorAll('[data-initial-en]').forEach(node => { node.textContent = node.dataset.initialEn; });
}
