param([ValidateSet('Financial','Day')][string]$Mode='Day')
$ErrorActionPreference='Stop'
$operationsGateMode=$Mode
. "$PSScriptRoot\run-localhost.ps1" -Mode Check
$env:GCLOUD_PROJECT='demo-el-mezaen-gate'
$env:GOOGLE_CLOUD_PROJECT='demo-el-mezaen-gate'
$env:FIREBASE_CONFIG='{"projectId":"demo-el-mezaen-gate","storageBucket":"demo-el-mezaen-gate.appspot.com"}'
$env:FUNCTIONS_EMULATOR='true'
$env:FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9198'
$testFile=if($operationsGateMode -eq 'Financial'){'tests/v6-1-production-gate.emulator.mjs'}else{'tests/operations-business-day.emulator.mjs'}
Invoke-Checked $node @($cli,'emulators:exec','--config','firebase.operations-gate.qa.json','--project','demo-el-mezaen-gate','--only','auth,firestore',"node --test $testFile")
