import {canonicalManagedStoragePath} from '../functions/src/managed-media.js';
export const siteMediaSlots = Object.freeze({heroImageUrl:{label:'صورة الافتتاحية',folder:'homepage',fallback:'/assets/owner/owner-hero-studio-suit-960.webp'},hairSystemImageUrl:{label:'صورة تركيب الشعر',folder:'homepage',fallback:'/assets/premium/hair-system-640.webp'},aboutImageUrl:{label:'صورة عن المزين',folder:'homepage',fallback:'/assets/owner/owner-about-car-640.webp'},brandLogoUrl:{label:'شعار النشاط',folder:'branding',fallback:'/assets/el-mezaen-mark-v2.webp'},brandFaviconUrl:{label:'أيقونة الموقع PNG',folder:'branding',fallback:'/assets/icon.svg'}});
export function validSiteImage(value,field,bucket=globalThis.__FIREBASE_CONFIG__?.storageBucket){const slot=siteMediaSlots[field];const path=slot&&canonicalManagedStoragePath(value,bucket);return Boolean(path&&path.startsWith(`public/${slot.folder}/`)&&(/\.(?:jpe?g|png|webp|avif)$/i.test(path))&&(field!=='brandFaviconUrl'||path.toLowerCase().endsWith('.png')));}
export function applySiteMedia(settings={},root=document){
 const bucket=globalThis.__FIREBASE_CONFIG__?.storageBucket;
 for(const img of root.querySelectorAll('[data-home-media],img[data-brand-logo],header img[src*="el-mezaen-logo.jpeg"],.site-header img[src*="el-mezaen-logo.jpeg"],.brand img[src*="el-mezaen-mark-v2.webp"]')){
  const field=img.dataset.homeMedia||'brandLogoUrl';if(!siteMediaSlots[field])continue;
  if(!img.dataset.siteFallback){img.dataset.siteFallback=img.getAttribute('src')||siteMediaSlots[field].fallback;img.dataset.siteSrcset=img.getAttribute('srcset')||'';}
  if(!img.dataset.siteErrorBound){img.addEventListener?.('error',()=>{if(img.getAttribute('src')!==img.dataset.siteFallback){img.src=img.dataset.siteFallback;if(img.dataset.siteSrcset)img.setAttribute('srcset',img.dataset.siteSrcset);}});img.dataset.siteErrorBound='true';}
  if(validSiteImage(settings[field],field,bucket)){img.src=settings[field];img.removeAttribute('srcset');}
  else{img.src=img.dataset.siteFallback;if(img.dataset.siteSrcset)img.setAttribute('srcset',img.dataset.siteSrcset);}
 }
 const icon=root.querySelector('link[rel="icon"]');if(icon){icon.dataset.siteFallback ||= icon.getAttribute('href')||'/favicon.ico';icon.dataset.siteIconType ||= icon.type||'image/x-icon';if(validSiteImage(settings.brandFaviconUrl,'brandFaviconUrl',bucket)){icon.href=settings.brandFaviconUrl;icon.type='image/png';}else{icon.href=icon.dataset.siteFallback;icon.type=icon.dataset.siteIconType;}}
}
