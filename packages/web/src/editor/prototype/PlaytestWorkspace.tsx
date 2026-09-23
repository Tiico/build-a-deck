// Throwaway: three layouts, one complete local journey on the existing /editor route.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Snapshot } from '@byd/protocol'
import type { ProjectDoc, ProjectRow } from '../types.js'
import { CardPreview, type CardPreviewProps } from '../CardPreview.js'
import { previewIcons } from '../assets.js'
import { previewFonts } from '../fonts.js'
import PlayerPrototype, { type PrototypeFeedback, type PrototypeProgress } from '../../player/prototype/PlayerPrototype.js'
import { PrototypeSwitcher, usePrototypeVariant } from '../../prototype/PrototypeSwitcher.js'
import './workspace.css'

type Props = { doc: ProjectDoc; revision: number; http: string }
type Phase = 'Kort' | 'Förbered' | 'Speltest' | 'Lärdomar'
type TestRun = { number: number; revision: number; state: 'Planerat' | 'Pågår' | 'Avslutat'; goal: string; flags: string[]; rows: ProjectRow[]; feedback?: PrototypeFeedback }
const phases: Phase[] = ['Kort', 'Förbered', 'Speltest', 'Lärdomar']
const title = (row: ProjectRow) => String(row.fields['title'] ?? row.id)

function ProjectFace(props: Omit<CardPreviewProps, 'id' | 'scale'>) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(150)
  const id = 'ux-player-' + useId().replace(/[^a-z0-9]/gi, '')
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => { if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width) })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return <div className="ux-compiled-face" ref={ref}><CardPreview {...props} id={id} scale={width / (63 * 96 / 25.4)} /></div>
}

export default function PlaytestWorkspace({ doc, revision, http }: Props) {
  const [variant, choose] = usePrototypeVariant()
  const [phase, setPhase] = useState<Phase>('Kort')
  const [rows, setRows] = useState(() => structuredClone(doc.rows))
  const [selected, select] = useState(doc.rows[0]?.id ?? '')
  const [query, search] = useState('')
  const [goal, setGoal] = useState('Förstår spelarna vad de kan göra utan att fråga värden?')
  const [note, setNote] = useState('')
  const [notice, say] = useState('')
  const [followup, setFollowup] = useState('')
  const [playing, setPlaying] = useState(false)
  const [playerProgress, setPlayerProgress] = useState<PrototypeProgress>({ flags: [], actions: 0, hand: 5 })
  const [localRevision, setLocalRevision] = useState(revision)
  const [dirty, setDirty] = useState(false)
  const [history, setHistory] = useState<TestRun[]>([])
  const [run, setRun] = useState<TestRun>({ number: 1, revision, state: 'Planerat', goal: '', flags: [], rows: [] })
  const fonts = useMemo(() => previewFonts(doc, http), [doc, http])
  const icons = useMemo(() => previewIcons(doc, http), [doc, http])
  const filtered = rows.filter(r => (r.id + ' ' + Object.values(r.fields).join(' ')).toLowerCase().includes(query.toLowerCase()))
  const card = rows.find(r => r.id === selected) ?? rows[0]
  const count = rows.reduce((n, r) => n + Number(r.fields['antal'] ?? 1), 0)
  const go = (next: Phase) => { setPhase(next); say(''); window.scrollTo({ top: 0 }) }
  const reset = () => {
    setRows(structuredClone(doc.rows)); select(doc.rows[0]?.id ?? ''); search(''); setPhase('Kort')
    setRun({ number: 1, revision, state: 'Planerat', goal: '', flags: [], rows: [] }); setHistory([])
    setGoal('Förstår spelarna vad de kan göra utan att fråga värden?'); setNote(''); say(''); setFollowup('')
    setPlaying(false); setPlayerProgress({flags:[],actions:0,hand:5}); setDirty(false); setLocalRevision(revision)
  }
  const picture = (row: ProjectRow, scale = .48) => doc.template.faces['front'] ? <CardPreview id={'ux-card-' + row.id.replace(/[^a-z0-9]/gi, '-')} face={doc.template.faces['front']} row={row.fields} icons={icons} fonts={fonts} assetBase={http} scale={scale} /> : <span>{title(row)}</span>
  const prepare = () => { if (dirty) { setLocalRevision(localRevision + 1); setDirty(false) } go('Förbered') }
  const start = () => {
    setRun({ number: run.number, revision: localRevision, state: 'Pågår', goal: goal.trim(), flags: [], rows: structuredClone(rows) })
    setFollowup(''); setPlayerProgress({flags:[],actions:0,hand:Math.min(5,rows.length)}); go('Speltest')
  }
  const finish = (feedback?: PrototypeFeedback) => {
    setRun(current => ({ ...current, state: 'Avslutat', ...(feedback ? { feedback } : {}), flags: [...current.flags, ...(feedback?.flags ?? playerProgress.flags)] }))
    setPlaying(false); go('Lärdomar')
  }
  const nextTest = (observation = '') => {
    setHistory([...history, run]); setFollowup(observation)
    setRun({ number: run.number + 1, revision: localRevision, state: 'Planerat', goal: '', flags: [], rows: [] })
    setPlaying(false); setNote(''); search(''); go('Kort')
  }
  const flag = () => { if (!note.trim()) return; setRun({ ...run, flags: [...run.flags, note.trim()] }); setNote(''); say('Observationen följer med till lärdomarna.') }
  const saveCard = (key: string, value: string) => { setRows(rows.map(r => r.id === card?.id ? { ...r, fields: { ...r.fields, [key]: value } } : r)); setDirty(true) }
  const canVisit = (step: Phase) => step === 'Kort' || step === 'Förbered' || (step === 'Speltest' ? run.state === 'Pågår' : run.state === 'Avslutat')
  const nav = <nav className="ux-work-nav" aria-label="Arbetssteg">{phases.map((step, i) => <button key={step} disabled={!canVisit(step)} aria-current={phase === step ? 'step' : undefined} aria-pressed={phase === step} onClick={() => step === 'Förbered' ? prepare() : go(step)}><small>{i + 1}</small> {step}</button>)}</nav>
  const snapshot: Snapshot = useMemo(() => ({
    seq: 0, seat: 'A', floor: 'table', ended: false, played: false, undo: null, rewind: null,
    seats: doc.setup.seats.map((s, i) => ({ id: s, name: ['Ada', 'Bo', 'Cy'][i] ?? null, edge: null })),
    zones: [{ id: 'draw', kind: 'pile', name: 'Dra', geometry: { x: 0, y: 0, w: 0, h: 0, rot: 0 }, dynamic: false, mode: 'count', count: Math.max(0, run.rows.reduce((n, r) => n + Number(r.fields['antal'] ?? 1), 0) - Math.min(5, run.rows.length)) }],
    components: run.rows.slice(0, 5).map(r => ({ id: r.id, type: { id: 'card.standard.63x88', version: 1 }, zone: 'hand:A', face: 'front', x: 0, y: 0, rot: 0, cardRef: r.id })),
  }), [run.rows, doc.setup.seats])
  const cardList = <div className="ux-card-list">{filtered.length ? filtered.map(r => <button key={r.id} aria-pressed={card?.id === r.id} onClick={() => select(r.id)}><span>{title(r)}</span><small>× {Number(r.fields['antal'] ?? 1)}</small></button>) : <p>Inga kort matchar. <button onClick={() => search('')}>Visa alla kort</button></p>}</div>
  const editCard = card ? <div className="ux-card-edit ux-stack"><div className="ux-row ux-between"><h2>{title(card)}</h2><span className="ux-pill">× {Number(card.fields['antal'] ?? 1)} i leken</span></div><div className="ux-card-preview">{picture(card, .7)}</div><label>Kortnamn<input value={String(card.fields['title'] ?? card.id)} onChange={e => saveCard('title', e.target.value)} /></label><label>Korttext<textarea value={String(card.fields['body'] ?? '')} onChange={e => saveCard('body', e.target.value)} /></label><small>{dirty ? 'Ändrat inför nästa test.' : 'Välj ett kort att läsa eller justera.'} Ändringar stannar i prototypen.</small><button className="ux-primary" onClick={prepare}>Klart med korten · förbered test →</button></div> : <p>Det här spelet saknar kort.</p>
  const preparation = <div className="ux-stack"><div><p className="ux-eyebrow">Steg 2 · Förbered</p><h2>Vad vill du få svar på?</h2></div><label>Testfråga<textarea value={goal} onChange={e => setGoal(e.target.value)} /></label><div className="ux-test-facts"><div><strong>{doc.setup.seats.length}</strong><small>platser</small></div><div><strong>{count}</strong><small>kort</small></div><div><strong>{localRevision}</strong><small>revision</small></div></div><div className="ux-panel"><h3>Prova hela vägen själv</h3><p>Starta testet, spela som Ada och lämna ett svar. Du kommer sedan tillbaka hit för att förbättra nästa version.</p><small>Bo och Cy är exempelspelare. Inga inbjudningar skickas.</small></div><div className="ux-row"><button onClick={() => go('Kort')}>← Till korten</button><button className="ux-primary" disabled={!goal.trim() || rows.length === 0 || run.state !== 'Planerat'} onClick={start}>Starta speltest {run.number} →</button></div>{run.state !== 'Planerat' && <button onClick={() => go(run.state === 'Pågår' ? 'Speltest' : 'Lärdomar')}>Återgå till {run.state === 'Pågår' ? 'pågående test' : 'resultatet'} →</button>}</div>
  const liveFlags = [...run.flags, ...playerProgress.flags]
  const liveTest = <div className="ux-stack"><div><p className="ux-eyebrow">Steg 3 · Speltest {run.number} pågår</p><h2>Nu är det dags att spela</h2><p className="ux-muted">{run.goal}</p></div><div className="ux-session-seats"><span>Du provar som <strong>Ada</strong></span><span>Bo <small>exempelspelare</small></span><span>Cy <small>exempelspelare</small></span></div><button className="ux-primary" onClick={() => { setPlaying(true); window.scrollTo({ top: 0 }) }}>Prova som Ada →</button><p>Du får en hand från rev {run.revision}. När du är klar lämnar du feedback och kommer tillbaka till lärdomarna.</p><details><summary>Anteckna som testledare · {liveFlags.length} observationer</summary><div className="ux-stack"><label>Vad hände?<textarea value={note} onChange={e => setNote(e.target.value)} /></label><button disabled={!note.trim()} onClick={flag}>Lägg till observation</button><ul>{liveFlags.map((f, i) => <li key={i}>{f}</li>)}</ul></div></details><button onClick={() => finish()}>Avsluta utan spelarsvar</button></div>
  const observations = [...run.flags, ...(run.feedback?.comment ? [run.feedback.comment] : [])]
  const review = <div className="ux-stack"><div><p className="ux-eyebrow">Steg 4 · Test {run.number} avslutat · rev {run.revision}</p><h2>Vad ändrar vi till nästa gång?</h2><p className="ux-muted">{run.goal}</p></div>{run.feedback ? <div className="ux-panel"><h3>Ada har lämnat sitt svar</h3><p>Tydlighet: {run.feedback.clarity} av 5 · {run.feedback.actions} provhandlingar</p></div> : <p>Testet avslutades utan spelarsvar. Dina egna observationer finns kvar.</p>}{observations.map((f, i) => <article className="ux-panel ux-stack" key={i}><small>{i < run.flags.length ? 'Observation' : 'Adas förslag'} · rev {run.revision}</small><h3>{f}</h3><button className="ux-primary" onClick={() => nextTest(f)}>Ta med till nästa kortändring →</button></article>)}{observations.length === 0 && <div className="ux-notice">Inga observationer från det här testet. Du kan göra en ändring eller prova samma lek igen.</div>}<button onClick={() => nextTest()}>Förbered nästa test utan vald observation →</button></div>
  const testPanel = run.state === 'Planerat' ? preparation : run.state === 'Pågår' ? liveTest : review
  const cardsPanel = <div className="ux-work-cards"><div><label>Sök kort<input value={query} onChange={e => search(e.target.value)} /></label>{cardList}</div>{editCard}</div>
  const phasePanel = phase === 'Kort' ? cardsPanel : phase === 'Förbered' ? preparation : testPanel
  const heading = <header className="ux-work-head"><div><p className="ux-eyebrow">{playing ? 'Spelarvy · samma speltest' : 'build-your-deck / arbetsyta'}</p><h1>{doc.name}</h1></div><div className="ux-row"><span className="ux-pill">Test {run.number} · {run.state}</span><span className="ux-pill">rev {localRevision}{dirty ? ' · ändrat' : ''}</span></div></header>
  const context = <aside className="ux-context"><p className="ux-eyebrow">Du är här</p><h3>{phase}</h3><p>{phase === 'Kort' ? 'Läs eller ändra ett kort. Fortsätt sedan till förberedelsen.' : phase === 'Förbered' ? 'Välj en fråga och starta testet.' : phase === 'Speltest' ? 'Prova spelarvyn och lämna ett svar.' : 'Ta med en observation till nästa kortändring.'}</p><hr /><small>Testfråga</small><p>{run.state === 'Planerat' ? goal : run.goal}</p></aside>
  return <div className={'ux-proto ux-work ux-work-' + variant.toLowerCase()}>
    {heading}
    <div hidden={playing}>
      {followup && <div className="ux-followup"><strong>Med till nästa version</strong><p>{followup}</p><small>Från test {run.number - 1}. Välj kortet du vill förbättra nedan.</small></div>}
      {variant === 'A' ? <div className="ux-work-shell"><aside className="ux-work-sidebar">{nav}</aside><main>{phasePanel}</main>{context}</div>
        : variant === 'B' ? <><div className="ux-work-progress">{nav}</div><main className="ux-workbench"><div className="ux-workbench-cards"><h2>Kortbibliotek</h2><label>Sök kort<input value={query} onChange={e => search(e.target.value)} /></label>{cardList}</div><section className="ux-workbench-editor">{editCard}</section><aside className="ux-workbench-test">{phase === 'Kort' ? <div className="ux-stack"><h2>Från kort till speltest</h2><p>Läs eller justera kortet bredvid. Därefter bestämmer du vad testet ska ge svar på.</p><button onClick={prepare}>Till förberedelsen →</button></div> : phase === 'Förbered' ? preparation : testPanel}</aside></main></>
        : <main className="ux-test-first"><section className="ux-test-hero"><div><p className="ux-eyebrow">Test {run.number} · {run.state}</p><h2>{run.state === 'Planerat' ? goal : run.goal}</h2><p>{phase === 'Kort' ? 'Börja med leken till testet.' : phase === 'Förbered' ? 'Förbered frågan och deltagarna.' : phase === 'Speltest' ? 'Prova som spelare, kom tillbaka med en lärdom.' : 'Använd det ni lärde er till nästa version.'}</p></div>{nav}</section><div className="ux-test-columns"><section>{phase === 'Kort' ? <div className="ux-stack"><h2>Leken till testet</h2><label>Sök kort<input value={query} onChange={e => search(e.target.value)} /></label>{cardList}<button className="ux-primary" onClick={prepare}>Klart med leken · förbered test →</button></div> : phase === 'Förbered' ? preparation : testPanel}</section><aside className="ux-stack">{phase === 'Kort' ? editCard : <><h2>Leken · {count} kort</h2><div className="ux-contact-sheet">{rows.slice(0, 6).map(r => <button key={r.id} onClick={() => { select(r.id); go('Kort') }}>{picture(r, .42)}<span>{title(r)}</span></button>)}</div><small>Kortändringar påverkar nästa test. Pågående test behåller rev {run.revision}.</small></>}</aside></div></main>}
      {history.length > 0 && <details className="ux-run-history"><summary>Tidigare tester · {history.length}</summary>{history.map(h => <article key={h.number}><h3>Test {h.number} · rev {h.revision}</h3><p>{h.goal}</p><ul>{[...h.flags, ...(h.feedback?.comment ? [h.feedback.comment] : [])].map((f, i) => <li key={i}>{f}</li>)}</ul><small>{h.feedback ? 'Ada: tydlighet ' + h.feedback.clarity + '/5' : 'Inget spelarsvar'}</small></article>)}</details>}
    </div>
    {run.state !== 'Planerat' && <section hidden={!playing} className="ux-player-rehearsal"><PlayerPrototype key={run.number} view={snapshot} faces={http} seat="A" embedded onReturn={() => { setPlaying(false); go('Speltest') }} onComplete={finish} onProgress={setPlayerProgress} cardTitle={c => { const r = run.rows.find(r => r.id === c.cardRef); return r ? title(r) : 'Kort' }} renderFace={c => { const row = run.rows.find(r => r.id === c.cardRef); const face = doc.template.faces['front']; return row && face ? <ProjectFace face={face} row={row.fields} icons={icons} fonts={fonts} assetBase={http} /> : null }} /></section>}
    {notice && <p className="ux-work-toast" role="status">{notice}</p>}
    <details className="ux-state"><summary>Prototypens tillstånd · test {run.number} · {playing ? 'Spelarvy' : phase} · {liveFlags.length} observationer</summary><pre>{JSON.stringify({variant, phase, playing, playerProgress, revision:localRevision, dirty, selected, goal, followup, test:{...run, rows:run.rows.map(r=>r.id)}, history:history.map(h=>({...h,rows:h.rows.map(r=>r.id)}))}, null, 2)}</pre></details>
    <PrototypeSwitcher variant={playing ? 'A' : variant} names={playing ? ['Handen först · vald'] : ['Steg genom arbetsflödet', 'Kort och test sida vid sida', 'Speltest som projektets hem']} choose={choose} reset={reset} />
  </div>
}
