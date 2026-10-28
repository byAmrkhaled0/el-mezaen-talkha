param([ValidateSet('Backend','Seed','Web','Verify')][string]$Mode='Verify')
$ErrorActionPreference='Stop'
$reviewRoot=$PSScriptRoot
Set-Location -LiteralPath $reviewRoot
$reviewNode='D:\ELMEZAEN-QA\input\runtime\node\node.exe'
if(!(Test-Path -LiteralPath $reviewNode)){$reviewNode=(Get-Command node.exe -ErrorAction Stop).Source}
$reviewVersion=& $reviewNode --version
if($reviewVersion -notmatch '^v22\.') {throw 'Node.js 22 is required for this local review.'}
$reviewCli='D:\ELMEZAEN-QA\input\runtime\firebase\lib\bin\firebase.js'
if(!(Test-Path -LiteralPath $reviewCli)){$reviewFirebase=(Get-Command firebase.cmd -ErrorAction Stop).Source;$reviewCli=Join-Path (Split-Path -Parent $reviewFirebase) 'node_modules/firebase-tools/lib/bin/firebase.js'}
if(!(Test-Path -LiteralPath $reviewCli)){throw 'Firebase CLI was not found. Install it before starting the local backend.'}
$reviewProfile=Join-Path $reviewRoot 'qa/local-review-profile'
New-Item -ItemType Directory -Path $reviewProfile -Force | Out-Null
$env:APPDATA=$reviewProfile;$env:XDG_CONFIG_HOME=$reviewProfile;$env:CLOUDSDK_CONFIG=$reviewProfile
$env:GCE_METADATA_HOST='127.0.0.1:9';$env:GCE_METADATA_IP='127.0.0.1'
foreach($reviewKey in @('GOOGLE_APPLICATION_CREDENTIALS','google_application_credentials','FIREBASE_TOKEN','NODE_OPTIONS')){[Environment]::SetEnvironmentVariable($reviewKey,$null,'Process')}
$env:GCLOUD_PROJECT='demo-el-mezaen-local';$env:GOOGLE_CLOUD_PROJECT=$env:GCLOUD_PROJECT
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';$env:FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9199'
$env:CI='true';$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK='true';$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'
$reviewJava='D:\ELMEZAEN-QA\input\runtime\java'
if(Test-Path -LiteralPath (Join-Path $reviewJava 'bin/java.exe')){$env:JAVA_HOME=$reviewJava;$env:PATH=(Join-Path $reviewJava 'bin')+';'+$env:PATH}
$env:PATH=(Split-Path -Parent $reviewNode)+';'+$env:PATH
$env:MEZAEN_REVIEW_FIREBASE_CLI=$reviewCli
& $reviewNode scripts/local-review/credential-preflight.cjs
if($LASTEXITCODE -ne 0){throw 'Credential isolation check failed; nothing started.'}
switch($Mode){
 'Backend' { $reviewState=Join-Path $reviewRoot 'qa/local-review-state'; $reviewArgs=@($reviewCli,'emulators:start','--config','firebase.local-review.json','--project','demo-el-mezaen-local','--only','auth,firestore,storage,functions','--export-on-exit',$reviewState); if(Test-Path -LiteralPath (Join-Path $reviewState 'firebase-export-metadata.json')){$reviewArgs+=@('--import',$reviewState)}; & $reviewNode @reviewArgs }
 'Seed' {& $reviewNode scripts/local-review/seed.mjs; if($LASTEXITCODE -ne 0){throw 'Local seed failed'}; & $reviewNode scripts/local-review/seed-operations.mjs}
 'Web' {& $reviewNode node_modules/vite/bin/vite.js --config vite.local.config.mjs --configLoader runner --host 127.0.0.1 --port 4203 --strictPort}
 'Verify' {& $reviewNode scripts/local-review/check-http.mjs}
}
if($LASTEXITCODE -ne 0){throw ('Local review command failed: '+$LASTEXITCODE)}
