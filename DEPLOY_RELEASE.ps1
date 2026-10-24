param([ValidateSet('Build','Backend','Verify')][string]$Mode='Build')
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
function Check-Exit([string]$Step){if($LASTEXITCODE -ne 0){throw "$Step failed (exit $LASTEXITCODE). Stop and inspect the error above."}}
$project='el-mezaen-talkha'
$deferred=@('customerAiAgent','adminBusinessAssistant')
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'functions/src/index.js'))
$expected=@([regex]::Matches($source,'(?m)^export const (\w+)\s*=') | ForEach-Object {$_.Groups[1].Value} | Where-Object {$_ -notin $deferred} | Sort-Object -Unique)
if($expected.Count -ne 125){throw 'Unexpected function inventory. Review this release before deployment.'}
function Get-Inventory {
  $raw=(& firebase functions:list --project $project --json | Out-String)
  Check-Exit 'Read cloud function inventory'
  $inventory=$raw|ConvertFrom-Json
  if($inventory.status -ne 'success'){throw 'Cloud inventory was not successful.'}
  return @($inventory.result)
}
if($Mode -eq 'Build'){
  & npm ci --include=dev; Check-Exit 'Install frontend dependencies'
  & npm --prefix functions ci; Check-Exit 'Install backend dependencies'
  & npm run build; Check-Exit 'Build'
  & npm run verify:build; Check-Exit 'Verify built assets'
  & npm run audit:links; Check-Exit 'Audit local links'
  Write-Output 'PASS: frontend build ready in dist. No cloud changes.'
  exit 0
}
$remote=@(Get-Inventory)
if($Mode -eq 'Verify'){
  $missing=@($expected|Where-Object {$_ -notin $remote.id})
  $inactive=@($remote|Where-Object {$_.id -in $expected -and $_.state -ne 'ACTIVE'})
  if($missing.Count){throw ('Missing functions: '+($missing -join ', '))}
  if($inactive.Count){throw ('Inactive functions: '+($inactive.id -join ', '))}
  Write-Output 'PASS: all 125 non-model functions are deployed and ACTIVE. This checks deployment state, not live business transactions.'
  Write-Output 'Deferred model endpoints: customerAiAgent, adminBusinessAssistant.'
  exit 0
}
# Update changed handlers plus any other missing non-model functions. No deletion,
# force flag, production data import, or global AI secret parameter is used.
$changed=@('createPosOrder','syncOfflinePosOrder','getAttendanceMonth','getAttendancePolicies','setAttendancePolicy','finishAttendanceShifts','getOwnStaffAttendance','recordOwnStaffAttendance','recordWorkerAttendance','getAttendanceDashboard','checkWorkerTargetsOnAssignment','checkWorkerTargetsOnRevenue','notifyWorkersOnTaskUpdate','syncWorkerBookingNotifications','getWorkerWorkspace','getMonthlyTargetProgress','getWorkerLeaderboard','getAdminBusinessInsights','confirmAiAction','prepareAdminTargetAction','confirmAdminTargetAction')
$names=@(@($changed)+@($expected|Where-Object {$_ -notin $remote.id}) | Sort-Object -Unique)
if(@($names|Where-Object {$_ -notin $expected}).Count){throw 'Deployment selection contains an unexpected function.'}
$selector=($names|ForEach-Object {'functions:'+$_}) -join ','
Write-Output ('Deploying '+$names.Count+' new or changed functions: '+($names -join ', '))
Write-Output 'For the four background retry handlers, Firebase may ask to enable retries. This release includes bounded failure handling and tested durable notification deduplication.'
& firebase deploy --project $project --only $selector
Check-Exit 'Backend deployment'
Write-Output 'Backend deploy finished. Run this script again with -Mode Verify.'
