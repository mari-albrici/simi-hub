/* Only the disposable local PostgreSQL/PostgREST/Auth adapter. */
const {chromium}=require(process.env.SIMI_PLAYWRIGHT_PATH||'/tmp/simi-ui-tools/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const session=await(await fetch('http://127.0.0.1:55430/test-session')).json();
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'127.0.0.1',path:'/'}]);
 const page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base='http://127.0.0.1:3100',invoice=base+'/fatture/2b000000-0000-4000-8000-000000000001',title='Verifica lavoro '+Date.now();
 const today=new Date().toISOString().slice(0,10);
 try{
  await page.goto(invoice);await page.getByRole('link',{name:'Crea attività',exact:true}).click();
  await page.getByLabel('Titolo',{exact:true}).fill(title);await page.getByLabel('Scadenza',{exact:true}).fill(today);await page.getByLabel('Priorità',{exact:true}).selectOption('urgent');
  assert.match(await page.locator('main').innerText(),/E2E-WORK-REQUIRED/);
  let release,started;const gate=new Promise(r=>release=r),seen=new Promise(r=>started=r);
  const hold=async route=>{if(route.request().method()==='POST'){started();await gate;}await route.continue();};
  await page.route('**/attivita/new?**',hold);
  const click=page.getByRole('button',{name:'Salva attività',exact:true}).click();await Promise.race([seen,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Save request did not start')),30000))]);
  await page.getByRole('button',{name:'Salvataggio…'}).waitFor();assert.equal(await page.getByRole('button',{name:'Salvataggio…'}).isDisabled(),true);release();await click;
  await page.waitForURL(/\/attivita\/[a-f0-9-]+\?success/);await page.unroute('**/attivita/new?**',hold);const taskUrl=page.url().split('?')[0];
  console.log('PASS task contextual create, inherited FK and pending feedback');
  await page.goto(base+'/attivita?view=mine&q='+encodeURIComponent(title));assert.equal(await page.locator('tbody tr').count(),1);assert.match(await page.locator('tbody').innerText(),/E2E-WORK-REQUIRED/);
  await page.goto(taskUrl);await page.getByLabel('Stato',{exact:true}).selectOption('completed');await page.getByRole('button',{name:'Salva attività',exact:true}).click();await page.waitForURL(/\?success/);await page.getByText(/Completata \d/).waitFor();
  await page.goto(base+'/attivita?view=all&status=completed&q='+encodeURIComponent(title));assert.match(await page.locator('tbody').innerText(),new RegExp(title));
  await page.goto(taskUrl);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Archivia',exact:true}).click();await page.getByText('Archiviata',{exact:true}).waitFor();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Ripristina',exact:true}).click();await page.getByRole('button',{name:'Salva attività',exact:true}).waitFor();
  console.log('PASS task filters, completion, archive and restore');
  await page.goto(base+'/anomalie');const row=page.locator('tbody tr').filter({hasText:'Fattura senza commessa richiesta'}).filter({hasText:'E2E-WORK-REQUIRED'});await row.getByRole('link',{name:'Fattura senza commessa richiesta',exact:true}).click();const anomalyUrl=page.url();
  await page.getByLabel('Motivazione obbligatoria').fill('In attesa di conferma E2E');await page.getByRole('button',{name:'Ignora anomalia'}).click();await page.getByText('Ignorata',{exact:true}).waitFor();
  await page.reload();await page.getByText('Ignorata',{exact:true}).waitFor();assert.match(await page.locator('main').innerText(),/In attesa di conferma E2E/);
  await page.getByRole('link',{name:'Crea attività',exact:true}).click();assert.equal(await page.getByLabel('Titolo',{exact:true}).inputValue(),'Fattura senza commessa richiesta');assert.equal(await page.getByLabel('Priorità',{exact:true}).inputValue(),'high');
  await page.getByRole('button',{name:'Salva attività',exact:true}).click();await page.waitForURL(/\/attivita\/[a-f0-9-]+\?success/);assert.equal(await page.getByRole('link',{name:'anomalia collegata'}).getAttribute('href'),new URL(anomalyUrl).pathname);
  await page.goto(invoice);await page.getByLabel('Commessa richiesta per questa fattura').uncheck();await page.getByRole('button',{name:'Salva requisito'}).click();await page.waitForURL(/\?success/);
  await page.goto(anomalyUrl);await page.getByText('Risolta',{exact:true}).waitFor();
  await page.goto(invoice);await page.getByLabel('Commessa richiesta per questa fattura').check();await page.getByRole('button',{name:'Salva requisito'}).click();await page.waitForURL(/\?success/);
  await page.goto(anomalyUrl);await page.getByText('Aperta',{exact:true}).waitFor();
  console.log('PASS anomaly ignore persistence, linked task, automatic resolution and stable reopening');
  await page.goto(base+'/dashboard');await page.getByRole('heading',{name:'Attività e anomalie da seguire'}).waitFor();assert.ok(await page.locator('main a[href^="/anomalie/"]').count()>0);
  for(const width of [1440,375]){await page.setViewportSize({width,height:1000});for(const route of ['attivita','anomalie']){await page.goto(base+'/'+route);await page.getByRole('heading',{name:route==='attivita'?'Attività':'Anomalie',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'overflow '+route);}}
  await page.screenshot({path:'/tmp/simi-2b-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS dashboard, desktop/mobile layout and no runtime errors');
 }catch(e){console.error(e);console.error('URL',page.url());console.error((await page.locator('body').innerText()).slice(0,3000));await page.screenshot({path:'/tmp/simi-2b-browser-failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}
 finally{await browser.close();}
})();
