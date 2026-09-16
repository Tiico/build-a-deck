// Chosen phone design: A, Handen först. All actions remain local prototype stubs.
// Includes the round trip to the editor and direct discard from the private area.
import { useEffect, useState, type ReactNode } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { Texture } from '../../table/Texture.js'
import { PrototypeSwitcher } from '../../prototype/PrototypeSwitcher.js'
import './player-prototype.css'

export type PrototypeProgress = { flags: string[]; actions: number; hand: number }
export type PrototypeFeedback = { clarity: number; comment: string; flags: string[]; actions: number }
type Props = {
  view: Snapshot; faces: string; seat: string; embedded?: boolean
  onReturn?(): void; onComplete?(feedback: PrototypeFeedback): void; onProgress?(progress: PrototypeProgress): void
  renderFace?(card: VisibleComponentState): ReactNode
  cardTitle?(card: VisibleComponentState): string
}
export default function PlayerPrototype({ view, faces, seat, embedded, onReturn, onComplete, onProgress, renderFace, cardTitle }: Props) {
  const [stage,setStage] = useState<'play'|'feedback'|'sent'>('play')
  const [clarity,setClarity] = useState(0)
  const [comment,setComment] = useState('')
  const [flags,setFlags] = useState<string[]>([])
  const [personalOpen,setPersonalOpen] = useState(false)
  const [inspecting,setInspecting] = useState(false)
  const label = (c: VisibleComponentState) => cardTitle?.(c) ?? (c.cardRef ?? 'Kort').replaceAll('-', ' ')
  const initial = view.components.filter(c=>c.zone===`hand:${seat}`)
  const [hand,setHand] = useState(initial)
  const [mine,setMine] = useState(view.components.filter(c=>c.zone===`mine:${seat}`))
  const [selected,select] = useState(initial[0]?.id ?? '')
  const [points,setPoints] = useState(view.components.find(c=>c.zone===`counters:${seat}`)?.counter ?? 0)
  const [discard,setDiscard] = useState(0)
  const [draws,setDraws] = useState(0)
  const [overlay,setOverlay] = useState<'rules'|'flag'|null>(null)
  const [note,setNote] = useState('')
  const [events,setEvents] = useState<string[]>([])
  const [undo,setUndo] = useState<{hand:VisibleComponentState[];mine:VisibleComponentState[];points:number;discard:number;draws:number}|null>(null)
  useEffect(() => { onProgress?.({ flags, actions: events.length, hand: hand.length }) }, [flags, events, hand, onProgress])
  const name = view.seats.find(s=>s.id===seat)?.name ?? seat
  const counterName = view.components.find(c=>c.zone===`counters:${seat}`)?.cardRef ?? 'Poäng'
  const source = initial[0] ?? view.components.find(c=>c.cardRef!==null && c.type.id.startsWith('card.'))
  const drawZone = view.zones.find(z=>z.id==='draw')
  const stock = Math.max(0,(drawZone ? drawZone.mode === 'count' ? drawZone.count : drawZone.order.length : 0)-draws)
  const chosen = hand.find(c=>c.id===selected) ?? hand[0]
  const remember = () => setUndo({hand,mine,points,discard,draws})
  const say = (event: string) => setEvents(previous => [event,...previous])
  const draw = () => { if(!source || stock===0)return; remember(); const card={...source,id:`prototype-draw-${draws}`,zone:`hand:${seat}`};setHand([...hand,card]);select(card.id);setDraws(draws+1);say('Kortet ligger nu i handen och är valt.') }
  const play = (target:string) => { if(!chosen)return;remember();setHand(hand.filter(c=>c.id!==chosen.id));if(target==='Framför mig'){setMine([...mine,chosen]);setPersonalOpen(true)}else setDiscard(discard+1);setInspecting(false);say(`${label(chosen)} → ${target}`) }
  const back = () => { if(!undo)return;setHand(undo.hand);setMine(undo.mine);setPoints(undo.points);setDiscard(undo.discard);setDraws(undo.draws);setUndo(null);say('Senaste provhandlingen ångrades.') }
  const reset = () => {setHand(initial);setMine(view.components.filter(c=>c.zone===`mine:${seat}`));setPoints(view.components.find(c=>c.zone===`counters:${seat}`)?.counter??0);setDiscard(0);setDraws(0);setEvents([]);setUndo(null);setOverlay(null);select(initial[0]?.id??'');setStage('play');setClarity(0);setComment('');setFlags([]);setNote('');setInspecting(false);setPersonalOpen(false)}
  const picture = (c:VisibleComponentState) => <><div className="ux-playing-face">{renderFace ? renderFace(c) : <Texture c={c} faces={faces}/>}</div><span className="ux-card-name">{label(c)}</span></>
  const tools = <div className="ux-row"><button onClick={()=>setOverlay('rules')}>Regler</button><button onClick={()=>setOverlay('flag')}>⚑ Flagga</button></div>
  const score = <div className="ux-score"><button aria-label={`Minska ${counterName}`} onClick={()=>{remember();setPoints(points-1);say('Poäng −1')}}>−</button><span><strong>{points}</strong><small>{counterName.toUpperCase()}</small></span><button aria-label={`Öka ${counterName}`} onClick={()=>{remember();setPoints(points+1);say('Poäng +1')}}>+</button></div>
  const cards = <div className="ux-phone-cards" role="group" aria-label="Din hand">{hand.length?hand.map(c=><button key={c.id} aria-label={'Välj ' + label(c)} aria-pressed={chosen?.id===c.id} onClick={()=>select(c.id)}>{picture(c)}</button>):<div className="ux-empty"><h2>Din hand är tom</h2><p>Dra ett kort för att fortsätta.</p></div>}</div>
  const actions = <div className="ux-phone-actions"><p>{chosen?<>Valt: <strong>{label(chosen)}</strong></>:'Inget kort valt'}</p><button className="ux-read-card" disabled={!chosen} onClick={()=>setInspecting(true)}>Läs valt kort</button><div className="ux-row"><button className="ux-primary" disabled={!chosen} onClick={()=>play('Framför mig')}>Spela framför mig</button><button disabled={!chosen} onClick={()=>play('Kasthögen')}>Kasta</button></div></div>
  const personal = <div className="ux-phone-cards">{mine.length?mine.map(c=><div key={c.id}>{picture(c)}<button aria-label={'Ta upp ' + label(c)} onClick={()=>{remember();setMine(mine.filter(m=>m.id!==c.id));setHand([...hand,c]);select(c.id);say(`${label(c)} togs upp`)}}>Ta upp</button><button aria-label={'Kasta ' + label(c) + ' från Framför mig'} onClick={()=>{remember();setMine(mine.filter(m=>m.id!==c.id));setDiscard(discard+1);say(label(c)+' kastades från Framför mig till kasthögen.')}}>Kasta</button></div>):<p className="ux-muted">Inga kort framför dig. Spela ett kort hit från handen.</p>}</div>
  const feedback = <main className="ux-feedback ux-stack"><p className="ux-eyebrow">Efter speltestet</p><h2>Vad ska bli bättre?</h2><p>{embedded?'Ditt svar följer med tillbaka till testledarens lärdomar.':'Ditt provsvar visas här efter att du skickat det.'}</p><fieldset><legend>Hur tydligt var det vad du kunde göra?</legend><div className="ux-feedback-ratings">{[1,2,3,4,5].map(value=><button key={value} aria-pressed={clarity===value} onClick={()=>setClarity(value)}>{value}</button>)}</div><small>1 · otydligt — 5 · tydligt</small></fieldset><label>En sak du skulle ändra<textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Till exempel: visa vart mitt spelade kort tog vägen." /></label><p className="ux-muted">{flags.length} flaggade ögonblick följer med.</p><button className="ux-primary" disabled={!clarity} onClick={()=>{const answer={clarity,comment:comment.trim(),flags,actions:events.length};setStage('sent');onComplete?.(answer)}}>{embedded?'Skicka svar · tillbaka till lärdomar →':'Skicka svar →'}</button><button onClick={()=>setStage('play')}>← Tillbaka till spelet</button></main>
  return <div className="ux-proto ux-phone ux-phone-a"><div className="ux-phone-shell">
    {embedded && <div className="ux-role-return"><button onClick={onReturn}>← Till testledaren</button></div>}
    <header className="ux-phone-head"><div><small>DITT SPELBORD</small><h1>{name}<span> · {hand.length} kort</span></h1></div>{stage==='play'&&tools}</header>
    {stage==='feedback'?feedback:stage==='sent'?<main className="ux-feedback ux-stack"><h2>Tack, {name}!</h2><p>Ditt provsvar är klart. Tydlighet: {clarity}/5.</p><p>{comment}</p><button className="ux-primary" onClick={reset}>Prova ett nytt speltest</button></main>:<>
    <p className="ux-phone-hint">Välj → läs → spela. Du kan ångra varje provhandling.</p>
    <><div className="ux-row ux-between ux-phone-summary">{score}<button onClick={back} disabled={!undo}>↶ Ångra</button></div><main><div className="ux-row ux-between"><div><p className="ux-eyebrow">Handen först</p><h2>Dina kort</h2></div><button className="ux-primary" onClick={draw} disabled={!source||stock===0}>Dra 1 · {stock} kvar</button></div>{cards}{actions}<details className="ux-personal" open={personalOpen} onToggle={e=>setPersonalOpen(e.currentTarget.open)}><summary>Framför mig · {mine.length} kort</summary>{personal}</details></main></>    <div className="ux-phone-recent" role="status">{events[0]??'Välj ett kort för att börja.'}</div>
    <details className="ux-phone-log"><summary>Händelser · {events.length}</summary><ol>{events.map((e,i)=><li key={i}>{e}</li>)}</ol></details>
    <div className="ux-phone-finish"><button onClick={()=>{setStage('feedback');window.scrollTo({top:0})}}>Klar med testet · lämna feedback →</button></div></>}
    {!embedded && <details className="ux-state"><summary>Prototypens tillstånd</summary><pre>{JSON.stringify({variant:'A',seat,name,hand:hand.map(c=>c.cardRef),mine:mine.map(c=>c.cardRef),points,draws,discard,events,stage,clarity,comment,flags},null,2)}</pre></details>}
    {inspecting&&<div className="ux-proto-overlay" onKeyDown={e=>{if(e.key==='Escape'){setInspecting(false);setOverlay(null)}}}><section role="dialog" aria-modal="true" aria-label="Läs valt kort"><button autoFocus onClick={()=>setInspecting(false)}>Tillbaka till handen</button>{chosen&&picture(chosen)}<button className="ux-primary" disabled={!chosen} onClick={()=>play('Framför mig')}>Spela framför mig</button><button disabled={!chosen} onClick={()=>play('Kasthögen')}>Kasta</button></section></div>}
    {overlay&&<div className="ux-proto-overlay" onKeyDown={e=>{if(e.key==='Escape'){setInspecting(false);setOverlay(null)}}}><section role="dialog" aria-modal="true" aria-label={overlay==='rules'?'Regler i prototypen':'Flagga i prototypen'}><div className="ux-row ux-between"><h2>{overlay==='rules'?'Regler':'Flagga ögonblicket'}</h2><button autoFocus onClick={()=>setOverlay(null)}>Stäng</button></div>{overlay==='rules'?<><p className="ux-eyebrow">Exempeltext · inte spelets regelbok</p><p>Här öppnas den befintliga regelboken utan att lämna handen. Samma ingång behövs även i distansläget.</p><p>Prova att dra, spela framför dig, kasta och ångra. Prototypen avgör inga spelregler.</p></>:<><label>Vad hände?<textarea value={note} onChange={e=>setNote(e.target.value)} /></label><button className="ux-primary" onClick={()=>{setFlags([...flags,note.trim()||'Ögonblick utan kommentar']);say('Ögonblicket är flaggat och följer med till lärdomarna.');setNote('');setOverlay(null)}}>Spara i prototypen</button></>}</section></div>}
  </div>{!embedded && <PrototypeSwitcher variant="A" names={['Handen först · vald']} choose={()=>undefined} reset={reset}/>}</div>
}
