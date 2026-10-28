// Report-only projections. Never post money or infer an unrecorded worker allocation.
const number=v=>Number.isFinite(Number(v))?Number(v):0;
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
const add=(map,id,seed)=>{if(!map.has(id))map.set(id,{id,...seed});return map.get(id);};
export function detailedDaily({ledger,expenses,bookings,staff,branchId}){
 const workers=new Map(),methods=new Map(),categories=new Map(),items=new Map();
 const people=new Map(staff.map(row=>[row.id,row]));const orders=new Map(bookings.filter(row=>row.branchId===branchId).map(row=>[row.id,row]));
 let discounts=0,walletRedemptions=0,missingOrders=0,missingLineOrders=0,legacyDiscountOrders=0,legacyWalletOrders=0,ledgerNet=0;
 const counted=new Set();
 for(const row of ledger){
  if(row.branchId!==branchId)continue;
  const amount=number(row.amount);ledgerNet+=amount;
  const method=add(methods,row.paymentMethod||'unknown',{payments:0,refunds:0,net:0,paymentCount:0,refundCount:0});method.net+=amount;
  if(row.type==='payment'){method.payments+=amount;method.paymentCount++;}else if(row.type==='refund'){method.refunds+=Math.abs(amount);method.refundCount++;}
  const allocation=row.workerBreakdown&&typeof row.workerBreakdown==='object'?row.workerBreakdown:{};
  const workerIds=new Set(Object.keys(allocation));if(row.staffId&&row.staffId!=='none')workerIds.add(row.staffId);
  for(const id of workerIds){const allocated=allocation[id]??(row.staffId===id?row.revenueBreakdown?.services??row.amount:0);if(!Number.isFinite(Number(allocated)))continue;
   const worker=add(workers,id,{nameAr:people.get(id)?.nameAr||id,payments:0,refunds:0,net:0,paymentCount:0,refundCount:0});worker.net+=number(allocated);
   if(row.type==='payment'){worker.payments+=number(allocated);worker.paymentCount++;}else if(row.type==='refund'){worker.refunds+=Math.abs(number(allocated));worker.refundCount++;}
  }
  if(row.type!=='payment')continue;
  const orderId=row.bookingId||row.bookingCode;if(!orderId||counted.has(orderId)){if(!orderId)missingOrders++;continue;}counted.add(orderId);
  const order=orders.get(orderId);if(!order){missingOrders++;continue;}
  if(order.discountAmount==null)legacyDiscountOrders++;else discounts+=number(order.discountAmount);
  if(order.walletRedemptionAmount==null)legacyWalletOrders++;else walletRedemptions+=number(order.walletRedemptionAmount);
  if(!Array.isArray(order.items)||!order.items.length){missingLineOrders++;continue;}
  for(const line of order.items){const kind=String(line.kind||'service'),id=String(line.id||line.nameAr||'unknown'),key=JSON.stringify([kind,id]);const item=add(items,key,{itemId:id,kind,nameAr:String(line.nameAr||id).slice(0,120),qty:0,beforeDiscount:0});item.qty+=number(line.qty??1);item.beforeDiscount+=number(line.lineTotal??number(line.price??line.unitPrice)*number(line.qty??1));}
 }
 for(const row of expenses){if(row.branchId!==branchId)continue;const category=add(categories,String(row.category||'uncategorized'),{amount:0,count:0});category.amount+=number(row.amount);category.count++;}
 const rounded=rows=>rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='number'?round(value):value])));
 return {available:true,version:1,ledgerNet:round(ledgerNet),discounts:round(discounts),walletRedemptions:round(walletRedemptions),coverage:{missingOrders,missingLineOrders,legacyDiscountOrders,legacyWalletOrders},methods:rounded([...methods.values()]),workers:[...workers.values()].sort((a,b)=>b.net-a.net),items:rounded([...items.values()]).sort((a,b)=>b.qty-a.qty),expenseCategories:rounded([...categories.values()]).sort((a,b)=>b.amount-a.amount)};
}
export async function readDetailedDay(db,branchId,dateKey){
 return db.runTransaction(async tx=>{
  const [ledgerRows,expenseRows]=await Promise.all(['revenueLedger','expenses'].map(collection=>tx.get(db.collection(collection).where('branchId','==',branchId).where('dateKey','==',dateKey).limit(1001))));
  if(ledgerRows.size>1000||expenseRows.size>1000)return {available:false,reason:'detail_limit'};
  const ledger=ledgerRows.docs.map(d=>({id:d.id,...d.data()})),expenses=expenseRows.docs.map(d=>d.data());
  const safeId=id=>typeof id==='string'&&id.length<=150&&!id.includes('/')&&id!=='.'&&id!=='..';
  const orderIds=[...new Set(ledger.filter(row=>row.type==='payment').map(row=>row.bookingId||row.bookingCode).filter(safeId))];
  const workerIds=[...new Set(ledger.flatMap(row=>[...Object.keys(row.workerBreakdown||{}),row.staffId]).filter(id=>safeId(id)&&id!=='none'))];
  if(workerIds.length>200)return {available:false,reason:'detail_limit'};
  const read=async(collection,ids)=>{const rows=[];for(let i=0;i<ids.length;i+=50){const docs=await tx.getAll(...ids.slice(i,i+50).map(id=>db.doc(collection+'/'+id)));rows.push(...docs.filter(d=>d.exists).map(d=>({id:d.id,...d.data()})));}return rows;};
  const bookings=await read('bookings',orderIds),staff=await read('staff',workerIds);
  const result=detailedDaily({ledger,expenses,bookings,staff,branchId});
  if(result.items.length>250)return {available:false,reason:'detail_limit'};
  return result;
 },{readOnly:true});
}
export function rollupDetails(daily){
 if(daily.some(row=>!row.details?.available))return {available:false,reason:'legacy_days'};
 const result={available:true,version:1,ledgerNet:0,discounts:0,walletRedemptions:0,coverage:{missingOrders:0,missingLineOrders:0,legacyDiscountOrders:0,legacyWalletOrders:0}};
 for(const key of ['ledgerNet','discounts','walletRedemptions'])result[key]=round(daily.reduce((sum,row)=>sum+number(row.details[key]),0));
 for(const key of Object.keys(result.coverage))result.coverage[key]=daily.reduce((sum,row)=>sum+number(row.details.coverage?.[key]),0);
 for(const [group,fields]of [['methods',['payments','refunds','net','paymentCount','refundCount']],['workers',['payments','refunds','net','paymentCount','refundCount']],['items',['qty','beforeDiscount']],['expenseCategories',['amount','count']]]){
  const map=new Map();for(const day of daily)for(const row of day.details[group]||[]){const target=add(map,row.id,{...row,...Object.fromEntries(fields.map(field=>[field,0]))});for(const field of fields)target[field]+=number(row[field]);}
  if(map.size>250)return {available:false,reason:'detail_limit'};
  result[group]=[...map.values()].map(row=>({...row,...Object.fromEntries(fields.map(field=>[field,group==='workers'?row[field]:round(row[field])]))}));
 }
 result.workers.sort((a,b)=>b.net-a.net);result.items.sort((a,b)=>b.qty-a.qty);result.expenseCategories.sort((a,b)=>b.amount-a.amount);
 return result;
}
