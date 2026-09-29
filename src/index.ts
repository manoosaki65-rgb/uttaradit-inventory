export interface Env { DB: D1Database; }
const J = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8'}});
const body = async (r: Request) => { try { return await r.json<any>(); } catch { return {}; } };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'GET' && path === '/api/_healthcheck') return J({message:'Success'});

    if (request.method === 'GET' && path === '/api/current') {
      const q = (url.searchParams.get('q') || '').trim();
      const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get('pageSize') || 100)));
      const page = Math.max(1, Number(url.searchParams.get('page') || 1));
      const where = q ? `WHERE status='active' AND (inventory_no LIKE ? OR item LIKE ? OR unit LIKE ? OR category LIKE ? OR fund LIKE ? OR note LIKE ? OR officer LIKE ?)` : `WHERE status='active'`;
      const args = q ? Array(7).fill(`%${q}%`) : [];
      const count = await env.DB.prepare(`SELECT COUNT(*) n FROM inventory ${where}`).bind(...args).first<{n:number}>();
      const rows = await env.DB.prepare(`SELECT id,seq,item,unit,inventory_no AS inventory,keyed,received_day AS day,received_month AS month,received_year AS year,category,fund,fund_year AS fundYear,amount,note,officer,source FROM inventory ${where} ORDER BY received_year,received_month,received_day,seq LIMIT ? OFFSET ?`).bind(...args,pageSize,(page-1)*pageSize).all();
      const total = count?.n || 0;
      return J({items:rows.results,total,page,pages:Math.max(1,Math.ceil(total/pageSize))});
    }

    if (request.method === 'POST' && path === '/api/current/import') {
      const b = await body(request); const rows = Array.isArray(b.rows) ? b.rows : [];
      if (!rows.length || rows.length > 200) return J({error:'invalid rows'},400);
      const snapshot = await env.DB.prepare(`SELECT * FROM inventory WHERE status='active'`).all();
      await env.DB.prepare(`INSERT INTO import_batches(source_name,row_count,backup_json) VALUES(?,?,?)`).bind(String(b.source||''),rows.length,JSON.stringify(snapshot.results)).run();
      let added=0, updated=0;
      for (const r of rows) {
        const inv=String(r.inventory||'').trim();
        const found = inv ? await env.DB.prepare(`SELECT id FROM inventory WHERE inventory_no=? LIMIT 1`).bind(inv).first<{id:number}>() : null;
        if (found) {
          await env.DB.prepare(`UPDATE inventory SET seq=?,item=?,unit=?,keyed=?,received_day=?,received_month=?,received_year=?,category=?,fund=?,fund_year=?,amount=?,note=?,officer=?,source=?,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(r.seq||0,r.item||'',r.unit||'',r.keyed||'',r.day||0,r.month||0,r.year||0,r.category||'',r.fund||'',r.fundYear||'',Number(r.amount||0),r.note||'',r.officer||'',b.source||'',found.id).run(); updated++;
        } else {
          await env.DB.prepare(`INSERT INTO inventory(seq,item,unit,inventory_no,keyed,received_day,received_month,received_year,category,fund,fund_year,amount,note,officer,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(r.seq||0,r.item||'',r.unit||'',inv,r.keyed||'',r.day||0,r.month||0,r.year||0,r.category||'',r.fund||'',r.fundYear||'',Number(r.amount||0),r.note||'',r.officer||'',b.source||'').run(); added++;
        }
      }
      return J({ok:true,added,updated});
    }

    const m = path.match(/^\/api\/current\/(\d+)$/);
    if (m && request.method === 'PUT') {
      const id=Number(m[1]); const old=await env.DB.prepare(`SELECT * FROM inventory WHERE id=?`).bind(id).first<any>();
      if(!old) return J({error:'not found'},404);
      const p=await body(request);
      const allowed:any={seq:'seq',item:'item',unit:'unit',inventory:'inventory_no',keyed:'keyed',day:'received_day',month:'received_month',year:'received_year',category:'category',fund:'fund',fundYear:'fund_year',amount:'amount',note:'note',officer:'officer',source:'source'};
      const sets:string[]=[]; const vals:any[]=[];
      for(const [k,c] of Object.entries(allowed)) if(k in p){sets.push(`${c}=?`); vals.push(p[k]);}
      if(!sets.length) return J({ok:true});
      vals.push(id); await env.DB.prepare(`UPDATE inventory SET ${sets.join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...vals).run(); return J({ok:true});
    }
    if (m && request.method === 'DELETE') {
      const id=Number(m[1]); const old=await env.DB.prepare(`SELECT * FROM inventory WHERE id=?`).bind(id).first<any>();
      if(!old) return J({error:'not found'},404);
      await env.DB.prepare(`INSERT INTO inventory_deleted_archive(original_id,seq,item,unit,inventory_no,keyed,received_day,received_month,received_year,category,fund,fund_year,amount,note,officer,source,delete_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(old.id,old.seq,old.item,old.unit,old.inventory_no,old.keyed,old.received_day,old.received_month,old.received_year,old.category,old.fund,old.fund_year,old.amount,old.note,old.officer,old.source,'deleted from current').run();
      await env.DB.prepare(`DELETE FROM inventory WHERE id=?`).bind(id).run(); return J({ok:true,archived:true});
    }

    return new Response('Not Found',{status:404});
  }
};