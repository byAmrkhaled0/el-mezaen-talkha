# EL MEZAEN — local defect closure source

This is the complete updated source derived from EL_MEZAEN_FINAL_MOBILE_SOURCE.zip (SHA256 0da1501d32a3e62225341cdd90b35f2176c69583c82a47e3c995fec530521351). It is a local owner-review candidate, NOT production-ready.

Applied: explicit public staff projection and private cache retirement; Admin branch content query; scoped in-flight request dedup after synthetic reproduction; partial media upload retry retention. Financial logic/tests, authorization rules, Firestore/Storage Rules/indexes, production config and booking availability engine are preserved.

Node22 + locked dependencies required for standard build/Functions tests. This archive intentionally excludes node_modules, secrets, host caches and dist. QA-only setup is in qa-only/RUN_PLAN_AR.md. Do not launch Admin or emulators until network-disabled OS guest isolation is verified. Do not deploy qa-only adapters. No AppCheck tokens/providers are fabricated.

Self-contained privacy/query/cache/wiring/dedup/retry regression tests (no sibling workspace or Firebase SDK required):
node --test tests/rel01-public-staff.test.mjs tests/final-defect-regression.test.mjs tests/qa-adapters.test.mjs tests/admin-collection-requests.test.mjs tests/cms-retry-retention.test.mjs

For safe root units on Windows after offline dependencies/Python are available:
$unitFiles=@(Get-ChildItem tests -Filter '*.test.mjs' | Where-Object {$_.Name -ne 'phase11-3-routes.test.mjs'} | ForEach-Object {'tests/'+$_.Name})
node --test @unitFiles
The excluded file has2 Vite server tests and requires the isolated guest. Original npm test remains intact; use it inside guest for complete suite.
node --test functions/test/*.test.mjs
npm run build
npm run verify:build
npm run audit:links

PYTHON and QA_PYTHON may point to an offline Python containing PIL/lxml. Missing environment dependencies must be reported, not downloaded automatically.

Current632/632 safe root units and142/142 Functions units passed. Browser, emulator/Rules, booking/Admin/Storage integration, current screenshots and performance acceptance are BLOCKED. Historical financial41PASS/2FAIL remains unresolved; no financial test expectations were changed. Separate QA evidence ZIP contains logs, changed-file manifest, protected hashes,504 inventory entries,40 journeys, matrices and blockers. Review source changes before any independently authorized release.

Latest public header/mobile/selected-branch editorial update: see HEADER_MOBILE_UPDATE_AR.md. Prior605-unit result was historical before this update.

Latest experience/theme refinement: EXPERIENCE_POLISH_AR.md (623 safe unit tests; actual integrated runtime remains blocked).

Latest cart/run/backend review: CART_RUN_REVIEW_AR.md. Run instructions: LOCAL_QA_COMMANDS_AR.md. Root firebase.qa.json is QA-only; live deployment not authorized.
