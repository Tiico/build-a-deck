// Three structurally different answers to: how does a creator move from cards to a useful playtest?
// Existing /editor?project=…&variant=A|B|C, real project read; all edits and sessions below are local stubs.
import { useMemo, useState } from 'react'
import type { ProjectDoc, ProjectRow } from '../types.js'
import { CardPreview } from '../CardPreview.js'
import { previewIcons } from '../assets.js'
import { previewFonts } from '../fonts.js'
import { PrototypeSwitcher, usePrototypeVariant } from '../../prototype/PrototypeSwitcher.js'
import './workspace.css'

type Props = { doc: ProjectDoc; revision: number; http: string }
type TestRun = { name: string; revision: number; state: 'Planerat' | 'Pågår' | 'Avslutat'; flags: string[] }
export default function PlaytestWorkspace({ doc, revision, http }: Props) {
  const [variant, choose] = usePrototypeVariant()
  const [phase, setPhase] = useState('Förbered')
  const [rows, setRows] = useState(() => structuredClone(doc.rows))
  const [selected, select] = useState(doc.rows[0]?.id ?? '')
  const [query, search] = useState('')
  const [goal, setGoal] = useState('Förstår spelarna vad de kan göra utan att fråga värden?')
  const [note, setNote] = useState('')
  const [notice, say] = useState('')
  const [run, setRun] = useState<TestRun>({ name: 'Kvällens speltest', revision, state: 'Planerat', flags: [] })
  const fonts = useMemo(() => previewFonts(doc, http), [doc, http])
  const icons = useMemo(() => previewIcons(doc, http), [doc, http])
  const filtered = rows.filter(r => `${r.id} ${Object.values(r.fields).join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  const card = rows.find(r => r.id === selected) ?? rows[0]
  const count = rows.reduce((n,r) => n + Number(r.fields['antal'] ?? 1),0)
  const reset = () => { setRows(structuredClone(doc.rows)); setRun({name:'Kvällens speltest', revision,state:'Planerat',flags:[]}); setPhase('Förbered'); setNote(''); say(''); search('') }
  const title = (row: ProjectRow) => String(row.fields['title'] ?? row.id)
  const picture = (row: ProjectRow, scale = .48) => doc.template.faces['front'] ? <CardPreview id={`ux-card-${row.id.replace(/[^a-z0-9]/gi,'-')}`} face={doc.template.faces['front']} row={{ ...row.fields }} icons={icons} fonts={fonts} assetBase={http} scale={scale} /> : <span>{title(row)}</span>
  const start = () => { setRun({...run,state:'Pågår'}); setPhase('Speltest'); say(`Simulerat bord startat från rev ${revision}. Det riktiga spelet är orört.`) }
  const finish = () => { setRun({...run,state:'Avslutat'}); setPhase('Lärdomar'); say('Simulerat speltest avslutat. Samla en konkret ändring inför nästa test.') }
  const flag = () => { if (!note.trim()) return; setRun({...run,flags:[...run.flags,note.trim()]}); setNote(''); say('Ögonblick tillagt i prototypen.') }
  const saveCard = (key: string,value: string) => setRows(rows.map(r=>r.id===card?.id?{...r,fields:{...r.fields,[key]:value}}:r))
  const cardList = <div className="ux-card-list">{filtered.map(r=><button key={r.id} aria-pressed={card?.id===r.id} onClick={()=>select(r.id)}><span>{title(r)}</span><small>× {Number(r.fields['antal'] ?? 1)}</small></button>)}</div>
  const editCard = card ? <div className="ux-card-edit ux-stack"><div className="ux-row ux-between"><h2>{title(card)}</h2><span className="ux-pill">× {Number(card.fields['antal'] ?? 1)} i leken</span></div><div className="ux-card-preview">{picture(card,.7)}</div><label>Kortnamn<input value={String(card.fields['title']??card.id)} onChange={e=>saveCard('title',e.target.value)} /></label><label>Korttext<textarea value={String(card.fields['body']??'')} onChange={e=>saveCard('body',e.target.value)} /></label><small>Ändringarna stannar i prototypen.</small></div>:<p>Det här spelet saknar kort.</p>
  const testPanel = <div className="ux-stack"><div className="ux-row ux-between"><h2>{run.name}</h2><span className="ux-pill">{run.state} · rev {run.revision}</span></div><label>Vad vill du lära dig?<textarea value={goal} onChange={e=>setGoal(e.target.value)} /></label><div className="ux-test-facts"><div><strong>{doc.setup.seats.length}</strong><small>platser</small></div><div><strong>{count}</strong><small>fysiska kort</small></div><div><strong>{run.flags.length}</strong><small>ögonblick</small></div></div>{run.state==='Planerat'?<button className="ux-primary" onClick={start}>Starta ett nytt speltest →</button>:run.state==='Pågår'?<><div className="ux-notice">Testet kör rev {run.revision}. Kortändringar förs inte över automatiskt.</div><label>Flagga ett ögonblick<textarea placeholder="Vad fastnade spelarna på?" value={note} onChange={e=>setNote(e.target.value)} /></label><button onClick={flag} disabled={!note.trim()}>Lägg till ögonblick</button><button onClick={finish}>Avsluta och samla lärdomar →</button></>:<button onClick={()=>{setRun({...run,state:'Planerat'});setPhase('Förbered')}}>Planera nästa test</button>}</div>
  const review = <div className="ux-stack"><p className="ux-eyebrow">Från observation till ändring</p><h2>Vad tar vi med oss?</h2><p className="ux-muted">{run.flags.length ? 'Dina simulerade observationer finns kvar när du byter variant.' : 'Inga egna observationer ännu. Starta testet och lägg till ett ögonblick.'}</p>{run.flags.map((f,i)=><article className="ux-panel" key={i}><small>Ögonblick {i+1} · rev {run.revision}</small><h3>{f}</h3><button onClick={()=>{setPhase('Kort');say('Observationen följer med till kortarbetet.')}}>Arbeta vidare med korten →</button></article>)}<div className="ux-sample"><small>ILLUSTRATION AV FRAMTIDA ÅTERKOPPLING · EJ INSAMLADE SVAR</small><h3>”Jag hittade inte reglerna.”</h3><p>Samla enkätsvar och flaggor här, kopplade till versionen som faktiskt spelades.</p></div></div>
  const heading = <header className="ux-work-head"><div><p className="ux-eyebrow">build-your-deck / arbetsyta</p><h1>{doc.name}</h1></div><div className="ux-row"><span className="ux-pill">rev {revision}</span><span className="ux-pill">{rows.length} unika · {count} kort</span></div></header>
  const nav = <nav className="ux-work-nav" aria-label="Arbetssteg">{['Kort','Förbered','Speltest','Lärdomar'].map(s=><button key={s} aria-pressed={phase===s} onClick={()=>setPhase(s)}>{s}</button>)}</nav>
  return <div className={`ux-proto ux-work ux-work-${variant.toLowerCase()}`}>
    {variant==='A' ? <>{heading}<div className="ux-work-shell"><aside className="ux-work-sidebar">{nav}<div className="ux-panel"><small>DITT NÄSTA STEG</small><h3>{run.state==='Planerat'?'Förbered ett spelbart test':run.state==='Pågår'?'Fånga det som händer':'Gör en ändring i taget'}</h3><p className="ux-muted">{goal}</p></div></aside><main>{phase==='Kort'?<div className="ux-work-cards"><div><label>Sök kort<input value={query} onChange={e=>search(e.target.value)} /></label>{cardList}</div>{editCard}</div>:phase==='Lärdomar'?review:testPanel}</main><aside className="ux-context"><p className="ux-eyebrow">Testet i fokus</p><h3>{run.name}</h3><p>{run.state} · rev {run.revision}</p><hr/><p className="ux-muted">Bordets uppställning hör till förberedelsen. Pågående bord och resultat får egna steg.</p><button onClick={()=>setPhase('Lärdomar')}>Öppna lärdomar</button></aside></div></>
    : variant==='B' ? <>{heading}<main className="ux-workbench"><div className="ux-workbench-cards"><div className="ux-row ux-between"><h2>Kortbibliotek</h2><span>{rows.length}</span></div><label>Sök kort<input value={query} onChange={e=>search(e.target.value)} /></label>{cardList}</div><section className="ux-workbench-editor">{editCard}</section><aside className="ux-workbench-test"><div className="ux-row"><button aria-pressed={phase!=='Lärdomar'} onClick={()=>setPhase('Speltest')}>Testbänk</button><button aria-pressed={phase==='Lärdomar'} onClick={()=>setPhase('Lärdomar')}>Lärdomar</button></div>{phase==='Lärdomar'?review:testPanel}</aside></main></>
    : <>{heading}<main className="ux-test-first"><section className="ux-test-hero"><div><p className="ux-eyebrow">Nästa fråga att besvara</p><h2>{goal}</h2><p>{run.name} · {doc.setup.seats.length} platser · rev {revision}</p></div><button className="ux-primary" onClick={()=>{if(run.state==='Avslutat'){setRun({...run,state:'Planerat'});setPhase('Förbered')}else{setPhase('Speltest');if(run.state==='Planerat')start()}}}>{run.state==='Planerat'?'Börja speltestet →':run.state==='Pågår'?'Fortsätt i testet →':'Planera nästa test →'}</button></section><div className="ux-test-columns"><section>{phase==='Lärdomar'?review:testPanel}</section><aside className="ux-stack"><div className="ux-row ux-between"><h2>Leken till testet</h2><button onClick={()=>setPhase(phase==='Kort'?'Förbered':'Kort')}>{phase==='Kort'?'Stäng redigering':'Justera ett kort'}</button></div>{phase==='Kort'?<>{cardList}{editCard}</>:<div className="ux-contact-sheet">{rows.slice(0,6).map(r=><button key={r.id} onClick={()=>{select(r.id);setPhase('Kort')}}>{picture(r,.42)}<span>{title(r)} · ×{Number(r.fields['antal'] ?? 1)}</span></button>)}</div>}<button onClick={()=>setPhase('Lärdomar')}>Se observationer och nästa ändring →</button></aside></div></main></>}
    {notice && <p className="ux-work-toast" role="status">{notice}</p>}
    <details className="ux-state" open><summary>Prototypens tillstånd · lokal simulering</summary><pre>{JSON.stringify({variant,phase,project:doc.name,revision,cards:rows.length,copies:count,selected:card?.id,test:run,goal},null,2)}</pre></details>
    <PrototypeSwitcher variant={variant} names={['Steg genom arbetsflödet','Kort och test sida vid sida','Speltest som projektets hem']} choose={choose} reset={reset}/>
  </div>
}
