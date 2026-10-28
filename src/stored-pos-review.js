export function renderStoredPosReview({snapshot,query,money,escapeHtml}){
 if(!snapshot)return false;const target=query('#posCart');if(!target)return false;
 target.innerHTML=(snapshot.items||[]).map(item=>`<div class="pos-cart-line"><div><b>${escapeHtml(item.nameAr||item.id)}</b><small>${Number(item.qty||1)} × ${money(item.unitPrice)}</small></div><strong>${money(item.lineTotal)}</strong></div>`).join('')||'<p>لا توجد أصناف محفوظة.</p>';
 for(const id of ['#posTotal','#posMobileTotal'])if(query(id))query(id).textContent=money(snapshot.total);
 const count=(snapshot.items||[]).reduce((n,x)=>n+Number(x.qty||1),0);for(const id of ['#posMobileCount','#posCartCount'])if(query(id))query(id).textContent=`${count} صنف`;
 if(query('#posCouponStatus'))query('#posCouponStatus').textContent='عرض الشيك المحفوظ بأسعاره وإجماليه المسجلين؛ أي إضافات تحتاج موافقة قبل التحصيل.';
 return true;
}
