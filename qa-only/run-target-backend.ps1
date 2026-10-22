$ErrorActionPreference='Stop'
# Only the new workspace Functions instance; existing owner Auth/Firestore/Storage stay running.
. "$PSScriptRoot\run-localhost.ps1" -Mode Check
$env:NODE_OPTIONS='--import='+([Uri](Join-Path $PSScriptRoot 'media-loader.mjs')).AbsoluteUri
Invoke-Checked $node @($cli,'emulators:start','--project','demo-el-mezaen-qa','--config','firebase.targets.qa.json','--only','functions')
