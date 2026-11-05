import {guideSteps,fieldHelp} from './page-guide-content.js';

export const GUIDE_VERSION=1;
export const isAdminGuideContext=(path,role)=>/^\/admin(?:\/|$)/.test(path)&&['admin','manager','cashier','media'].includes(role);
export const guideStorageKey=({uid,role})=>`mz:guide:${GUIDE_VERSION}:${role}:${encodeURIComponent(uid||'guest')}`;
export function fitGuideCard({width,height,target,cardWidth,cardHeight}) {
  const gap=12,w=Math.min(cardWidth,width-2*gap),h=Math.min(cardHeight,height-2*gap);
  if(width<640)return {left:(width-w)/2,top:target&&target.top>height/2?gap:Math.max(gap,height-h-gap),width:w};
  const left=target&&target.right+w+gap*2<width?target.right+gap:target&&target.left>w+gap*2?target.left-w-gap:(width-w)/2;
  return {left:Math.max(gap,Math.min(left,width-w-gap)),top:Math.max(gap,Math.min(target?.top??(height-h)/2,height-h-gap)),width:w};
}
export function isGuideTargetVisible(node,win=window) {
  if(!node||node.closest('[hidden],[inert]'))return false;
  const style=win.getComputedStyle(node);
  return style.display!=='none'&&style.visibility!=='hidden'&&node.getClientRects().length>0;
}
export function mountPageGuide({role='admin',uid='',section='',anchor}={}) {
  if(!isAdminGuideContext(location.pathname,role))return {refresh(){},start(){return false;},dispose(){}};
  let context={role,uid,section},steps=[],index=0,returnFocus,timer,positionFrame,disposed=false,autoShown=false,noteSequence=0;
  const sessionSeen=new Set();
  const en=()=>document.documentElement.lang==='en';
  const copy=(ar,eng)=>en()?eng:ar;
  const create=(tag,className,text)=>{const n=document.createElement(tag);n.className=className;if(text)n.textContent=text;return n;};
  const button=create('button','mz-guide-launch');button.type='button';button.hidden=true;button.dataset.pageGuide='';
  const host=()=>[...document.querySelectorAll('.cashier-header-tools,.header-actions')].find(n=>isGuideTargetVisible(n))||anchor||document.querySelector('main');
  host()?.append(button);
  const dialog=create('dialog','mz-guide-dialog');dialog.setAttribute('aria-labelledby','mzGuideTitle');dialog.setAttribute('aria-describedby','mzGuideBody');
  const spot=create('div','mz-guide-spot');spot.setAttribute('aria-hidden','true');
  const card=create('section','mz-guide-card'),count=create('p','mz-guide-count'),title=create('h2',''),body=create('p','mz-guide-body');
  title.id='mzGuideTitle';body.id='mzGuideBody';
  count.setAttribute('aria-live','polite');
  const actions=create('div','mz-guide-actions'),skip=create('button','mz-guide-skip'),back=create('button',''),next=create('button','mz-guide-next');
  for(const b of [skip,back,next])b.type='button';
  actions.append(skip,back,next);card.append(count,title,body,actions);dialog.append(spot,card);document.body.append(dialog);
  const pendingTips=new Set();const tips=new Map();
  function ready(){
    return isAdminGuideContext(location.pathname,context.role)&&!!context.uid&&isGuideTargetVisible(document.querySelector('#adminApp'));
  }
  function seen(){try{return sessionSeen.has(guideStorageKey(context))||localStorage.getItem(guideStorageKey(context))==='done';}catch{return sessionSeen.has(guideStorageKey(context));}}
  function remember(){const key=guideStorageKey(context);sessionSeen.add(key);try{localStorage.setItem(key,'done');}catch{/* Private browsing: keep a session-only fallback. */}}
  function targetFor(selector){if(!selector)return null;return [...document.querySelectorAll(selector)].find(n=>isGuideTargetVisible(n))||null;}
  function language(){button.textContent=copy('؟','?');const label=copy('مساعدة لوحة الإدارة','Dashboard help');button.setAttribute('aria-label',label);button.title=label;}
  function position(){
    positionFrame=0;if(!dialog.open)return;
    const target=steps[index]?.target?.isConnected&&isGuideTargetVisible(steps[index].target)?steps[index].target:null;
    const rect=target?.getBoundingClientRect();
    const viewport=window.visualViewport;
    const width=viewport?.width||innerWidth,height=viewport?.height||innerHeight,ox=viewport?.offsetLeft||0,oy=viewport?.offsetTop||0;
    spot.hidden=!rect;
    if(rect)Object.assign(spot.style,{left:`${Math.max(ox+4,rect.left-5)}px`,top:`${Math.max(oy+4,rect.top-5)}px`,width:`${Math.min(rect.width+10,width-8)}px`,height:`${Math.min(rect.height+10,height-8)}px`});
    card.style.width=`${Math.min(360,width-24)}px`;
    const local=rect?{left:rect.left-ox,right:rect.right-ox,top:rect.top-oy,bottom:rect.bottom-oy}:null;
    const placement=fitGuideCard({width,height,target:local,cardWidth:360,cardHeight:card.offsetHeight});
    Object.assign(card.style,{left:`${placement.left+ox}px`,top:`${placement.top+oy}px`,maxHeight:`${height-24}px`});
  }
  const schedulePosition=()=>{if(dialog.open&&!positionFrame)positionFrame=requestAnimationFrame(position);};
  function paint(){
    const s=steps[index];if(!s)return close(false);
    const current=en()?s.enTitle:s.title,description=en()?s.enBody:s.body;
    dialog.dir=en()?'ltr':'rtl';dialog.lang=en()?'en':'ar';title.textContent=current;body.textContent=description;
    count.textContent=copy(`خطوة ${index+1} من ${steps.length}`,`Step ${index+1} of ${steps.length}`);
    skip.textContent=copy('تخطي','Skip');back.textContent=copy('السابق','Back');back.disabled=index===0;
    next.textContent=index===steps.length-1?copy('تمام، فهمت','Got it'):copy('التالي','Next');
    s.target?.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});position();next.focus({preventScroll:true});
  }
  function start(automatic=false){
    if(disposed||!ready()||dialog.open)return false;
    if(automatic&&(document.hidden||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')))return false;
    const opened=[...document.querySelectorAll('dialog[open]')].filter(n=>n!==dialog);
    if(opened.length)return false;
    steps=guideSteps(context).map(s=>({...s,target:targetFor(s.selector)})).filter(s=>!s.selector||s.target);
    if(!automatic&&steps.length>1&&!steps[0].selector)steps.shift();
    if(!steps.length)return false;
    index=0;returnFocus=document.activeElement;autoShown=automatic;dialog.showModal();paint();return true;
  }
  function close(mark=true){if(!dialog.open)return;if(mark)remember();dialog.close();spot.hidden=true;if(returnFocus?.isConnected&&isGuideTargetVisible(returnFocus))returnFocus.focus({preventScroll:true});}
  skip.addEventListener('click',()=>close(true));back.addEventListener('click',()=>{if(index>0){index--;paint();}});
  next.addEventListener('click',()=>{if(index===steps.length-1)close(true);else{index++;paint();}});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);});
  button.addEventListener('click',()=>start(false));
  function decorate(){
    if(!ready())return;
    for(const [field,t] of tips)if(!field.isConnected){t.help.remove();t.note.remove();tips.delete(field);}
    for(const [selector,ar,eng] of fieldHelp){
      for(const field of document.querySelectorAll(selector)){
        if(!isGuideTargetVisible(field)||tips.has(field)||field.closest('.mz-guide-dialog'))continue;
        // Put help beside the label, never inside another button or a label that could activate the input.
        const label=field.closest('label');const parent=label?.parentElement||field.parentElement;
        if(!parent)continue;
        const help=create('button','mz-field-help','ⓘ');help.type='button';help.setAttribute('aria-expanded','false');
        const note=create('span','mz-field-note');note.hidden=true;note.id=`mzGuideNote${++noteSequence}`;note.setAttribute('role','note');
        const prior=field.getAttribute('aria-describedby');field.setAttribute('aria-describedby',[prior,note.id].filter(Boolean).join(' '));help.setAttribute('aria-controls',note.id);
        const update=()=>{const text=en()?eng:ar;help.setAttribute('aria-label',text);help.title=text;note.textContent=text;};
        update();help.addEventListener('click',()=>{note.hidden=!note.hidden;help.setAttribute('aria-expanded',String(!note.hidden));});
        (label||field).after(help,note);tips.set(field,{help,note,update,prior});
      }
    }
  }
  function queueAuto(){clearTimeout(timer);if(!ready()||seen())return;timer=setTimeout(()=>{if(!start(true)&&!seen()&&ready())timer=setTimeout(()=>start(true),3000);},1200);}
  function refresh(nextContext={}){
    const changed=context.uid!== (nextContext.uid??context.uid)||context.role!==(nextContext.role??context.role)||context.section!==(nextContext.section??context.section);
    if(changed)close(autoShown);
    context={...context,...nextContext};language();button.hidden=!ready();
    const placement=host();if(placement&&button.parentElement!==placement)placement.append(button);
    decorate();queueAuto();
  }
  function onRoute(){close(autoShown);refresh();}
  function onLanguage(){language();for(const t of tips.values())t.update();close(false);}
  window.addEventListener('hashchange',onRoute);window.addEventListener('popstate',onRoute);window.addEventListener('mz:language',onLanguage);
  window.addEventListener('resize',schedulePosition);document.addEventListener('scroll',schedulePosition,true);
  window.visualViewport?.addEventListener('resize',schedulePosition);window.visualViewport?.addEventListener('scroll',schedulePosition);
  // These events only schedule local help decoration, not API reads.
  const onClick=event=>{if(event.target.closest?.('.mz-guide-dialog'))return;const t=setTimeout(()=>{pendingTips.delete(t);decorate();},0);pendingTips.add(t);};
  document.addEventListener('click',onClick);
  refresh();
  return {refresh,start,dispose(){disposed=true;clearTimeout(timer);pendingTips.forEach(clearTimeout);if(positionFrame)cancelAnimationFrame(positionFrame);close(false);button.remove();dialog.remove();for(const [field,t] of tips){t.help.remove();t.note.remove();if(t.prior)field.setAttribute('aria-describedby',t.prior);else field.removeAttribute('aria-describedby');}window.removeEventListener('hashchange',onRoute);window.removeEventListener('popstate',onRoute);window.removeEventListener('mz:language',onLanguage);window.removeEventListener('resize',schedulePosition);document.removeEventListener('scroll',schedulePosition,true);document.removeEventListener('click',onClick);window.visualViewport?.removeEventListener('resize',schedulePosition);window.visualViewport?.removeEventListener('scroll',schedulePosition);}};
}
