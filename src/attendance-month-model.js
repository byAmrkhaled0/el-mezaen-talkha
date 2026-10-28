export function monthReportRow(employee,result,branchId='all'){
 const rows=(result.rows||[]).filter(row=>branchId==='all'||row.branchId===branchId);
 return {uid:employee.uid,name:employee.name,days:new Set(rows.filter(row=>!row.carryOver).map(row=>row.dateKey)).size,seconds:rows.reduce((total,row)=>total+Math.max(0,Number(row.monthSeconds)||0),0),open:rows.filter(row=>row.status==='PRESENT').length,unknown:rows.filter(row=>row.monthSeconds==null).length};
}
export function reportCsv(rows){const quote=value=>'"'+String(value??'').replace(/^\s*[=+@-]/,"'$&").replaceAll('"','""')+'"';return '\uFEFF'+[['الموظف','أيام الحضور','ساعات محتسبة','ورديات مفتوحة','سجلات غير مكتملة'],...rows.map(row=>[row.name,row.days,(row.seconds/3600).toFixed(2),row.open,row.unknown])].map(row=>row.map(quote).join(',')).join('\r\n');}
