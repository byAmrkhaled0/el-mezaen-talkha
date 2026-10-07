import { readFile, writeFile } from 'node:fs/promises';
const [source, destination = 'PHASE11_DATA_AUDIT.json'] = process.argv.slice(2);
if (!source) throw new Error('Provide a read-only JSON export approved by the owner; this script never connects to Firebase.');
const data = JSON.parse(await readFile(source, 'utf8'));
const branches = new Set((data.branches || []).map(b => b.id));
const unresolved = [];
for (const collection of ['staff','services','packages','offers','reviews','content']) {
 for (const row of data[collection] || []) {
  const scope = row.branchIds || (row.branchId ? [row.branchId] : []);
  if (!scope.length || scope.some(id => !branches.has(id))) unresolved.push({ collection, id:row.id, name:row.nameAr || row.name || '', reason:'Missing or unknown branch scope', ownerApprovalRequired:true });
 }
}
await writeFile(destination, JSON.stringify({source,productionVerified:false,mutations:0,branchCount:branches.size,unresolved},null,2)+'\n');
console.log(`${unresolved.length} unresolved records; no production writes`);
