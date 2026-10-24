export function createSidebarController({app,sidebar,menu,backdrop,collapse,document:doc=document,media=matchMedia('(max-width:1100px)'),save=()=>{}}){
  let previousOverflow='',returnFocus=null;
  const dismiss=doc.createElement('button');dismiss.type='button';dismiss.id='sidebarDismiss';dismiss.className='sidebar-dismiss';dismiss.setAttribute('aria-label','إغلاق القائمة');dismiss.title='إغلاق القائمة';dismiss.textContent='×';sidebar.prepend(dismiss);
  function sync(){
    const open=media.matches?sidebar.classList.contains('open'):!app.classList.contains('sidebar-collapsed');
    menu.setAttribute('aria-controls',sidebar.id);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'إخفاء القائمة':'إظهار القائمة');menu.title=open?'إخفاء القائمة':'إظهار القائمة';
    collapse.setAttribute('aria-expanded',String(open));collapse.title=open?'إخفاء القائمة':'إظهار القائمة';collapse.textContent=open?'›':'‹';sidebar.inert=!open;
  }
  function close(){
    const wasOpen=sidebar.classList.contains('open');sidebar.classList.remove('open');backdrop.classList.remove('show');if(wasOpen)doc.body.style.overflow=previousOverflow;sync();if(wasOpen&&returnFocus?.isConnected)returnFocus.focus();
  }
  function setCollapsed(value,{persist=true}={}){app.classList.toggle('sidebar-collapsed',Boolean(value));if(persist)save(Boolean(value));sync();}
  function toggle(){
    if(!media.matches){const value=!app.classList.contains('sidebar-collapsed');setCollapsed(value);if(value)menu.focus();return;}
    if(sidebar.classList.contains('open')){close();return;}
    returnFocus=doc.activeElement;previousOverflow=doc.body.style.overflow;sidebar.classList.add('open');backdrop.classList.add('show');doc.body.style.overflow='hidden';sync();dismiss.focus();
  }
  dismiss.onclick=()=>{if(media.matches)close();else{setCollapsed(true);menu.focus();}};
  sidebar.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();dismiss.onclick();return;}
    if(event.key!=='Tab'||!media.matches||!sidebar.classList.contains('open'))return;
    const controls=[...sidebar.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary')].filter(el=>!el.hidden&&el.getClientRects().length&&el.tabIndex>=0);
    const first=controls[0],last=controls.at(-1);if(!first)return;
    if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
  });
  media.addEventListener('change',()=>{close();sync();});sync();return {close,toggle,setCollapsed};
}
