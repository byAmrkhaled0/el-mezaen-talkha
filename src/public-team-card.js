import {safeMediaUrl} from './media.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const localized=(item,key,lang)=>String(item?.[key+(lang==='en'?'En':'Ar')]||item?.[key+'Ar']||'').trim();
export function teamPhotoPlaceholder(name,lang='ar'){
 return `<div class="team-photo team-photo-placeholder" role="img" aria-label="${escape((lang==='en'?'No photo available for ':'صورة غير متاحة لـ ')+name)}"><img src="/assets/el-mezaen-mark-v2.webp" alt="" width="48" height="58" loading="lazy"><small>${lang==='en'?'EL MEZAEN':'فريق المزين'}</small></div>`;
}
export function publicTeamCard(item,{lang='ar',canBook=true}={}){
 const en=lang==='en',name=localized(item,'name',lang)||(en?'Team member':'عضو الفريق'),specialty=localized(item,'specialty',lang),bio=localized(item,'bio',lang),photo=safeMediaUrl(item.imageUrl),unavailable=item.available===false;
 return `<article class="team-card team-page-card">${photo?`<img class="team-photo" data-team-image src="${escape(photo)}" alt="${escape(name)}" loading="lazy" decoding="async" width="220" height="220">`:teamPhotoPlaceholder(name,lang)}<div class="team-member-copy"><h3>${escape(name)}</h3>${specialty?`<p class="team-specialty">${escape(specialty)}</p>`:''}<span class="availability ${unavailable?'off':''}">${unavailable?(en?'Booking unavailable':'الحجز غير متاح حاليًا'):(en?'Book an available time':'الحجز حسب المواعيد المتاحة')}</span></div>${bio?`<details class="team-bio-details"><summary>${en?'About this specialist':'عن المتخصص'}</summary><p class="team-bio">${escape(bio)}</p></details>`:''}${unavailable?'':`<button class="btn btn-ghost" type="button" data-book-staff="${escape(item.id)}" ${canBook?'':'disabled aria-disabled="true"'}>${canBook?(en?'Book this member':`احجز مع ${escape(name)}`):(en?'Reconnect to book':'أعد الاتصال للحجز')}</button>`}</article>`;
}
export function mountTeamPhotoFallback(root,lang='ar'){
 for(const image of root.querySelectorAll('[data-team-image]')){
  const fallback=()=>{if(!image.isConnected)return;const host=image.ownerDocument.createElement('template');host.innerHTML=teamPhotoPlaceholder(image.alt,lang);image.replaceWith(host.content.firstElementChild);};
  image.addEventListener('error',fallback,{once:true});if(image.complete&&image.naturalWidth===0)fallback();
 }
}
