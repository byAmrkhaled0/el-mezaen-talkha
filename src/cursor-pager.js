export function createCursorPager(load,{take=24,maxHistory=500}={}){
 let scope='',generation=0,page=0,cursors=[null],result=null,pending=null;
 async function request(context={},target=0,reset=false){
  const key=JSON.stringify(context);
  if(reset||key!==scope){scope=key;generation++;page=0;cursors=[null];result=null;pending=null;}
  if(target<0||target>=cursors.length||target>=maxHistory)throw Error('PAGE_OUT_OF_RANGE');
  const stamp=generation,current=scope;
  if(pending&&pending.target===target&&pending.scope===scope)return pending.promise;
  const entry={target,scope,promise:null};
  entry.promise=Promise.resolve().then(()=>load({...context,take,skip:target*take,cursor:cursors[target]||undefined})).then(value=>{if(stamp!==generation||current!==scope||pending!==entry)return null;page=target;result=value;if(value.nextCursor)cursors[target+1]=value.nextCursor;else cursors.length=target+1;return {...value,page:target+1,canPrevious:target>0,canNext:Boolean(value.nextCursor)&&target+1<maxHistory};}).finally(()=>{if(pending===entry)pending=null;});pending=entry;return entry.promise;
 }
 return {request,next:context=>request(context,page+1),previous:context=>request(context,page-1),reset:context=>request(context,0,true),state:()=>({page:page+1,result,pending:Boolean(pending)})};
}

export function boundedCollectionWindow(current,incoming,pinnedIds=[],maximum=200){
 const merged=new Map([...current,...incoming].map(item=>[item.id,item])),pinned=new Set(pinnedIds),rows=[...merged.values()];
 return [...new Map([...rows.slice(-maximum),...rows.filter(item=>pinned.has(item.id))].map(item=>[item.id,item])).values()];
}
