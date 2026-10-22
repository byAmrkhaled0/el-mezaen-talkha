param([ValidateSet('Check','Backend','Seed','Web')][string]$Mode='Web',[ValidateRange(1024,65535)][int]$Port=4193)
$ErrorActionPreference='Stop'
$releaseCheckMode=$Mode
. "$PSScriptRoot\run-localhost.ps1" -Mode Check
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9094'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8084'
$env:FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9194'
switch($releaseCheckMode){
 'Backend' {$env:NODE_OPTIONS='--import='+([Uri](Join-Path $PSScriptRoot 'media-final-ai-loader.mjs')).AbsoluteUri;Invoke-Checked $node @($cli,'emulators:start','--project','demo-el-mezaen-qa','--config','firebase.final-ai.qa.json','--only','auth,firestore,functions,storage')}
 'Seed' {Invoke-Checked $node @('qa/final-ai-seed.mjs')}
 'Web' {Invoke-Checked $node @('node_modules/vite/bin/vite.js','--config','qa-only/vite.final-ai.config.mjs','--host','127.0.0.1','--port',[string]$Port,'--strictPort')}
}
