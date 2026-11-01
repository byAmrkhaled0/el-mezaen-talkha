const glyphs={confirmed:'<path d="m5 12 4 4L19 6"/>',rejected:'<path d="m6 6 12 12M18 6 6 18"/>',reschedule:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18m-8 4h4m-4 3h2"/>',whatsapp:'<path d="M20 11.8a8 8 0 0 1-11.9 7L4 20l1.2-4A8 8 0 1 1 20 11.8Z"/><path d="M9 8c.5 3 2 4.5 5 5l1-1 2 1"/>'};
export function bookingActionIcon(name){return glyphs[name]?`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name]}</svg>`:'';}
export function decorateBookingActionIcons(root){
 for(const [selector,name,label] of [['[data-booking-action="confirmed"]','confirmed','قبول الحجز'],['[data-booking-action="rejected"]','rejected','رفض الحجز'],['[data-reschedule-booking]','reschedule','إعادة جدولة الحجز'],['[data-whatsapp-receipt]','whatsapp','إرسال الشيك على واتساب']]){
  for(const button of root.querySelectorAll(selector)){if(button.dataset.bookingIcon===name)continue;button.dataset.bookingIcon=name;button.classList.add('booking-icon-action');button.setAttribute('aria-label',label);button.title=label;button.innerHTML=bookingActionIcon(name);}
 }
}
