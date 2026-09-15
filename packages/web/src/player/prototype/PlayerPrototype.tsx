// Three variants on /play?…&variant=A|B|C. The admitted snapshot is real; all actions here are stubs.
// Question: should the phone prioritise the hand, one card at a time, or named places on the table?
import { useState } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { Texture } from '../../table/Texture.js'
import { PrototypeSwitcher, usePrototypeVariant } from '../../prototype/PrototypeSwitcher.js'
import './player-prototype.css'

type Props = { view: Snapshot; faces: string; seat: string }
export default function PlayerPrototype({ view, faces, seat }: Props) {
  const [variant,choose] = usePrototypeVariant()
  const initial = view.components.filter(c=>c.zone===`hand:${seat}`)
  const [hand,setHand] = useState(initial)
  const [mine,setMine] = useState(view.components.filter(c=>c.zone===`mine:${seat}`))
  const [selected,select] = useState(initial[0]?.id ?? '')
  const [points,setPoints] = useState(view.components.find(c=>c.zone===`counters:${seat}`)?.counter ?? 0)
  const [discard,setDiscard] = useState(0)
  const [draws,setDraws] = useState(0)
  const [tab,setTab] = useState('Hand')
  const [overlay,setOverlay] = useState<'rules'|'flag'|null>(null)
  const [note,setNote] = useState('')
  const [events,setEvents] = useState<string[]>([])
  const [undo,setUndo] = useState<{hand:VisibleComponentState[];mine:VisibleComponentState[];points:number;discard:number;draws:number}|null>(null)
  const [where,setWhere] = useState('Min hand')
  const name = view.seats.find(s=>s.id===seat)?.name ?? seat
  const counterName = view.components.find(c=>c.zone===`counters:${seat}`)?.cardRef ?? 'Poäng'
  const source = initial[0] ?? view.components.find(c=>c.cardRef!==null && c.type.id.startsWith('card.'))
  const drawZone = view.zones.find(z=>z.id==='draw')
  const stock = Math.max(0,(drawZone ? drawZone.mode === 'count' ? drawZone.count : drawZone.order.length : 0)-draws)
  const chosen = hand.find(c=>c.id===selected) ?? hand[0]
  const remember = () => setUndo({hand,mine,points,discard,draws})
  const say = (event: string) => setEvents([event,...events])
  const draw = () => { if(!source || stock===0)return; remember(); const card={...source,id:`prototype-draw-${draws}`,zone:`hand:${seat}`};setHand([...hand,card]);select(card.id);setDraws(draws+1);say('Du drog 1 kort. Samma kända kortbild används som exempel.');setTab('Hand') }
  const play = (target:string) => { if(!chosen)return;remember();setHand(hand.filter(c=>c.id!==chosen.id));if(target==='Framför mig')setMine([...mine,chosen]);else setDiscard(discard+1);say(`${chosen.cardRef} → ${target}`) }
  const back = () => { if(!undo)return;setHand(undo.hand);setMine(undo.mine);setPoints(undo.points);setDiscard(undo.discard);setDraws(undo.draws);setUndo(null);say('Senaste provhandlingen ångrades.') }
  const reset = () => {setHand(initial);setMine(view.components.filter(c=>c.zone===`mine:${seat}`));setPoints(view.components.find(c=>c.zone===`counters:${seat}`)?.counter??0);setDiscard(0);setDraws(0);setEvents([]);setUndo(null);setOverlay(null);setTab('Hand');select(initial[0]?.id??'')}
  const picture = (c:VisibleComponentState) => <><div className="ux-playing-face"><Texture c={c} faces={faces}/></div><span className="ux-card-name">{(c.cardRef ?? 'Dolt kort').replaceAll('-', ' ')}</span></>
  const tools = <div className="ux-row"><button onClick={()=>setOverlay('rules')}>Regler</button><button onClick={()=>setOverlay('flag')}>⚑ Flagga</button></div>
  const score = <div className="ux-score"><button aria-label={`Minska ${counterName}`} onClick={()=>{remember();setPoints(points-1);say('Poäng −1')}}>−</button><span><strong>{points}</strong><small>{counterName.toUpperCase()}</small></span><button aria-label={`Öka ${counterName}`} onClick={()=>{remember();setPoints(points+1);say('Poäng +1')}}>+</button></div>
  const cards = <div className="ux-phone-cards" role="group" aria-label="Din hand">{hand.length?hand.map(c=><button key={c.id} aria-label={`Välj ${c.cardRef}`} aria-pressed={chosen?.id===c.id} onClick={()=>select(c.id)}>{picture(c)}</button>):<div className="ux-empty"><h2>Din hand är tom</h2><p>Dra ett kort för att fortsätta.</p></div>}</div>
  const actions = <div className="ux-phone-actions"><p>{chosen?<>Valt: <strong>{chosen.cardRef}</strong></>:'Inget kort valt'}</p><div className="ux-row"><button className="ux-primary" disabled={!chosen} onClick={()=>play('Framför mig')}>Spela framför mig</button><button disabled={!chosen} onClick={()=>play('Kasthögen')}>Kasta</button></div></div>
  const places = <div className="ux-place-list"><button className="ux-primary" onClick={draw} disabled={!source||stock===0}><strong>Dra 1 kort</strong><span>{stock} i draghögen</span></button><button onClick={()=>{setTab('Framför mig');setWhere('Framför mig')}}><strong>Framför mig</strong><span>{mine.length} kort · bara jag ser</span></button><button onClick={()=>{setWhere('Kasthögen');say(`${discard} kort har kastats i prototypen.`)}}><strong>Kasthögen</strong><span>{discard} kastade i prototypen</span></button></div>
  const personal = <div className="ux-phone-cards">{mine.length?mine.map(c=><div key={c.id}>{picture(c)}<button onClick={()=>{remember();setMine(mine.filter(m=>m.id!==c.id));setHand([...hand,c]);select(c.id);setTab('Hand');say(`${c.cardRef} togs upp`)}}>Ta upp</button></div>):<p className="ux-muted">Inga kort framför dig. Spela ett kort hit från handen.</p>}</div>
  return <div className={`ux-proto ux-phone ux-phone-${variant.toLowerCase()}`}><div className="ux-phone-shell">
    <header className="ux-phone-head"><div><small>DITT SPELBORD</small><h1>{name}<span> · {hand.length} kort</span></h1></div>{tools}</header>
    {variant==='A'?<><div className="ux-row ux-between ux-phone-summary">{score}<button onClick={back} disabled={!undo}>↶ Ångra</button></div><main><div className="ux-row ux-between"><div><p className="ux-eyebrow">Handen först</p><h2>Dina kort</h2></div><button className="ux-primary" onClick={draw} disabled={!source||stock===0}>Dra 1 · {stock} kvar</button></div>{cards}{actions}<details className="ux-personal"><summary>Framför mig · {mine.length} kort</summary>{personal}</details></main></>
    :variant==='B'?<><div className="ux-phone-browse"><button disabled={!hand.length} aria-label="Föregående kort" onClick={()=>select(hand[(hand.indexOf(chosen!)-1+hand.length)%hand.length]!.id)}>←</button><span>Kort {chosen?hand.indexOf(chosen)+1:0} av {hand.length}</span><button disabled={!hand.length} aria-label="Nästa kort" onClick={()=>select(hand[(hand.indexOf(chosen!)+1)%hand.length]!.id)}>→</button></div><main className="ux-single-card">{chosen?picture(chosen):<div className="ux-empty"><h2>Tom hand</h2><p>Dra ett kort nedanför.</p></div>}</main>{actions}<div className="ux-single-tray"><button className="ux-primary" onClick={draw} disabled={!source||stock===0}>Dra 1 kort</button>{score}<button onClick={back} disabled={!undo}>↶</button></div><details className="ux-personal"><summary>Framför mig · {mine.length} kort</summary>{personal}</details></>
    :<><nav className="ux-phone-tabs" aria-label="Spelarens områden">{['Hand','Bord','Framför mig'].map(s=><button key={s} aria-pressed={tab===s} onClick={()=>setTab(s)}>{s}{s==='Hand'?` (${hand.length})`:''}</button>)}</nav><main>{tab==='Bord'?<><p className="ux-eyebrow">Bordet genom namngivna platser</p><h2>Var vill du agera?</h2><p className="ux-muted">Dra från en hög. Spela till en plats. Reglerna avgör ni tillsammans.</p>{places}{score}<div className="ux-room-seats">{view.seats.map(s=><span key={s.id}>{s.name??'Ledig'}<small>Plats {s.id}</small></span>)}</div></>:tab==='Framför mig'?<><h2>Framför mig</h2>{personal}</>:<><div className="ux-row ux-between"><h2>Din hand</h2><button onClick={draw} disabled={!source||stock===0}>Dra 1 kort</button></div>{cards}{actions}</>}<button onClick={back} disabled={!undo}>↶ Ångra senaste handlingen</button></main></>}
    <div className="ux-phone-recent" role="status">{events[0]??'Välj ett kort och prova en handling. Alla ändringar är lokala.'}</div>
    <details className="ux-phone-log"><summary>Händelser · {events.length}</summary><ol>{events.map((e,i)=><li key={i}>{e}</li>)}</ol></details>
    <details className="ux-state" open><summary>Prototypens tillstånd</summary><pre>{JSON.stringify({variant,seat,name,hand:hand.map(c=>c.cardRef),mine:mine.map(c=>c.cardRef),points,draws,discard,where,events},null,2)}</pre></details>
    {overlay&&<div className="ux-proto-overlay"><section role="dialog" aria-modal="true" aria-label={overlay==='rules'?'Regler i prototypen':'Flagga i prototypen'}><div className="ux-row ux-between"><h2>{overlay==='rules'?'Regler':'Flagga ögonblicket'}</h2><button autoFocus onClick={()=>setOverlay(null)}>Stäng</button></div>{overlay==='rules'?<><p className="ux-eyebrow">Exempeltext · inte spelets regelbok</p><p>Här öppnas den befintliga regelboken utan att lämna handen. Samma ingång behövs även i distansläget.</p><p>Prova att dra, spela framför dig, kasta och ångra. Prototypen avgör inga spelregler.</p></>:<><label>Vad hände?<textarea value={note} onChange={e=>setNote(e.target.value)} /></label><button className="ux-primary" onClick={()=>{say(`Flaggat: ${note||'ögonblick utan kommentar'}`);setNote('');setOverlay(null)}}>Spara i prototypen</button></>}</section></div>}
  </div><PrototypeSwitcher variant={variant} names={['Handen först','Ett kort i taget','Hand och bordsplatser']} choose={choose} reset={reset}/></div>
}
