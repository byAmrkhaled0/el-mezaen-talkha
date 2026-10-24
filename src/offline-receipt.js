const money = value => new Intl.NumberFormat('ar-EG', {minimumFractionDigits:2, maximumFractionDigits:2}).format(value) + ' ج.م';
export function receiptPresentation(sale) {
  const confirmed=sale.status==='confirmed';
  return {
    title:confirmed?'شيك مؤكد — نسخة الجهاز':'شيك محفوظ على الجهاز',
    notice:confirmed?'تم تأكيد المزامنة على السيرفر':'في انتظار تأكيد السيرفر — لا تعيد إنشاء نفس الشيك',
    code:sale.result?.bookingCode||'LOCAL-'+sale.id,
    date:new Date(sale.createdAt).toLocaleString('ar-EG',{timeZone:'Africa/Cairo'}),
    customer:[sale.payload.customer.firstName,sale.payload.customer.lastName].filter(Boolean).join(' '),
    branch:({talkha:'فرع طلخا',mashaya:'فرع المشاية'})[sale.payload.branchId]||sale.payload.branchId,
    items:sale.payload.offline.prices.map(item=>({name:item.nameAr||item.id,quantity:String(item.qty),unitPrice:money(item.unitPrice),total:money(item.unitPrice*item.qty)})),
    total:money(sale.total)
  };
}
export function showOfflineReceipt(sale, trigger) {
  const previous=document.querySelector('.offline-receipt-dialog');previous?.close();previous?.remove();
  const data=receiptPresentation(sale),dialog=document.createElement('dialog');dialog.className='offline-receipt-dialog';dialog.dir='rtl';dialog.lang='ar';dialog.setAttribute('aria-labelledby','offlineReceiptTitle');
  const text=(tag,value,parent=dialog)=>{const node=document.createElement(tag);node.textContent=value;parent.append(node);return node;};
  text('p','مزين مصر').className='offline-receipt-brand';text('h2',data.title).id='offlineReceiptTitle';
  text('p',data.notice).className='offline-receipt-notice';text('p','رقم الشيك: '+data.code);text('p','تاريخ التسجيل على الجهاز: '+data.date);text('p',data.branch);text('p','العميل: '+data.customer);
  const table=document.createElement('table'),head=document.createElement('thead'),header=document.createElement('tr'),body=document.createElement('tbody');
  for(const value of ['الصنف','الكمية','السعر','القيمة'])text('th',value,header);head.append(header);table.append(head,body);dialog.append(table);
  for(const item of data.items){const row=document.createElement('tr');for(const value of [item.name,item.quantity,item.unitPrice,item.total])text('td',value,row);body.append(row);}
  text('p','الإجمالي المدفوع نقديًا: '+data.total).className='offline-receipt-total';text('p','احتفظ بالنسخة. الشيك الأصلي المعتمد يظهر في سجل المعاملات بعد تأكيد المزامنة.').className='offline-receipt-footer';
  const message=text('p','');message.className='offline-receipt-print-status';message.setAttribute('role','status');
  const actions=document.createElement('div');actions.className='offline-receipt-actions';dialog.append(actions);
  const print=text('button','طباعة الشيك',actions),close=text('button','إغلاق المعاينة',actions);print.type=close.type='button';print.className=close.className='small-button';
  const beforePrint=()=>{if(dialog.open)document.body.classList.add('printing-offline-receipt');};
  const afterPrint=()=>document.body.classList.remove('printing-offline-receipt');
  window.addEventListener('beforeprint',beforePrint);window.addEventListener('afterprint',afterPrint);
  print.addEventListener('click',()=>{message.textContent='';beforePrint();try{window.print();}catch{afterPrint();message.textContent='المتصفح لم يفتح الطباعة. تقدر تستخدم أمر الطباعة من قائمة المتصفح والمعاينة مفتوحة.';}});
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{afterPrint();window.removeEventListener('beforeprint',beforePrint);window.removeEventListener('afterprint',afterPrint);dialog.remove();if(trigger?.isConnected)trigger.focus();},{once:true});
  document.body.append(dialog);dialog.showModal();close.focus();return dialog;
}
