import {columns,validateRecord} from '../../server/inventory-record';
import {ownerUser,type OwnerAuthEnv} from '../../server/owner-auth';
interface Env extends OwnerAuthEnv{DB:D1Database}
const J=(x:any,s=200)=>Response.json(x,{status:s,headers:{'Cache-Control':'no-store'}});
const row=(r:any)=>({id:String(r.id),seq:r.seq,item:r.item,unit:r.unit,inventory:r.inventory_no,keyed:r.keyed,day:r.received_day,month:r.received_month,year:r.received_year,category:r.category,fund:r.fund,fundYear:r.fund_year,amount:r.amount,note:r.note,officer:r.officer});
const dateKey=(r:any)=>{const y=Number(r.year);return (y<100?2500+y:y<2400?543+y:y)*10000+Number(r.month)*100+Number(r.day)};
const keyedKey=(r:any)=>{const s=String(r.keyed||'');let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m){let y=+m[1];if(y<2400)y+=543;return y*10000+(+m[2])*100+(+m[3])}m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2500;else if(y<2400)y+=543;return y*10000+(+m[2])*100+(+m[1])};
function filter(all:any[],q:URLSearchParams){
 const text=(q.get('q')||'').trim().toLowerCase(), eq=(k:string,v:any)=>!q.get(k)||String(v??'').trim()===q.get(k), inc=(k:string,v:any)=>!q.get(k)||String(v??'').toLowerCase().includes((q.get(k)||'').toLowerCase());
 let a=all.filter(r=>(!text||Object.values(r).join(' ').toLowerCase().includes(text))&&inc('seq',r.seq)&&inc('item',r.item)&&eq('unit',r.unit)&&inc('inventory',r.inventory)&&inc('keyed',r.keyed)&&eq('day',r.day)&&eq('month',r.month)&&(!q.get('year')||String(Number(r.year)%100)===q.get('year'))&&eq('category',r.category)&&eq('fund',r.fund)&&eq('fundYear',r.fundYear)&&(!q.get('amount')||String(r.amount).includes((q.get('amount')||'').replace(/,/g,'')))&&inc('note',r.note)&&eq('officer',r.officer));
 a.sort((x,y)=>dateKey(x)-dateKey(y)||x.seq-y.seq); return a;
}
function pack(all:any[],items:any[],q:URLSearchParams){
 const u=(k:string)=>[...new Set(all.map((r:any)=>String(r[k]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));
 const pageSize=Math.min(5000,Math.max(1,Number(q.get('pageSize')||5000))),pages=Math.max(1,Math.ceil(items.length/pageSize)),page=Math.min(Math.max(1,Number(q.get('page')||pages)),pages);
 return {items:items.slice((page-1)*pageSize,page*pageSize),total:items.length,page,pages,masterTotal:all.length,source:'Master Inventory เดียว',filterOptions:{years:[...new Set(all.map((r:any)=>String(Number(r.year)%100)))].sort(),months:[...new Set(all.map((r:any)=>Number(r.month)))].filter(Boolean).sort((a,b)=>a-b),units:u('unit'),categories:u('category'),funds:u('fund'),fundYears:u('fundYear'),officers:u('officer')}};
}
async function allRows(env:Env){const x=await env.DB.prepare("SELECT * FROM inventory WHERE status='active' ORDER BY received_year,received_month,received_day,seq,id").all();return (x.results||[]).map(row)}
function validIso(s:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s}
export const onRequest:PagesFunction<Env>=async(c)=>{
 try{
  const req=c.request,u=new URL(req.url),p=u.pathname;
  if(req.method!=='GET'&&req.headers.get('Origin')&&req.headers.get('Origin')!==u.origin)return J({error:'ไม่อนุญาตคำขอจากเว็บไซต์อื่น'},403);
  if(req.method==='GET'&&p==='/api/_healthcheck'){await c.env.DB.prepare('SELECT 1 AS ok').first();return J({message:'Success',database:'D1',masterImportEnabled:false})}
  if(req.method==='GET'&&p==='/api/auth/session')return J({user:await ownerUser(req,c.env),configured:Boolean(c.env.ACCESS_TEAM_DOMAIN&&c.env.ACCESS_AUD)});
  if(req.method==='GET'&&p==='/api/admin/login'){
   if(!await ownerUser(req,c.env))return J({error:'ต้องยืนยันบัญชี manoosaki65@gmail.com ผ่าน Cloudflare Access'},403);
   return new Response('<!doctype html><html lang="th"><meta charset="utf-8"><title>ยืนยันเจ้าของบัญชี</title><p>ยืนยันเจ้าของบัญชีแล้ว</p><script>if(window.opener){window.opener.postMessage({type:"inventory-owner-login"},location.origin);window.close()}else{location.href="/"}</script>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }
  if(req.method==='POST'&&p==='/api/current'){
   let r;try{r=validateRecord(await req.json())}catch(e:any){return J({error:e.message},400)}
   const keys=Object.keys(columns);
   const result=await c.env.DB.prepare(`INSERT INTO inventory(${keys.map(k=>columns[k]).join(',')},source,status) VALUES(${keys.map(()=>'?').join(',')},'manual','active')`).bind(...keys.map(k=>r[k])).run();
   return J({ok:true,id:String(result.meta.last_row_id)},201);
  }
  if(req.method==='GET'&&(p==='/api/current'||p==='/api/print-range')){
   const all=await allRows(c.env);
   if(p==='/api/print-range'){const from=u.searchParams.get('from')||'',to=u.searchParams.get('to')||'';if(!validIso(from)||!validIso(to)||from>to||!['received','keyed'].includes(u.searchParams.get('basis')||'received'))return J({error:'ช่วงวันที่ไม่ถูกต้อง'},400);const cv=(s:string)=>{const [y,m,d]=s.split('-').map(Number);return (y+543)*10000+m*100+d};const f=cv(from),t=cv(to),basis=u.searchParams.get('basis');const items=all.filter(r=>{const k=basis==='keyed'?keyedKey(r):dateKey(r);return k!==null&&k>=f&&k<=t}).sort((a,b)=>(basis==='keyed'?(keyedKey(a)||0):dateKey(a))-(basis==='keyed'?(keyedKey(b)||0):dateKey(b))||a.seq-b.seq);return J(pack(all,items,new URLSearchParams()))}
   return J(pack(all,filter(all,u.searchParams),u.searchParams));
  }
  if(req.method==='POST'&&p==='/api/current/import'){
   const b:any=await req.json(),input=Array.isArray(b.rows)?b.rows:[];
   if(/master/i.test(String(b.source||''))||input.length>1000)return J({error:'พักขั้นตอนอัปเดต/เชื่อม Master ไว้ก่อน ยังไม่มีการบันทึกข้อมูล'},409);
   if(!input.length)return J({error:'ไม่พบรายการรายงานประจำวัน'},400);
   let records;try{records=input.map((r:any)=>validateRecord(r))}catch(e:any){return J({error:e.message},400)}
   if(new Set(records.map((r:any)=>r.inventory)).size!==records.length)return J({error:'รายงานมีเลข Inventory ซ้ำ กรุณาตรวจสอบก่อนบันทึก'},409);
   const snap=await c.env.DB.prepare("SELECT * FROM inventory WHERE status='active'").all(),existing=new Set((snap.results||[]).map((r:any)=>r.inventory_no));
   const keys=Object.keys(columns);
   const select=keys.map(k=>"json_extract(value,'$."+k+"')").join(',');
   const update=keys.filter(k=>k!=='inventory').map(k=>['fundYear','note','officer'].includes(k)?columns[k]+"=CASE WHEN excluded."+columns[k]+"='' THEN inventory."+columns[k]+" ELSE excluded."+columns[k]+" END":columns[k]+'=excluded.'+columns[k]).join(',');
   const sql='INSERT INTO inventory('+keys.map(k=>columns[k]).join(',')+",source,status) SELECT "+select+",?,'active' FROM json_each(?) WHERE true ON CONFLICT(inventory_no) WHERE inventory_no<>'' DO UPDATE SET "+update+',source=excluded.source,updated_at=CURRENT_TIMESTAMP';
   await c.env.DB.batch([c.env.DB.prepare('INSERT INTO import_batches(source_name,row_count,backup_json) VALUES(?,?,?)').bind(String(b.source||''),records.length,JSON.stringify(snap.results||[])),c.env.DB.prepare(sql).bind(String(b.source||''),JSON.stringify(records))]);
   const all=await allRows(c.env),updated=records.filter((r:any)=>existing.has(r.inventory)).length;
   return J({...pack(all,all,new URLSearchParams()),ok:true,added:records.length-updated,updated});
  }
  const m=p.match(/^\/api\/(?:admin\/)?current\/(\d+)$/);
  if(m&&req.method==='PUT'){
   const old:any=await c.env.DB.prepare("SELECT * FROM inventory WHERE id=? AND status='active'").bind(+m[1]).first();if(!old)return J({error:'ไม่พบรายการ'},404);
   const patch:any=await req.json();let r;try{r=validateRecord(patch,row(old))}catch(e:any){return J({error:e.message},400)}
   const keys=Object.keys(columns).filter(k=>k in patch);if(keys.length)await c.env.DB.prepare('UPDATE inventory SET '+keys.map(k=>columns[k]+'=?').join(',')+',updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(...keys.map(k=>r[k]),+m[1]).run();return J({ok:true});
  }
  if(m&&req.method==='DELETE'){
   if(!await ownerUser(req,c.env))return J({error:'สิทธิ์ลบกำหนดให้บัญชี manoosaki65@gmail.com ที่ยืนยันตัวตนแล้วเท่านั้น'},403);
   const old:any=await c.env.DB.prepare('SELECT * FROM inventory WHERE id=?').bind(+m[1]).first();if(!old)return J({error:'ไม่พบรายการ'},404);
   await c.env.DB.batch([c.env.DB.prepare("INSERT INTO inventory_deleted_archive(original_id,seq,item,unit,inventory_no,keyed,received_day,received_month,received_year,category,fund,fund_year,amount,note,officer,source,delete_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(old.id,old.seq,old.item,old.unit,old.inventory_no,old.keyed,old.received_day,old.received_month,old.received_year,old.category,old.fund,old.fund_year,old.amount,old.note,old.officer,old.source,'deleted by verified owner'),c.env.DB.prepare('DELETE FROM inventory WHERE id=?').bind(old.id)]);return J({ok:true,archived:true});
  }
  return J({error:'Not found'},404);
 }catch(e:any){if(String(e?.message||e).includes('UNIQUE constraint'))return J({error:'เลข Inventory นี้มีอยู่แล้ว กรุณาแก้ไขรายการเดิม'},409);return J({error:e?.message||String(e)},500)}
}
