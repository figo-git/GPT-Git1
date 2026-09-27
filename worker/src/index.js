const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}})
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
const fromB64=s=>{const b=s.replaceAll('-','+').replaceAll('_','/'),p='='.repeat((4-b.length%4)%4),r=atob(b+p);return Uint8Array.from(r,c=>c.charCodeAt(0))}
const uid=()=>crypto.randomUUID()
async function hashPassword(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},key,256);return b64(bits)}
async function makePassword(password){const salt=crypto.getRandomValues(new Uint8Array(16));return{salt:b64(salt),hash:await hashPassword(password,salt)}}
async function verifyPassword(password,r){return(await hashPassword(password,fromB64(r.salt)))===r.hash}
function cookies(request){const s=request.headers.get('Cookie')||'';return Object.fromEntries(s.split(';').filter(Boolean).map(x=>{const [k,...v]=x.trim().split('=');return[k,v.join('=')]}))}
function cookie(value,maxAge){return`session=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=None`}
function cors(env,request){const allowed=env.ALLOWED_ORIGIN;const origin=request.headers.get('Origin');const ok=origin&&origin===allowed;return{'Access-Control-Allow-Origin':ok?origin:allowed,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Vary':'Origin'}}
async function gh(env,path,options={}){return fetch(`https://api.github.com${path}`,{...options,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${env.GITHUB_GIST_TOKEN}`,'X-GitHub-Api-Version':env.GITHUB_API_VERSION||'2026-03-10','User-Agent':'GPT-Git1-Memo-Calendar',...(options.headers||{})}})}
async function userByEmail(env,email){return env.USERS.get(`email:${email}`,{type:'json'})}
async function session(env,request){const sid=cookies(request).session;if(!sid)return null;return env.USERS.get(`session:${sid}`,{type:'json'})}
async function getNotes(env,user){const r=await gh(env,`/gists/${user.gistId}`);if(!r.ok)throw new Error('无法读取 Gist');const j=await r.json();const f=j.files?.['notes.json'];if(!f)return{};if(f.truncated&&f.raw_url)return(await(await fetch(f.raw_url)).json()).notes||{};return JSON.parse(f.content||'{}').notes||{}}
async function saveNotes(env,user,notes){const body={description:`Memo Calendar data for ${user.email}`,files:{'notes.json':{content:JSON.stringify({version:1,updatedAt:new Date().toISOString(),notes})}}};const r=await gh(env,`/gists/${user.gistId}`,{method:'PATCH',body:JSON.stringify(body)});if(!r.ok)throw new Error('无法保存到 Gist')}
function validEmail(x){return/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(x)}

export default{async fetch(request,env){
  const headers=cors(env,request),url=new URL(request.url),path=url.pathname
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
  try{
    if(path==='/health')return json({ok:true},200,headers)
    if(path==='/auth/register'&&request.method==='POST'){
      const {email,password}=await request.json(),e=String(email||'').trim().toLowerCase()
      if(!validEmail(e))return json({error:'请输入有效邮箱'},400,headers)
      if(String(password||'').length<8)return json({error:'密码至少 8 位'},400,headers)
      if(await userByEmail(env,e))return json({error:'该邮箱已注册'},409,headers)
      const p=await makePassword(password)
      const gr=await gh(env,'/gists',{method:'POST',body:JSON.stringify({description:`Memo Calendar - ${e}`,public:false,files:{'notes.json':{content:JSON.stringify({version:1,updatedAt:new Date().toISOString(),notes:{}})}}})})
      if(!gr.ok)return json({error:'创建个人数据 Gist 失败'},502,headers)
      const gj=await gr.json(),u={id:uid(),email:e,salt:p.salt,hash:p.hash,gistId:gj.id,createdAt:new Date().toISOString()}
      await env.USERS.put(`email:${e}`,JSON.stringify(u))
      const sid=uid();await env.USERS.put(`session:${sid}`,JSON.stringify({userId:u.id,email:u.email,gistId:u.gistId}),{expirationTtl:2592000})
      return json({user:{email:u.email}},200,{...headers,'Set-Cookie':cookie(sid,2592000)})
    }
    if(path==='/auth/login'&&request.method==='POST'){
      const {email,password}=await request.json(),e=String(email||'').trim().toLowerCase(),u=await userByEmail(env,e)
      if(!u||!(await verifyPassword(String(password||''),u)))return json({error:'邮箱或密码错误'},401,headers)
      const sid=uid();await env.USERS.put(`session:${sid}`,JSON.stringify({userId:u.id,email:u.email,gistId:u.gistId}),{expirationTtl:2592000})
      return json({user:{email:u.email}},200,{...headers,'Set-Cookie':cookie(sid,2592000)})
    }
    if(path==='/auth/logout'&&request.method==='POST'){const sid=cookies(request).session;if(sid)await env.USERS.delete(`session:${sid}`);return json({ok:true},200,{...headers,'Set-Cookie':cookie('',0)})}
    if(path==='/auth/me'&&request.method==='GET'){const s=await session(env,request);if(!s)return json({error:'未登录'},401,headers);return json({user:{email:s.email},notes:await getNotes(env,s)},200,headers)}
    if(path==='/notes'&&request.method==='PUT'){const s=await session(env,request);if(!s)return json({error:'未登录'},401,headers);const {notes}=await request.json();if(!notes||typeof notes!=='object'||Array.isArray(notes))return json({error:'数据格式错误'},400,headers);await saveNotes(env,s,notes);return json({ok:true},200,headers)}
    return json({error:'Not Found'},404,headers)
  }catch(e){console.error(e);return json({error:e.message||'服务器错误'},500,headers)}
}}
