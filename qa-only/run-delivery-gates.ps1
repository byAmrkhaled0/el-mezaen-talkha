param([ValidateSet('All','Financial','Day','Worker','Security','Closure','Requests','Scheduling','Advances','Payroll','DayClosing','Expenses','Pagination','Profiles','WorkerAccounts','Repair','Rules')][string]$Suite='All')
$ErrorActionPreference='Stop'
$deliverySuite=$Suite
. "$PSScriptRoot\run-localhost.ps1" -Mode Check
$cases=@(
 @('Financial','demo-el-mezaen-gate','v6-1-production-gate'),
 @('Day','demo-el-mezaen-gate','operations-business-day'),
 @('Worker','demo-el-mezaen-gate','phase11'),
 @('Security','demo-el-mezaen-gate','production-security'),
 @('Closure','demo-el-mezaen-gate','final-closure'),
 @('Requests','demo-el-mezaen-verify','phase12-3c-verification'),
 @('Scheduling','demo-el-mezaen-verify','phase12-3d-scheduling'),
 @('Advances','demo-el-mezaen-verify','phase12-3e2-advances'),
 @('Payroll','demo-el-mezaen-verify','phase12-3e1-payroll'),
 @('DayClosing','demo-el-mezaen-verify','phase12-3f1-closing'),
 @('Expenses','demo-el-mezaen-verify','phase12-3f2-expense-closing'),
 @('Pagination','demo-el-mezaen-gate','phase11-1'),
 @('Profiles','demo-el-mezaen-gate','customer-profile'),
 @('WorkerAccounts','demo-el-mezaen-gate','branch-worker-accounts'),
 @('Repair','demo-el-mezaen-gate','production-repair'),
 @('Rules','demo-el-mezaen-rules','firebase-rules')
)
$results=New-Object 'System.Collections.Generic.List[object]'
if(Test-Path qa/delivery-gates-results.json){
 foreach($record in (Get-Content qa/delivery-gates-results.json -Raw|ConvertFrom-Json)){
  if($record.suite){$results.Add($record)}
 }
}
foreach($case in $cases){
 if($deliverySuite -ne 'All' -and $deliverySuite -ne $case[0]){continue}
 $env:GCLOUD_PROJECT=$case[1];$env:GOOGLE_CLOUD_PROJECT=$case[1]
 $env:FIREBASE_CONFIG=(@{projectId=$case[1];storageBucket=($case[1]+'.appspot.com')}|ConvertTo-Json -Compress)
 $env:FUNCTIONS_EMULATOR='true'
 $env:FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9197'
 $only=if($case[0] -eq 'Rules'){'firestore,storage'}else{'auth,firestore'}
 $testFile='tests/'+$case[2]+'.emulator.mjs'
 $logFile='qa/delivery-'+$case[0].ToLower()+'.log'
 Write-Output ('START '+$case[0])
 & $node $cli emulators:exec --config firebase.delivery-gates.qa.json --project $case[1] --only $only "node --test $testFile" *> $logFile
 $code=$LASTEXITCODE
 $lines=Get-Content -LiteralPath $logFile
 $counts=@($lines|Where-Object {$_ -match '^# (tests|pass|fail|skipped) '}|ForEach-Object {[string]$_})
 for($i=$results.Count-1;$i -ge 0;$i--){if($results[$i].suite -eq $case[0]){$results.RemoveAt($i)}}
 $results.Add(@{suite=$case[0];exitCode=$code;counts=$counts;log=$logFile;finished=(Get-Date).ToString('o')})
 ConvertTo-Json -InputObject ($results.ToArray()) -Depth 5|Set-Content -Encoding UTF8 qa/delivery-gates-results.json
 Write-Output ($case[0]+' exit='+$code+' '+($counts -join '; '))
 if($code -ne 0){Get-Content -LiteralPath $logFile -Tail 80;throw ('Delivery suite failed: '+$case[0])}
}
