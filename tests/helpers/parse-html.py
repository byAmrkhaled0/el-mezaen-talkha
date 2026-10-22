from html.parser import HTMLParser
import sys,json
class Parser(HTMLParser):
 def __init__(self):
  super().__init__();self.root={'childNodes':[]};self.stack=[self.root]
 def handle_starttag(self,tag,attrs):
  node={'tagName':tag,'attrs':[{'name':k,'value':v or ''} for k,v in attrs],'childNodes':[]};self.stack[-1]['childNodes'].append(node)
  if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:self.stack.append(node)
 def handle_startendtag(self,tag,attrs):
  self.handle_starttag(tag,attrs)
  if self.stack[-1].get('tagName')==tag:self.stack.pop()
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i].get('tagName')==tag:self.stack=self.stack[:i];break
p=Parser();p.feed(sys.stdin.read());print(json.dumps(p.root))
