param([ValidateSet('Check','Backend','Seed','Web','Gates','Rules')][string]$Mode='Check')
$ErrorActionPreference='Stop'
# Run only in the prepared Windows Sandbox, never against host/production.
if($env:USERNAME -ine 'WDAGUtilityAccount'){throw 'Run inside the verified network-disabled Windows Sandbox. Host execution is blocked.'}
$routes=@(Get-NetRoute -ErrorAction Stop | Where-Object {$_.DestinationPrefix -in @('0.0.0.0/0','::/0')})
$adapters=@(Get-NetAdapter -ErrorAction Stop | Where-Object {$_.Status -eq 'Up' -and $_.InterfaceDescription -notmatch 'Loopback'})
if($routes.Count -or $adapters.Count){throw 'External guest network isolation is not proven: active adapter/default route found.'}
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$node='C:\QAInput\runtime\node\node.exe'
$npm='C:\QAInput\runtime\node\npm.cmd'
$javaHome='C:\QAInput\runtime\java'
$qaPython='C:\QAInput\runtime\python\python.exe'
if(Test-Path -LiteralPath $qaPython){$env:PYTHON=$qaPython;$env:QA_PYTHON=$qaPython}
$cli='C:\QAInput\runtime\firebase\lib\bin\firebase.js'
foreach($required in @($node,$npm,(Join-Path $javaHome 'bin\java.exe'),$cli,'C:\QAInput\emulator-cache',(Join-Path $projectRoot 'node_modules'),(Join-Path $projectRoot 'functions\node_modules'))){if(!(Test-Path -LiteralPath $required)){throw "Offline dependency missing: $required"}}
if(Test-Path -LiteralPath (Join-Path $projectRoot '.local')){throw 'Remove credentials/local production overrides from the sanitized guest INPUT before copying; do not run this copy.'}
$env:PATH='C:\QAInput\runtime\node;'+(Join-Path $javaHome 'bin')+';'+$env:PATH
$env:JAVA_HOME=$javaHome
$env:FIREBASE_EMULATORS_PATH='C:\QAInput\emulator-cache'
$env:GCLOUD_PROJECT='demo-el-mezaen-qa'
$env:GOOGLE_CLOUD_PROJECT='demo-el-mezaen-qa'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9199'
$env:FIREBASE_CONFIG='{"projectId":"demo-el-mezaen-qa","storageBucket":"demo-el-mezaen-qa.appspot.com"}'
$env:CI='true'
$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK='true'
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
Remove-Item Env:ENFORCE_APP_CHECK -ErrorAction SilentlyContinue
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
$version=& $node --version
if($version -notmatch '^v22\.' -or [Version]$version.TrimStart('v') -lt [Version]'22.15.0'){throw "Node22 required; found $version"}
function Invoke-Checked([string]$Program,[string[]]$CommandArgs){& $Program @CommandArgs;if($LASTEXITCODE -ne 0){throw "Command failed with exit $LASTEXITCODE"}}
function Assert-BackendReady(){foreach($port in @(9099,8080,5001,9199)){$client=[Net.Sockets.TcpClient]::new();try{$task=$client.ConnectAsync('127.0.0.1',$port);if(!$task.Wait(1500) -or !$client.Connected){throw "Emulator not ready at loopback:$port"}}finally{$client.Dispose()}}}
if(!(Test-Path -LiteralPath 'C:\QAOutput')){throw 'Mapped QAOutput is missing; prepare WSB mappings first.'}
$log=Join-Path 'C:\QAOutput' ('run-'+$Mode+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.log')
Start-Transcript -LiteralPath $log | Out-Null
try{
 switch($Mode){
  'Check' {Write-Output "Guest network preflight passed; Node $version. Verify Networking Disable in the WSB used to start this guest.";Invoke-Checked (Join-Path $javaHome 'bin\java.exe') @('-version')}
  'Backend' {$hook=([Uri](Join-Path $PSScriptRoot 'media-loader.mjs')).AbsoluteUri;$env:NODE_OPTIONS='--import='+$hook;Invoke-Checked $node @($cli,'emulators:start','--project','demo-el-mezaen-qa','--config','firebase.qa.json','--only','auth,firestore,functions,storage')}
  'Seed' {Assert-BackendReady;$env:QA_ISOLATION_VERIFIED='windows-sandbox-network-disabled';Invoke-Checked $node @('qa-only/seed.mjs')}
  'Web' {Assert-BackendReady;Invoke-Checked $node @('node_modules/vite/bin/vite.js','--config','qa-only/vite.config.mjs','--host','127.0.0.1','--port','4173','--strictPort')}
  'Gates' {if(!(Test-Path -LiteralPath $qaPython)){throw 'Offline Python with PIL and lxml is required for the complete Gates mode.'};Invoke-Checked $qaPython @('-c','import PIL,lxml;print("Offline Python dependencies ready")');Invoke-Checked $npm @('test');Invoke-Checked $npm @('run','test:functions');Invoke-Checked $npm @('run','build');Invoke-Checked $npm @('run','verify:build');Invoke-Checked $npm @('run','audit:links')}
  'Rules' {
    $busy=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -in @(9099,8080,5001,9199,4173)})
    if($busy.Count){throw 'Stop the app Web and Backend before running the separate Rules demo project.'}
    $env:GCLOUD_PROJECT='demo-el-mezaen-rules';$env:GOOGLE_CLOUD_PROJECT=$env:GCLOUD_PROJECT;$env:FIREBASE_CONFIG='{"projectId":"demo-el-mezaen-rules","storageBucket":"demo-el-mezaen-rules.appspot.com"}'
    Invoke-Checked $node @($cli,'emulators:exec','--project','demo-el-mezaen-rules','--config','firebase.qa.json','--only','firestore,storage','node --test tests/firebase-rules.emulator.mjs')
  }
 }
}finally{Stop-Transcript | Out-Null}
