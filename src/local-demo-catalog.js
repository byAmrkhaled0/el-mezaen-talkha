// Dedicated local preview fixture. Never exported to Firebase or migrations.
import {seedCatalog} from './seed-data.js';
const legacyTalkhaServices = new Set(["hair-001", "hair-002", "hair-003", "hair-004", "hair-005", "hair-006", "hair-007", "hair-008", "hair-009", "hair-010", "hair-011", "hair-012", "hair-013", "hair-014", "hair-015", "hair-016", "hair-017", "hair-018", "hair-019", "hair-020", "hair-021", "hair-022", "hair-023", "hair-024", "hair-025", "hair-026", "hair-027", "hair-028", "hair-029", "hair-030", "hair-031", "hair-032", "beard-001", "beard-002", "beard-003", "beard-004", "beard-005", "beard-006", "skin-001", "skin-002", "skin-003", "skin-004", "extras-001", "wax-001", "wax-002", "wax-003", "wax-004", "beard-care-001", "beard-care-002", "beard-care-003", "beard-care-004", "beard-care-005", "hair-care-001", "service-001", "service-002", "service-003", "service-004", "service-005", "service-006", "service-007", "service-008", "service-009", "service-010", "service-011", "service-012", "service-013", "service-014", "service-015", "service-016", "service-017", "service-018", "service-019", "installation-001", "installation-002", "product-001", "product-002", "product-003", "product-004", "product-005", "facial-cleaning-001", "facial-cleaning-002", "facial-cleaning-003"]);
const legacyTalkhaPackages = new Set(Array.from({length:6},(_,i)=>`package-${String(i+1).padStart(3,'0')}`));
const legacyTalkhaStaff = new Set(Array.from({length:21},(_,i)=>`staff-${String(i+1).padStart(3,'0')}`));
export function createLocalDemoCatalog(source=seedCatalog){
 const catalog=structuredClone(source);
 for(const key of ['services','packages','staff','offers','drinks','content','results','hairVideos']){
  for(const row of catalog[key]||[]){
   const scope=Array.isArray(row.branchIds)?row.branchIds.filter(id=>['talkha','mashaya'].includes(id)):[];
   const legacy=key==='services'?legacyTalkhaServices:key==='packages'?legacyTalkhaPackages:key==='staff'?legacyTalkhaStaff:null;
   // Explicit single-branch records win. Only audited legacy records are narrowed.
   row.branchIds=scope.length===1?scope:scope.length===2&&legacy?.has(row.id)?['talkha']:[];
  }
 }
 for(const row of catalog.packages||[]){
  const branch=row.branchIds?.[0];
  const eligible=id=>(catalog.services||[]).some(service=>service.id===id&&service.active!==false&&service.catalogVisible!==false&&service.branchIds?.includes(branch));
  row.demoBookable=Boolean(branch)&&(row.includedServiceIds||[]).every(eligible)&&(row.choiceGroups||[]).every(group=>(group.options||[]).some(option=>eligible(option.serviceId)));
 }
 for (const [index, row] of (catalog.staff || []).entries()) { row.nameAr=`متخصص تجريبي ${index+1}`; row.nameEn=`Demo specialist ${index+1}`; row.phone=''; row.email=''; row.imageUrl=''; row.bioAr='بيانات تجريبية'; row.bioEn='Synthetic fixture'; }
 for (const row of catalog.branches || []) { row.phone=''; row.whatsapp=''; row.mapsUrl=''; row.social={}; row.addressAr='عنوان تجريبي'; row.addressEn='Demo address'; }
 catalog.reviews=[];
 const stripRemote=value=>{ if (!value || typeof value!=='object') return; for(const [key,child] of Object.entries(value)) { if(typeof child==='string' && /^(https?:|tel:|mailto:)/i.test(child)) value[key]=''; else stripRemote(child); } }; stripRemote(catalog);
 catalog.preview=true; return catalog;
}
export function assertDemoWorkerScope(catalog,payload){
 if((payload.items||[]).some(line=>(catalog.packages||[]).some(row=>row.id===line.id&&row.demoBookable===false)))throw new Error('مكونات هذه الباقة غير متاحة لهذا الفرع في العرض التجريبي');
 const appointment=(payload.items||[]).some(line=>{
  const row=[...(catalog.services||[]),...(catalog.packages||[]),...(catalog.offers||[])].find(x=>x.id===line.id);
  return row && row.type!=='product' && Number(row.duration)>0;
 });
 if(!appointment)return;
 if(!(catalog.staff||[]).some(row=>row.active!==false&&row.available!==false&&row.branchIds?.includes(payload.branchId)&&(!payload.staffId||payload.staffId==='any'||row.id===payload.staffId)))throw new Error('لا يوجد موظف متاح في الفرع المختار');
}
