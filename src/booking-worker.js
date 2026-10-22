// Public capability projection only. Date/leave/schedule eligibility stays server-authoritative.
import {availableAtBranch} from './branch-availability.js';
export function bookingWorkerCandidates(catalog,branchId,items=[]){
 if(!branchId)return [];
 const serviceIds=[...new Set(items.flatMap(item=>item.kind==='service'?[item.id]:[...(item.includedServiceIds||[]),...(item.choiceGroups||[]).flatMap(group=>{const option=group.options?.find(option=>option.id===item.choices?.[group.id]);return option?.serviceId?[option.serviceId]:[];})]))];
 return (catalog.staff||[]).filter(worker=>worker.active!==false&&worker.available!==false&&worker.catalogVisible!==false&&worker.published!==false&&availableAtBranch(worker,branchId)&&(!Array.isArray(worker.serviceIds)||!worker.serviceIds.length||serviceIds.every(id=>worker.serviceIds.includes(id))));
}
