// Client opt-in only; server authorization and feature checks remain mandatory.
export function customerAssistantProvider({ devProvider, ask, settings }) {
  return devProvider || (settings?.aiAgentEnabled === true ? ask : async () => ({ fallback: true }));
}
export async function adminAssistantResponse({ report, insights, ask, scope, message, history }) {
  const current = report || await insights(scope);
  if (current.modelEnabled !== true) return { ...current, mode: 'local', proposal: null,
    message: 'الموديل الحي متوقف حاليًا. دي توصيات محلية من تقرير الفترة المعروض، مش إجابة مولدة على السؤال.\n' + (current.recommendations || []).join('\n') };
  return ask({ ...scope, message, history });
}
