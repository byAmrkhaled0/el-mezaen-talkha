/* Local cached media selection only: no API, listener, polling or remote bootstrap. */
(() => {
  // Resolve the existing language preference before first paint; no new store or request.
  try{const query=new URLSearchParams(location.search);const lang=query.get('lang')==='en'||(!query.has('lang')&&localStorage.getItem('mz-lang')==='en')?'en':'ar';document.documentElement.lang=lang;document.documentElement.dir=lang==='en'?'ltr':'rtl';}catch{}

  const fallback='/assets/owner/owner-hero-studio-suit-960.webp';
  const srcset='/assets/owner/owner-hero-studio-suit-640.webp 640w, /assets/owner/owner-hero-studio-suit-960.webp 960w';
  let custom='';
  try {
    const cache=JSON.parse(localStorage.getItem('mz-public-catalog-v4')||'null');
    const value=cache?.data?.settings?.heroImageUrl;
    const bucket=globalThis.__FIREBASE_CONFIG__?.storageBucket;
    if(cache?.savedAt && Date.now()-Number(cache.savedAt)>=0 && Date.now()-Number(cache.savedAt)<=7*24*60*60*1000 && typeof value==='string' && bucket){
      const url=new URL(value);let path='';
      if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port){
        if(url.hostname==='firebasestorage.googleapis.com'){const m=url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);if(m&&decodeURIComponent(m[1])===bucket)path=decodeURIComponent(m[2]);}
        else if(url.hostname==='storage.googleapis.com'){const m=url.pathname.match(/^\/([^/]+)\/(.+)$/);if(m&&decodeURIComponent(m[1])===bucket)path=decodeURIComponent(m[2]);}
      }
      if(path.startsWith('public/homepage/') && !path.split('/').some(p=>!p||p==='.'||p==='..'||/[\\%\u0000-\u001f]/.test(p)) && /\.(?:png|jpe?g|webp|avif)$/i.test(path))custom=url.href;
    }
  } catch {}
  const link=document.createElement('link');link.rel='preload';link.as='image';link.href=custom||'/assets/owner/owner-hero-studio-suit-640.webp';
  if(!custom){link.setAttribute('imagesrcset',srcset);link.setAttribute('imagesizes','(max-width:768px) 92vw, (max-width:1280px) 42vw, 520px');link.type='image/webp';}
  document.head.append(link);
  globalThis.mountPublicHero=() => {
    const template=document.getElementById('publicHeroTemplate');if(!template)return;
    const image=template.content.firstElementChild.cloneNode(true);
    image.dataset.siteFallback=fallback;image.dataset.siteSrcset=srcset;
    if(custom){image.src=custom;image.removeAttribute('srcset');}
    image.addEventListener('error',()=>{if(image.getAttribute('src')!==fallback){image.src=fallback;image.setAttribute('srcset',srcset);}});
    template.replaceWith(image);delete globalThis.mountPublicHero;
  };
})();
