// Presentation/navigation only. Server pricing, eligibility and booking payloads stay in the existing flow.
export function bookingScreen(requested,appointment=true) {
  let step=Math.max(1,Math.min(7,Math.floor(Number(requested)||1)));
  if([3,4].includes(step))step=2;
  if(step===2&&!appointment)step=5;
  const stages=appointment?[1,2,5,6]:[1,5,6];
  return {step,visible:step===2?[2,3,4]:[step],stages,position:step===7?stages.length:stages.indexOf(step)+1};
}
export function nextBookingScreen(step,appointment=true) {
  const view=bookingScreen(step,appointment),index=view.stages.indexOf(view.step);
  return view.stages[index+1]||7;
}
export function previousBookingScreen(step,appointment=true) {
  const view=bookingScreen(step,appointment),index=view.stages.indexOf(view.step);
  return view.stages[Math.max(0,index-1)]||1;
}
export function mountBookingSummary(root=document,media=window.matchMedia('(max-width:820px)')) {
  const button=root.querySelector('#bookingSummaryToggle'),details=root.querySelector('#bookingSummaryDetails');
  if(!button||!details)return null;
  let expanded=false;
  const sync=()=>{button.hidden=!media.matches;details.hidden=media.matches&&!expanded;button.setAttribute('aria-expanded',String(!details.hidden));};
  button.addEventListener('click',()=>{expanded=!expanded;sync();});
  media.addEventListener('change',sync);sync();
  return {sync};
}
