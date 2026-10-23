/* Parser-positioned external script: compatible with the published strict CSP. */
(() => {
  if (typeof globalThis.mountPublicHero === 'function') { globalThis.mountPublicHero(); return; }
  const template = document.getElementById('publicHeroTemplate');
  const image = template?.content?.firstElementChild;
  if (image) template.replaceWith(image.cloneNode(true));
})();
