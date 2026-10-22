param([ValidateSet('Check','Backend','Web')][string]$Mode='Web',[ValidateRange(1024,65535)][int]$Port=4187)
$ErrorActionPreference='Stop'
$ownerPolishMode=$Mode
if($ownerPolishMode -eq 'Backend'){
 & "$PSScriptRoot\run-target-lock.ps1" -Mode Backend
 return
}
. "$PSScriptRoot\run-localhost.ps1" -Mode Check
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9098'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8088'
$env:FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9198'
if($ownerPolishMode -eq 'Web'){
 Invoke-Checked $node @('node_modules/vite/bin/vite.js','--config','qa-only/vite.target-lock.config.mjs','--host','127.0.0.1','--port',[string]$Port,'--strictPort')
}
