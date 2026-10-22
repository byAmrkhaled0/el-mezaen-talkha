"""Source-only release checks. No browser, SDK or network execution."""
from pathlib import Path
import unittest,hashlib,json,csv,re
from lxml import html
R=Path(__file__).resolve().parents[1];Q=R/'qa/premium'
class PremiumSource(unittest.TestCase):
 def test_protected_byte_equivalence(self):
  for name,expected in json.loads((Q/'protected-before.json').read_text()).items():
   self.assertEqual(hashlib.sha256((R/name).read_bytes()).hexdigest(),expected,name)
 def test_all_504_inventory_entries_preserved(self):
  a=list(csv.DictReader((R/'qa/step2c/FEATURE_PARITY_MATRIX.csv').open(encoding='utf-8-sig')))
  b=list(csv.DictReader((Q/'FEATURE_PRESERVATION.csv').open(encoding='utf-8-sig')))
  self.assertEqual(len(a),504);self.assertEqual(len(a),len(b))
  for old,new in zip(a,b):
   for k,v in old.items():self.assertEqual(new[k],v)
 def test_all_40_journeys_preserved(self):
  a=list(csv.DictReader((R/'qa/step2c/FEATURE_JOURNEYS.csv').open(encoding='utf-8-sig')))
  b=list(csv.DictReader((Q/'CUSTOMER_JOURNEYS.csv').open(encoding='utf-8-sig')))
  self.assertEqual(len(a),40);self.assertEqual(len(a),len(b))
  for old,new in zip(a,b):
   for k,v in old.items():self.assertEqual(new[k],v)
 def test_all_public_static_controls_and_routes_exact(self):
  before=json.loads((Q/'before-files.json').read_text())
  for name,digest in before.items():
   if name.endswith('.html'):
    self.assertEqual(hashlib.sha256((R/name).read_bytes()).hexdigest(),digest,name)
 def test_every_runtime_asset_exact(self):
  for name,digest in json.loads((Q/'before-files.json').read_text()).items():
   if name.startswith('public/'):
    self.assertEqual(hashlib.sha256((R/name).read_bytes()).hexdigest(),digest,name)
 def test_internal_links_and_local_resources_exist(self):
  for name in ['admin/index.html','worker/index.html','login/index.html']:
   d=html.fromstring((R/name).read_bytes());ids=set(d.xpath('//*[@id]/@id'))
   for url in d.xpath('//@href | //script/@src | //img/@src'):
    if re.match(r'^(https?:|tel:|mailto:|data:)',url):continue
    if url.startswith('#'):
     if len(url)>1:self.assertIn(url[1:],ids,(name,url))
     continue
    clean=url.split('?')[0].split('#')[0]
    if not clean:continue
    p=R/clean.lstrip('/') if clean.startswith('/') else (R/name).parent/clean
    if clean.endswith('/'):p/='index.html'
    self.assertTrue(p.exists() or (R/'public'/clean.lstrip('/')).exists(),(name,url))
 def test_local_imports_of_changed_modules_exist(self):
  before=json.loads((Q/'before-files.json').read_text())
  for p in (R/'src').glob('*.js'):
   if before.get(str(p.relative_to(R)))==hashlib.sha256(p.read_bytes()).hexdigest():continue
   for target in re.findall(r'(?:from\s+|import\s*\(?\s*)[\x27"](\.[^\x27"]+)[\x27"]',p.read_text()):self.assertTrue((p.parent/target).is_file(),(p.name,target))
 def test_feedback_color_pairs_aa(self):
  def lum(h):
   c=[int(h[i:i+2],16)/255 for i in (1,3,5)];c=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c];return sum(x*w for x,w in zip(c,[.2126,.7152,.0722]))
  for fg,bg in [('#ffaaaa','#102332'),('#83e8bb','#102332'),('#a51d2d','#ffffff'),('#166342','#ffffff')]:
   a,b=sorted([lum(fg),lum(bg)]);self.assertGreaterEqual((b+.05)/(a+.05),4.5)
 def test_no_hidden_business_changes(self):
  for p in ['package.json','package-lock.json','src/firebase-client.js','src/public-branch.js','src/ai-chat.js','src/public-assistant.js']:
   self.assertEqual(hashlib.sha256((R/p).read_bytes()).hexdigest(),json.loads((Q/'before-files.json').read_text())[p])
if __name__=='__main__':unittest.main(verbosity=2)
