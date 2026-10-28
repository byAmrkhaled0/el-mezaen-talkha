// Keep the original rows, actions and cursor loading; only control their visibility.
export function mountCompactRecordList({target,anchor,more=null,doc=document}){
 if(!target||!anchor)return null;
 const controls=doc.createElement('div');controls.className='record-list-controls';
 const caption=doc.createElement('span');caption.setAttribute('aria-live','polite');
 const button=doc.createElement('button');button.type='button';button.className='small-button record-list-toggle';button.setAttribute('aria-controls',target.id);
 controls.append(caption,button);anchor.parentElement.insertBefore(controls,anchor.nextSibling||null);
 let expanded=false,scope,hasMore=false;
 function render(){
  anchor.dataset.recordListExpanded=String(expanded);
  const records=[...target.children].filter(node=>!node.querySelector('[colspan]'));
  records.forEach((node,index)=>{node.hidden=!expanded&&index>=2;});
  controls.hidden=records.length===0;
  button.hidden=records.length<=2&&!hasMore;
  button.setAttribute('aria-expanded',String(expanded));
  button.textContent=expanded?'عرض آخر عمليتين فقط':'عرض المزيد — كل السجل';
  caption.textContent=expanded?`السجل: ${records.length} عملية`:`آخر ${Math.min(2,records.length)} من ${records.length} عملية`;
  if(more)more.hidden=!expanded||!hasMore;
 }
 button.onclick=()=>{expanded=!expanded;render();};
 return {update(nextScope,{hasMore:nextMore=false}={}){if(scope!==nextScope){scope=nextScope;expanded=false;}hasMore=Boolean(nextMore);render();},get expanded(){return expanded;},button};
}
