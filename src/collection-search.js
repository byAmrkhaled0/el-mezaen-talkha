const fields={customers:[['firstName','الاسم الأول'],['lastName','اسم العائلة'],['phone','الموبايل']],services:[['nameAr','الاسم العربي'],['nameEn','الاسم الإنجليزي']],packages:[['nameAr','الاسم العربي'],['nameEn','الاسم الإنجليزي']],staff:[['nameAr','الاسم العربي'],['nameEn','الاسم الإنجليزي']],inventoryItems:[['nameAr','اسم الصنف']],drinks:[['nameAr','الاسم العربي'],['nameEn','الاسم الإنجليزي']],content:[['titleAr','العنوان العربي'],['titleEn','العنوان الإنجليزي']],offers:[['nameAr','الاسم العربي'],['nameEn','الاسم الإنجليزي']],reviews:[['name','الاسم'],['comment','بداية التعليق'],['bookingCode','كود الحجز']],campaigns:[['name','الاسم'],['titleAr','العنوان']],users:[['name','الاسم'],['email','الإيميل'],['phone','الموبايل']],activityLogs:[['action','نوع الإجراء']],walletTransactions:[['phone','الموبايل'],['bookingCode','كود الحجز']],categories:[['nameAr','الاسم العربي'],['nameEn','الاسم الإنجليزي']],faqs:[['questionAr','السؤال العربي'],['questionEn','السؤال الإنجليزي']],translations:[['key','المفتاح']],coupons:[['code','الكود']]};
export function collectionSearchOptions(collection,documentRef=document){
 if(!fields[collection])return {};
 const input=documentRef.querySelector(`[data-entity-search="${collection}"]`),search=input?.value.trim()||'',searchField=documentRef.querySelector(`[data-search-field="${collection}"]`)?.value||fields[collection][0][0];
 const category=collection==='services'?documentRef.querySelector('#serviceCategoryFilter')?.value||'':'';
 if(!search&&!category)return {};
 return {pageMode:'search',search,searchField,...(category?{category}:{})};
}
export function mountCollectionSearch({reload,render}){
 const timers=new Map();
 for(const input of document.querySelectorAll('[data-entity-search]')){
  const collection=input.dataset.entitySearch,choices=fields[collection];if(!choices)continue;input.dataset.serverSearch='true';
  input.placeholder='ابحث ببداية '+choices[0][1]+' في كل السجلات';
  const select=document.createElement('select');select.dataset.searchField=collection;select.setAttribute('aria-label','حقل البحث');
  for(const [value,label]of choices){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}input.after(select);
  const schedule=()=>{for(const other of document.querySelectorAll(`[data-entity-search="${collection}"]`))other.value=input.value;for(const other of document.querySelectorAll(`[data-search-field="${collection}"]`))other.value=select.value;clearTimeout(timers.get(collection));render?.(collection,true);timers.set(collection,setTimeout(()=>{timers.delete(collection);void reload(collection,true);},300));};
  input.addEventListener('input',schedule);select.addEventListener('change',schedule);
 }
 return {schedule(collection){clearTimeout(timers.get(collection));void reload(collection,true);}};
}
