/* Isolated local services + fixture.sql + phase-a-fixture.sql. No production credentials. */
const {chromium}=require(process.env.SIMI_PLAYWRIGHT_PATH||'/tmp/simi-ui-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base='http://127.0.0.1:3100';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const session=await(await fetch('http://127.0.0.1:55430/test-session')).json();
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'127.0.0.1',path:'/'}]);
 const page=await context.newPage();page.setDefaultTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const api=async path=>{const r=await fetch('http://127.0.0.1:55430/rest/v1/'+path);assert.equal(r.ok,true,path);return r.json();};
 try{
  const entities=await api('legal_entities?code=eq.SIMI-IT&select=id');
  const params=new URLSearchParams({q:'Phase A',status:'active',country:'IT',entity:entities[0].id});
  await page.goto(base+'/personale?'+params);await page.getByRole('heading',{name:'Personale',exact:true}).waitFor();
  assert.equal(await page.locator('tbody tr').count(),50);assert.match(await page.getByRole('navigation',{name:'Paginazione',exact:true}).innerText(),/127 risultati · Pagina 1/);
  const first=await page.locator('tbody tr').allTextContents();
  await page.getByRole('link',{name:'Successiva',exact:true}).click();await page.waitForURL(/page=2/);await page.getByText('127 risultati · Pagina 2',{exact:true}).waitFor();
  assert.equal(await page.locator('tbody tr').count(),50);
  for(const [key,value]of params)assert.equal(new URL(page.url()).searchParams.get(key),value);
  const second=await page.locator('tbody tr').allTextContents();assert.equal(second.some(r=>first.includes(r)),false);
  await page.getByRole('link',{name:'Successiva',exact:true}).click();await page.waitForURL(/page=3/);await page.getByText('127 risultati · Pagina 3',{exact:true}).waitFor();assert.equal(await page.locator('tbody tr').count(),27);assert.equal(await page.getByRole('link',{name:'Successiva',exact:true}).count(),0);
  await page.getByRole('link',{name:'Precedente',exact:true}).click();await page.waitForURL(/page=2/);
  await page.goto(base+'/personale?'+params+'&page=NaN');await page.getByText('127 risultati · Pagina 1',{exact:true}).waitFor();
  console.log('PASS personnel 127 rows, stable pages 50/50/27, previous/next, preserved filters/search, invalid page');

  await page.goto(base+'/dashboard');await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  const mine=page.getByRole('link',{name:'Le mie attività aperte',exact:true});
  const taskCount=Number(await mine.locator('..').locator('..').locator('dd').innerText());assert.equal(taskCount,2);
  const anomalyLink=page.getByRole('link',{name:'Anomalie aperte',exact:true});
  const anomalyCount=Number(await anomalyLink.locator('..').locator('..').locator('dd').innerText());
  const dueLink=page.getByRole('link',{name:'Scadenze oggi / entro 7 giorni',exact:true});
  const dueCount=Number(await dueLink.locator('..').locator('..').locator('dd').innerText());assert.equal(dueCount,3);
  assert.equal(anomalyCount,(await api('anomalies?status=eq.open&select=id')).length);
  await mine.click();await page.waitForURL(/attivita\?view=mine/);await page.getByText(taskCount+' risultati · Pagina 1',{exact:true}).waitFor();assert.equal(await page.locator('tbody tr').count(),taskCount);
  await page.goto(base+'/dashboard');await page.getByRole('link',{name:'Anomalie aperte',exact:true}).click();await page.waitForURL(/anomalie\?view=open/);await page.getByText(anomalyCount+' risultati · Pagina 1',{exact:true}).waitFor();
  await page.goto(base+'/dashboard');await page.getByRole('link',{name:'Scadenze oggi / entro 7 giorni',exact:true}).click();await page.waitForURL(/scadenze\?period=7/);await page.getByText(dueCount+' scadenze',{exact:true}).waitFor();assert.equal(await page.locator('tbody tr').count(),dueCount);
  await page.goto(base+'/dashboard');await page.getByRole('link').filter({hasText:'Scadenze scadute'}).click();await page.waitForURL(/scadenze\?period=overdue/);await page.getByText('1 scadenze',{exact:true}).waitFor();
  console.log('PASS dashboard task/anomaly/deadline counts match destination filters');
  await page.goto(base+'/dashboard');await page.getByText(/Importi in USD esclusi/).waitFor();await page.getByText(/posizioni finanziarie aperte senza data/).waitFor();
  await page.goto(base+'/report');await page.getByRole('heading',{name:'Report',exact:true}).waitFor();await page.getByText('Acquisti · USD:',{exact:true}).waitFor();
  const deadlines=await api('operational_deadlines?archived_at=is.null&completed=eq.false&select=id');
  assert.equal(Number(await page.getByRole('heading',{name:'Scadenze aperte',exact:true}).locator('..').locator('.fs-3').innerText()),deadlines.length);
  await page.getByRole('link',{name:'Scadenze aperte',exact:true}).click();await page.waitForURL(/scadenze\?status=open/);await page.getByText(deadlines.length+' scadenze',{exact:true}).waitFor();
  console.log('PASS EUR scope explicit, undated exposure explained, reports retain currency and central deadline count');
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/personale?'+params);await page.getByRole('link',{name:'Successiva',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);console.log('PASS mobile pagination and no browser errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
