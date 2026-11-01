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
 let context,enabled=true,lastPlayed=-Infinity;const voices=new Set();try{enabled=storage?.getItem('mz-booking-sound')!=='off';}catch{}
 const state=()=>onState({enabled,ready:context?.state==='running'});
 async function arm(){if(!enabled||!Audio)return false;try{context ||= new Audio();if(context.state==='suspended')await context.resume();state();return context.state==='running';}catch{state();return false;}}
 return {arm,async play(){if(!await arm()||!enabled||Date.now()-lastPlayed<1900)return false;lastPlayed=Date.now();const start=context.currentTime;
  // Three bell strikes; partials total .8 peak and each strike decays before the next.
  for(let index=0;index<3;index++)for(const [frequency,peak]of [[1046.5,.48],[2095,.22],[2930.2,.10]]){const oscillator=context.createOscillator(),gain=context.createGain(),at=start+index*.58;oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(peak,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+.51);oscillator.connect(gain).connect(context.destination);voices.add(oscillator);oscillator.onended=()=>{voices.delete(oscillator);oscillator.disconnect?.();gain.disconnect?.();};oscillator.start(at);oscillator.stop(at+.53);}return true;
 },setEnabled(value){enabled=Boolean(value);if(!enabled){for(const oscillator of voices)try{oscillator.stop();}catch{}voices.clear();}try{storage?.setItem('mz-booking-sound',enabled?'on':'off');}catch{}state();},get enabled(){return enabled;},sync:state};
}
export function bookingSoundIcon(enabled){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/>${enabled?'<path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>':'<path d="m16 9 5 6m0-6-5 6"/>'}</svg>`;}
export function mountBookingLiveUi({root=document,onOpen=()=>{},branchLabel=id=>id}={}){
 const host=root.querySelector('#bookingLiveControls'),banner=root.querySelector('#newBookingBanner');let latest=null;
 const mute=root.querySelector('#bookingSoundMute');
 const header=root.querySelector('.admin-header');
 if(header&&globalThis.ResizeObserver){const observer=new ResizeObserver(()=>root.documentElement.style.setProperty('--admin-live-header-height',Math.ceil(header.getBoundingClientRect().height)+'px'));observer.observe(header);globalThis.window?.addEventListener('beforeunload',()=>observer.disconnect(),{once:true});}
 const sound=createBookingSound({onState:state=>{if(mute){const label=state.enabled?'كتم صوت الحجوزات':'تشغيل صوت الحجوزات';mute.innerHTML=bookingSoundIcon(state.enabled);mute.setAttribute('title',label);mute.setAttribute('aria-label',label);mute.setAttribute('aria-pressed',String(!state.enabled));}}});
 mute?.addEventListener('click',()=>{sound.setEnabled(!sound.enabled);if(sound.enabled)void sound.arm();});
 root.querySelector('#bookingSoundTest')?.addEventListener('click',()=>{sound.setEnabled(true);void sound.play();});
 root.addEventListener('pointerdown',()=>void sound.arm(),{once:true,passive:true});sound.sync();
 root.querySelector('#openNewBooking')?.addEventListener('click',()=>{if(latest)void onOpen(latest.id);});root.querySelector('#dismissNewBooking')?.addEventListener('click',()=>{banner.hidden=true;});
 const shown=new Set();
 return {sound,reset(){shown.clear();latest=null;if(banner)banner.hidden=true;},status(value){if(host)host.dataset.connection=value;},notify(item){
  if(!item?.id||shown.has(item.id))return false;shown.add(item.id);if(shown.size>300)shown.delete(shown.values().next().value);latest=item;
  if(banner){banner.hidden=false;root.querySelector('#newBookingBannerText').textContent=`حجز جديد${item.customerName?' — '+item.customerName:''} · ${branchLabel(item.branchId)}`;}
  void sound.play();return true;
 },showControls(value){if(host)host.hidden=!value;}};
}
