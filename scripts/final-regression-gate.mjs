// Suites use separate emulator lifetimes: shared financial fixtures invalidate
// empty-branch assertions even when each handler correctly scopes its query.
import {spawnSync} from 'node:child_process';
const executable=process.env.FIREBASE_CLI || 'firebase';
const suites=['tests/v6-1-production-gate.emulator.mjs','tests/phase11.emulator.mjs','tests/phase11-1.emulator.mjs','tests/final-closure.emulator.mjs','tests/production-security.emulator.mjs'];
for(const suite of suites){
  const result=spawnSync(executable,['emulators:exec','--project','demo-el-mezaen-gate','--only','auth,firestore',`node --test ${suite}`],{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
const result=spawnSync(executable,['emulators:exec','--project','demo-el-mezaen-rules','--only','firestore,storage','node --test tests/firebase-rules.emulator.mjs'],{stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status||0);
