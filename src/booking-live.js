export function createNewBookingTracker(notify){
 const scopes=new Map();
 return {reset(){scopes.clear();},accept(items,scope='default'){
  const active=(items||[]).filter(item=>item?.id&&item.source!=='pos'&&['pending','confirmed'].includes(item.status));
  if(!scopes.has(scope)){scopes.set(scope,new Set(active.map(item=>item.id)));return;}
  const seen=scopes.get(scope);for(const item of active){if(!seen.has(item.id)){seen.add(item.id);notify(item);}}
  if(seen.size>500)scopes.set(scope,new Set([...seen].slice(-300)));if(scopes.size>6)scopes.delete(scopes.keys().next().value);
 }};
}
export function createBookingSignalPump({scope,refresh,notify,onError=()=>{},schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}){
 const seen=new Map();let disposed=false,timer=null,running=false,dirty=false;
 function queue(){dirty=true;if(disposed||running||timer!==null)return;timer=schedule(()=>{timer=null;void flush();},120);}
 async function flush(){if(disposed||running)return;running=true;dirty=false;try{await refresh();}catch(error){onError(error);}finally{running=false;if(dirty)queue();}}
 return {receive({signals={},initial=false}={}){
  if(disposed)return;const access=scope();if(!access?.uid||!['admin','manager','cashier'].includes(access.role))return;
  for(const [branchId,signal]of Object.entries(signals)){
   if(!['talkha','mashaya'].includes(branchId)||signal?.branchId!==branchId||typeof signal.bookingId!=='string'||signal.bookingId.includes('/')||!signal.revision||!['new_booking','booking_changed'].includes(signal.type))continue;
   if(access.role!=='admin'&&!access.branchIds?.includes(branchId))continue;
   if(access.selectedBranch&&access.selectedBranch!=='all'&&access.selectedBranch!==branchId)continue;
   const key=access.uid+':'+branchId,revision=String(signal.revision);if(seen.get(key)>=revision)continue;seen.set(key,revision);
   if(!initial&&signal.type==='new_booking'&&signal.source!=='pos')notify({id:signal.bookingId,branchId});
   queue();
  }
 },refresh:queue,dispose(){disposed=true;if(timer!==null)cancel(timer);timer=null;seen.clear();}};
}
export function createBookingSound({Audio=globalThis.AudioContext,storage=globalThis.localStorage,onState=()=>{}}={}){
 let context,enabled=true,lastPlayed=-Infinity;try{enabled=storage?.getItem('mz-booking-sound')!=='off';}catch{}
 const state=()=>onState({enabled,ready:context?.state==='running'});
 async function arm(){if(!enabled||!Audio)return false;try{context ||= new Audio();if(context.state==='suspended')await context.resume();state();return context.state==='running';}catch{state();return false;}}
 return {arm,async play(){if(!await arm()||Date.now()-lastPlayed<1100)return false;lastPlayed=Date.now();const start=context.currentTime;
  for(let index=0;index<4;index++){const oscillator=context.createOscillator(),gain=context.createGain(),at=start+index*.22;oscillator.type='sine';oscillator.frequency.value=index%2?1174:880;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.28,at+.025);gain.gain.exponentialRampToValueAtTime(.0001,at+.19);oscillator.connect(gain).connect(context.destination);oscillator.start(at);oscillator.stop(at+.21);}return true;
 },setEnabled(value){enabled=Boolean(value);try{storage?.setItem('mz-booking-sound',enabled?'on':'off');}catch{}state();},get enabled(){return enabled;},sync:state};
}
export function mountBookingLiveUi({root=document,onOpen=()=>{},branchLabel=id=>id}={}){
 const host=root.querySelector('#bookingLiveControls'),banner=root.querySelector('#newBookingBanner');let latest=null;
 const enable=root.querySelector('#bookingSoundEnable'),mute=root.querySelector('#bookingSoundMute'),status=root.querySelector('#bookingLiveStatus');
 const header=root.querySelector('.admin-header');
 if(header&&globalThis.ResizeObserver){const observer=new ResizeObserver(()=>root.documentElement.style.setProperty('--admin-live-header-height',Math.ceil(header.getBoundingClientRect().height)+'px'));observer.observe(header);globalThis.window?.addEventListener('beforeunload',()=>observer.disconnect(),{once:true});}
 const sound=createBookingSound({onState:state=>{if(enable)enable.textContent=state.ready&&state.enabled?'تجربة صوت الحجوزات':'تفعيل وتجربة صوت الحجوزات';if(mute){mute.textContent=state.enabled?'كتم الصوت':'تشغيل الصوت';mute.setAttribute('aria-pressed',String(!state.enabled));}}});
 enable?.addEventListener('click',()=>{sound.setEnabled(true);void sound.play();});mute?.addEventListener('click',()=>{sound.setEnabled(!sound.enabled);if(sound.enabled)void sound.arm();});
 root.addEventListener('pointerdown',()=>void sound.arm(),{once:true,passive:true});sound.sync();
 root.querySelector('#openNewBooking')?.addEventListener('click',()=>{if(latest)void onOpen(latest.id);});root.querySelector('#dismissNewBooking')?.addEventListener('click',()=>{banner.hidden=true;});
 const shown=new Set();
 return {sound,reset(){shown.clear();latest=null;if(banner)banner.hidden=true;},status(value){if(status)status.textContent=value==='connected'?'التحديث التلقائي متصل':value==='error'?'تعذر الاتصال المباشر — التحديث الدوري مستمر':'جاري توصيل التحديث التلقائي…';},notify(item){
  if(!item?.id||shown.has(item.id))return false;shown.add(item.id);if(shown.size>300)shown.delete(shown.values().next().value);latest=item;
  if(banner){banner.hidden=false;root.querySelector('#newBookingBannerText').textContent=`حجز جديد${item.customerName?' — '+item.customerName:''} · ${branchLabel(item.branchId)}`;}
  void sound.play();return true;
 },showControls(value){if(host)host.hidden=!value;}};
}
