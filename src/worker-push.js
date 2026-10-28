export function workerPushNotification(payload,origin){
 const data=payload?.data||{},notice=payload?.notification||{};let link=new URL('/worker/',origin);
 try{const candidate=new URL(data.link||payload?.fcmOptions?.link||'/worker/',origin);if(candidate.origin===new URL(origin).origin&&candidate.pathname.startsWith('/worker/'))link=candidate;}catch{}
 return {title:String(notice.title||data.title||'تنبيه من المزين').slice(0,160),options:{body:String(notice.body||data.body||'افتح حسابك لمراجعة التنبيه').slice(0,500),icon:'/assets/el-mezaen-mark-v2.webp',badge:'/assets/icon-192.png',tag:String(data.type||'worker')+'_'+String(data.entityId||payload?.messageId||'notice'),data:{url:link.href}}};
}
