let nextId=0;
function uniqueId(doc,prefix){let id;do{id=prefix+'-'+(++nextId);}while(doc.getElementById?.(id));return id;}
export function identifyAdminFields(root,doc=root.ownerDocument||document){
 for(const field of root.querySelectorAll('input,select,textarea')){
  if(!field.id&&!field.getAttribute('name'))field.setAttribute('id',uniqueId(doc,'admin-control'));
  if(!field.getAttribute('autocomplete')&&field.type!=='hidden')field.setAttribute('autocomplete','off');
 }
}
export function exposeAdminDisclosure(details,doc=details.ownerDocument||document){
 if(details.dataset.clarityReady)return null;const summary=[...details.children].find(node=>node.tagName==='SUMMARY');if(!summary)return null;
 details.dataset.clarityReady='true';details.classList.add('admin-disclosure-content');if(!details.id)details.setAttribute('id',uniqueId(doc,'admin-disclosure'));
 const raw=summary.textContent.trim(),label=raw==='المزيد من الإجراءات'?'إجراءات الحجز':raw==='العامل والتنبيه'?'تعيين العامل وإرسال تنبيه':raw;
 const button=doc.createElement('button');button.type='button';button.className='small-button admin-disclosure-button';button.setAttribute('aria-controls',details.id);button.dataset.adminDisclosure='';
 const sync=()=>{const text=(details.open?'إخفاء ':'عرض ')+label;if(button.textContent!==text)button.textContent=text;button.setAttribute('aria-expanded',String(Boolean(details.open)));};
 summary.hidden=true;details.before(button);button.onclick=()=>{details.open=!details.open;sync();};details.addEventListener('toggle',sync);sync();return button;
}
export function mountAdminClarity(doc=document){
 const app=doc.querySelector('#adminApp');if(!app)return null;const toggles=new Map();let pending=false,disposed=false;
 const sync=()=>{pending=false;if(disposed)return;for(const [details,button]of toggles)if(!details.isConnected){button.remove();toggles.delete(details);}for(const details of app.querySelectorAll('details')){const button=exposeAdminDisclosure(details,doc);if(button)toggles.set(details,button);}identifyAdminFields(app,doc);for(const dialog of doc.querySelectorAll('dialog'))identifyAdminFields(dialog,doc);};
 const schedule=()=>{if(!pending&&!disposed){pending=true;requestAnimationFrame(sync);}};const observer=new MutationObserver(schedule);observer.observe(doc.body,{childList:true,subtree:true});sync();return {sync,dispose(){disposed=true;observer.disconnect();}};
}
