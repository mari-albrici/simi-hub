/* Disposable local services + fixture.sql + redesign-fixture.sql + app-shell-fixture.sql only. */
const { chromium } = require(process.env.SIMI_PLAYWRIGHT_PATH || '/tmp/simi-ui-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:3100';
(async () => {
 const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
 const context = await browser.newContext();
 const session = await (await fetch('http://127.0.0.1:55430/test-session')).json();
 await context.addCookies([{name:'sb-127-auth-token', value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'), domain:'127.0.0.1', path:'/'}]);
 const page = await context.newPage(); page.setDefaultTimeout(30000);
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 const routes=['fatture','ordini','ddt','pagamenti','clienti','fornitori','aziende','documenti','scadenze','personale','commesse','offerte','contratti'];
 async function noOverflow() { assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'viewport overflow '+page.url()); }
 try {
  for (const width of [1440,1920]) {
   await page.setViewportSize({width,height:1000});
   for (const route of routes) {
    await page.goto(base+'/'+route); await page.locator('h1').first().waitFor();
    const side=page.locator('.desktop-sidebar'); assert.equal((await side.boundingBox()).width,260);
    assert.equal(await side.locator('a[href="/offerte"],a[href="/contratti"]').count(),0);
    if(!['offerte','contratti'].includes(route))assert.equal(await side.locator(`a[href="/${route}"]`).getAttribute('aria-current'),'page');
    const group=['fatture','ordini','ddt','pagamenti'].includes(route)?'Contabilità':['clienti','fornitori','aziende'].includes(route)?'Anagrafiche':null;
    if(group)assert.equal(await side.getByRole('button',{name:group}).getAttribute('aria-expanded'),'true');
    const toolbar=page.locator('.filter-primary');
    if(await toolbar.count()) {
     const bottoms=await toolbar.locator(':scope > :not(.filter-advanced)').evaluateAll(es=>es.map(e=>Math.round(e.getBoundingClientRect().bottom)));
     assert.ok(Math.max(...bottoms)-Math.min(...bottoms)<3,route+' toolbar wraps');
    }
    const button=page.locator('.row-actions > button').first();
    if(await button.count()) {
     const table=button.locator('xpath=ancestor::div[contains(@class,"table-responsive")][1]');
     const before=await table.evaluate(e=>e.scrollHeight-e.clientHeight);
     assert.notEqual(await button.locator('i').evaluate(e=>getComputedStyle(e,'::before').content),'none');
     await button.click(); await page.locator(':popover-open').waitFor();
     assert.equal(await table.evaluate(e=>e.scrollHeight-e.clientHeight),before,'menu adds vertical overflow');
     await page.keyboard.press('Escape');
    }
    await noOverflow(); console.log('PASS desktop',width,route);
   }
  }
  for(const route of ['fatture/new','fatture/65000000-0000-4000-8000-000000000001','clienti/25000000-0000-4000-8000-000000000001/edit']) {
   await page.goto(base+'/'+route);await page.locator('h1').first().waitFor();
   assert.equal(await page.locator(`.desktop-sidebar a[href="/${route.split('/')[0]}"]`).getAttribute('aria-current'),'page');
  }
  for(const width of [375,768]) {
   await page.setViewportSize({width,height:900});await page.goto(base+'/fatture');await page.locator('h1').first().waitFor();
   assert.equal(await page.locator('.desktop-sidebar').isVisible(),false);
   const menu=page.locator('#mobileSidebar');
   const open=async()=>{await page.getByRole('button',{name:'Apri menu',exact:true}).click();await page.locator('#mobileSidebar.show').waitFor();};
   const closed=async()=>{await page.locator('#mobileSidebar').waitFor({state:'hidden'});assert.equal(await page.locator('.offcanvas-backdrop').count(),0);};
   await open();assert.equal(await menu.getByRole('button',{name:'Contabilità'}).getAttribute('aria-expanded'),'true');
   await menu.getByRole('link',{name:'Ordini',exact:true}).click();await page.waitForURL('**/ordini');await closed();
   await open();await menu.getByRole('button',{name:'Anagrafiche'}).click();await menu.getByRole('link',{name:'Clienti',exact:true}).click();await page.waitForURL('**/clienti');await closed();
   await open();assert.equal(await menu.getByRole('button',{name:'Anagrafiche'}).getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');await closed();
   await open();await page.mouse.click(width-2,450);await closed();
   await open();await menu.getByRole('button',{name:'Chiudi menu'}).click();await closed();
   for(const route of routes){await page.goto(base+'/'+route);await page.locator('h1').first().waitFor();await noOverflow();}
   await page.screenshot({path:`/tmp/simi-shell-${width}.png`,fullPage:true});console.log('PASS mobile',width);
  }
  // Real request held by the test, released explicitly: no artificial app delay.
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/clienti');
  let release;const gate=new Promise(r=>{release=r;});
  await page.route('**/clienti?**',async route=>{await gate;await route.continue();});
  await page.locator('input[name="q"]').fill('01234');await page.getByRole('button',{name:'Applica',exact:true}).click();
  await page.locator('form[aria-busy="true"]').waitFor();await page.getByText('Aggiornamento elenco…').waitFor();release();
  await page.waitForURL('**/clienti?q=01234');await page.unroute('**/clienti?**');
  await page.getByText('eSolver 01234',{exact:true}).waitFor();
  // Editing persists the same textual code through the actual server action.
  await page.goto(base+'/clienti/25000000-0000-4000-8000-000000000001/edit');
  assert.equal(await page.locator('[name="esolver_code"]').inputValue(),'01234');
  await page.locator('[name="esolver_code"]').fill('001234');
  let releaseSave;const saveGate=new Promise(r=>{releaseSave=r;});
  await page.route('**/clienti/**/edit',async route=>{if(route.request().method()==='POST')await saveGate;await route.continue();});
  await page.locator('main button[type="submit"]').click();
  await page.locator('main button[type="submit"]:disabled').waitFor();releaseSave();
  await page.waitForURL(/\/clienti(?:\?|$)/);await page.unroute('**/clienti/**/edit');
  await page.goto(base+'/fornitori?q=001234');await page.getByText('eSolver 001234',{exact:true}).waitFor();
  await page.goto(base+'/fornitori/25000000-0000-4000-8000-000000000001');await page.getByText(/^Codice eSolver:\s*001234$/).waitFor();
  await page.goto(base+'/clienti/25000000-0000-4000-8000-000000000001/edit');
  await page.locator('[name="esolver_code"]').fill('01234');await page.locator('main button[type="submit"]').click();await page.waitForURL(/\/clienti(?:\?|$)/);
  let releaseNavigation;const navigationGate=new Promise(r=>{releaseNavigation=r;});
  await page.route('**/report**',async route=>{await navigationGate;await route.continue();});
  await page.locator('.desktop-sidebar').getByRole('link',{name:'Report',exact:true}).click();
  await page.locator('.navigation-progress,.page-loading').first().waitFor();releaseNavigation();
  await page.waitForURL('**/report');await page.unroute('**/report**');
  assert.deepEqual(errors,[]);console.log('PASS app shell, routes, responsive, filters, menus and loading');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
