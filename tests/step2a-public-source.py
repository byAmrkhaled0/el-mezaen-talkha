"""Source/DOM checks only. These do not claim browser layout or computed contrast."""
import unittest, re
from pathlib import Path
from lxml import html
from PIL import Image
R=Path(__file__).resolve().parents[1]
S=(R/'index.html').read_text(); D=html.fromstring(S); C=(R/'src/public-refinement.css').read_text()
class PublicSource(unittest.TestCase):
 def test_portraits_and_dimensions(self):
  for slot,name in [('heroImageUrl','owner-hero-studio-suit'),('aboutImageUrl','owner-about-car')]:
   img=D.xpath('//img[@data-home-media="'+slot+'"]')[0]
   self.assertIn(name,img.get('src')); self.assertTrue(img.get('data-alt-en')); self.assertTrue(img.get('data-alt-ar'))
   for part in img.get('srcset').split(','):
    path,width=part.strip().split(); im=Image.open(R/'public'/path.lstrip('/'));self.assertEqual(im.width,int(width[:-1]))
 def test_original_sources_retained(self):
  for n in ['owner-hero-studio-suit','owner-about-car']:self.assertTrue((R/'public/assets/owner'/f'{n}.jpeg').is_file())
 def test_hero_is_prioritized_about_lazy(self):
  self.assertEqual(D.xpath('//img[@data-home-media="heroImageUrl"]')[0].get('fetchpriority'),'high')
  self.assertEqual(D.xpath('//img[@data-home-media="aboutImageUrl"]')[0].get('loading'),'lazy')
 def test_two_different_hero_actions(self):
  hero=D.xpath('//section[contains(@class,"hero")]')[0]
  self.assertEqual(len(hero.xpath('.//*[@data-open-booking]')),1)
  self.assertEqual(hero.xpath('.//a[@data-i18n="exploreServices"]/@href'),['/services/'])
 def test_visible_reviews(self):self.assertFalse(D.xpath('//*[@id="publishedReviews"]/ancestor::details'))
 def test_single_robot(self):self.assertEqual(len(D.xpath('//*[contains(concat(" ",@class," ")," faq-chat-fab ")]')),1)
 def test_no_staff_promotion(self):self.assertFalse(D.xpath('//a[@href="/login/"]'));self.assertTrue((R/'login/index.html').exists())
 def test_canonical_photo_cms_contract(self):
  code=(R/'src/site-media.js').read_text();self.assertIn('validSiteImage(settings[field]',code);self.assertIn('img.dataset.siteFallback',code)
 def test_nested_grid_reset(self):self.assertIn(':is(.service-copy,.team-copy)>*{grid-column:auto;grid-row:auto}',C)
 def test_portrait_fit(self):self.assertIn('.hero-photo{width:100%;height:100%;object-fit:cover;object-position:center 20%',C);self.assertIn('aspect-ratio:4/5;width:min(100%,520px)',C)
 def test_visible_sections_keep_deeplinks(self):
  self.assertFalse(D.xpath('//details[contains(@class,"compact-editorial")]'))
  for id in ['local-seo-title','celebrity-title','about','galleryGrid']:
   self.assertEqual(len(D.xpath('//*[@id="'+id+'"]')),1)
   self.assertFalse(D.xpath('//*[@id="'+id+'"]//ancestor::details'))
 def test_header_live_cart_hook(self):self.assertEqual(len(D.xpath('//header[@id="home"]//*[@data-open-booking]//*[@data-cart-count]')),1)
 def test_route_sources(self):
  for route in ['services','packages','team','results','hair-systems','reviews','gallery','news','celebrities','branches/talkha','branches/mashaya','account','booking']:
   p=R/route/'index.html';self.assertTrue(p.is_file());text=p.read_text();self.assertIn('<title>',text);self.assertIn('location.replace("/?book=1"' if route == 'booking' else 'noindex' if route == 'account' else 'canonical',text)
 def test_declared_palette_contrast(self):
  def lum(h):
   rgb=[int(h[i:i+2],16)/255 for i in [1,3,5]];rgb=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in rgb];return sum(x*w for x,w in zip(rgb,[.2126,.7152,.0722]))
  for a,b in [('#122c40','#f5f8fa'),('#496375','#ffffff'),('#f1f7fa','#102332'),('#b0c3cf','#102332'),('#ffffff','#087783'),('#09262b','#44d4df')]:
   v=sorted([lum(a),lum(b)]);self.assertGreaterEqual((v[1]+.05)/(v[0]+.05),4.5)
if __name__=='__main__':unittest.main(verbosity=2)
