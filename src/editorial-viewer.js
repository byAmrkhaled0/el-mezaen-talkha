import {safeMediaUrl} from './media.js';
// Native modal dialog supplies focus containment and makes the background inert.
// One viewer per page; images load only when requested, never as a gallery preload.
export function mountEditorialViewer(grid,lang='ar') {
 if(grid.dataset.viewerBound) return;
 grid.dataset.viewerBound='true';
 const en=lang==='en',dialog=document.createElement('dialog');
 dialog.className='editorial-viewer';
 dialog.setAttribute('aria-label',en?'Image viewer':'عارض الصور');
 dialog.innerHTML=`<div class="editorial-viewer-toolbar"><button type="button" data-close>${en?'Close':'إغلاق'}</button><button type="button" data-prev>${en?'Previous':'السابق'}</button><button type="button" data-next>${en?'Next':'التالي'}</button></div><figure><img alt=""><figcaption></figcaption></figure><a target="_blank" rel="noopener noreferrer">${en?'Open original image':'فتح الصورة الأصلية'}</a>`;
 document.body.append(dialog);
 let index=0,opener=null;
 const links=()=>[...grid.querySelectorAll('[data-editorial-image]')];
 function show(next) {
  const list=links();if(!list.length)return;
  index=(next+list.length)%list.length;const link=list[index],src=safeMediaUrl(link.href);if(!src)return;
  const img=dialog.querySelector('img');img.src=src;img.alt=link.querySelector('img')?.alt||'';
  dialog.querySelector('figcaption').textContent=img.alt;
  dialog.querySelector('a').href=src;
  dialog.querySelectorAll('[data-prev],[data-next]').forEach(b=>b.disabled=list.length<2);
  if(!dialog.open)dialog.showModal();
 }
 grid.addEventListener('click',event=>{const link=event.target.closest('[data-editorial-image]');if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();opener=link;show(links().indexOf(link));});
 dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
 dialog.querySelector('[data-prev]').addEventListener('click',()=>show(index-1));
 dialog.querySelector('[data-next]').addEventListener('click',()=>show(index+1));
 dialog.addEventListener('close',()=>{dialog.querySelector('img').removeAttribute('src');opener?.focus();});
 dialog.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();show(index+(en?1:-1));}if(e.key==='ArrowLeft'){e.preventDefault();show(index+(en?-1:1));}});
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
}
