import { bindSafeBack } from './navigation.js';
export function mountGlobalNavigation() {
  const path=location.pathname.replace(/\/$/,'');
  if(path && path!='/admin' && !document.querySelector('[data-safe-back]')) {
    const back=document.createElement('a');back.href='/';back.dataset.safeBack='';back.className='global-back';back.textContent='→ رجوع';
    const target=document.querySelector('main, .worker-shell, .login-shell');target?.prepend(back);
    bindSafeBack('.global-back');
  }
  let top=document.querySelector('.scroll-top');
  if(!top){top=document.createElement('button');top.type='button';top.className='scroll-top';top.textContent='↑';top.setAttribute('aria-label','أعلى الصفحة');top.hidden=true;document.body.append(top);}
  if(!top.id){const update=()=>{top.hidden=window.scrollY<350;};window.addEventListener('scroll',update,{passive:true});update();top.addEventListener('click',()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));}
}
mountGlobalNavigation();
