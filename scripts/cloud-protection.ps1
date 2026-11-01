param(
 [ValidateSet('Plan','Protect','Backup')][string]$Mode='Plan',
 [switch]$ApproveBackupCosts
)
$ErrorActionPreference='Stop'
$projectId='el-mezaen-talkha'
if($Mode -eq 'Plan'){
 [pscustomobject]@{Project=$projectId;Database='(default)';DeletionProtection='Enable';Backup='Daily';Retention='7 days';BackupCostsApproved=[bool]$ApproveBackupCosts;CloudChangesMade=$false}|Format-List
 return
}
if($Mode -eq 'Backup' -and !$ApproveBackupCosts){throw 'Backup has storage charges. Review the 7-day policy and approve costs before applying.'}
$gcloud=(Get-Command gcloud -ErrorAction Stop).Source
$accessToken=(& $gcloud auth print-access-token --quiet)
if($LASTEXITCODE -ne 0){throw 'Google Cloud login failed'}
$headers=@{Authorization="Bearer $accessToken"}
$databaseUri="https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)"
try{
 $database=Invoke-RestMethod -Uri $databaseUri -Headers $headers
 if($database.name -cne "projects/$projectId/databases/(default)"){throw 'Unexpected database identity'}
 if($Mode -eq 'Protect'){
  if($database.deleteProtectionState -ne 'DELETE_PROTECTION_ENABLED'){
   $body=@{deleteProtectionState='DELETE_PROTECTION_ENABLED'}|ConvertTo-Json -Compress
   $null=Invoke-RestMethod -Method Patch -Uri ($databaseUri+'?updateMask=deleteProtectionState') -Headers $headers -ContentType 'application/json' -Body $body
  }
  $check=Invoke-RestMethod -Uri $databaseUri -Headers $headers
  if($check.deleteProtectionState -ne 'DELETE_PROTECTION_ENABLED'){throw 'Deletion protection was not confirmed'}
  Write-Output 'CONFIRMED: database deletion protection enabled. No documents or prices changed.'
 }else{
  $uri=$databaseUri+'/backupSchedules'
  $existing=Invoke-RestMethod -Uri $uri -Headers $headers
  $daily=@($existing.backupSchedules|Where-Object {$null -ne $_ -and $null -ne $_.dailyRecurrence})
  if($daily.Count -gt 1){throw 'Unexpected duplicate daily schedules; review manually'}
  if($daily.Count -eq 1 -and $daily[0].retention -ne '604800s'){throw 'An existing daily schedule has different retention. It was not changed.'}
  if($daily.Count -eq 0){
   $body=@{dailyRecurrence=@{};retention='604800s'}|ConvertTo-Json -Depth 4 -Compress
   $null=Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body $body
  }
  $check=Invoke-RestMethod -Uri $uri -Headers $headers
  $confirmed=@($check.backupSchedules|Where-Object {$null -ne $_ -and $null -ne $_.dailyRecurrence -and $_.retention -eq '604800s'})
  if($confirmed.Count -ne 1){throw 'The daily backup schedule was not confirmed. Inspect before retrying.'}
  Write-Output 'CONFIRMED: daily backup schedule retains each backup for 7 days. First successful backup is not yet confirmed.'
 }
}finally{$accessToken=$null;$headers=$null}
