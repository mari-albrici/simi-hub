const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {formatDate,formatMoney,formatMonth,formatNumber}=require('../src/lib/formatters.ts');
const {isActiveRoute,navigationGroups}=require('../src/lib/navigation.ts');
const {filterCompanies}=require('../src/lib/company-filters.ts');

test('navigation groups include descendant routes without matching similar prefixes',()=>{
 for(const group of navigationGroups) for(const route of group.routes){
  for(const suffix of ['', '/new', '/record', '/record/edit'])assert.equal(isActiveRoute(route+suffix,route),true);
  assert.equal(isActiveRoute(route+'-other',route),false);
 }
 assert.deepEqual(navigationGroups.map(g=>g.routes),[['/ordini','/ddt','/fatture','/pagamenti'],['/clienti','/fornitori','/aziende'],['/attivita','/scadenze','/anomalie']]);
 const nav=read('src/components/ui/portal-navigation.tsx');
 assert.match(nav,/aria-current/);assert.match(nav,/aria-expanded/);assert.match(nav,/closeMobileMenu/);
 assert.doesNotMatch(read('src/lib/constants.ts').split('export const NAV_ITEMS =')[1],/\/offerte|\/contratti/);
});

test('every requested list uses the shared responsive filter and pending navigation',()=>{
 for(const route of ['fatture','scadenze','documenti','ordini','ddt','offerte','contratti','commesse','clienti','fornitori','pagamenti','personale']){
  const source=read(`src/app/(portal)/${route}/page.tsx`);
  assert.match(source,/FilterToolbar|CompanyFilters/,route);
  assert.match(source,/FilterForm|CompanyFilters/,route);
 }
 assert.match(read('src/components/ui/filter-form.tsx'),/startTransition/);
 assert.match(read('src/components/ui/app-link.tsx'),/useLinkStatus/);
 const css=read('src/app/globals.css');
 assert.match(css,/flex: 0 0 var\(--simi-sidebar-width\)/);
 assert.match(css,/--simi-primary: #253a78/);
});

test('eSolver is optional text, keeps leading zeroes and participates in company search',()=>{
 const {companyFormSchema}=require('../src/lib/validations.ts');
 const input={company_type:'customer',business_name:'Test cliente',esolver_code:'01234'};
 assert.equal(companyFormSchema.parse(input).esolver_code,'01234');
 assert.equal(companyFormSchema.parse({...input,esolver_code:''}).esolver_code,null);
 assert.equal(filterCompanies([{...input,active:true}],{q:'01234'}).length,1);
 for(const route of ['clienti','fornitori'])for(const suffix of ['page.tsx','new/page.tsx','[id]/page.tsx','[id]/edit/page.tsx'])assert.match(read(`src/app/(portal)/${route}/${suffix}`),/esolver_code/);
 assert.match(read('supabase/migrations/021_phase2a5_company_esolver.sql'),/ADD COLUMN esolver_code text/);
});

test('file signing keeps authorization and supplies immediate pending and error feedback',()=>{
 const source=read('src/components/documents/file-link.tsx');
 assert.match(source,/aria-busy=\{pending\}/);assert.match(source,/setPending\(true\)/);
 assert.match(source,/finally/);assert.match(source,/role="alert"/);
 const route=read('src/app/(portal)/documenti/versioni/[version]/file/route.ts');
 assert.match(route,/await signedDocumentVersion/);assert.match(route,/private, no-store/);
 assert.match(read('src/components/documents/document-preview.tsx'),/onLoad/);
});

test('operational server-action forms expose pending feedback',()=>{
 function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?walk(path.join(dir,f.name)):[path.join(dir,f.name)]);}
 for(const file of walk(path.join(root,'src')).filter(f=>f.endsWith('.tsx'))){
  const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node){
   if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='form'&&node.openingElement.attributes.properties.some(p=>p.name?.getText(ast)==='action'))assert.match(node.getText(ast),/SubmitButton|pending/,file);
   ts.forEachChild(node,visit);
  }
  visit(ast);
 }
});

test('central formatters preserve zero, foreign currency and missing values',()=>{
 assert.equal(formatDate('2026-09-18'),'18/09/2026');
 assert.equal(formatDate(null),'—');
 assert.match(formatMoney(1004.41,'EUR'),/^1\.004,41\s€$/);
 assert.match(formatMoney(20659.46,'USD'),/^20\.659,46\s/);
 assert.match(formatMoney(0,'EUR'),/^0,00\s€$/);
 assert.equal(formatMoney(null),'—');
 assert.equal(formatMoney(Infinity),'—');
 assert.equal(formatMoney(1004.41,'E'),'1.004,41');
 assert.equal(formatMoney(1004.41,null),'1.004,41');
 assert.equal(formatNumber(20659.46),'20.659,46');
 assert.equal(formatMonth('2026-09'),'settembre 2026');
});

// Render the actual shared UI, not a mirrored implementation.
require.extensions['.tsx']=(module,filename)=>{
 const source=fs.readFileSync(filename,'utf8');
 const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});
 module._compile(result.outputText,filename);
};
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {FilterToolbar}=require('../src/components/ui/filter-toolbar.tsx');
const {RowActionsMenu}=require('../src/components/ui/row-actions-menu.tsx');
const {StatusBadge}=require('../src/components/ui/status-badge.tsx');

test('advanced filters start hidden even when active, retain controls and expose state accessibly',()=>{
 const html=renderToStaticMarkup(React.createElement(FilterToolbar,{activeCount:2,advanced:React.createElement('input',{name:'from',defaultValue:'2026-09-18'})},React.createElement('input',{name:'q'})));
 assert.match(html,/aria-expanded="false"/);assert.match(html,/aria-controls=/);assert.match(html,/hidden=""/);
 assert.match(html,/name="from"/);assert.match(html,/value="2026-09-18"/);assert.match(html,/2.*filtri avanzati attivi/);
 assert.doesNotMatch(html,/disabled/);assert.match(html,/type="submit"/);
});
test('shared actions escape clipping and keep accessible per-row labels',()=>{
 const html=renderToStaticMarkup(React.createElement(RowActionsMenu,{label:'Azioni OFF-123'},React.createElement('a',{href:'/offerte/id/edit'},'Modifica')));
 assert.match(html,/popover="auto"/);assert.match(html,/popoverTarget=/i);assert.match(html,/aria-label="Azioni OFF-123"/);assert.match(html,/href="\/offerte\/id\/edit"/);
 assert.match(read('src/app/globals.css'),/\.row-actions-menu \{ position: fixed/);
});
test('temporal states, HR and priority use central Italian badges',()=>{
 for(const [domain,status,label] of [['deadline','overdue','Scaduta'],['deadline','high','Alta'],['employee','terminated','Cessato'],['project','draft','Preparazione']]){
  assert.match(renderToStaticMarkup(React.createElement(StatusBadge,{domain,status})),new RegExp(label));
 }
});
test('all eight lists use shared density, status and secondary action patterns',()=>{
 for(const route of ['offerte','contratti','commesse','clienti','fornitori','pagamenti','personale','scadenze']){
  const source=read(`src/app/(portal)/${route}/page.tsx`);
  assert.match(source,/table-admin/,route);assert.match(source,/StatusBadge/,route);
  if(route!=='scadenze')assert.match(source,/RowActionsMenu/,route);
  if(!['clienti','fornitori'].includes(route))assert.match(source,/@\/lib\/formatters/,route);
 }
 assert.match(read('src/app/(portal)/loading.tsx'),/PageLoading/);
 assert.ok(!fs.existsSync(path.join(root,"src/app/'(portal)'")), 'commercial pages must inherit the portal route and loading');
});
test('deadline register has only seven columns and advanced controls live in collapsed toolbar',()=>{
 const source=read('src/app/(portal)/scadenze/page.tsx');
 const headers=[...source.matchAll(/<th(?: className="[^"]*")?>([^<]+)<\/th>/g)].map(m=>m[1]);
 assert.deepEqual(headers,['Scadenza','Descrizione','Soggetto','Commessa','Residuo','Stato','Priorità']);
 assert.match(source,/colSpan=\{7\}/);assert.doesNotMatch(source,/colSpan=\{11\}/);
 for(const key of ['from','to','entity','category','priority','company','project','assigned','archived'])assert.match(source,new RegExp("'"+key+"'"));
 assert.match(source,/d.kind==="payment"\|\|d.kind==="receipt"\?money/);
});
test('global rendered outputs do not introduce raw fixed decimals, currency concatenation or local Intl formatters',()=>{
 function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?walk(path.join(dir,f.name)):[path.join(dir,f.name)]);}
 for(const file of [...walk(path.join(root,'src/app')),...walk(path.join(root,'src/components'))].filter(f=>f.endsWith('.tsx'))){
  const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node){
   if(ts.isJsxExpression(node)&&node.expression&&!ts.isJsxAttribute(node.parent)){
    const expression=node.expression.getText(ast);
    if(!expression.includes('<'))assert.doesNotMatch(expression,/\.toFixed\(2\)|\.toLocaleString\(|new Intl\./,file);
   }
   ts.forEachChild(node,visit);
  }
  visit(ast);
 }
 const css=read('src/app/globals.css');assert.match(css,/\.col-date, \.col-money, \.col-status, \.col-code, \.badge \{ white-space: nowrap/);
 assert.match(css,/text-overflow: ellipsis/);assert.doesNotMatch(css,/\.table-admin \{ table-layout: fixed/);
});
