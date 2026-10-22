"""Fail closed on image defects before producing either release archive."""
from pathlib import Path
import subprocess,sys,zipfile,tarfile,os,argparse,json,re
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output-dir',required=True);parser.add_argument('--name',default='EL_MEZAEN_PHASE11_3_1_RELEASE_CANDIDATE');args=parser.parse_args()
if not args.name.replace('_','').replace('-','').isalnum():parser.error('Archive name must be a safe filename')
subprocess.run([sys.executable,str(root/'scripts/verify-premium-assets.py')],check=True)
out=Path(args.output_dir).resolve();out.mkdir(parents=True,exist_ok=True)
entries={}
for p in root.rglob('*'):
 if not p.is_file() or out in p.parents:continue
 rel=p.relative_to(root)
 if any(x in {'node_modules','dist','.git','.local','.firebase','coverage','qa-evidence','__pycache__','.cache','.vite','playwright-report','test-results','browser-cache','tmp','temp'} for x in rel.parts) or p.name.endswith(('.log','.tmp','.pyc')) or p.name.startswith('.env'):continue
 if re.search(r'(service[-_]?account|credentials|app[-_]?check[-_]?debug|production[-_].*(audit|export)|temporary[-_].*write)',p.name,re.I) or p.suffix.lower() in {'.pem','.key'}:continue
 if p.suffix == '.json':
  try:
   data=json.loads(p.read_text())
   if isinstance(data,dict) and (data.get('type')=='service_account' or 'private_key' in data):continue
  except (UnicodeDecodeError,json.JSONDecodeError):pass
 entries['el-mezaen/'+rel.as_posix()]=p
for p in out.glob('*'):
 if p.suffix in {'.md','.json'} and 'INTEGRITY' not in p.name:entries[p.name]=p
class AppendOnly:
 def __init__(self,f):self.f=f;self.pos=0
 def write(self,b):self.pos+=len(b);return self.f.write(b)
 def tell(self):return self.pos
 def flush(self):self.f.flush()
name=args.name
for suffix in ['.zip','.tar.gz']:
 target=out/(name+suffix);stage=out/(name+suffix+'.tmp')
 with stage.open('wb') as f:
  if suffix=='.zip':
   with zipfile.ZipFile(AppendOnly(f),'w',zipfile.ZIP_DEFLATED,compresslevel=7) as z:
    for n,p in sorted(entries.items()):z.writestr(n,p.read_bytes())
  else:
   with tarfile.open(fileobj=f,mode='w:gz',compresslevel=7) as t:
    for n,p in sorted(entries.items()):t.add(p,arcname=n,recursive=False)
  f.flush();os.fsync(f.fileno())
 os.replace(stage,target)
print(f'Packaged {len(entries)} entries in independent ZIP and TAR archives')
