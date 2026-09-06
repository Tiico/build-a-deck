import { useMemo, useState } from 'react'
import { CardPreview } from '../editor/CardPreview.js'
import { loginUrl, withCredentials } from '../account/api.js'
import { parseCsv } from './csv.js'
import { buildProject, type WizardState } from './build.js'
import { DEFAULT_FIELDS, DEFAULT_FRAME, FRAMES, type Field } from './frames.js'
import './wizard.css'

export type NewProjectPageProps = { onNavigate?(url: string): void }

const SAMPLE_CSV = `title,cost,body
Drake,5,Flygande. När Drake anfaller: gör 2 skada på alla motståndare.
Riddare,3,Sköld 1. Kostar 1 mindre om du kontrollerar ett **Torn**.
Trollkarl,2,När du spelar Trollkarl: dra ett kort.
Tjuv,1,Ta ett slumpmässigt kort från en motståndares hand.`
const SAMPLE_ROW = { title: 'Drake', cost: '5', body: 'Flygande. När Drake anfaller: gör 2 skada på alla motståndare.' }

// /new?server=http://…  — the wizard (L6), one page with a live card (prototype answer B).
// It produces exactly the document the editor edits, then hands off to the editor or a table.
export function NewProjectPage({ onNavigate = (url) => location.assign(url) }: NewProjectPageProps) {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const server = params.get('server')
  const http = server ?? location.origin
  const [s, setS] = useState<WizardState>({ name: '', players: 2, fields: DEFAULT_FIELDS, frame: 'classic', rows: [] })
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const frame = FRAMES.find((f) => f.id === s.frame) ?? DEFAULT_FRAME
  const ready = s.name.trim().length > 0 && s.rows.length > 0 && s.fields.length > 0
  const front = useMemo(() => frame.front(s.fields), [frame, s.fields])
  const first = s.rows[0] ?? SAMPLE_ROW

  const suffix = (q: URLSearchParams) => {
    if (server) q.set('server', server)
    return q.toString()
  }
  const create = async () => {
    const res = await fetch(`${http}/projects`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildProject(s)) }))
    if (res.status === 401) {
      // Not logged in (G1): to the login card and back to the wizard after.
      onNavigate(loginUrl(location.pathname + location.search, server))
      throw new Error('logga in först')
    }
    if (!res.ok) throw new Error(`kunde inte skapa projektet: ${res.status}`)
    return ((await res.json()) as { id: string }).id
  }
  const toEditor = async () => {
    setBusy('editor')
    try {
      const id = await create()
      onNavigate(`/editor?${suffix(new URLSearchParams({ project: id }))}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }
  const toTable = async () => {
    setBusy('table')
    try {
      const id = await create()
      const res = await fetch(`${http}/projects/${encodeURIComponent(id)}/sessions`, withCredentials({ method: 'POST' }))
      if (!res.ok) throw new Error(`kunde inte starta bordet: ${res.status}`)
      const { id: session } = (await res.json()) as { id: string }
      const q = new URLSearchParams({ session, mode: 'tv' })
      if (server) q.set('server', server.replace(/^http/, 'ws'))
      onNavigate(`/table?${q.toString()}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }
  const setFields = (fields: Field[]) => setS({ ...s, fields })

  return (
    <div className="byd-wizard" data-page="new">
      <main>
        <h1>Nytt spel</h1>
        <section>
          <h2><span>1</span>Namn</h2>
          <input aria-label="Namn" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="Skogens herrar" />
        </section>
        <section>
          <h2><span>2</span>Spelare</h2>
          <div className="byd-wizard-players">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} type="button" aria-pressed={s.players === n ? 'true' : 'false'} onClick={() => setS({ ...s, players: n })}>{n}</button>
            ))}
          </div>
          <p>Ger {s.players} platser med varsin hand. Går att ändra senare.</p>
        </section>
        <section>
          <h2><span>3</span>Fält på kortet</h2>
          <div className="byd-wizard-fields">
            {s.fields.map((f, i) => (
              <div key={i}>
                <input aria-label={`fält ${i + 1} namn`} value={f.label} onChange={(e) => setFields(s.fields.map((x, k) => (k === i ? { ...x, label: e.target.value, key: x.key || e.target.value.toLowerCase() } : x)))} placeholder="Namn" />
                <input aria-label={`fält ${i + 1} kolumn`} className="byd-mono" value={f.key} onChange={(e) => setFields(s.fields.map((x, k) => (k === i ? { ...x, key: e.target.value } : x)))} placeholder="kolumn" />
                <select aria-label={`fält ${i + 1} typ`} value={f.kind} onChange={(e) => setFields(s.fields.map((x, k) => (k === i ? { ...x, kind: e.target.value as Field['kind'] } : x)))}>
                  <option value="text">text</option>
                  <option value="number">tal</option>
                  <option value="image">bild</option>
                </select>
                <button type="button" aria-label={`ta bort fält ${i + 1}`} onClick={() => setFields(s.fields.filter((_, k) => k !== i))}>×</button>
              </div>
            ))}
            <div className="byd-wizard-fields-actions">
              <button type="button" onClick={() => setFields([...s.fields, { key: '', label: '', kind: 'text' }])}>+ Fält</button>
              <button type="button" onClick={() => setFields(DEFAULT_FIELDS)}>Förslag: titel, kostnad, text</button>
            </div>
          </div>
        </section>
        <section>
          <h2><span>4</span>Ram</h2>
          <div className="byd-wizard-frames">
            {FRAMES.map((f) => (
              <button key={f.id} type="button" aria-pressed={s.frame === f.id ? 'true' : 'false'} onClick={() => setS({ ...s, frame: f.id })}>
                <CardPreview id={`frame-${f.id}`} face={f.front(s.fields)} row={first} icons={{}} scale={0.8} />
                <strong>{f.name}</strong>
                <small>{f.blurb}</small>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h2><span>5</span>Kort</h2>
          <p>Klistra in från ditt kalkylblad — första raden är rubriker — eller börja med tomma rader.</p>
          <textarea aria-label="Kort som CSV" rows={7} value={csv} placeholder={SAMPLE_CSV} onChange={(e) => {
            setCsv(e.target.value)
            setS({ ...s, rows: parseCsv(e.target.value).rows })
          }} />
          <div className="byd-wizard-data-actions">
            <button type="button" onClick={() => {
              setCsv(SAMPLE_CSV)
              setS({ ...s, rows: parseCsv(SAMPLE_CSV).rows })
            }}>Använd exemplet</button>
            <button type="button" onClick={() => setS({ ...s, rows: Array.from({ length: 5 }, (_, i) => ({ title: `Kort ${i + 1}`, cost: '1', body: '' })) })}>5 tomma rader</button>
            <span>{s.rows.length} kort</span>
          </div>
        </section>
        <section className="byd-wizard-actions">
          <button type="button" className="byd-wizard-primary" disabled={!ready || busy !== null} onClick={() => void toTable()}>
            {busy === 'table' ? 'Startar…' : 'Öppna bordet'}
          </button>
          <button type="button" disabled={!ready || busy !== null} onClick={() => void toEditor()}>
            {busy === 'editor' ? 'Skapar…' : 'Till editorn'}
          </button>
          {error && <span role="alert">{error}</span>}
        </section>
      </main>
      <aside>
        <div className="byd-wizard-caption">{s.name || 'Ditt spel'} · {s.rows.length} kort · {s.players} spelare</div>
        <div className="byd-wizard-live">
          <CardPreview id="live" face={front} row={first} icons={{}} scale={2} />
        </div>
        {s.rows.length > 1 && (
          <div className="byd-wizard-thumbs">
            {s.rows.slice(1, 9).map((r, i) => (
              <CardPreview key={i} id={`thumb-${i}`} face={front} row={r} icons={{}} scale={0.35} />
            ))}
          </div>
        )}
      </aside>
    </div>
  )
}
