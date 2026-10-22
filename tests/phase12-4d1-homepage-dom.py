"""Offline DOM regression: existing QA Python/lxml, no Firebase or browser."""
from pathlib import Path
from collections import Counter
from html.parser import HTMLParser
import unittest
from lxml import html

SOURCE = Path(__file__).resolve().parents[1] / 'index.html'

def duplicate_ids(document):
    return sorted(key for key, count in Counter(document.xpath('//*[@id]/@id')).items() if count > 1)

class SectionBalance(HTMLParser):
    def __init__(self):
        super().__init__(); self.open_sections = 0; self.unexpected_close = False
    def handle_starttag(self, tag, attrs):
        if tag == 'section': self.open_sections += 1
    def handle_endtag(self, tag):
        if tag == 'section':
            self.open_sections -= 1
            if self.open_sections < 0: self.unexpected_close = True

class HomepageDomTests(unittest.TestCase):
    def setUp(self):
        self.source = SOURCE.read_text(); self.dom = html.document_fromstring(self.source)
    def test_every_homepage_id_is_unique(self):
        self.assertEqual(duplicate_ids(self.dom), [])
    def test_regression_detector_rejects_duplicate_ids(self):
        self.assertEqual(duplicate_ids(html.document_fromstring('<main><div id="homeHairVideos"></div><div id="homeHairVideos"></div></main>')), ['homeHairVideos'])
    def test_single_video_container_has_intended_parent(self):
        nodes = self.dom.xpath('//*[@id="homeHairVideos"]')
        self.assertEqual(len(nodes), 1)
        self.assertIn('specialized-section', nodes[0].getparent().get('class', '').split())
        self.assertEqual(nodes[0].tag, 'div'); self.assertIn('hair-media-grid', nodes[0].get('class').split())
        self.assertIn('hidden', nodes[0].attrib)
    def test_specialized_and_brand_sections_are_main_siblings(self):
        specialized = self.dom.xpath('//section[contains(concat(" ",normalize-space(@class)," ")," specialized-section ")]')[0]
        brand = self.dom.xpath('//section[@class="brand-statement"]')[0]
        self.assertEqual(specialized.getparent().tag, 'main')
        self.assertIs(specialized.getparent(), brand.getparent())
        self.assertIs(specialized.getnext(), brand)
    def test_section_tags_are_balanced(self):
        parser = SectionBalance(); parser.feed(self.source)
        self.assertEqual(parser.open_sections, 0); self.assertFalse(parser.unexpected_close)

if __name__ == '__main__': unittest.main(verbosity=2)
