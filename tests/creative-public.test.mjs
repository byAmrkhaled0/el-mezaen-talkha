import postcss from 'postcss';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bindResponsivePublicHeader,bindPublicMenu,publicHeaderMarkup} from '../src/public-navigation.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
class Element {
 constructor(name){this.name=name;this.children=[];this.classes=new Set();this.classList={toggle:(n,v)=>v?this.classes.add(n):this.classes.delete(n),contains:n=>this.classes.has(n)};}
 append(node){node.parent?.remove(node);this.children.push(node);node.parent=this;}
 remove(node){this.children=this.children.filter(n=>n!==node);node.parent=null;}
 insertBefore(node,anchor){node.parent?.remove(node);const i=this.children.indexOf(anchor);assert.ok(i>=0);this.children.splice(i,0,node);node.parent=this;}
 contains(node){return this===node||this.children.some(n=>n.contains?.(node));}
}
function harness(mobile){
 const nodes=new Map(),header=new Element('header'),actions=new Element('actions'),links=new Element('links');nodes.set('.nav-actions',actions);nodes.set('#navLinks',links);
 for(const id of ['#branchSwitch','.nav-book','#langToggle','#themeToggle','#menuToggle']){const n=new Element(id);n.state={clicks:0};n.click=()=>n.state.clicks++;n.focus=()=>root.activeElement=n;actions.append(n);nodes.set(id,n);}
 header.querySelector=s=>nodes.get(s);const root={activeElement:null,createElement:()=>new Element('preferences'),createComment:()=>new Element('marker')};
 const events=[];const media={matches:mobile,addEventListener:(name,handler)=>events.push({name,handler})};const sync=bindResponsivePublicHeader(header,root,media);
 return {nodes,header,actions,links,root,media,events,sync};
}
test('mobile header moves original controls while retaining state and handlers',()=>{
 const h=harness(true);assert.equal(h.events.length,1);const prefs=h.links.children[0];
 for(const id of ['#branchSwitch','.nav-book']){const node=h.nodes.get(id);assert.equal(node.parent,prefs);node.click();assert.equal(node.state.clicks,1);}
 for(const id of ['#langToggle','#themeToggle'])assert.equal(h.nodes.get(id).parent,h.actions);
assert.equal(h.nodes.get('#menuToggle').parent,h.actions);
});
test('desktop restoration preserves node identity, order and does not duplicate controls',()=>{
 const h=harness(true),original=[...h.nodes.values()];for(let i=0;i<4;i++){h.media.matches=false;h.sync();h.media.matches=true;h.sync();}h.media.matches=false;h.sync();
 assert.deepEqual(h.actions.children.filter(n=>n.name!=='marker').map(n=>n.name),['#branchSwitch','.nav-book','#langToggle','#themeToggle','#menuToggle']);assert.equal(h.links.children[0].children.length,0);assert.equal(h.events.length,1);assert.deepEqual([...h.nodes.values()],original);
});
test('catalog replacement branch button survives subsequent responsive relocation',()=>{
 const h=harness(true),old=h.nodes.get('#branchSwitch'),replacement=new Element('catalog-branch-button');old.parent.insertBefore(replacement,old);old.parent.remove(old);h.nodes.set('#branchSwitch',replacement);h.media.matches=false;h.sync();assert.equal(replacement.parent,h.actions);assert.equal(old.parent,null);
});
test('visible language control retains focus when resizing to mobile',()=>{
 const h=harness(false);h.root.activeElement=h.nodes.get('#langToggle');h.media.matches=true;h.sync();assert.equal(h.root.activeElement,h.nodes.get('#langToggle'));
});
test('public shell keeps original control IDs and destinations in both languages',()=>{
 for(const lang of ['ar','en']){const s=publicHeaderMarkup(lang);for(const id of ['branchSwitch','langToggle','themeToggle','menuToggle','navLinks'])assert.equal((s.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);for(const path of ['/account/','/results/','/gallery/','/celebrities/','/hair-systems/'])assert.ok(s.includes(`href="${path}"`));}
});
test('source About layout explicitly defeats inherited empty-gallery one-column selector',()=>{
 const s=read('src/public-refinement.css');assert.match(s,/body\[data-home-editorial\] #about \.about-grid,body\[data-home-editorial\] #about \.about-grid.without-gallery\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);assert.match(s,/#about \.about-media\{grid-column:1;grid-row:2/);
});
test('content stays visible without observer; animation is short and reduced motion supported',()=>{
 const s=read('src/public-refinement.css');assert.match(s,/body\[data-public-refinement\] \.reveal\{opacity:1;transform:none\}/);assert.match(s,/prefers-reduced-motion:reduce/);assert.match(s,/animation:none!important;transition:none!important/);postcss.parse(s).walkDecls(d=>{if(/backdrop-filter$/.test(d.prop))assert.equal(d.value,'none','Only an explicit reset is allowed; no backdrop effect');if(d.prop==='filter')assert.doesNotMatch(d.value,/blur\s*\(/);});
});
test('image delivery retains real owner media and CMS hooks',()=>{
 const h=read('index.html');assert.match(h,/data-home-media="heroImageUrl"/);assert.match(h,/data-home-media="aboutImageUrl"/);assert.match(h,/owner-hero-studio-suit-960.webp/);assert.match(h,/owner-about-car-640.webp/);assert.match(h,/fetchpriority="high"/);assert.match(h,/loading="lazy"/);
});
test('responsive header relocation contains no catalog fetch, storage mutation or business action',()=>{
 const s=read('src/public-navigation.js').split('export function bindResponsivePublicHeader')[1];assert.doesNotMatch(s,/cloneNode|fetch\(|getCatalog\(|onSnapshot|localStorage|sessionStorage|setInterval/);
});
