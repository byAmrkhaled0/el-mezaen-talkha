param()
$ErrorActionPreference='Stop'
# Local-only check. Never clears flags or reads secret values into output.
$forbidden=@('FUNCTIONS_EMULATOR','FIREBASE_EMULATOR_HUB','FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','STORAGE_EMULATOR_HOST','FIREBASE_CONFIG','NODE_OPTIONS')
$present=@($forbidden|Where-Object {[Environment]::GetEnvironmentVariable($_,'Process')})
foreach($name in @('GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT')){if([Environment]::GetEnvironmentVariable($name,'Process') -like 'demo-*'){$present+=$name}}
if($present.Count){throw ('Open a NEW VS Code terminal without the QA runner. QA/discovery flags found: '+($present -join ', '))}
$releaseRoot=Split-Path -Parent $PSScriptRoot
foreach($file in @('firebase.json','functions/package.json','functions/src/index.js','firestore.indexes.json','vercel.json')){if(!(Test-Path -LiteralPath (Join-Path $releaseRoot $file))){throw ('Missing release file: '+$file)}}
$releaseVersion=& node --version
if($LASTEXITCODE -ne 0 -or $releaseVersion -notmatch '^v22\.'){throw 'Use Node.js 22 before deploying this Functions source.'}
Write-Output 'PASS: clean production-discovery environment; local files present; Node 22. No cloud access or deployment performed.'
Write-Output 'Deployment commands must explicitly select --project el-mezaen-talkha and exact Function names.'
