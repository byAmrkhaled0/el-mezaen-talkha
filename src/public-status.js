// Presentation only: never interprets a failed request as an empty catalog.
export function publicDataStatus(error, {cached=false, hasBranches=true, hasSelection=true, count=0}={}) {
  if(error){const code=String(error.code||'').replace(/^(functions|auth)\//,'');return ['unauthenticated','permission-denied'].includes(code)?'authorization-error':code.startsWith('appCheck/')||code.startsWith('app-check/')?'app-check-error':error.emptyCatalog?'no-active-branches':'connection-error';}
  return cached?'cached':!hasBranches?'no-active-branches':!hasSelection?'choose':count?'ready':'empty';
}
const messages={
 ar:{'rendering-error':'تعذر عرض المحتوى. أعد المحاولة.','contract-error':'لم تتضمن استجابة المحتوى البيانات المطلوبة.','editorial-empty':'لا يوجد محتوى منشور مطابق حاليًا.',loading:'جاري تحميل المحتوى…','authorization-error':'تعذر التحقق من صلاحية الطلب وحماية الموقع.','app-check-error':'تعذر التحقق من حماية الموقع.','connection-error':'تعذر الاتصال لتحميل المحتوى.','no-active-branches':'لا توجد فروع نشطة متاحة حاليًا.',cached:'هذه نسخة محفوظة؛ أعد الاتصال للتحقق من أحدث المحتوى.',choose:'اختر الفرع لعرض المحتوى المناسب له.',empty:'لا يوجد محتوى منشور مطابق في هذا الفرع حاليًا.'},
 en:{'rendering-error':'Content could not be rendered. Please retry.','contract-error':'The content response is missing required data.','editorial-empty':'No matching published content yet.',loading:'Loading content…','authorization-error':'Authorization or site protection verification failed.','app-check-error':'Site protection verification failed.','connection-error':'Could not connect to load content.','no-active-branches':'No active branches are currently available.',cached:'This is a saved copy; reconnect to check the latest content.',choose:'Choose a branch to see its content.',empty:'No matching published content at this branch yet.'}
};
export const publicStatusText=(status,lang='ar')=>(messages[lang]||messages.ar)[status]||'';
