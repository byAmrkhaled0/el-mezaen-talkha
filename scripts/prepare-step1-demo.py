"""Prepare, but do not launch, a separate customer demo source copy.
Execution of Node/browser requires independently verified process-wide network isolation.
"""
from pathlib import Path
import shutil,sys,re
source=Path(__file__).resolve().parents[1]
if len(sys.argv)!=2: raise SystemExit('Usage: python scripts/prepare-step1-demo.py NEW_DESTINATION')
target=Path(sys.argv[1]).resolve()
if target.exists() or target==source or source in target.parents: raise SystemExit('Use a new directory outside the source checkout')
shutil.copytree(source,target,ignore=shutil.ignore_patterns('node_modules','.git','dist','demo-source'))
(target/'public/firebase-config.js').write_text('window.__OFFLINE_DEMO__=true;window.__FIREBASE_CONFIG__={};window.__USE_EMULATORS__=false;window.__APP_CHECK_SITE_KEY__="";window.__SITE_URL__=location.origin;\n',encoding='utf8')
policy="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; worker-src 'none'"
for page in target.rglob('*.html'):
 text=page.read_text(encoding='utf8')
 # Place before every existing script and before any remote resource can be parsed.
 text=re.sub(r'<head(?:\s[^>]*)?>',lambda m:m.group(0)+'<meta http-equiv="Content-Security-Policy" content="'+policy+'"><script>window.__OFFLINE_DEMO__=true;</script>',text,count=1,flags=re.I)
 page.write_text(text,encoding='utf8')
print('Prepared demo source only:',target)
print('DO NOT LAUNCH without independently verified whole-process external network isolation.')
