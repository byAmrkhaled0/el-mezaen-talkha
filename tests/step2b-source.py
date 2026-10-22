"""Source/DOM regression gate. Not a browser or measured-layout acceptance gate."""
from pathlib import Path
from lxml import html
import unittest,re
R=Path(__file__).resolve().parents[1]
D=html.fromstring((R/'index.html').read_text());CSS=(R/'src/public-refinement.css').read_text()
class Source(unittest.TestCase):
 def test_marketing_visible_without_disclosure(self):
  for id in ['services','packages','results','team','reviews','about','local-seo-title','celebrity-title','newsSection']:
   nodes=D.xpath('//*[@id="'+id+'"]');self.assertEqual(len(nodes),1,id);self.assertFalse(nodes[0].xpath('ancestor::details'),id)
 def test_hero_has_one_bootstrapped_portrait_no_decorations(self):
  hero=D.xpath('//figure[@class="hero-frame"]')[0]
  self.assertEqual(len(hero.xpath('./template/img')),1);self.assertEqual(len(hero.xpath('./noscript/img')),1)
  self.assertFalse(hero.xpath('./img|.//figcaption'));self.assertEqual(len(hero.xpath('.//img')),2)
  self.assertIn('owner-hero-studio-suit',hero.xpath('./template/img/@src')[0])
 def test_about_slot_and_single_portrait(self):
  figure=D.xpath('//figure[@class="about-media"]')[0];self.assertEqual(len(figure.xpath('./img[@data-home-media="aboutImageUrl"]')),1);self.assertFalse(figure.xpath('./figcaption'))
 def test_preload_and_image_sizes_match(self):
  sizes=D.xpath('//template/img[@data-home-media="heroImageUrl"]/@sizes')[0];self.assertIn(sizes,(R/'public/hero-bootstrap.js').read_text())
 def test_full_width_geometry_owner(self):
  self.assertIn('--public-max:1480px',CSS);self.assertIn('--public-gutter:clamp(12px,3.5vw,64px)',CSS)
  self.assertNotIn('max-width:1180px',CSS);self.assertNotIn('max-width:360px',CSS);self.assertNotIn('width:min(100%,300px)',CSS)
  self.assertIn('.container .container{width:100%',CSS)
 def test_empty_gallery_height_is_content_driven(self):
  self.assertIn('.catalog-page{min-height:0',CSS);self.assertIn('.catalog-grid,.team-page-grid,.editorial-grid){min-height:0',CSS);self.assertIn('contain-intrinsic-size:none',CSS)
 def test_contact_grid_only_in_footer(self):
  nodes=D.xpath('//*[@id="branchFooterGrid"]');self.assertEqual(len(nodes),1);self.assertEqual(nodes[0].xpath('ancestor::footer')[0].get('class'),'site-footer');self.assertFalse(nodes[0].xpath('ancestor::main'))
  self.assertTrue(D.xpath('//main//*[@id="contact"]//*[@id="mobileQuickActions"]'))
 def test_home_essential_nav_visible(self):
  nav=D.xpath('//nav[@id="navLinks"]')[0]
  for key in ['services','packages','team','branchesNav']:self.assertTrue(nav.xpath('./a[@data-i18n="'+key+'"]'))
 def test_unique_home_ids(self):
  ids=D.xpath('//*[@id]/@id');self.assertEqual(len(ids),len(set(ids)))
 def test_all_local_links_on_public_pages_resolve(self):
  pages=['index.html','404.html']+[x+'/index.html' for x in ['services','packages','team','results','reviews','gallery','hair-systems','news','celebrities','account','booking','branches/talkha','branches/mashaya']]
  for f in pages:
   dom=html.fromstring((R/f).read_text())
   for a in dom.xpath('//a[@href]'):
    href=a.get('href')
    if not href or href.startswith(('http:','https:','mailto:','tel:','data:')):continue
    path,_,hash=href.partition('#');path=path.split('?')[0]
    target=R/path.lstrip('/') if path.startswith('/') else (R/f).parent/path if path else R/f
    if str(path).endswith('/'):target=target/'index.html'
    if not path:target=R/f
    self.assertTrue(target.is_file(),str((f,href,target)))
    if hash and target.suffix=='.html':self.assertTrue(html.fromstring(target.read_text()).xpath('//*[@id=$id]',id=hash),str((f,href)))
 def test_footer_small_screen_and_tablet_columns_defined(self):
  self.assertIn('.site-footer .footer-branches-layout{display:grid',CSS);self.assertIn('@media(max-width:1024px){body[data-public-refinement] .site-footer',CSS);self.assertIn('@media(max-width:600px){body[data-public-refinement] .site-footer',CSS)
 def test_no_new_unscoped_selector_or_protected_target(self):
  # Top-level selector checks, not a full CSS parser. Every rule touching an element is rooted in public body.
  for selector in re.findall(r'(?:^|[{}])([^{}]+)\{',CSS):
   selector=selector.strip()
   if selector.startswith('@') or selector=='to' or selector.startswith('/*'):continue
   self.assertIn('body[data-',selector,selector)
  self.assertNotRegex(CSS,r'#(?:admin|worker|payroll)')
if __name__=='__main__':unittest.main(verbosity=2)
