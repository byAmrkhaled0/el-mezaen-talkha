param([ValidateSet('Backend','Seed','Web')][string]$Mode='Backend')
$ErrorActionPreference='Stop'
$targetLockMode=$Mode
. "$PSScriptRoot\run-localhost.ps1" -Mode Check
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9098'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8088'
$env:FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9198'
switch($targetLockMode){
 'Backend' {$env:NODE_OPTIONS='--import='+([Uri](Join-Path $PSScriptRoot 'media-target-lock-loader.mjs')).AbsoluteUri;Invoke-Checked $node @($cli,'emulators:start','--project','demo-el-mezaen-qa','--config','firebase.target-lock.qa.json','--only','auth,firestore,functions,storage')}
 'Seed' {$env:QA_LOCALHOST_AUTHORIZED='demo-emulators-only';Invoke-Checked $node @('qa-only/seed-target-lock.mjs')}
 'Web' {Invoke-Checked $node @('node_modules/vite/bin/vite.js','--config','qa-only/vite.target-lock.config.mjs','--host','127.0.0.1','--port','4185','--strictPort')}
}
