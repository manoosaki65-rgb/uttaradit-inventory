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
  delete:(path:string)=>request('DELETE',path),
};
export const auth={
  getUser:async()=>({email:'inventory-admin@uttaradit-hospital.local'} as {email?:string}|null),
  signIn:async(_options:unknown)=>({user:{email:'inventory-admin@uttaradit-hospital.local'}}),
};
