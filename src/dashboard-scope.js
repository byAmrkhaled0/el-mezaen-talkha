const states=new WeakMap();
export function mountDashboardScope({root=document,branchIds=['talkha','mashaya']}){
 const anchor=root.querySelector('#dashboard'),summary=anchor?.querySelector('.dashboard-financial-summary');if(!anchor||!summary)return;
 if(states.has(root))return;
 const state={chosen:false,pending:false};states.set(root,state);summary.hidden=true;
 const prompt=root.createElement('div');prompt.className='dashboard-scope-prompt';prompt.setAttribute('role','status');
 const text=root.createElement('p');text.textContent='اختر الفرع لعرض الملخص المالي والتشغيلي';prompt.append(text);
 const options=branchIds.length>1?[...branchIds,'all']:branchIds;
 for(const id of options){const b=root.createElement('button');b.type='button';b.className='small-button';b.textContent=id==='all'?'الفرعين معًا':id==='talkha'?'طلخا':'المشاية';b.addEventListener('click',()=>{const select=root.querySelector('#headerBranchFilter');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));});prompt.append(b);}
 summary.before(prompt);
 root.addEventListener('change',event=>{if(!['headerBranchFilter','dashboardBranchFilter'].includes(event.target.id))return;state.chosen=true;state.pending=true;summary.hidden=true;prompt.hidden=false;text.textContent='جاري تحميل ملخص '+(event.target.value==='all'?'الفرعين معًا':event.target.value==='talkha'?'طلخا':'المشاية')+'…';});
 root.addEventListener('mz:dashboard-error',()=>{if(state.chosen){summary.hidden=true;prompt.hidden=false;text.textContent='تعذر تحميل الملخص؛ اختر الفرع للمحاولة مرة تانية.';}});
 root.addEventListener('mz:dashboard-ready',event=>{if(!state.chosen)return;if(event.detail.branchId!==root.querySelector('#dashboardBranchFilter').value)return;state.pending=false;summary.hidden=false;prompt.hidden=true;let label=summary.querySelector('[data-summary-scope]');if(!label){label=root.createElement('p');label.dataset.summaryScope='';summary.querySelector('.panel-head').append(label);}label.textContent=event.detail.branchId==='all'?'إجمالي الفرعين — طلخا والمشاية':event.detail.branchId==='talkha'?'بيانات فرع طلخا فقط':'بيانات فرع المشاية فقط';});
}
