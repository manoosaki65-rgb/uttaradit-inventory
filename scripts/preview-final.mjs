// Local-only preview: same Pages handler, isolated in-memory SQLite, three synthetic rows.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRuntime} from './final-test-runtime.mjs';
const {onRequest,env,call}=createRuntime();
for(let i=1;i<=3;i++){
 const response=await call('POST','/api/current',{seq:i,item:'TEST รายการ '+i,unit:i===3?'หน่วย B':'หน่วย A',inventory:'69-9900'+i,keyed:'2026-09-'+String(7+i).padStart(2,'0'),day:i===3?11:10,month:9,year:69,category:'วัสดุทดสอบ',fund:'เงินทดสอบ',fundYear:'69',amount:i*1500,note:'ข้อมูลจำลอง Local เท่านั้น',officer:'เจ้าหน้าที่ '+i});if(response.status!==201)throw new Error(await response.text());
}
const root=path.resolve('dist'),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:5174');
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   const response=await onRequest({env,request:new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}:{} )})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(fs.readFileSync(file));
 }catch(e){res.writeHead(500);res.end(String(e));}
});server.listen(5174,'127.0.0.1',()=>console.log('Isolated Final preview: http://127.0.0.1:5174 (3 synthetic rows; no Cloudflare/D1 writes)'));
