import React, {useEffect, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Solar} from 'lunar-javascript'
import './styles.css'

const API=(import.meta.env.VITE_API_BASE||'').replace(/\/$/,'')
const WEEK=['一','二','三','四','五','六','日']
const pad=n=>String(n).padStart(2,'0')
const keyOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const dateFromKey=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)}

function solarInfo(date){
  const s=Solar.fromDate(date), lunar=s.getLunar()
  return {
    lunarDay:lunar.getDayInChinese(),
    lunarMonth:lunar.getMonthInChinese(),
    festivals:[...(s.getFestivals?.()||[]),...(lunar.getFestivals?.()||[])],
    jieQi:lunar.getJieQi?.()||''
  }
}
async function api(path,options={}){
  if(!API) throw new Error('尚未配置 VITE_API_BASE')
  const r=await fetch(`${API}${path}`,{...options,credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})}})
  const data=await r.json().catch(()=>({}))
  if(!r.ok) throw new Error(data.error||'请求失败')
  return data
}

function Auth({onLogin}){
  const [mode,setMode]=useState('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  async function submit(e){
    e.preventDefault();setBusy(true);setError('')
    try{const d=await api(`/auth/${mode}`,{method:'POST',body:JSON.stringify({email,password})});onLogin(d.user)}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <main className="auth-shell"><section className="auth-card">
    <div className="brand-mark">✦</div><h1>时光备忘录</h1><p className="muted center">把每天值得记住的事，放进日历。</p>
    <form onSubmit={submit}>
      <label>邮箱<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label>
      <label>密码<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength="8" autoComplete={mode==='login'?'current-password':'new-password'}/></label>
      {error&&<div className="error">{error}</div>}
      <button className="primary wide" disabled={busy}>{busy?'处理中…':mode==='login'?'登录':'创建账户'}</button>
    </form>
    <button className="link-btn" onClick={()=>{setMode(mode==='login'?'register':'login');setError('')}}>{mode==='login'?'还没有账户？注册':'已有账户？登录'}</button>
  </section></main>
}

function Calendar({month,setMonth,selected,setSelected,notes}){
  const y=month.getFullYear(),m=month.getMonth(),first=new Date(y,m,1),offset=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate()
  const cells=Array.from({length:Math.ceil((offset+days)/7)*7},(_,i)=>{const n=i-offset+1;return n<1||n>days?null:new Date(y,m,n)})
  const shift=x=>setMonth(new Date(y,m+x,1))
  return <section className="calendar-card">
    <header className="calendar-head"><div><div className="month-title">{y}年 {m+1}月</div><div className="month-sub">农历 · 节日 · 节气</div></div>
      <div className="month-actions"><button onClick={()=>shift(-1)}>‹</button><button onClick={()=>setMonth(new Date())}>今天</button><button onClick={()=>shift(1)}>›</button></div>
    </header>
    <div className="week-row">{WEEK.map(w=><div key={w}>{w}</div>)}</div>
    <div className="grid">{cells.map((d,i)=>!d?<div className="cell empty" key={i}/>:(()=>{
      const k=keyOf(d),info=solarInfo(d),today=k===keyOf(new Date()),label=info.jieQi||info.festivals[0]||info.lunarDay
      return <button key={k} className={`cell ${today?'today':''} ${selected===k?'selected':''}`} onClick={()=>setSelected(k)}>
        <span className="solar-day">{d.getDate()}</span><span className="lunar-day">{label}</span>{notes[k]&&<span className="dot"/>}
      </button>
    })())}</div>
  </section>
}

function Editor({dateKey,note,onSave,onDelete}){
  const [title,setTitle]=useState(note?.title||''),[content,setContent]=useState(note?.content||'')
  useEffect(()=>{setTitle(note?.title||'');setContent(note?.content||'')},[dateKey,note])
  const d=dateFromKey(dateKey),info=solarInfo(d),special=[info.jieQi,...info.festivals].filter(Boolean)
  return <section className="editor">
    <div className="editor-date"><div className="big-date">{d.getDate()}</div><div><strong>{d.getFullYear()}年{d.getMonth()+1}月{d.getDate()}日</strong><div className="muted">{info.lunarMonth}月 · {info.lunarDay}{special.length?' · '+special.join(' / '):''}</div></div></div>
    <input className="title-input" placeholder="标题" value={title} onChange={e=>setTitle(e.target.value)}/>
    <textarea placeholder="写下今天要记住的事情…" value={content} onChange={e=>setContent(e.target.value)}/>
    <div className="editor-actions"><button className="primary" onClick={()=>onSave({title,content})}>保存</button>{note&&<button className="danger" onClick={onDelete}>删除</button>}</div>
  </section>
}

function App(){
  const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[month,setMonth]=useState(new Date(new Date().getFullYear(),new Date().getMonth(),1)),[selected,setSelected]=useState(keyOf(new Date())),[notes,setNotes]=useState({}),[sync,setSync]=useState('连接中…')
  useEffect(()=>{api('/auth/me').then(d=>{setUser(d.user);setNotes(d.notes||{});setSync('已同步')}).catch(()=>{}).finally(()=>setLoading(false))},[])
  async function save(n){const next={...notes};if(!n.title&&!n.content)delete next[selected];else next[selected]={...n,updatedAt:new Date().toISOString()};setNotes(next);setSync('同步中…');try{await api('/notes',{method:'PUT',body:JSON.stringify({notes:next})});setSync('已同步')}catch(e){setSync('同步失败');alert(e.message)}}
  async function del(){const next={...notes};delete next[selected];setNotes(next);setSync('同步中…');try{await api('/notes',{method:'PUT',body:JSON.stringify({notes:next})});setSync('已同步')}catch(e){setSync('同步失败')}}
  async function logout(){await api('/auth/logout',{method:'POST'});setUser(null)}
  if(loading)return <div className="loading">加载中…</div>
  if(!user)return <Auth onLogin={u=>{setUser(u);api('/auth/me').then(d=>setNotes(d.notes||{}))}}/>
  return <main className="app-shell"><header className="topbar"><div className="brand"><span>✦</span><strong>时光备忘录</strong></div><div className="account"><span>{user.email}</span><span className="sync">{sync}</span><button onClick={logout}>退出</button></div></header>
    <div className="layout"><Calendar month={month} setMonth={setMonth} selected={selected} setSelected={setSelected} notes={notes}/><Editor dateKey={selected} note={notes[selected]} onSave={save} onDelete={del}/></div>
  </main>
}
createRoot(document.getElementById('root')).render(<App/>)
