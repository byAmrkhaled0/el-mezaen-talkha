$ErrorActionPreference='Stop'
$target=Join-Path (Get-Location).Path 'functions\src\index.js'
if(!(Test-Path -LiteralPath $target)){throw 'Run from the el-mezaen folder containing functions/src/index.js.'}
$text=[IO.File]::ReadAllText($target)
$changes=@(
 @('const aiAgentKey = defineSecret("AI_AGENT_API_KEY");',"// Bind the existing Secret Manager name only to AI endpoints.`n// Avoid registering a global deploy-time parameter for unrelated partial deploys.`nconst aiAgentKey = () => process.env.AI_AGENT_API_KEY || `"`";"),
 @('const aiRuntimeSecrets = process.env.FUNCTIONS_EMULATOR === "true" ? [] : [aiAgentKey];','const aiRuntimeSecrets = process.env.FUNCTIONS_EMULATOR === "true" ? [] : ["AI_AGENT_API_KEY"];'),
 @('apiKey: () => aiAgentKey.value()','apiKey: aiAgentKey'),
 @('key:()=>aiAgentKey.value()','key:aiAgentKey')
)
if($text.Contains('const aiAgentKey = () => process.env.AI_AGENT_API_KEY || "";') -and !$text.Contains('aiAgentKey.value()') -and $text.Contains('[] : ["AI_AGENT_API_KEY"];')){Write-Output 'PASS: AI deployment fix already applied; no changes.';exit 0}
foreach($change in $changes){if([regex]::Matches($text,[regex]::Escape($change[0])).Count -ne 1){throw 'Source differs from the verified release. No file changed.'}}
foreach($change in $changes){$text=$text.Replace($change[0],$change[1])}
[IO.File]::WriteAllText($target,$text,[Text.UTF8Encoding]::new($false))
Write-Output 'PASS: AI Secret Manager binding retained for AI endpoints; unrelated deployments no longer declare a global AI secret parameter. No cloud changes.'
