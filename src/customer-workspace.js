// Presentation only: never changes membership tokens, permissions or balances.
export function nextCustomerBooking(items=[],today='') {
 return items.filter(item=>item&&!item.productOnly&&['pending','confirmed','arrived'].includes(item.status)&&/^\d{4}-\d{2}-\d{2}$/.test(item.bookingDate||'')&&(!today||item.bookingDate>=today))
  .slice().sort((a,b)=>`${a.bookingDate} ${a.bookingTime||''}`.localeCompare(`${b.bookingDate} ${b.bookingTime||''}`))[0]||null;
}
export function mountCustomerWorkspace(root,copy=value=>value,initialHash='') {
 const $=selector=>root.querySelector(selector);
 const views=new Set(['overview','bookings','wallet','preferences']);
 const initialView=({'#upcomingCard':'bookings','#bookingHistory':'bookings','#walletCard':'wallet','#walletActivity':'wallet'})[initialHash]||'overview';
 const dialog=$('#membershipDialog'),open=$('#openMembership');
 for(const node of root.querySelectorAll('[data-account-copy]'))node.textContent=copy(node.textContent);
 for(const node of root.querySelectorAll('[data-account-copy-aria]'))node.setAttribute('aria-label',copy(node.getAttribute('aria-label')));
 function show(view){
  if(!views.has(view))return;
  root.querySelectorAll('[data-account-panel]').forEach(panel=>{panel.hidden=panel.dataset.accountPanel!==view;});
  root.querySelectorAll('[data-account-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.accountView===view)));
  if(view!=='bookings')$('#reschedulePanel').hidden=true;
 }
 root.querySelectorAll('[data-account-view]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.accountView)));
 root.querySelectorAll('[data-open-account-view]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.openAccountView)));
 function close(){if(dialog.open)dialog.close();}
 open.addEventListener('click',()=>{if(!open.disabled&&!dialog.open){dialog.showModal();$('#closeMembership').focus();}});
 $('#closeMembership').addEventListener('click',close);
 dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
 dialog.addEventListener('close',()=>{if(!open.disabled&&!$('#portal').hidden)open.focus();});
 show(initialView);
 return {
  show,
  reset(){open.disabled=true;close();show(initialView);const canvas=$('#customerQr');canvas.getContext?.('2d')?.clearRect(0,0,canvas.width,canvas.height);},
  setMembershipReady(ready){open.disabled=!ready;if(!ready)close();},
  update(data,{today='',money=String,statusLabel=String,lang='ar'}={}){
   const c=data.customer||{},item=nextCustomerBooking(data.upcomingBookings,today);
   $('#customerInitial').textContent=Array.from(String(c.firstName||'م').trim())[0]||'م';
   $('#customerCompletedVisits').textContent=String(Number(c.completedVisits||0));
   $('#customerOverviewPoints').textContent=String(Number(c.pointsBalance||0));
   $('#customerOverviewCashback').textContent=money(c.cashbackBalance||0);
   $('#accountNextBooking').hidden=!item;$('#accountNoNextBooking').hidden=!!item;
   $('#nextBookingStatus').hidden=!item;
   if(!item)return;
   $('#nextBookingStatus').textContent=statusLabel(item.status);
   $('#nextBookingDate').textContent=item.bookingDate;
   $('#nextBookingTime').textContent=item.bookingTime||'';
   const names=lang==='en'&&item.serviceNamesEn?.length?item.serviceNamesEn:item.serviceNamesAr?.length?item.serviceNamesAr:(item.items||[]).map(line=>lang==='en'?line.nameEn||line.nameAr:line.nameAr);
   $('#nextBookingServices').textContent=names.filter(Boolean).join(' + ')||copy('لا توجد خدمات');
   $('#nextBookingBranch').textContent=(lang==='en'?item.branchNameEn||item.branchNameAr:item.branchNameAr)||item.branchId||'';
   $('#nextBookingStaff').textContent=(lang==='en'?item.staffNameEn||item.staffNameAr:item.staffNameAr)||'';
   $('#nextBookingTotal').textContent=money(item.total||0);
  }
 };
}
