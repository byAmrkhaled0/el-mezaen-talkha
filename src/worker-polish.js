import './worker-polish.css';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
const branch=id=>({talkha:'طلخا',mashaya:'المشاية'})[id]||id;
const money=n=>new Intl.NumberFormat('ar-EG',{style:'currency',currency:'EGP'}).format(n);

export function renderWorkerProfile(staff,workspace,attendance,user){
 const root=document.getElementById('profileDetails');root.replaceChildren();
 const dl=el('dl');dl.className='worker-profile-grid';
 for(const [label,value]of [['الاسم',staff.nameAr],['الهاتف',staff.phone||user.phoneNumber],['اسم المستخدم',workspace.account?.username||user.email],['التخصص',staff.specialtyAr],['الفروع المعينة',(staff.branchIds||[]).map(branch).join('، ')],['فرع العمل الحالي',branch(workspace.activeBranchId)],['الشيفت',(staff.shiftStart||'—')+' — '+(staff.shiftEnd||'—')],['حضور اليوم',attendance?.status==='PRESENT'?'حاضر':attendance?'تم الانصراف':'غير مسجل']]){const item=el('div');item.append(el('dt',label),el('dd',value||'غير مسجل'));dl.append(item)}root.append(dl);
 const progress=el('section');progress.className='worker-profile-progress';progress.append(el('h3','أداؤك الشهري • '+(workspace.target?.month||'')));
 if(Number.isFinite(workspace.target?.achieved))progress.append(el('p','المحقق في '+branch(workspace.activeBranchId)+': '+money(workspace.target.achieved)));
 progress.append(el('small','الهدف والنسبة والمتبقي في بطاقة التارجت أدناه. البيانات المالية تخص حسابك ونطاق الفرع فقط.'));root.append(progress);
}

const status=document.getElementById('status'),retry=el('button','إعادة تحميل حسابي');retry.type='button';retry.id='workerLoadRetry';retry.hidden=true;retry.onclick=()=>location.reload();status.after(retry);
const nav=document.querySelector('.worker-nav');
const icons={home:'M3 11 12 3l9 8v10h-6v-7H9v7H3Z',bookings:'M4 5h16v16H4Zm4-3v6m8-6v6M4 11h16',tasks:'M5 3h14v18H5Zm3 8 2 2 5-5m-7 9h8',attendance:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',profile:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2'};
for(const b of nav.querySelectorAll('[data-view]')){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',icons[b.dataset.view]);svg.append(path);const label=el('span',b.textContent);b.replaceChildren(svg,label);}
const push=document.getElementById('enablePush');if(push){const hint=el('p');hint.className='push-explanation';hint.textContent='إشعارات الجهاز اختيارية وتحتاج سماح المتصفح. في الاختبار المحلي تظل التنبيهات متاحة داخل حسابك.';push.after(hint);}

const legacyTarget=document.getElementById('targetProgress')?.closest('article');if(legacyTarget)legacyTarget.hidden=true;

const ownTarget=document.getElementById('workerOwnTarget'),photoCard=document.querySelector('[data-screen=profile] .profile-photo-card');if(ownTarget&&photoCard)photoCard.before(ownTarget);
