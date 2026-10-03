export interface OwnerAuthEnv { ACCESS_TEAM_DOMAIN?:string; ACCESS_AUD?:string }
const owner='manoosaki65@gmail.com';
const decode=(text:string)=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
let cached:{domain:string;expires:number;keys:JsonWebKey[]}|undefined;
export async function ownerUser(request:Request,env:OwnerAuthEnv):Promise<{email:string}|null>{
  if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD)return null;
  const domain=env.ACCESS_TEAM_DOMAIN.replace(/^https:\/\//,'').replace(/\/$/,'');
  if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain))return null;
  const token=request.headers.get('Cf-Access-Jwt-Assertion')||request.headers.get('Cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  if(!token)return null;
  try{
    const [header,payload,signature,extra]=token.split('.');if(!header||!payload||!signature||extra)return null;
    const h=JSON.parse(new TextDecoder().decode(decode(header))),claims=JSON.parse(new TextDecoder().decode(decode(payload))),now=Math.floor(Date.now()/1000);
    if(h.alg!=='RS256'||claims.iss!=='https://'+domain||!Array.isArray(claims.aud)||!claims.aud.includes(env.ACCESS_AUD)||!Number.isFinite(claims.exp)||claims.exp<=now||claims.nbf>now||String(claims.email||'').toLowerCase()!==owner)return null;
    if(!cached||cached.domain!==domain||cached.expires<Date.now()){
      const response=await fetch('https://'+domain+'/cdn-cgi/access/certs');if(!response.ok)return null;
      cached={domain,expires:Date.now()+300000,keys:((await response.json()) as {keys:JsonWebKey[]}).keys};
    }
    const jwk=cached.keys.find(k=>(k as JsonWebKey&{kid:string}).kid===h.kid);if(!jwk)return null;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(signature),new TextEncoder().encode(header+'.'+payload))?{email:owner}:null;
  }catch{return null;}
}
