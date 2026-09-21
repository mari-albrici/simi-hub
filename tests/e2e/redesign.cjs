/* Run only against the disposable local service and redesign-fixture.sql. */
const {chromium}=require(process.env.SIMI_PLAYWRIGHT_PATH||'/tmp/simi-ui-tools/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const session=await(await fetch('http://127.0.0.1:55430/test-session')).json();
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'127.0.0.1',path:'/'}]);
 const page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const routes={offerte:['Numero','Data','Cliente','Commessa','Totale','Validità','Stato','Azioni'],contratti:['Contratto','Controparte','Commessa','Decorrenza','Scadenza','Valore','Stato','Azioni'],commesse:['Commessa','Cliente','Luogo','Responsabile','Chiusura prevista','Stato','Azioni'],clienti:['Nome','Paese','P.IVA / identificativo','Referente','Stato','Azioni'],fornitori:['Nome','Paese','P.IVA / identificativo','Referente','Stato','Azioni'],pagamenti:['Data','Tipo','Soggetto','Riferimento','Importo','Stato','Azioni'],personale:['Dipendente','Società','Mansione','Assunzione','Scadenze HR','Stato','Azioni'],scadenze:['Scadenza','Descrizione','Soggetto','Commessa','Residuo','Stato','Priorità']};
 try{
 for(const width of [1440,1280]){
 await page.setViewportSize({width,height:1000});
 for(const [route,headers] of Object.entries(routes)){
  await page.goto('http://127.0.0.1:3100/'+route);await page.locator('table.table-admin tbody tr').first().waitFor();
  const table=page.locator('table.table-admin').first();
  assert.deepEqual(await table.locator('thead th').allTextContents(),headers,route+' columns');
  assert.ok(await table.locator('tbody tr').count()>0,route+' fixture');
  assert.equal(await table.evaluate(t=>t.scrollWidth>t.parentElement.clientWidth+1),false,route+' requires horizontal scrolling at '+width);
  const wrapping=await table.locator('.col-date,.col-money,.col-status,.badge').evaluateAll(els=>els.filter(el=>getComputedStyle(el).whiteSpace!=='nowrap').length);
  assert.equal(wrapping,0,route+' structured wrapping');
  const filter=page.getByRole('button',{name:/^Filtri/});
  if(await filter.count()){
   assert.equal(await filter.getAttribute('aria-expanded'),'false');
   const panel=page.locator('[id="'+await filter.getAttribute('aria-controls')+'"]');assert.equal(await panel.isVisible(),false);
   await filter.click();await panel.waitFor({state:"visible"});assert.equal(await panel.isVisible(),true);await filter.click();await panel.waitFor({state:"hidden"});assert.equal(await panel.isVisible(),false);
  }
  const action=table.locator('.row-actions > button').first();
  if(await action.count()){
   await action.click();const menu=page.locator('.row-actions-menu:popover-open');await menu.waitFor({state:'visible'});
   const box=await menu.boundingBox();assert.ok(box.y>=0&&box.x>=0&&box.x+box.width<=width+1);assert.ok(box.y+box.height<=1001);
   await page.keyboard.press('Escape');assert.equal(await page.locator('.row-actions-menu:popover-open').count(),0);
  }
  assert.doesNotMatch(await table.innerText(),/\b2026-\d{2}-\d{2}\b|20659\.46|1004\.41/);
  await page.screenshot({path:`/tmp/simi-2a4c-${route}-${width}.png`,fullPage:true});console.log('PASS',width,route);
 }
 }
 // Active advanced filters remain collapsed and are still submitted.
 await page.goto('http://127.0.0.1:3100/scadenze?from=2026-09-18&priority=high');
 const filters=page.getByRole('button',{name:/^Filtri/});await filters.waitFor();assert.equal(await filters.getAttribute('aria-expanded'),'false');assert.match(await filters.innerText(),/2/);
 await page.getByRole('button',{name:'Applica',exact:true}).click();await page.waitForURL(/priority=high/);assert.ok(new URL(page.url()).searchParams.get('from')==='2026-09-18');
 for(const route of ['offerte/81000000-0000-4000-8000-000000000001','contratti/82000000-0000-4000-8000-000000000001','commesse/35000000-0000-4000-8000-000000000001','clienti/25000000-0000-4000-8000-000000000001','fornitori/25000000-0000-4000-8000-000000000001','personale/83000000-0000-4000-8000-000000000001']){
  await page.goto('http://127.0.0.1:3100/'+route);await page.locator('h1').waitFor();assert.doesNotMatch(await page.locator('main').innerText(),/Qualcosa è andato storto|20659\.46|1004\.41/);console.log('PASS detail',route);
 }
 assert.deepEqual(errors,[]);console.log('PASS all redesign browser checks');
 }catch(e){console.error('URL',page.url());console.error((await page.locator('body').innerText()).slice(-4000));await page.screenshot({path:'/tmp/simi-2a4c-failure.png',fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
