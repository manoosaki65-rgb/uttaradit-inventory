import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const source = fs.readFileSync('original/v77/src/App.tsx', 'utf8');
const backend = fs.readFileSync('original/v77/backend/index.ts', 'utf8');
const results = [];
const compile = code => ts.transpileModule(code, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const repair = source.slice(source.indexOf('const repairLegacyThai'), source.indexOf('const seed:'));
const process = source.slice(source.indexOf('  const processTestFiles ='), source.indexOf('  return (', source.indexOf('  const processTestFiles =')));
function file(path) { const data=fs.readFileSync(path); return {name:path.split(/[\\/]/).at(-1),arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)}; }
async function parse(files) {
  let captured=null, message='';
  const noop=()=>{};
  const context={XLSX,pdfjsLib,selectedFiles:files,console,api:{post:async(_path,body)=>{captured=body;return {data:{items:body.rows,total:body.rows.length,currentTotal:body.rows.length,added:0,updated:0}};}},setMsg:v=>message=v,setRows:noop,setTotal:noop,setPage:noop,setPages:noop,setPreviewMode:noop,setPrintRange:noop};
  vm.createContext(context);
  await vm.runInContext(compile(repair+'\n'+process+'\nprocessTestFiles();'),context);
  return {captured,message};
}
const root='C:/Users/ACER/Downloads/';
const excel=await parse([file(root+'Report 690910.xls')]);
assert(excel.captured?.rows.length>0,'Excel parser must produce rows');
const pdf=await parse([file(root+'Report 690910.pdf')]);
assert(pdf.captured?.rows.length>0,'PDF parser must produce rows');
const combined=await parse([file(root+'Report 690910.xls'),file(root+'Report 690910.pdf')]);
assert(combined.captured?.rows.length>0);
const xlsx=await parse([file(root+'Report inventory 690910.xlsx')]);
assert(xlsx.captured?.rows.length>0);
for(const [name,result] of [['Excel',excel],['XLSX',xlsx],['PDF',pdf],['Combined',combined]]) {
  const rows=result.captured.rows;
  assert(rows.every(r=>r.day===10&&r.month===9&&r.year===69));
  assert.equal(new Set(rows.map(r=>[r.seq,r.inventory,r.day,r.month,r.year].join('|'))).size,rows.length);
  results.push({name,count:rows.length,total:rows.reduce((s,r)=>s+r.amount,0),firstInventory:rows[0].inventory,lastInventory:rows.at(-1).inventory});
}
const excelKeys=new Set(excel.captured.rows.map(r=>r.seq+'|'+r.inventory));
const amountDifferences=excel.captured.rows.flatMap(r=>{const p=pdf.captured.rows.find(p=>p.seq===r.seq&&p.inventory===r.inventory);return p&&p.amount!==r.amount?[{inventory:r.inventory,excel:r.amount,pdf:p.amount}]:[];});
results.push({name:'Amount differences between original Excel/PDF parsers',items:amountDifferences});
const pdfOnly=pdf.captured.rows.filter(r=>!excelKeys.has(r.seq+'|'+r.inventory)).map(r=>r.inventory);
results.push({name:'Excel/PDF match',pdfOnly,excelOnly:excel.captured.rows.filter(r=>!pdf.captured.rows.some(p=>p.seq===r.seq&&p.inventory===r.inventory)).map(r=>r.inventory)});
const badName=await parse([{...file(root+'Report 690910.xls'),name:'report.xls'}]);
assert.equal(badName.captured,null);
assert(badName.message.includes('อ่านวันที่'));
results.push({name:'Missing filename date',passed:true});

// Exercise the exact frontend print handlers without opening a printer.
const printHandlers=source.slice(source.indexOf('  const printSavedRows='),source.indexOf('  const importFile ='));
const printHelpers=source.slice(source.indexOf('  const thaiMonths='),source.indexOf('  const reportDate ='));
let printCalls=0,printMessage='',preview=false;
const printContext={URLSearchParams,rows:combined.captured.rows,printBasis:'received',fromDate:'2026-09-10',toDate:'2026-09-10',dateBasis:'received',window:{print:()=>printCalls++,setTimeout:fn=>fn()},setMsg:v=>printMessage=v,setPrintBasis:()=>{},setPrintRange:()=>{},setPreviewMode:v=>preview=v,setRows:()=>{},setTotal:()=>{},setPage:()=>{},setPages:()=>{},setRangeOpen:()=>{},api:{get:async()=>({data:{items:combined.captured.rows}})}};
vm.createContext(printContext);
vm.runInContext(compile(repair+'\n'+printHelpers+'\n'+printHandlers),printContext);
vm.runInContext('printSavedRows()',printContext);
assert.equal(printCalls,0);assert(printMessage.includes('ปีแหล่งเงิน'));results.push({name:'Daily print blocks missing fundYear',passed:true});
printContext.rows=combined.captured.rows.map(r=>({...r,fundYear:'69'}));
vm.runInContext('printSavedRows()',printContext);
assert.equal(printCalls,1);assert.equal(preview,true);results.push({name:'Daily print calls original preview/print when complete',passed:true});
await vm.runInContext('printDateRange()',printContext);
assert.equal(printCalls,2);results.push({name:'Range print allows missing fundYear (original inconsistency)',passed:true});
printContext.fromDate='2026-09-11';printContext.toDate='2026-09-10';
await vm.runInContext('printDateRange()',printContext);
assert.equal(printCalls,2);results.push({name:'Reversed print range rejected',passed:true});

// Evaluate exact original route implementations against an in-memory DB.
const sf=ts.createSourceFile('backend.ts',backend,ts.ScriptTarget.Latest,true);
let routeObject;
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(sf)==='router')routeObject=node.arguments[0].getText(sf);ts.forEachChild(node,visit);} visit(sf);
const normalizers=backend.slice(backend.indexOf('const repairLegacyThai'),backend.indexOf('type CurrentRow'));
let rows=[], tables=new Map(), calls=[];
const db={list:async(table)=>({items:tables.get(table)||[]}),add:async(table,records)=>{calls.push(['add',table,records.length]);const saved=tables.get(table)||[];const ids=records.map((r,i)=>table+'-'+(saved.length+i));tables.set(table,[...saved,...records.map((r,i)=>({...r,id:ids[i]}))]);return ids;},update:async(table,records)=>{calls.push(['update',table,records.length]);tables.set(table,(tables.get(table)||[]).map(r=>({...r,...records.find(x=>x.id===r.id)?.record})));return records.map(()=>true);},delete:async(table,ids)=>{calls.push(['delete',table,ids.length]);tables.set(table,(tables.get(table)||[]).filter(r=>!ids.includes(r.id)));return ids.map(()=>true);}};
const context={console,Map,Set,Date,Buffer,db,json:data=>({status:200,data}),error:(message,status)=>({status,message}),router:r=>r,requireAuth:()=>()=>{},requireAdminEmailAllowlist:()=>()=>{},ADMIN_EMAILS:[],ensureCanonical14Sep:async()=>{},ensureOct1HospRepair:async()=>{},ensureFundYear69Backfill:async()=>{},loadUnifiedRows:async()=>rows};
vm.createContext(context);
const routes=vm.runInContext(compile(normalizers+'\nconst routes=router('+routeObject+');\nroutes;'),context);
const base={...combined.captured.rows[0],id:'existing',fundYear:'69'};
tables.set('inventory_current_v2',[base,{...base,id:'stale',inventory:'69-99999'}]);
const importResult=await routes['POST /api/current/import'][0]({body:{rows:[{...base,item:'ตรวจการ update'},{...base,inventory:'69-88888'}],source:'audit only'}});
assert.equal(importResult.status,200);assert.equal(importResult.data.added,1);assert.equal(importResult.data.updated,1);assert.equal(importResult.data.removed,1);
assert(calls.find(c=>c[1]==='inventory_deleted_archive_v1'));
results.push({name:'Original backend upsert and replace-day archive',passed:true,calls});
const tooMany=await routes['POST /api/current/import'][0]({body:{rows:Array(201).fill(base)}});
assert.equal(tooMany.status,400);results.push({name:'Original 200-row import limit',passed:true});
rows=[{...base,day:10,month:9,year:69,keyed:'10/09/2569 09:18'},{...base,id:'end',day:11,keyed:'2026-09-11 10:00'},{...base,id:'outside',day:12,keyed:'2026-09-12'}];
const received=await routes['GET /api/print-range'][0]({query:{from:'2026-09-10',to:'2026-09-11',basis:'received'}});
assert.equal(received.data.items.length,2);results.push({name:'Received range includes both endpoints',passed:true});
const keyed=await routes['GET /api/print-range'][0]({query:{from:'2026-09-10',to:'2026-09-11',basis:'keyed'}});
assert.equal(keyed.data.items.length,0);results.push({name:'Original keyed-date regex bug reproduced',returned:0,expected:2});
const filters=await routes['GET /api/current'][0]({query:{day:'10',month:'9',year:'69',pageSize:'5000'}});
assert.equal(filters.data.items.length,1);results.push({name:'Daily column filtering',passed:true});
fs.mkdirSync('audit',{recursive:true});
// Daily report only, kept as a review fixture, never loaded into a Master database.
fs.writeFileSync('audit/daily-rows.json',JSON.stringify(combined.captured.rows.map((r,i)=>({...r,id:'audit:'+i})),null,2));
fs.writeFileSync('audit/results.json',JSON.stringify({snapshot:'v77',noLiveApi:true,noMasterImported:true,results},null,2));
console.log(JSON.stringify(results,null,2));

