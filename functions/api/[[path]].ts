interface Env{DB:D1Database}
const J=(x:any,s=200)=>Response.json(x,{status:s});
const row=(r:any)=>({id:String(r.id),seq:r.seq,item:r.item,unit:r.unit,inventory:r.inventory_no,keyed:r.keyed,day:r.received_day,month:r.received_month,year:r.received_year,category:r.category,fund:r.fund,fundYear:r.fund_year,amount:r.amount,note:r.note,officer:r.officer});
const dateKey=(r:any)=>((Number(r.year)<100?2500+Number(r.year):Number(r.year))*10000+Number(r.month)*100+Number(r.day));
const keyedKey=(r:any)=>{const s=String(r.keyed||'');let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m){let y=+m[1];if(y<2400)y+=543;return y*10000+(+m[2])*100+(+m[3])}m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2500;else if(y<2400)y+=543;return y*10000+(+m[2])*100+(+m[1])};
function filter(all:any[],q:URLSearchParams){
 const text=(q.get('q')||'').trim().toLowerCase(), eq=(k:string,v:any)=>!q.get(k)||String(v??'').trim()===q.get(k), inc=(k:string,v:any)=>!q.get(k)||String(v??'').toLowerCase().includes((q.get(k)||'').toLowerCase());
 let a=all.filter(r=>(!text||Object.values(r).join(' ').toLowerCase().includes(text))&&inc('seq',r.seq)&&inc('item',r.item)&&eq('unit',r.unit)&&inc('inventory',r.inventory)&&inc('keyed',r.keyed)&&eq('day',r.day)&&eq('month',r.month)&&(!q.get('year')||String(Number(r.year)%100)===q.get('year'))&&eq('category',r.category)&&eq('fund',r.fund)&&eq('fundYear',r.fundYear)&&inc('amount',r.amount)&&inc('note',r.note)&&eq('officer',r.officer));
 a.sort((x,y)=>dateKey(x)-dateKey(y)||x.seq-y.seq); return a;
}
function pack(all:any[],items:any[],q:URLSearchParams){
 const u=(k:string)=>[...new Set(all.map((r:any)=>String(r[k]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));
 const pageSize=Math.min(5000,Math.max(1,Number(q.get('pageSize')||5000))),pages=Math.max(1,Math.ceil(items.length/pageSize)),page=Math.min(Math.max(1,Number(q.get('page')||pages)),pages);
 return {items:items.slice((page-1)*pageSize,page*pageSize),total:items.length,page,pages,masterTotal:all.length,source:'Master Inventory เดียว',filterOptions:{years:[...new Set(all.map((r:any)=>String(Number(r.year)%100)))].sort(),months:[...new Set(all.map((r:any)=>Number(r.month)))].filter(Boolean).sort((a,b)=>a-b),units:u('unit'),categories:u('category'),funds:u('fund'),fundYears:u('fundYear'),officers:u('officer')}};
}
async function allRows(env:Env){const x=await env.DB.prepare("SELECT * FROM inventory WHERE status='active' ORDER BY received_year,received_month,received_day,seq,id").all();return (x.results||[]).map(row)}
export const onRequest:PagesFunction<Env>=async(c)=>{
 try{
  const req=c.request,u=new URL(req.url),p=u.pathname;
  if(req.method==='GET'&&p==='/api/_healthcheck')return J({message:'Success',database:'D1'});
  if(req.method==='GET'&&(p==='/api/current'||p==='/api/print-range')){
   const all=await allRows(c.env);
   if(p==='/api/print-range'){const from=u.searchParams.get('from')||'',to=u.searchParams.get('to')||'';if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return J({error:'ช่วงวันที่ไม่ถูกต้อง'},400);const cv=(s:string)=>{const [y,m,d]=s.split('-').map(Number);return (y+543)*10000+m*100+d};const f=cv(from),t=cv(to),basis=u.searchParams.get('basis');const items=all.filter(r=>{const k=basis==='keyed'?keyedKey(r):dateKey(r);return k!==null&&k>=f&&k<=t}).sort((a,b)=>(basis==='keyed'?(keyedKey(a)||0):dateKey(a))-(basis==='keyed'?(keyedKey(b)||0):dateKey(b))||a.seq-b.seq);return J(pack(all,items,new URLSearchParams()))}
   return J(pack(all,filter(all,u.searchParams),u.searchParams));
  }
  if(req.method==='POST'&&p==='/api/current/import'){
   const b:any=await req.json();const rows=Array.isArray(b.rows)?b.rows:[];if(!rows.length||rows.length>5000)return J({error:'นำเข้าได้ครั้งละ 1-5,000 รายการ'},400);
   const snap=await c.env.DB.prepare("SELECT * FROM inventory WHERE status='active'").all();await c.env.DB.prepare("INSERT INTO import_batches(source_name,row_count,backup_json) VALUES(?,?,?)").bind(String(b.source||''),rows.length,JSON.stringify(snap.results)).run();
   if(rows.length>1000){
     await c.env.DB.prepare("DELETE FROM inventory WHERE status='active'").run();
     let added=0;
     for(const r of rows){const inv=String(r.inventory||'').trim();if(!inv)continue;await c.env.DB.prepare("INSERT INTO inventory(seq,item,unit,inventory_no,keyed,received_day,received_month,received_year,category,fund,fund_year,amount,note,officer,source,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')").bind(r.seq||0,r.item||'',r.unit||'',inv,r.keyed||'',r.day||0,r.month||0,r.year||0,r.category||'',r.fund||'',r.fundYear||'',Number(r.amount||0),r.note||'',r.officer||'',String(b.source||'MASTER')).run();added++}
     const all=await allRows(c.env);return J({...pack(all,all,new URLSearchParams()),ok:true,added,updated:0});
   }
   let added=0,updated=0;for(const r of rows){const inv=String(r.inventory||'').trim();if(!inv)continue;const found:any=await c.env.DB.prepare("SELECT id FROM inventory WHERE inventory_no=? AND status='active' LIMIT 1").bind(inv).first();if(found){await c.env.DB.prepare("UPDATE inventory SET seq=?,item=?,unit=?,keyed=?,received_day=?,received_month=?,received_year=?,category=?,fund=?,fund_year=?,amount=?,note=?,officer=?,source=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(r.seq||0,r.item||'',r.unit||'',r.keyed||'',r.day||0,r.month||0,r.year||0,r.category||'',r.fund||'',r.fundYear||'',Number(r.amount||0),r.note||'',r.officer||'',String(b.source||''),found.id).run();updated++}else{await c.env.DB.prepare("INSERT INTO inventory(seq,item,unit,inventory_no,keyed,received_day,received_month,received_year,category,fund,fund_year,amount,note,officer,source,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')").bind(r.seq||0,r.item||'',r.unit||'',inv,r.keyed||'',r.day||0,r.month||0,r.year||0,r.category||'',r.fund||'',r.fundYear||'',Number(r.amount||0),r.note||'',r.officer||'',String(b.source||'')).run();added++}}
   return J({ok:true,added,updated});
  }
  const m=p.match(/^\/api\/current\/(\d+)$/);if(m&&req.method==='PUT'){const id=+m[1],b:any=await req.json();const map:any={seq:'seq',item:'item',unit:'unit',inventory:'inventory_no',keyed:'keyed',day:'received_day',month:'received_month',year:'received_year',category:'category',fund:'fund',fundYear:'fund_year',amount:'amount',note:'note',officer:'officer'};const sets=[],vals=[];for(const k in map)if(k in b){sets.push(map[k]+'=?');vals.push(b[k])}if(sets.length){vals.push(id);await c.env.DB.prepare('UPDATE inventory SET '+sets.join(',')+',updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(...vals).run()}return J({ok:true})}
  if(m&&req.method==='DELETE'){const id=+m[1],old:any=await c.env.DB.prepare('SELECT * FROM inventory WHERE id=?').bind(id).first();if(!old)return J({error:'ไม่พบรายการ'},404);await c.env.DB.prepare("INSERT INTO inventory_deleted_archive(original_id,seq,item,unit,inventory_no,keyed,received_day,received_month,received_year,category,fund,fund_year,amount,note,officer,source,delete_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(old.id,old.seq,old.item,old.unit,old.inventory_no,old.keyed,old.received_day,old.received_month,old.received_year,old.category,old.fund,old.fund_year,old.amount,old.note,old.officer,old.source,'deleted from final').run();await c.env.DB.prepare('DELETE FROM inventory WHERE id=?').bind(id).run();return J({ok:true,archived:true})}
  return J({error:'Not found'},404);
 }catch(e:any){return J({error:e?.message||String(e)},500)}
}