import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
export function parse(html){const result=spawnSync(process.env.QA_PYTHON||'python3',[fileURLToPath(new URL('./parse-html.py',import.meta.url))],{input:html,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'}});if(result.status!==0)throw Error(result.stderr||String(result.error));return JSON.parse(result.stdout);}
