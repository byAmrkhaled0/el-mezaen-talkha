import {projectCatalogStaff} from '../src/catalog-cache.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../src/firebase-client.js', import.meta.url), 'utf8');
const catalogFunction = source.slice(source.indexOf('let catalogRequest;'), source.indexOf('export async function getPublishedReviews')).replace('export ', '');
function client(remote, { cached = null, online = true, error = null } = {}) {
  let calls = 0;
  const context = vm.createContext({ projectCatalogStaff, structuredClone, firebaseConfigured: true, navigator: { onLine: online }, console,
    readCatalogCache: () => cached, saveCatalogCache: () => {},
    localCatalog: () => ({ staff: [], content: [{ id: 'local-only', imageUrl: 'local.webp' }], categories: [], offers: [], faqs: [], settings: {} }),
    callFunction: async () => { calls++; if (error) throw error; return remote; }
  });
  vm.runInContext(catalogFunction, context);
  return { get: () => context.getCatalog(), calls: () => calls };
}

test('live empty gallery stays empty and never resurrects local business content', async () => {
  for (const remote of [{ content: [] }, {}]) {
    const catalog = await client(remote).get();
    assert.equal(catalog.content.length, 0);
    assert.equal(catalog.preview, false);
  }
});

test('live gallery and branch data win over cache while existing offline cache is labeled', async () => {
  const cached = { content: [{ id: 'old' }], branches: [{ id: 'mashaya' }] };
  const live = client({ content: [{ id: 'live', imageUrl: 'live.webp' }], branches: [{ id: 'talkha' }] }, { cached });
  const catalog = await live.get();
  assert.equal(catalog.content[0].id, 'live');
  assert.equal(catalog.branches[0].id, 'talkha');
  assert.equal(live.calls(), 1);
  const offline = client({}, { cached, online: false });
  const fallback = await offline.get();
  assert.equal(offline.calls(), 0);
  assert.equal(fallback.offline, true);
  assert.equal(fallback.cached, true);
});

test('gallery routes reuse App Check client once and preserve failure behavior', async () => {
  for (const route of ['results', 'hair-systems']) {
    const code = await fs.readFile(new URL(`../src/${route}.js`, import.meta.url), 'utf8');
    assert.equal((code.match(route==='results'?/await getCatalogMetadata\(\)/g:/await getCatalog\(\)/g) || []).length, 1);
    if(route==='results')assert.match(code,/createCursorPager\(getCatalogPage/);
    assert.match(code, /from ['"]\.\/firebase-client\.js['"]/);
    assert.match(source, /if \(!firebaseConfigured\) return \{ \.\.\.localCatalog\(\), preview: true \}/);
    if(route==='results'){const {sharedEditorial}=await import('../src/public-editorial.js');assert.deepEqual(sharedEditorial([{id:'foreign',type:'result',active:true,status:'published',branchIds:['mashaya'],imageUrl:'https://example.test/result.webp'},{id:'private',type:'result',active:true,private:true,imageUrl:'https://example.test/private.webp'}],'result').map(x=>x.id),['foreign']);}else assert.match(code,/publicSubset\(/);
    assert.match(code, /if \(catalog\.offline\)/);
    assert.doesNotMatch(code, /initializeApp|httpsCallable|seedCatalog/);
  }
});
