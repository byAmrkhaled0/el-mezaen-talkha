import json,re,sys
from pathlib import Path
from PIL import Image
ROOT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]
manifest=json.loads((Path(__file__).parent/'premium-assets.manifest.json').read_text())
expected={item['path']:item for item in manifest}
for relative,item in expected.items():
 p=ROOT/relative
 assert p.is_file(), f'Missing asset: {relative}'
 assert p.stat().st_size>0, f'Empty asset: {relative}'
 with Image.open(p) as image:
  image.load()
  assert image.format=='WEBP',f'Invalid WebP: {relative}'
  assert image.size==(item['width'],item['height']),f'Invalid dimensions: {relative}'
for p in (ROOT/'public/assets/premium').glob('*.webp'):
 assert p.relative_to(ROOT).as_posix() in expected,f'Unregistered generated asset: {p.name}'
for relative in expected:
 other=re.sub(r'-(640|1280)\.webp$',lambda m:'-'+('1280' if m[1]=='640' else '640')+'.webp',relative)
 assert other in expected,f'Missing responsive variant: {other}'
for folder in ['src','public']:
 for p in (ROOT/folder).rglob('*'):
  if p.suffix not in ['.js','.css','.html']:continue
  for name in re.findall(r'/assets/premium/([\w-]+\.webp)',p.read_text()):
   assert 'public/assets/premium/'+name in expected,f'Unknown reference: {p}: {name}'
print(f'PASS: {len(expected)} premium assets decoded; dimensions and responsive pairs verified')
