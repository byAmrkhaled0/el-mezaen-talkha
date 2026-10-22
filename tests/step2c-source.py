"""Static source contracts, not browser/layout/operational parity acceptance."""
from pathlib import Path
from lxml import html
from collections import Counter
from urllib.parse import urlsplit
import unittest,json,re,hashlib
R=Path(__file__).resolve().parents[1]
Q=R/'qa/step2c';BASE=json.loads((Q/'baseline-contracts.json').read_text());CSS=(R/'src/public-refinement.css').read_text()
def signature(e):
 attrs={k:v for k,v in e.attrib.items() if k in ['href','id','name','type','action','method'] or k.startswith('data-') and not k.startswith(('data-i18n','data-alt'))}
 return json.dumps([e.tag,attrs],sort_keys=True,ensure_ascii=False)
def contrast(a,b):
 def luminance(h):
  cs=[int(h[i:i+2],16)/255 for i in (1,3,5)];cs=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in cs];return sum(x*w for x,w in zip(cs,[.2126,.7152,.0722]))
 x,y=sorted([luminance(a),luminance(b)]);return (y+.05)/(x+.05)
class Parity(unittest.TestCase):
 def test_every_baseline_static_control_contract_remains(self):
  for name,b in BASE.items():
   if not name.endswith('.html'):continue
   d=html.fromstring((R/name).read_bytes());now=Counter(signature(e) for e in d.xpath('//a|//button|//input|//select|//textarea|//form'))
   self.assertFalse(Counter(b['controls'])-now,name)
 def test_every_baseline_id_and_route_remains(self):
  for name,b in BASE.items():
   if not name.endswith('.html'):continue
   ids=html.fromstring((R/name).read_bytes()).xpath('//*[@id]/@id');self.assertTrue(set(b['ids'])<=set(ids),name);self.assertEqual(len(ids),len(set(ids)),name)
 def test_all_dynamic_hooks_retained(self):
  for name,b in BASE.items():
   if 'hooks' not in b:continue
   hooks=set(re.findall(r'data-[a-z][a-z0-9-]*',(R/name).read_text()));self.assertTrue(set(b['hooks'])<=hooks,str((name,set(b['hooks'])-hooks)))
 def test_public_local_routes_and_hash_links(self):
  for name in BASE:
   if not name.endswith('.html'):continue
   d=html.fromstring((R/name).read_bytes())
   for href in d.xpath('//a[@href]/@href'):
    u=urlsplit(href)
    if u.scheme or u.netloc:continue
    target=(R/u.path.lstrip('/') if u.path.startswith('/') else (R/name).parent/u.path) if u.path else R/name
    if u.path.endswith('/'):target/='index.html'
    self.assertTrue(target.is_file(),str((name,href)))
    if u.fragment and target.suffix=='.html':self.assertTrue(html.fromstring(target.read_bytes()).xpath('//*[@id=$v]',v=u.fragment),str((name,href)))
 def test_existing_seo_and_noindex_preserved(self):
  for name,b in BASE.items():
   if not name.endswith('.html'):continue
   d=html.fromstring((R/name).read_bytes());self.assertEqual(d.findtext('.//title'),b['title']);self.assertEqual(d.xpath('//link[@rel="canonical"]/@href'),b['canonical']);self.assertEqual(d.xpath('//meta[@name="robots"]/@content'),b['robots']);self.assertEqual(d.xpath('//script[@type="application/ld+json"]/text()'),b['jsonld'])
 def test_booking_redirect_exact(self):
  baseline=json.loads((Q/'baseline-files-sha256.json').read_text());self.assertEqual(hashlib.sha256((R/'booking/index.html').read_bytes()).hexdigest(),baseline['booking/index.html'])
 def test_protected_files_identical(self):
  manifest=json.loads((Q/'protected-files-sha256.json').read_text())
  for row in manifest:self.assertEqual(hashlib.sha256((R/row['path']).read_bytes()).hexdigest(),row['baseline_sha256'],row['path'])
 def test_no_home_marketing_disclosures(self):
  d=html.fromstring((R/'index.html').read_bytes())
  for id in ['services','packages','offers','team','results','reviews','about','guests','gallery-preview','newsSection','hair-preview']:
   n=d.xpath('//*[@id=$v]',v=id)[0];self.assertFalse(n.xpath('ancestor::details'));self.assertNotIn('hidden',n.attrib)
 def test_mobile_navigation_cascade_order_and_cart_substitute(self):
  final=CSS.index('/* Responsive shell:')
  self.assertGreater(CSS.rfind('.public-main-links{display:none}'),final)
  self.assertGreater(CSS.rfind('.public-route-menu{display:block}'),final)
  self.assertIn('.site-header .header-cart{display:none}body[data-public-refinement] .cart-fab{display:inline-flex}',CSS)
  self.assertIn('body[data-public-refinement] .public-branch-context>svg{width:20px;height:20px',CSS)
  self.assertNotIn('.site-header .branch-switch b{display:none}',CSS)
  self.assertIn('.site-header .branch-switch b{position:absolute;width:1px;height:1px',CSS)
 def test_base_token_contrast_math(self):
  # Color-token math only, not measured composite/rendered WCAG acceptance.
  for fg,bg in [('#f1f7fa','#102332'),('#b0c3cf','#081724'),('#122c40','#ffffff'),('#496375','#ffffff'),('#09262b','#44d4df'),('#ffffff','#087783')]:self.assertGreaterEqual(contrast(fg,bg),4.5,str((fg,bg)))
 def test_status_and_translation_modules_have_no_remote_dependencies(self):
  for name in ['src/public-status.js','src/public-navigation.js','src/public-controls.js']:self.assertNotRegex((R/name).read_text(),r'fetch\(|httpsCallable\(|setInterval\(|initializeApp\(')
 def test_fallback_contacts_exactly_from_baseline_pages(self):
  data=json.loads((Q/'footer-contact-provenance.json').read_text())
  for row in data['contacts']:
   d=html.fromstring((R/f"branches/{row['id']}/index.html").read_bytes());self.assertEqual(row['phone'],d.xpath('//*[@data-branch-phone]/@href')[0][4:]);self.assertEqual(row['mapsUrl'],d.xpath('//*[@data-branch-map]/@href')[0])
if __name__=='__main__':unittest.main(verbosity=2)
