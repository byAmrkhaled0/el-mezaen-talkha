const homeLinks=[['/services/','الخدمات والأسعار','Services & prices'],['/packages/','الباقات','Packages'],['/results/','نتائج شغلنا','Our results'],['/team/','الفريق','Team']];
export function mountCustomerSimple(root=document) {
  if(!root.body.hasAttribute('data-public-refinement'))return;
  root.body.dataset.customerSimple='true';
  if(!root.body.hasAttribute('data-home-editorial'))return;
  const main=root.querySelector('#main');if(!main||root.querySelector('#homeExplore'))return;
  const en=()=>root.documentElement.lang==='en';
  const nav=root.createElement('nav');nav.className='customer-shortcuts container';nav.setAttribute('aria-label',en()?'Explore El Mezaen':'اكتشف المزين');
  for(const [url,ar,eng] of homeLinks){const link=root.createElement('a');link.href=url;link.dataset.ar=ar;link.dataset.en=eng;link.textContent=en()?eng:ar;nav.append(link);}
  const hero=main.querySelector('.hero');hero?.after(nav);
  const panel=root.createElement('section');panel.id='homeExplore';panel.className='home-explore section-pad';
  const head=root.createElement('div');head.className='container home-explore-head';
  const title=root.createElement('h2');const button=root.createElement('button');button.type='button';button.className='btn btn-ghost';button.setAttribute('aria-controls','homeExploreContent');button.setAttribute('aria-expanded','false');
  const content=root.createElement('div');content.id='homeExploreContent';content.hidden=true;
  head.append(title,button);panel.append(head,content);
  // Move existing nodes rather than cloning: forms, IDs and delegated handlers remain intact.
  const candidates=[...main.querySelectorAll('#hair-preview,.brand-statement,#team,#reviews,#about,#guests,#newsSection,#gallery-preview')];
  const sections=candidates.filter(section=>!candidates.some(parent=>parent!==section&&parent.contains(section)));
  if(!sections.length)return;
  (main.querySelector('.final-booking')||main.querySelector('#contact'))?.before(panel);
  for(const section of sections)content.append(section);
  function updateCopy(){title.textContent=en()?'More from El Mezaen':'اكتشف أكتر عن المزين';button.textContent=content.hidden?(en()?'Show team, reviews & more':'الفريق والتقييمات وباقي التفاصيل'):(en()?'Show less':'عرض أقل');for(const link of nav.children)link.textContent=en()?link.dataset.en:link.dataset.ar;}
  function show(open){content.hidden=!open;button.setAttribute('aria-expanded',String(open));updateCopy();}
  button.addEventListener('click',()=>{const open=content.hidden;show(open);if(!open)button.focus({preventScroll:true});});
  function revealAnchor(hash){if(hash==='#choose-branch'){root.querySelector('#contact')?.scrollIntoView({block:'start'});return;}let node;try{node=root.querySelector(hash);}catch{return;}if(node&&content.contains(node)){show(true);node.scrollIntoView({block:'start'});}}
  root.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(!link)return;const url=new URL(link.href,location.href);if(url.origin===location.origin&&url.pathname===location.pathname&&url.hash)revealAnchor(url.hash);});
  window.addEventListener('hashchange',()=>revealAnchor(location.hash));
  window.addEventListener('mz:language',updateCopy);
  updateCopy();if(location.hash)revealAnchor(location.hash);
}
