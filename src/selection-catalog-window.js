// Keep a fixed bootstrap plus only the current page and selected rows.
export function createSelectionCatalogWindow(initial={}){
 let base={...initial},extra={};
 function refs(packages){return packages.flatMap(x=>[...(x.includedServiceIds||[]),...(x.choiceGroups||[]).flatMap(g=>(g.options||[]).map(o=>o.serviceId))]);}
 return {reset(value){base={...value};extra={};},page(collection,value,pinned=[]){
  const selected=new Set(pinned);const packs=[...(base.packages||[]),...(extra.packages||[])].filter(x=>selected.has(x.id));for(const id of refs(packs))selected.add(id);
  extra[collection]=[...new Map([...(extra[collection]||[]).filter(x=>selected.has(x.id)),...(value.items||[])].map(x=>[x.id,x])).values()];
  if(collection==='packages')extra.services=[...new Map([...(extra.services||[]).filter(x=>selected.has(x.id)),...(value.linkedServices||[])].map(x=>[x.id,x])).values()];
  return Object.fromEntries(['services','packages','offers'].map(key=>[key,[...new Map([...(base[key]||[]),...(extra[key]||[])].map(x=>[x.id,x])).values()]]));
 }};
}
