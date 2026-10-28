export const BOOKING_BARCODE_OPTIONS=Object.freeze({format:'CODE128',displayValue:false,width:2,height:72,margin:20,background:'#ffffff',lineColor:'#000000'});
export function normalizeBookingScan(value){let raw=String(value||'').trim().replace(/^\]C[01]/,'').trim();if(/^https?:\/\//i.test(raw)){const url=new URL(raw);raw=url.searchParams.get('bookingCode')||url.searchParams.get('code')||url.searchParams.get('booking')||'';}raw=raw.replace(/[\r\n\t]/g,'').trim().toUpperCase();if(!/^(MZ|POS|TR)-[A-Z0-9][A-Z0-9-]{3,95}$/.test(raw))throw Error('باركود الحجز غير صحيح؛ جرّب الكود المكتوب أسفله');return raw;}
export async function resolveScannedBooking(value,{cached=[],lookup,allowed=()=>true}){const code=normalizeBookingScan(value);const found=cached.find(row=>String(row.code||row.id).toUpperCase()===code&&allowed(row));if(found)return found;const page=await lookup(code);return (page.items||[]).find(row=>String(row.code||row.id).toUpperCase()===code&&allowed(row))||null;}
export async function startBookingDecoder({video,stream,NativeDetector,loadFallback,onValue,onError=()=>{},isCurrent=()=>true,requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id),setTimer=setTimeout,clearTimer=clearTimeout}){
 let stopped=false,frame=null,timer=null,fallback=null,starting=false;
 const valid=()=>!stopped&&isCurrent();
 const stop=()=>{stopped=true;if(frame!=null)cancelFrame(frame);if(timer!=null)clearTimer(timer);fallback?.stop?.();};
 async function startFallback(){if(!valid()||starting)return;starting=true;if(timer!=null)clearTimer(timer);if(frame!=null)cancelFrame(frame);try{const reader=await loadFallback();if(!valid())return;const controls=await reader.decodeFromStream(stream,video,result=>{if(result&&valid())void Promise.resolve(onValue(result.getText())).catch(onError);});if(stopped||!isCurrent())controls?.stop?.();else fallback=controls;}catch(error){if(valid())onError(error);}}
 let detector=null;try{if(NativeDetector){const formats=await NativeDetector.getSupportedFormats?.();if(formats?.includes('code_128')&&formats.includes('qr_code'))detector=new NativeDetector({formats:['code_128','qr_code']});}}catch{}
 if(!valid())return {stop};
 if(!detector){await startFallback();return {stop};}
 async function tick(){if(!valid()||starting)return;try{const codes=await detector.detect(video);if(!valid())return;if(codes[0]?.rawValue)await onValue(codes[0].rawValue);if(valid()&&!starting)frame=requestFrame(tick);}catch{await startFallback();}}
 timer=setTimer(()=>void startFallback(),3000);void tick();return {stop};
}
