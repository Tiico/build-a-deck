// THROWAWAY (läsbarhetsgranskning 2026-09-28). Kopia av run.ts på egna portar, med ett bord som
// har kort i alla publika ytor. Tas bort när granskningen är klar.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { TypeRegistry, STANDARD_TYPES } from '@byd/engine'
import { applyPatch } from '@byd/engine'
import { TableHost, createServer, MemoryLogStore, MemoryProjectStore, MemorySurveyStore, MemoryAuthStore, MemoryMailer, MemoryAssetStore } from '../../src/index.js'
import { MemoryRenderStore, Renderer, runWorker } from '@byd/render'
import { spelkortDoc } from '../spelkort.js'
import type { Intent } from '@byd/protocol'
const apiPort = Number(process.env['BYD_PROTO_API'] ?? 8319)
const webPort = Number(process.env['BYD_PROTO_WEB'] ?? 5319)
const seatCount = Number(process.env['BYD_PROTO_SEATS'] ?? 4)
const http = `http://localhost:${apiPort}`
const web = `http://localhost:${webPort}`
const out = process.argv[2] ?? '/tmp/byd-lasbarhet-links.json'
const registry = new TypeRegistry(STANDARD_TYPES)
const store = new MemoryLogStore()
const renders = new MemoryRenderStore()
const host = new TableHost(registry,store,undefined,renders)
const server = createServer({host,store,registry,renders,projects:new MemoryProjectStore(),surveys:new MemorySurveyStore(),auth:new MemoryAuthStore(),mailer:new MemoryMailer(),assets:new MemoryAssetStore(),authBypass:true,appOrigin:web})
await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(apiPort,'127.0.0.1',resolve)})
const renderer = await Renderer.launch()
void runWorker({store:renders,renderer,until:'forever',pollMs:150})
const login = await fetch(`${http}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'lasbarhet@example.com'})})
const cookie = (login.headers.get('set-cookie')??'').split(';')[0]!
const post = async (path:string,body:unknown) => {
  const res=await fetch(http+path,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify(body)})
  if(!res.ok)throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}
const doc=spelkortDoc(seatCount)
await post('/projects',{id:'lasbarhet',...doc})
const session=await post('/projects/lasbarhet/sessions',{})
const SEATS=([['A','Ada'],['B','Bo'],['C','Cy'],['D','Di'],['E','Eli'],['F','Fu'],['G','Gry'],['H','Hal']] as const).slice(0,seatCount)
const guests: Record<string,{token:string}> = {}
for (const [seat,name] of SEATS) guests[seat]=await post(`/rooms/${session.code}/join`,{seat,name})
type Seen = { zones: { id: string; order?: string[] }[]; components: { id: string; zone: string }[] }
let latest: Seen | null = null
const connect = async (query:string) => {
  const ws=new WebSocket(`${http.replace('http','ws')}/sessions/${session.id}?${query}`)
  await new Promise<void>((resolve,reject)=>{ws.addEventListener('message',e=>{const msg=JSON.parse(String(e.data));if(msg.t==='snapshot'){latest=msg.snapshot;resolve()}if(msg.t==='patch'&&latest)latest=applyPatch(latest as never,msg.patch) as unknown as Seen;if(msg.t==='refused')reject(new Error(msg.reason))});ws.addEventListener('error',()=>reject(new Error('Socket failed')))})
  return ws
}
let seq=0
const send=(ws:WebSocket,seat:string|null,intents:Intent[])=>new Promise<void>((resolve,reject)=>{
  const id=`proto-${seq++}`
  const listener=(event:MessageEvent)=>{const m=JSON.parse(String(event.data));if(m.id!==id)return;ws.removeEventListener('message',listener);m.t==='ack'?resolve():reject(new Error(JSON.stringify(m)))}
  ws.addEventListener('message',listener)
  ws.send(JSON.stringify({t:'envelope',envelope:{id,seat,intents}}))
})
const snapshot = async (): Promise<Seen> => { await new Promise((r)=>setTimeout(r,30)); if(!latest) throw new Error('no snapshot'); return latest }
const table=await connect(`host=${session.hostKey}`)
for (const [seat,name] of SEATS) await send(table,null,[{v:'seat.claim',seat,name}])
await send(table,null,[{v:'shuffle',pile:'draw'},{v:'deal',from:'draw',to:SEATS.map(([seat])=>`hand:${seat}`),each:7}])
await send(table,null,[{v:'draw',from:'draw',to:'market',count:4}])
const market=(await snapshot()).zones.find((z)=>z.id==='market') as {order:string[]}
await send(table,null,market.order.flatMap((id,i)=>[{v:'flip',component:id,face:'front'} as Intent,{v:'move',component:id,to:'market',x:20+i*125,y:16} as Intent]))
await send(table,null,[{v:'draw',from:'draw',to:'discard',count:3}])
const discard=(await snapshot()).zones.find((z)=>z.id==='discard') as {order:string[]}
await send(table,null,discard.order.map((id)=>({v:'flip',component:id,face:'front'}) as Intent))
// Ett kort framför varje plats, framsidan upp (C4: publik yta).
for (const [seat] of SEATS) {
  const mine=await connect(`seat=${seat}&token=${guests[seat]!.token}`)
  const hand=(await snapshot()).zones.find((z)=>z.id===`hand:${seat}`) as {order?:string[]}
  const top=hand.order?.[0] ?? (await snapshot()).components.find((c)=>c.zone===`hand:${seat}`)?.id
  if(!top) throw new Error(`no card in hand:${seat}`)
  await send(mine,seat,[{v:'move',component:top,to:`mine:${seat}`,x:20,y:10},{v:'flip',component:top,face:'front'}])
  mine.close()
}
await send(table,null,[{v:'draw',from:'draw',to:'table',count:2}])
const loose=(await snapshot()).components.filter((c)=>c.zone==='table').map((c)=>c.id)
await send(table,null,[{v:'move',component:loose[0]!,to:'table',x:520,y:570,rot:-6},{v:'flip',component:loose[0]!,face:'front'},{v:'move',component:loose[1]!,to:'table',x:630,y:580,rot:4},{v:'flip',component:loose[1]!,face:'front'}])
const ws=encodeURIComponent(http.replace('http','ws'))
const links={
  api:http, web, session:session.id, code:session.code, hostKey:session.hostKey, tokens:Object.fromEntries(Object.entries(guests).map(([s,g])=>[s,g.token])),
  editor:`${web}/editor?project=lasbarhet&server=${encodeURIComponent(http)}`,
  table:`${web}/table?session=${session.id}&mode=table&host=${encodeURIComponent(session.hostKey)}&code=${session.code}&server=${ws}`,
  tv:`${web}/table?session=${session.id}&mode=tv&host=${encodeURIComponent(session.hostKey)}&code=${session.code}&server=${ws}`,
  play:`${web}/play?session=${session.id}&seat=A&name=Ada&token=${guests['A']!.token}&code=${session.code}&server=${ws}`,
  online:`${web}/online?session=${session.id}&seat=B&name=Bo&token=${guests['B']!.token}&code=${session.code}&server=${ws}`,
  observe:`${web}/observe?session=${session.id}&host=${encodeURIComponent(session.hostKey)}&code=${session.code}&server=${ws}`,
}
writeFileSync(out,JSON.stringify(links,null,2))
const vite=spawn('pnpm',['--filter','@byd/web','dev'],{stdio:'inherit',env:{...process.env,PORT:String(webPort)}})
console.log(`\nLÄSBARHET · länkar i ${out}\n`)
const stop=async()=>{vite.kill('SIGTERM');table.close();server.close();await renderer.close();process.exit(0)}
process.on('SIGINT',()=>void stop())
process.on('SIGTERM',()=>void stop())
