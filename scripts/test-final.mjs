import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {webcrypto} from 'node:crypto';
import {createRuntime} from './final-test-runtime.mjs';
const runtime=createRuntime(),{call,sqlite,env}=runtime;
const request=async(method,p,b,h)=>{const r=await call(method,p,b,h);return {status:r.status,data:await r.json()}};
const api={get:p=>request('GET',p),post:(p,b)=>request('POST',p,b),put:(p,b)=>request('PUT',p,b),delete:p=>request('DELETE',p)};
const {receivedDateFromData}=runtime.load('src/inventory-rules.ts');
const source=fs.readFileSync('src/App.tsx','utf8'),repair=source.slice(source.indexOf('const repairLegacyThai'),source.indexOf('const OWNER_EMAIL')),processFiles=source.slice(source.indexOf('  const processTestFiles ='),source.indexOf('  return (',source.indexOf('  const processTestFiles =')));
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const noop=()=>{};
function file(name){const bytes=fs.readFileSync('audit/fixtures/'+name);return {name,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}}
async function parse(files){let response,message,posts=0;const context={selectedFiles:files,receivedDateFromData,rangeLabel:()=>'',normalizeRow:r=>r,importBusy:{current:false},XLSX,pdfjsLib,console,api:{post:async(...args)=>{posts++;response=await api.post(...args);if(response.status>=400)throw new Error(response.data.error);return response}},setMsg:v=>message=v,setImporting:noop,setRows:noop,setTotal:noop,setPage:noop,setPages:noop,setPreviewMode:noop,setPrintRange:noop,setFilterOptions:noop};vm.createContext(context);await vm.runInContext(compile(repair+'\n'+processFiles+'\nprocessTestFiles();'),context);return {response,message,posts}}
const daily=[file('small-misleading-690101.xls'),file('small-no-date.xlsx'),file('small-misleading-690102.pdf')];
assert.equal((await parse([daily[0]])).response.data.added,3);
for(const input of [[daily[1]],[daily[2]],[daily[0],daily[2]]]){assert.equal((await parse(input)).response.data.added,0);assert.equal((await api.get('/api/current')).data.total,3)}
let rows=(await api.get('/api/current')).data.items;assert.deepEqual(rows.map(r=>r.day),[10,10,11]);assert(rows.every(r=>r.month===9&&r.year===69));assert.equal(rows.reduce((n,r)=>n+r.amount,0),7500);
for(const name of ['small-missing-date.xlsx','small-invalid-date.xlsx'])assert.equal((await parse([file(name)])).posts,0);
const fresh={...rows[0],seq:4,inventory:'69-99998',item:'New small test'};
assert.equal((await api.post('/api/current',fresh)).status,201);assert.equal((await api.post('/api/current',fresh)).status,409);
assert.equal((await api.put('/api/current/'+rows[0].id,{day:31,month:2})).status,400);assert.equal((await api.put('/api/current/99999',{note:'no'})).status,404);
await api.put('/api/current/'+rows[0].id,{fundYear:'69',officer:'Officer A',note:'Edited',amount:1500});
await api.put('/api/current/'+rows[1].id,{fundYear:'70',officer:'Officer B'});await api.put('/api/current/'+rows[2].id,{fundYear:'68',officer:'Officer C'});
rows=(await api.get('/api/current')).data.items;const r=rows[0];
for(const [key,value] of Object.entries({seq:r.seq,item:r.item,unit:r.unit,inventory:r.inventory,keyed:r.keyed,day:r.day,month:r.month,year:r.year,category:r.category,fund:r.fund,fundYear:r.fundYear,amount:'1,500',note:r.note,officer:r.officer}))assert((await api.get('/api/current?'+new URLSearchParams({[key]:String(value)}))).data.items.some(x=>x.id===r.id),key);
assert.equal((await api.get('/api/current?q=Edited')).data.total,1);
assert.equal((await api.get('/api/current?pageSize=2&page=1')).data.items.length,2);
assert.equal((await api.get('/api/print-range?from=2026-09-10&to=2026-09-10&basis=received')).data.total,3);
assert.equal((await api.get('/api/print-range?from=2026-09-08&to=2026-09-08&basis=keyed')).data.total,2);
assert.equal((await api.get('/api/print-range?from=2026-02-30&to=2026-03-01')).status,400);
assert.equal((await api.get('/api/print-range?from=2026-09-11&to=2026-09-10')).status,400);
const printCode=source.slice(source.indexOf('  const printSavedRows='),source.indexOf('  const importFile ='));
async function printCheck(input,range=false){let preview=false,message='',printed=[];const context={URLSearchParams,rows:input,api,fromDate:'2026-09-11',toDate:'2026-09-11',dateBasis:'received',rangeLabel:()=>'',formatIsoDate:s=>s,normalizeRow:r=>r,setMsg:v=>message=v,setPrintBasis:noop,setPrintRange:noop,setPreviewMode:v=>preview=v,setRows:v=>printed=v,setTotal:noop,setPage:noop,setPages:noop,setRangeOpen:noop};vm.createContext(context);await vm.runInContext(compile(printCode+'\n'+(range?'printDateRange();':'printSavedRows();')),context);return {preview,message,printed}}
assert.equal((await printCheck([{...r,fundYear:''}])).preview,false);assert.equal((await printCheck(rows.filter(r=>r.fundYear))).preview,true);assert.equal((await printCheck(rows,true)).printed.length,1);
const cancelCode=source.slice(source.indexOf('  const cancelReceived ='),source.indexOf('  const requestDelete ='));let closed=false;const cancelContext={api,load:async()=>{},page:1,q:'',setEdit:()=>closed=true,setCancelTarget:noop,setMsg:noop};vm.createContext(cancelContext);await vm.runInContext(compile(cancelCode+'\ncancelReceived('+JSON.stringify(r)+');'),cancelContext);assert(closed);assert((await api.get('/api/current?note='+encodeURIComponent('ยกเลิก'))).data.items.some(x=>x.id===r.id));
assert.equal((await api.delete('/api/current/'+r.id)).status,403);assert.equal((await request('DELETE','/api/current/'+r.id,undefined,{'Cf-Access-Authenticated-User-Email':'manoosaki65@gmail.com'})).status,403);
const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
runtime.setKeys([{...await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid:'local-test'}]);env.ACCESS_TEAM_DOMAIN='inventory-test.cloudflareaccess.com';env.ACCESS_AUD='local-test-audience';
async function token(patch={}){const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),h=encode({alg:'RS256',kid:'local-test'}),p=encode({iss:'https://'+env.ACCESS_TEAM_DOMAIN,aud:[env.ACCESS_AUD],exp:Math.floor(Date.now()/1000)+300,email:'manoosaki65@gmail.com',...patch}),sig=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(h+'.'+p));return h+'.'+p+'.'+Buffer.from(sig).toString('base64url')}
for(const claims of [{email:'other@example.com'},{aud:['wrong']},{exp:1}])assert.equal((await request('DELETE','/api/current/'+r.id,undefined,{'Cf-Access-Jwt-Assertion':await token(claims)})).status,403);
const ownerHeaders={'Cf-Access-Jwt-Assertion':await token()};assert.equal((await request('GET','/api/auth/session',undefined,ownerHeaders)).data.user.email,'manoosaki65@gmail.com');
sqlite.exec("CREATE TRIGGER protect_test BEFORE DELETE ON inventory BEGIN SELECT RAISE(ABORT,'test rollback'); END;");assert.equal((await request('DELETE','/api/current/'+r.id,undefined,ownerHeaders)).status,500);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM inventory_deleted_archive').get().n,0);assert.equal((await api.get('/api/current')).data.total,4);
// Remove a test-only trigger; no D1 schema or live data is used.
sqlite.exec('DROP TRIGGER protect_test');assert.equal((await request('DELETE','/api/current/'+r.id,undefined,ownerHeaders)).status,200);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM inventory_deleted_archive').get().n,1);assert.equal((await api.get('/api/current')).data.total,3);
const original=fs.readFileSync('original/v77/src/App.tsx','utf8'),report=s=>s.slice(s.indexOf('<div className="print-only print-pages">'),s.indexOf('</section>',s.indexOf('<div className="print-only print-pages">'))+10);assert.equal(report(source),report(original));assert.equal(fs.readFileSync('src/index.css','utf8'),fs.readFileSync('original/v77/src/index.css','utf8'));
const result={passed:true,fixtureRows:3,masterUsed:false,productionWrites:false,add:true,edit:true,cancel:true,ownerOnlyDelete:true,archiveRollback:true,search:true,filters:14,dailyImport:['xls','xlsx','pdf','combined'],dateFromContents:true,repeatImport:true,dailyPreview:true,historicalPreview:true,originalPrintUnchanged:true};fs.writeFileSync('audit/final-structure-test-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
