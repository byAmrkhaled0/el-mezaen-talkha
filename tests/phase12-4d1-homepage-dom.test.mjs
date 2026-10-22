import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Uses the existing offline QA Python/lxml tool, never installs dependencies.
test('D.1 homepage DOM IDs, canonical video placement and section balance', () => {
  const result = spawnSync(process.env.QA_PYTHON || 'python3', [fileURLToPath(new URL('./phase12-4d1-homepage-dom.py', import.meta.url))], {encoding:'utf8'});
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
