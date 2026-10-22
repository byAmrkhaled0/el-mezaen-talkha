// Presentation only; callers retain the existing permission and navigation contracts.
export const workspaceGroups = [
 ['الفريق والمالية',['staff','workerTargets','workerRequests','payroll','revenue','expenses','cash','dailyClosing']],
 ['الخدمات والمبيعات',['services','packages','offers','coupons','inventory','drinks']],
 ['الموقع والتسويق',['adminAssistant','websiteContent','gallery','results','hairMedia','celebrities','posts','reviews','faqs','rewards','campaigns']],
 ['الإعدادات والصلاحيات',['schedule','settings','activity','users']],
 ['حساب العامل',['worker']]
];
export function syncAdminWorkspace(role, canOpen, root=document) {
 const nav=root.querySelector('#sidebar nav[aria-label="أقسام لوحة الإدارة"]');
 if(!nav)return;
 const primary=nav.querySelector('.sidebar-primary');
 const more=nav.querySelector('.sidebar-more-list');
 if(more&&!more.dataset.grouped){
   for(const [label,ids] of workspaceGroups){
     const section=root.createElement('details');section.className='admin-workspace-group';
     const summary=root.createElement('summary');summary.textContent=label;section.append(summary);
     for(const id of ids){const button=more.querySelector(`[data-section="${id}"]:not(.cashier-secondary)`);if(button)section.append(button);}
     more.append(section);
   }
   more.dataset.grouped='true';
 }
 nav.classList.add('grouped-admin-menu');
 const shell=nav.querySelector('.sidebar-more');if(shell)shell.open=true;
 for(const group of nav.querySelectorAll('.admin-workspace-group')){
   group.hidden=![...group.querySelectorAll('[data-section]')].some(button=>!button.hidden);
   if(group.querySelector('.active'))group.open=true;
 }
 const dashboard=root.querySelector('#dashboard');if(!dashboard)return;
 let area=root.querySelector('#adminHomeShortcuts');
 if(role==='admin'){if(area)area.remove();return;}
 if(!area){area=root.createElement('section');area.id='adminHomeShortcuts';area.className='admin-home-shortcuts';area.setAttribute('aria-label','اختصارات سريعة');dashboard.append(area);}
 area.replaceChildren();area.hidden=!['admin','manager'].includes(role);
 if(area.hidden)return;
 const heading=root.createElement('h2');heading.textContent='اختصارات سريعة';area.append(heading);
 const grid=root.createElement('div');grid.className='admin-shortcut-grid';area.append(grid);
 for(const id of ['pos','bookings','customers','staff','expenses','cash','services','websiteContent','revenue','adminAssistant']){
   if(!canOpen(id))continue;
   const original=nav.querySelector(`[data-section="${id}"]`);if(!original)continue;
   const button=original.cloneNode(true);button.removeAttribute('id');button.hidden=false;button.className='admin-shortcut';button.type='button';
   button.removeAttribute('data-section');button.dataset.shortcutSection=id;
   button.addEventListener('click',()=>{root.defaultView.location.hash='admin='+encodeURIComponent(id);});
   button.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
   grid.append(button);
 }
 if(!grid.children.length)area.hidden=true;
}
