// THROWAWAY. One command for the UX comparison, with the real service and renderer.
// Dedicated loopback ports, synthetic data, no database, no email, no production writes.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { TypeRegistry, STANDARD_TYPES } from '@byd/engine'
import { TableHost, createServer, MemoryLogStore, MemoryProjectStore, MemorySurveyStore, MemoryAuthStore, MemoryMailer, MemoryAssetStore } from '../../src/index.js'
import { MemoryRenderStore, Renderer, runWorker } from '@byd/render'
import { spelkortDoc } from '../spelkort.js'
import type { Intent } from '@byd/protocol'
const http = 'http://localhost:8317'
const web = 'http://localhost:5317'
const registry = new TypeRegistry(STANDARD_TYPES)
const store = new MemoryLogStore()
const renders = new MemoryRenderStore()
const host = new TableHost(registry,store,undefined,renders)
const server = createServer({host,store,registry,renders,projects:new MemoryProjectStore(),surveys:new MemorySurveyStore(),auth:new MemoryAuthStore(),mailer:new MemoryMailer(),assets:new MemoryAssetStore(),authBypass:true,appOrigin:web})
await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(8317,'127.0.0.1',resolve)})
const renderer = await Renderer.launch()
void runWorker({store:renders,renderer,until:'forever',pollMs:150})
const login = await fetch(`${http}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'prototype@example.com'})})
const cookie = (login.headers.get('set-cookie')??'').split(';')[0]!
const post = async (path:string,body:unknown) => {
  const res=await fetch(http+path,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify(body)})
  if(!res.ok)throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}
const doc=spelkortDoc()
await post('/projects',{id:'ux-prototype',...doc})
const session=await post('/projects/ux-prototype/sessions',{})
const guest=await post(`/rooms/${session.code}/join`,{seat:'A',name:'Ada'})
const connect = async (query:string) => {
  const ws=new WebSocket(`${http.replace('http','ws')}/sessions/${session.id}?${query}`)
  await new Promise<void>((resolve,reject)=>{ws.addEventListener('message',e=>{const msg=JSON.parse(String(e.data));if(msg.t==='snapshot')resolve();if(msg.t==='refused')reject(new Error(msg.reason))});ws.addEventListener('error',()=>reject(new Error('Socket failed')))})
  return ws
}
let seq=0
const send=(ws:WebSocket,seat:string|null,intents:Intent[])=>new Promise<void>((resolve,reject)=>{
  const id=`proto-${seq++}`
  const listener=(event:MessageEvent)=>{const m=JSON.parse(String(event.data));if(m.id!==id)return;ws.removeEventListener('message',listener);m.t==='ack'?resolve():reject(new Error(JSON.stringify(m)))}
  ws.addEventListener('message',listener)
  ws.send(JSON.stringify({t:'envelope',envelope:{id,seat,intents}}))
})
const player=await connect(`seat=A&token=${guest.token}`)
await send(player,'A',[{v:'seat.claim',seat:'A',name:'Ada'}])
const table=await connect(`host=${session.hostKey}`)
await send(table,null,[{v:'seat.claim',seat:'B',name:'Bo'},{v:'seat.claim',seat:'C',name:'Cy'}])
await send(table,null,[{v:'shuffle',pile:'draw'},{v:'deal',from:'draw',to:['hand:A','hand:B','hand:C'],each:5}])
const editorUrl=`${web}/editor?project=ux-prototype&server=${encodeURIComponent(http)}&variant=A`
const playerUrl=`${web}/play?session=${session.id}&seat=A&name=Ada&token=${guest.token}&code=${session.code}&server=${encodeURIComponent(http.replace('http','ws'))}&variant=A`
// Local, disposable navigation manifest: useful when comparing from the browser tool.
writeFileSync('/private/tmp/byd-ux-prototype-links.json',JSON.stringify({editor:editorUrl,player:playerUrl,email:'prototype@example.com'},null,2))
const vite=spawn('pnpm',['--filter','@byd/web','dev'],{stdio:'inherit',env:{...process.env,PORT:'5317'}})
console.log(`\nPROTOTYPER · inga ändringar sparas\nEditor: ${editorUrl}\nLogga in som prototype@example.com när editorn ber om det.\nTelefon: ${playerUrl}\nByt A/B/C med pilknapparna längst ner. Ctrl+C stänger testmiljön.\n`)
const stop=async()=>{vite.kill('SIGTERM');player.close();table.close();server.close();await renderer.close();process.exit(0)}
process.on('SIGINT',()=>void stop())
process.on('SIGTERM',()=>void stop())
