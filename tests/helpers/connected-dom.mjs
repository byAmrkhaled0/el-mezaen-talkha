// In-memory DOM fixture: document queries visit connected nodes only.
// No browser session, network requests, script execution or package installation.
import {spawnSync} from 'node:child_process';
const parser=`from html.parser import HTMLParser
import sys,json
class Parser(HTMLParser):
 def __init__(self):
  super().__init__();self.root={'tag':'#document','children':[]};self.stack=[self.root]
 def handle_starttag(self,tag,attrs):
  node={'tag':tag,'attrs':dict(attrs),'children':[]};self.stack[-1]['children'].append(node)
  if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:self.stack.append(node)
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i]['tag']==tag:self.stack=self.stack[:i];break
 def handle_data(self,text):self.stack[-1]['children'].append({'tag':'#text','text':text})
p=Parser();p.feed(sys.stdin.read());print(json.dumps(p.root))`;
export function connectedDom(html){
 const result=spawnSync(process.env.QA_PYTHON||'python3',['-c',parser],{input:html,encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,PYTHONUTF8:'1'}});if(result.status!==0)throw Error(result.stderr||String(result.error));
 let document;
 const matches=(item,selector)=>{if(item.nodeType!==1)return false;return selector.split(',').some(value=>{const parts=value.trim().replace(/>/g,' > ').split(/\s+/);let index=parts.length-1,current=item;if(!simple(current,parts[index--]))return false;while(index>=0){if(parts[index]==='>'){current=current.parentElement;index--;if(!current||!simple(current,parts[index--]))return false;}else{const wanted=parts[index--];current=current.parentElement;while(current&&!simple(current,wanted))current=current.parentElement;if(!current)return false;}}return true;});};
 function simple(item,selector){if(!item||item.nodeType!==1)return false;const tag=selector.match(/^[a-z][\w-]*/i)?.[0];if(tag&&item.tagName!==tag.toUpperCase())return false;for(const [,id]of selector.matchAll(/#([\w-]+)/g))if(item.id!==id)return false;for(const [,cls]of selector.matchAll(/\.([\w-]+)/g))if(!item.className.split(/\s+/).includes(cls))return false;for(const [,key,value]of selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)){if(!item.hasAttribute(key)||value!==undefined&&item.getAttribute(key)!==value)return false;}return true;}
 class Node{
  constructor(tag,text=''){this.tagName=tag.toUpperCase();this.nodeType=tag==='#text'?3:1;this.childNodes=[];this.attributes={};this.dataset={};this.listeners={};this.parentElement=null;this._text=text;this._value=undefined;this.hidden=false;this.disabled=false;this.open=false;this.className='';this.id='';}
  get children(){return this.childNodes.filter(node=>node.nodeType===1);}
  get firstChild(){return this.childNodes[0]||null;}
  get textContent(){return this.nodeType===3?this._text:this.childNodes.map(node=>node.textContent).join('');}
  set textContent(text){this.childNodes.forEach(node=>node.parentElement=null);this.childNodes=[];this._text=String(text);if(this.nodeType!==3&&text!=='')this.append(new Node('#text',String(text)));}
  get value(){if(this._value!==undefined)return this._value;if(this.tagName==='SELECT'){const selected=this.options.find(option=>option.hasAttribute('selected'))||this.options[0];return selected?.value||'';}return this.attributes.value||'';}
  set value(value){this._value=String(value);}
  get options(){return this.children.filter(node=>node.tagName==='OPTION');}
  get isConnected(){let node=this;while(node.parentElement)node=node.parentElement;return node===document;}
  get classList(){return {add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/),...names])].filter(Boolean).join(' ');},contains:name=>this.className.split(/\s+/).includes(name)};}
  setAttribute(key,value){this.attributes[key]=String(value);if(key==='id')this.id=String(value);if(key==='class')this.className=String(value);if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);if(key==='hidden')this.hidden=true;if(key==='disabled')this.disabled=true;}
  getAttribute(key){return key==='id'?this.id:key==='class'?this.className:this.attributes[key]??null;}
  hasAttribute(key){return key==='id'?Boolean(this.id):key==='class'?Boolean(this.className):Object.hasOwn(this.attributes,key);}
  removeAttribute(key){delete this.attributes[key];if(key==='id')this.id='';if(key==='class')this.className='';if(key.startsWith('data-'))delete this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];}
  append(...nodes){for(let node of nodes){if(typeof node==='string')node=new Node('#text',node);node.remove();node.parentElement=this;this.childNodes.push(node);}}
  prepend(...nodes){for(const node of [...nodes].reverse()){node.remove();node.parentElement=this;this.childNodes.unshift(node);}}
  remove(){if(this.parentElement){const parent=this.parentElement;parent.childNodes.splice(parent.childNodes.indexOf(this),1);this.parentElement=null;}}
  replaceChildren(...nodes){this.childNodes.forEach(node=>node.parentElement=null);this.childNodes=[];this.append(...nodes);}
  insertBefore(node,target){node.remove();const index=this.childNodes.indexOf(target);node.parentElement=this;this.childNodes.splice(index<0?this.childNodes.length:index,0,node);}
  before(node){this.parentElement?.insertBefore(node,this);}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(matches(child,selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){let node=this;while(node&&!matches(node,selector))node=node.parentElement;return node;}
  addEventListener(type,listener){(this.listeners[type]||=[]).push(listener);}
  dispatchEvent(event){for(const listener of this.listeners[event.type]||[])listener(event);return true;}
  showModal(){this.open=true;}
  close(){this.open=false;this.dispatchEvent({type:'close'});}
  focus(){document.activeElement=this;}
  checkValidity(){return true;}
  add(option){this.append(option);}
 }
 function build(value){const node=new Node(value.tag,value.text||'');for(const [key,text]of Object.entries(value.attrs||{}))node.setAttribute(key,text??'');for(const child of value.children||[])node.append(build(child));return node;}
 document=build(JSON.parse(result.stdout));document.createElement=tag=>new Node(tag);document.createElementNS=(_,tag)=>new Node(tag);document.createTextNode=text=>new Node('#text',text);document.activeElement=null;
 return {document,Option:function(text,value){const node=new Node('option');node.textContent=text;node.value=value;return node;}};
}
