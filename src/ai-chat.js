import { askCustomerAgent, confirmCustomerAgent } from './firebase-client.js';
import { resolveAssistantFallback } from './assistant-fallback.js';
import { safeMediaUrl } from './media.js';
import { serviceMedia } from './premium-media.js';
let devProvider;
let options, history = [], busy = false, panel, draft;
const textNode = (tag, text, className) => { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; };
function message(text,kind='assistant') { const row = textNode('p', text, 'ai-message '+kind); panel.querySelector('.ai-conversation').append(row); row.scrollIntoView({block:'nearest'}); return row; }
function close() { panel.hidden = true;document.querySelector('.faq-chat-fab')?.setAttribute('aria-expanded','false'); document.querySelector('[data-open-faq-chat]')?.focus(); }
const labels = {nameAr:'الاسم',descriptionAr:'الوصف',price:'السعر',duration:'المدة',specialtyAr:'التخصص',addressAr:'العنوان',phone:'الهاتف',openingTime:'يفتح',closingTime:'يغلق',questionAr:'السؤال',answerAr:'الإجابة',branchNameAr:'الفرع',serviceNamesAr:'الخدمات',staffNameAr:'العامل',bookingDate:'التاريخ',bookingTime:'الوقت',total:'الإجمالي',subtotal:'قبل الخصم',discountAmount:'الخصم',status:'الحالة',code:'كود الحجز'};
function card(data) {
  const node = document.createElement('article'); node.className = 'ai-action-card';
  for (const [key,label] of Object.entries(labels)) if (data[key] !== undefined && data[key] !== '') node.append(textNode('p', `${label}: ${Array.isArray(data[key]) ? data[key].join(' + ') : data[key]}`));
  panel.querySelector('.ai-conversation').append(node); return node;
}
async function send(value) {
  if (busy || history.length >= 20) { if (history.length >= 20) message('ابدأ محادثة جديدة لمتابعة الطلب'); return; }
  busy = true; panel.querySelector('form button').disabled = true;
  panel.querySelector('.ai-welcome')?.remove();message(value,'user');const typing=message('مزين بيراجع طلبك…','loading');
  try {
    let result = await (devProvider || askCustomerAgent)({message:value,history:history.slice(-6),branchId:options.branch?.id});
    if (result.fallback && !result.message) result = resolveAssistantFallback(value, options);
    typing.remove();history.push({role:'user',content:value}); if(result.message){message(result.message);history.push({role:'assistant',content:result.message.slice(0,1200)});}
    for (const row of result.cards || []) {const resultCard=card(row);resultCard.dataset.cardType=result.cardType||'result';const photo=safeMediaUrl(row.imageUrl || row.photoUrl) || (result.cardType==='service'?serviceMedia(row):result.cardType==='worker'?'/assets/el-mezaen-mark-v2.webp':null);if(photo){const img=document.createElement('img');img.src=photo;img.alt=row.nameAr||'';img.loading='lazy';img.className='ai-result-image';resultCard.prepend(img);}if(result.cardType==='service'&&row.id){const choose=textNode('button','اختار الخدمة');choose.type='button';choose.onclick=()=>send(`اختار خدمة ${row.nameAr}`);const details=textNode('button','تفاصيل');details.type='button';details.onclick=()=>send(`تفاصيل خدمة ${row.nameAr}`);resultCard.append(choose,details);}if(row.specialtyAr&&row.nameAr){const choose=textNode('button',`اختار ${row.nameAr}`);choose.type='button';choose.onclick=()=>send(`احجز مع ${row.nameAr}`);resultCard.append(choose);}}
    if(result.slots){if(!result.slots.length)message('لا توجد مواعيد متاحة');else{const slots=document.createElement('div');slots.className='ai-slots';for(const slot of result.slots){const time=typeof slot==='string'?slot:slot.time||slot.bookingTime;if(!time)continue;const b=textNode('button',time);b.type='button';b.onclick=()=>send(`اختار الموعد ${time}`);slots.append(b);}panel.querySelector('.ai-conversation').append(slots);}}
    if (result.whatsapp) { const link=textNode('a','كلم الفرع'); const number=result.whatsapp.startsWith('0') ? `2${result.whatsapp}` : result.whatsapp; link.href=`https://wa.me/${number}`;link.target='_blank';link.rel='noopener noreferrer';panel.querySelector('.ai-conversation').append(link); }
    if (result.confirmation) {
      const node = card(result.confirmation);node.classList.add('confirmation'); draft=result.draftId;
      if(result.devOnly){node.append(textNode('small','DEV: بطاقة عرض فقط؛ التأكيد معطل'));const testButton=textNode('button','تأكيد الحجز');testButton.disabled=true;node.append(testButton);}
      else if (result.loginRequired) { const a=textNode('a','دخول العميل');a.href='/account/';node.append(a); }
      else {
        const first=document.createElement('input'),last=document.createElement('input');first.placeholder='الاسم الأول';last.placeholder='اسم العائلة';first.autocomplete='given-name';last.autocomplete='family-name';
        if (result.action === 'prepareBooking') node.append(first,last);
        first.setAttribute('aria-label','الاسم الأول');last.setAttribute('aria-label','اسم العائلة');const button=textNode('button',({prepareBooking:'تأكيد الحجز',prepareReschedule:'تأكيد تعديل الموعد',prepareCancel:'تأكيد الإلغاء'})[result.action]||'تأكيد العملية');button.type='button';
        button.addEventListener('click',async () => { if(button.disabled)return; button.disabled=true; try { const response=await confirmCustomerAgent({draftId:result.draftId,confirmed:true,firstName:first.value,lastName:last.value});if(response.fallback){message("التأكيد غير متاح حاليًا؛ تفاصيلك محفوظة هنا، حاول لاحقًا أو تواصل مع الفرع.");button.disabled=false;return;}message('تم تأكيد العملية');if(response.booking)card(response.booking); }catch(error){message(error.message);button.disabled=false;} });
        const edit=textNode('button','تعديل');edit.type='button';edit.addEventListener('click',()=>{button.disabled=true;panel.querySelector('input[name=message]').focus();});node.append(button,edit);
      }
    }
  } catch(error) { const fallback=resolveAssistantFallback(value,options);message(fallback.message); }
  finally { typing.remove();busy=false; panel.querySelector('form button').disabled=false; }
}
export async function openAiChat(data) {
  options=data;
  if(import.meta.env.DEV && import.meta.env.VITE_AI_DEV_MOCK==='true' && ['localhost','127.0.0.1'].includes(location.hostname)){const {createDevConversation}=await import('./ai-dev-provider.js');devProvider ||= createDevConversation(data.catalog||{});}
  if (!panel) {
    panel=document.createElement('section');panel.id='customerAiPanel';panel.className='ai-panel';panel.role='dialog';panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','مساعدك الشخصي');
    const header=document.createElement('header');const identity=document.createElement('div');identity.className='ai-identity';const avatar=textNode('span','', 'ai-avatar');avatar.innerHTML='<svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M16 3v4m-2-5h4M7 9h18v16H7zM3 14v7m26-7v7M12 20h8"/><circle cx="12" cy="14" r="1.5"/><circle cx="20" cy="14" r="1.5"/><path d="M23 25v4l5-4"/></svg>';const titles=document.createElement('div');titles.append(textNode('h2','مساعدك الشخصي'),textNode('small','مساعد مزين للحجز والاستفسارات'));identity.append(avatar,titles);header.append(identity);const exit=textNode('button','×');exit.type='button';exit.setAttribute('aria-label','إغلاق');exit.addEventListener('click',close);header.append(exit);
    const branch=textNode('p','', 'ai-branch');const conversation=document.createElement('div');conversation.className='ai-conversation';conversation.setAttribute('aria-live','polite');const welcome=document.createElement('article');welcome.className='ai-welcome';welcome.append(textNode('h3','أهلًا بيك في مزين'),textNode('p','قولّي محتاج إيه، أساعدك تختار الخدمة والعامل والموعد المناسب. السعر والتوافر بيتراجعوا قبل التأكيد.'));const starters=document.createElement('div');starters.className='ai-starters';for(const label of ['احجز موعد','مين متاح؟','الخدمات والأسعار','الباقات','العروض','حجوزاتي']){const b=textNode('button',label);b.type='button';b.onclick=()=>send(label);starters.append(b);}welcome.append(starters);conversation.append(welcome);
    const quick=document.createElement('div');quick.className='ai-quick';for(const label of ['احجز موعد','الخدمات والأسعار','مكان الفروع']){const b=textNode('button',label);b.type='button';b.addEventListener('click',()=>send(label));quick.append(b);}
    const form=document.createElement('form');const input=document.createElement('input');input.name='message';input.maxLength=1200;input.placeholder='اكتب سؤالك…';input.setAttribute('aria-label','رسالتك');input.required=true;const sendButton=textNode('button','إرسال');form.append(input,sendButton);form.addEventListener('submit',e=>{e.preventDefault();const value=input.value.trim();if(value){input.value='';void send(value);}});
    panel.append(header,branch,quick,conversation,form);document.body.append(panel);
    panel.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('button,input,a[href]')].filter(n=>!n.disabled);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}});
  }
  if(devProvider&&!panel.querySelector('.ai-dev-indicator')){panel.querySelector('header').append(textNode('small','DEV • محادثة تجريبية', 'ai-dev-indicator'));}
  panel.hidden=false;document.querySelector('.faq-chat-fab')?.setAttribute('aria-expanded','true');panel.querySelector('.ai-branch').textContent=options.branch?.nameAr || 'اختر الفرع';panel.querySelector('input[name=message]').focus();
}
