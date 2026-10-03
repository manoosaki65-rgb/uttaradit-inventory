interface Env{DB:D1Database}
const CSV_URL="https://sdmntpraustraliaeast.oaiusercontent.com/files/00000000-39f8-81fa-8198-30483423419d/raw?se=2026-10-03T07%3A03%3A16Z&sp=r&sv=2026-02-06&sr=b&scid=36f81905-9212-5ee6-8788-023b13b10cf1&skoid=b7fc319f-b93c-4fac-ba5f-14fdc3f9209f&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skt=2026-10-03T01%3A24%3A47Z&ske=2026-10-04T01%3A24%3A47Z&sks=b&skv=2026-02-06&sig=4g7FUa4fUbr9Pk2VBgz6Gyseivq6WC9CaYHtrcXWVjI%3D";
function parseCSV(s:string){const out:string[][]=[];let row:string[]=[],v="",q=false;for(let i=0;i<s.length;i++){const c=s[i];if(q){if(c==='"'&&s[i+1]==='"'){v+='"';i++}else if(c==='"')q=false;else v+=c}else if(c==='"')q=true;else if(c===','){row.push(v);v=""}else if(c==='\n'){row.push(v.replace(/\r$/,""));out.push(row);row=[];v=""}else v+=c}if(v||row.length){row.push(v.replace(/\r$/,""));out.push(row)}return out}
const n=(x:any)=>{const v=Number(String(x??"").replace(/,/g,""));return Number.isFinite(v)?v:0};
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 try{
  const res=await fetch(CSV_URL);if(!res.ok)return Response.json({ok:false,error:"fetch csv "+res.status},{status:502});
  const rows=parseCSV(await res.text());const body=rows.slice(1).filter(r=>r.some(x=>String(x).trim()!==""));
  if(body.length!==4107)return Response.json({ok:false,error:"row count mismatch",found:body.length},{status:409});
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS inventory_backup_before_master_final AS SELECT * FROM inventory WHERE 0").run();
  await env.DB.prepare("DELETE FROM inventory_backup_before_master_final").run();
  await env.DB.prepare("INSERT INTO inventory_backup_before_master_final SELECT * FROM inventory").run();
  await env.DB.prepare("DROP INDEX IF EXISTS ux_inventory_no").run();
  await env.DB.prepare("DELETE FROM inventory").run();
  const sql=`INSERT INTO inventory(seq,item,unit,inventory_no,keyed,received_day,received_month,received_year,category,fund,fund_year,amount,note,officer,source,status)
  SELECT CAST(json_extract(value,'$[0]') AS INTEGER),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]'),json_extract(value,'$[4]'),CAST(json_extract(value,'$[5]') AS INTEGER),CAST(json_extract(value,'$[6]') AS INTEGER),CAST(json_extract(value,'$[7]') AS INTEGER),json_extract(value,'$[8]'),json_extract(value,'$[9]'),json_extract(value,'$[10]'),CAST(json_extract(value,'$[11]') AS REAL),json_extract(value,'$[12]'),json_extract(value,'$[13]'),'MASTER_ถึง_30กย2569','active' FROM json_each(?)`;
  for(let i=0;i<body.length;i+=250){const part=body.slice(i,i+250).map(r=>{let note=r[11]||"";let amount=n(r[10]);if(String(r[10]||"").trim()&&!Number.isFinite(Number(String(r[10]).replace(/,/g,"")))){note=(note+" "+r[10]).trim();amount=0}return [n(r[0]),r[1]||"",r[2]||"",r[3]||"",r[4]||"",n(r[5]),n(r[6]),n(r[7]),r[8]||"",r[9]||"",r[13]||"",amount,note,r[12]||""]});await env.DB.prepare(sql).bind(JSON.stringify(part)).run()}
  const c:any=await env.DB.prepare("SELECT COUNT(*) n, MIN(received_year*10000+received_month*100+received_day) mn, MAX(received_year*10000+received_month*100+received_day) mx FROM inventory WHERE status='active'").first();
  const d:any=await env.DB.prepare("SELECT COUNT(*) groups, COALESCE(SUM(c-1),0) extra FROM (SELECT inventory_no,COUNT(*) c FROM inventory WHERE inventory_no<>'' GROUP BY inventory_no HAVING c>1)").first();
  return Response.json({ok:true,sourceRows:body.length,liveCount:c.n,minDate:c.mn,maxDate:c.mx,duplicateGroups:d.groups,duplicateExtra:d.extra,backupTable:"inventory_backup_before_master_final"});
 }catch(e:any){return Response.json({ok:false,error:e?.message||String(e)},{status:500})}
}