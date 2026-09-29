// Same-origin Cloudflare API adapter for the existing Inventory UI.
type Data = Record<string, any>;
const normalize = (data: Data) => ({...data, ...(Array.isArray(data.items) ? {items:data.items.map((row: Data)=>({...row,id:String(row.id)}))} : {})});
async function request(method:string, path:string, body?:unknown):Promise<{data:Data}> {
  const response=await fetch(path,{method,headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  if(!response.ok) throw new Error('Cloudflare API '+response.status);
  return {data:normalize(await response.json())};
}
async function allCurrent() {
  const first=await request('GET','/api/current?page=1&pageSize=500');
  const items=[...first.data.items];
  for(let page=2;page<=first.data.pages;page++) items.push(...(await request('GET','/api/current?page='+page+'&pageSize=500')).data.items);
  return {...first.data,items};
}
export const api={
  async get(path:string) {
    // Master remains unavailable until its edit overlays can be migrated.
    if(path.startsWith('/api/print-range?')) {
      const params=new URLSearchParams(path.split('?')[1]);
      const from=params.get('from')||'',to=params.get('to')||'';
      const data=await allCurrent();
      const items=data.items.filter((row:Data)=>{
        let year=Number(row.year),month=Number(row.month),day=Number(row.day);
        if(params.get('basis')==='keyed') {
          const iso=String(row.keyed||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
          const slash=String(row.keyed||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
          if(iso){year=Number(iso[1]);month=Number(iso[2]);day=Number(iso[3]);}
          else if(slash){day=Number(slash[1]);month=Number(slash[2]);year=Number(slash[3]);}
          else return false;
        }
        year=year<100?year+1957:year>2400?year-543:year;
        const date=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
        return date>=from&&date<=to;
      });
      return {data:{items,total:items.length}};
    }
    return request('GET',path);
  },
  async post(path:string,body:Data) {
    if(path!=='/api/current/import')return request('POST',path,body);
    let added=0,updated=0;
    for(let i=0;i<body.rows.length;i+=200){
      const result=await request('POST',path,{...body,rows:body.rows.slice(i,i+200)});
      added+=result.data.added; updated+=result.data.updated;
    }
    const current=await allCurrent();
    return {data:{...current,added,updated,currentTotal:current.total}};
  },
  put:(path:string,body:unknown)=>request('PUT',path,body),
  delete:(path:string)=>request('DELETE',path)
};
