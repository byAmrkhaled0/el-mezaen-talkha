export function readPosCustomerIntake(root=document){
 const fields={acquisitionSource:'posAcquisitionSource',birthDate:'posBirthDate',notes:'posCustomerNotes'};
 return Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,root.querySelector('#'+id)?.value.trim()||'']).filter(([,value])=>value));
}
export function clearPosCustomerIntake(root=document){for(const id of ['posAcquisitionSource','posGender','posBirthDate','posCustomerNotes']){const field=root.querySelector('#'+id);if(field)field.value='';}const count=root.querySelector('#posCustomerNotesCount');if(count)count.textContent='0/200';}
