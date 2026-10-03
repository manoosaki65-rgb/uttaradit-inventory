import type { InventoryRow } from './inventory-rules';

async function request(method:string,path:string,body?:unknown){
  const res=await fetch(path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>({error:'ระบบตอบกลับไม่ถูกต้อง'}));
  if(!res.ok) throw new Error(data?.error||('HTTP '+res.status));
  return {data};
}
export const api={
  get:(path:string)=>request('GET',path),
  post:(path:string,body:unknown)=>request('POST',path,body),
  put:(path:string,body:Partial<InventoryRow>)=>request('PUT',path,body),
  delete:(path:string)=>request('DELETE',path.replace('/api/current/','/api/admin/current/')),
};
export const auth={
  getUser:async()=>((await request('GET','/api/auth/session')).data.user as {email?:string}|null),
  signIn:async(_options:unknown):Promise<{user:{email?:string}}>=>{
    const session=(await request('GET','/api/auth/session')).data;
    if(session.user)return {user:session.user};
    if(!session.configured)throw new Error('ยังไม่ได้ผูก Login เจ้าของบัญชีบน Cloudflare — สิทธิ์ลบยังถูกป้องกันไว้');
    const popup=window.open('/api/admin/login','inventory-owner-login','width=520,height=680');
    if(!popup)throw new Error('กรุณาอนุญาตหน้าต่าง Login แล้วลองใหม่');
    return new Promise((resolve,reject)=>{
      const timer=window.setTimeout(()=>{cleanup();reject(new Error('หมดเวลายืนยันเจ้าของบัญชี'))},120000);
      const cleanup=()=>{window.clearTimeout(timer);window.removeEventListener('message',done)};
      const done=async(event:MessageEvent)=>{
        if(event.origin!==window.location.origin||event.source!==popup||event.data?.type!=='inventory-owner-login')return;
        cleanup();try{const user=await auth.getUser();if(!user)throw new Error('ยังยืนยันเจ้าของบัญชีไม่ได้');resolve({user})}catch(e){reject(e)}
      };
      window.addEventListener('message',done);
    });
  },
};
