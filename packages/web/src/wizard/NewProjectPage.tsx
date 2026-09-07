import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CardPreview } from '../editor/CardPreview.js'
import { useRoving } from '../editor/roving.js'
import { useRoom } from '../room.js'
import { loginUrl, withCredentials } from '../account/api.js'
import { buildProject, type WizardState } from './build.js'
import { DEFAULT_FIELDS, DEFAULT_FRAME, FRAMES, type Field } from './frames.js'
import './wizard.css'

export type NewProjectPageProps = { onNavigate?(url: string): void }

const firstRow = (): Record<string, string> => ({ title: 'Kort 1', cost: '1', body: '', art: '' })
const emptyState = (): WizardState => ({ name: '', players: 2, fields: DEFAULT_FIELDS, frame: 'classic', rows: [firstRow()] })
const PENDING_KEY = 'byd.pending-wizard'
type PendingWizard = { state: WizardState; server: string | null }

function pendingWizard(server: string | null): PendingWizard | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<PendingWizard>
    const state = value.state
    if (
      value.server !== server ||
      !state ||
      typeof state.name !== 'string' ||
      typeof state.players !== 'number' ||
      typeof state.frame !== 'string' ||
      !Array.isArray(state.fields) ||
      !Array.isArray(state.rows)
    ) return null
    return value as PendingWizard
  } catch {
    return null
  }
}

function rememberWizard(pending: PendingWizard): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch {
    // Login still works if storage is unavailable; only automatic resume is lost.
  }
}

function forgetWizard(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // Nothing else depends on cleanup succeeding.
  }
}

const mappedByStarterFrame = (key: string) => ['title', 'cost', 'body', 'art'].includes(key)

// The three steps the header has promised all along. Below the desk they are three screens with
// one job each; on a desk they are the two columns the wizard has always had (L10, #4).
type Step = 'spelet' | 'falten' | 'korten'
const STEPS: readonly (readonly [Step, string])[] = [
  ['spelet', '1 · Spelet'],
  ['falten', '2 · Fälten'],
  ['korten', '3 · Korten'],
]

// /new?server=http://… — a short graphical starter flow. It creates the same document the
// editor edits, then sends the designer there for the rest of the deck and template work.
export function NewProjectPage({ onNavigate = (url) => location.assign(url) }: NewProjectPageProps) {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const server = params.get('server')
  const http = server ?? location.origin
  const pending = useMemo(() => pendingWizard(server), [server])
  const [s, setS] = useState<WizardState>(pending?.state ?? emptyState())
  const [selectedRow, setSelectedRow] = useState(0)
  const desk = useRoom() === 'desk'
  const [step, setStep] = useState<Step>('spelet')
  const at = STEPS.findIndex(([key]) => key === step)
  const { itemProps } = useRoving({ ids: STEPS.map(([key]) => key), selected: step, orientation: 'horizontal' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resumed = useRef(false)
  const frame = FRAMES.find((candidate) => candidate.id === s.frame) ?? DEFAULT_FRAME
  const ready = s.name.trim().length > 0 && s.rows.length > 0 && s.fields.length > 0
  const front = useMemo(() => frame.front(s.fields), [frame, s.fields])
  const row = s.rows[selectedRow] ?? s.rows[0] ?? firstRow()

  const suffix = (q: URLSearchParams) => {
    if (server) q.set('server', server)
    return q.toString()
  }
  const toEditor = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${http}/projects`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildProject(s)) }))
      if (res.status === 401) {
        rememberWizard({ state: s, server })
        onNavigate(loginUrl(location.pathname + location.search, server))
        throw new Error('logga in först')
      }
      if (!res.ok) throw new Error(`kunde inte skapa projektet: ${res.status}`)
      forgetWizard()
      const { id } = (await res.json()) as { id: string }
      onNavigate(`/editor?${suffix(new URLSearchParams({ project: id }))}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }
  useEffect(() => {
    if (!pending || resumed.current) return
    resumed.current = true
    void toEditor()
  }, [])

  const setFields = (fields: Field[]) => setS((current) => ({ ...current, fields }))
  const updateRow = (index: number, key: string, value: string) => setS((current) => ({
    ...current,
    rows: current.rows.map((candidate, rowIndex) => rowIndex === index ? { ...candidate, [key]: value } : candidate),
  }))
  const chooseImage = (index: number, key: string, file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => updateRow(index, key, String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }
  const addField = (kind: Field['kind']) => {
    const base = kind === 'image' ? 'bild' : kind === 'number' ? 'värde' : 'fält'
    let n = 1
    while (s.fields.some((field) => field.key === `${base}${n}`)) n++
    const field: Field = {
      key: `${base}${n}`,
      label: kind === 'image' ? 'Ny bild' : kind === 'number' ? 'Nytt tal' : 'Nytt textfält',
      kind,
    }
    setS((current) => ({
      ...current,
      fields: [...current.fields, field],
      rows: current.rows.map((candidate) => ({ ...candidate, [field.key]: '' })),
    }))
  }
  const removeField = (key: string) => setS((current) => ({
    ...current,
    fields: current.fields.filter((field) => field.key !== key),
    rows: current.rows.map((candidate) => Object.fromEntries(Object.entries(candidate).filter(([field]) => field !== key))),
  }))
  const addRow = () => {
    const next = Object.fromEntries(s.fields.map((field) => [field.key, field.key === 'title' ? `Kort ${s.rows.length + 1}` : field.key === 'cost' ? '1' : '']))
    setS((current) => ({ ...current, rows: [...current.rows, next] }))
    setSelectedRow(s.rows.length)
  }
  const removeRow = (index: number) => {
    if (s.rows.length === 1) return
    setS((current) => ({ ...current, rows: current.rows.filter((_, rowIndex) => rowIndex !== index) }))
    setSelectedRow(Math.max(0, Math.min(selectedRow, s.rows.length - 2)))
  }

  // Steps 1 and 2 are one panel each, and the cards are the third. On a desk they are read side
  // by side, the way they always have been; below one they are three steps with one job each —
  // the wizard has said "3 enkla steg" all along, and now it is three (L10, #4).
  const spelet = (
    <section className="byd-wizard-block" aria-labelledby="byd-wizard-h1">
      <h2 id="byd-wizard-h1"><span className="byd-wizard-step">1</span>Spelet</h2>
      <label className="byd-wizard-label">Spelets namn<input aria-label="Namn" value={s.name} onChange={(event) => setS({ ...s, name: event.target.value })} placeholder="Skogens herrar" /></label>
      <fieldset><legend>Spelare</legend><div className="byd-wizard-players">{[1, 2, 3, 4, 5, 6].map((n) => <button key={n} type="button" aria-pressed={s.players === n} onClick={() => setS({ ...s, players: n })}>{n}</button>)}</div></fieldset>
    </section>
  )
  const falten = (
    <section className="byd-wizard-block" aria-labelledby="byd-wizard-h2">
      <h2 id="byd-wizard-h2"><span className="byd-wizard-step">2</span>Fält</h2>
      <p>Varje fält blir direkt en kontroll på varje exempelkort.</p>
      <div className="byd-wizard-fields">
        <div className="byd-wizard-field-list">{s.fields.map((field) => <div className="byd-wizard-field" key={field.key}>
          <span>{field.kind === 'image' ? 'Bild' : field.kind === 'number' ? 'Tal' : 'Text'}</span>
          <input aria-label={`${field.label} namn`} value={field.label} onChange={(event) => setFields(s.fields.map((candidate) => candidate.key === field.key ? { ...candidate, label: event.target.value } : candidate))} />
          <small>{mappedByStarterFrame(field.key) ? 'Visas i startramen' : 'Placeras på mallen i editorn'}</small>
          <button type="button" aria-label={`Ta bort ${field.label}`} onClick={() => removeField(field.key)}>×</button>
        </div>)}</div>
        <div className="byd-wizard-add-fields"><button type="button" onClick={() => addField('text')}>+ Textfält</button><button type="button" onClick={() => addField('number')}>+ Talfält</button><button type="button" onClick={() => addField('image')}>+ Bildfält</button></div>
      </div>
      <fieldset className="byd-wizard-frames"><legend>Startram</legend>{FRAMES.map((candidate) => <button key={candidate.id} type="button" aria-pressed={s.frame === candidate.id} onClick={() => setS({ ...s, frame: candidate.id })}>{candidate.name}</button>)}</fieldset>
    </section>
  )
  const korten = (
    <section className="byd-wizard-block" aria-labelledby="byd-wizard-h3">
      <div className="byd-wizard-cards-head"><h2 id="byd-wizard-h3"><span className="byd-wizard-step">3</span>Gör några exempelkort</h2><span>{s.rows.length} kort</span></div>
      <p>De hjälper editorn att visa hur fälten faktiskt används.</p>
      <div className="byd-wizard-card-workspace">
        <div className="byd-wizard-preview"><CardPreview id="wizard-live" face={front} row={row} icons={{}} /><span>Levande förhandsvisning</span></div>
        <div className="byd-wizard-card-form">{s.fields.map((field) => field.kind === 'image' ? <div key={field.key} className="byd-wizard-image-field is-wide"><span>{field.label}{!mappedByStarterFrame(field.key) && <em>placera i editorn</em>}</span><div>{row[field.key] ? <img src={row[field.key]} alt={`Förhandsvisning av ${field.label}`} /> : <i>Ingen bild vald</i>}<label className="byd-wizard-file-button">{row[field.key] ? 'Byt bild' : 'Välj bild'}<input type="file" accept="image/*" aria-label={`kort ${selectedRow + 1} ${field.label}`} onChange={(event) => chooseImage(selectedRow, field.key, event.target.files?.[0])} /></label>{row[field.key] && <button type="button" onClick={() => updateRow(selectedRow, field.key, '')}>Ta bort</button>}</div></div> : <label key={field.key} className={field.key === 'body' ? 'is-wide' : ''}><span>{field.label}{!mappedByStarterFrame(field.key) && <em>placera i editorn</em>}</span>{field.key === 'body' ? <textarea rows={4} aria-label={`kort ${selectedRow + 1} ${field.label}`} value={row[field.key] ?? ''} onChange={(event) => updateRow(selectedRow, field.key, event.target.value)} /> : <input type={field.kind === 'number' ? 'number' : 'text'} aria-label={`kort ${selectedRow + 1} ${field.label}`} value={row[field.key] ?? ''} onChange={(event) => updateRow(selectedRow, field.key, event.target.value)} />}</label>)}</div>
      </div>
      <div className="byd-wizard-card-tabs">{s.rows.map((candidate, index) => <button type="button" key={index} aria-pressed={selectedRow === index} onClick={() => setSelectedRow(index)}><b>{index + 1}</b>{candidate['title'] || 'Namnlöst kort'}</button>)}<button type="button" className="is-add" onClick={addRow}>+ Nytt kort</button><button type="button" disabled={s.rows.length === 1} onClick={() => removeRow(selectedRow)}>Ta bort valt kort</button></div>
      <footer><p>Du kan lägga till resten av leken, importera CSV och finjustera mallen efter nästa steg.</p><button type="button" className="byd-wizard-primary" disabled={!ready || busy} onClick={() => void toEditor()}>{busy ? 'Skapar…' : 'Skapa spelet och fortsätt i editorn →'}</button>{error && <span role="alert">{error}</span>}</footer>
    </section>
  )
  const handoff = <div className="byd-wizard-handoff"><strong>Wizarden är startpunkten</strong><p>Skapa några exempelkort här. Layout, hela leken och CSV-verktyg väntar i editorn.</p></div>
  const panels: Record<Step, ReactNode> = { spelet, falten: <>{falten}</>, korten }

  return (
    <div className="byd-wizard" data-page="new" data-room={desk ? 'desk' : 'steps'}>
      <header>
        <div><span>Guidad start</span><h1>Ge spelet en flygande start</h1></div>
        <span>3 enkla steg · cirka 3 min</span>
      </header>
      {desk ? (
        <div className="byd-wizard-grid">
          <aside>
            {handoff}
            {spelet}
            {falten}
          </aside>
          <main>{korten}</main>
        </div>
      ) : (
        <div className="byd-wizard-flow">
          <div className="byd-wizard-stepbar" role="tablist" aria-label="Steg">
            {STEPS.map(([key, label]) => {
              const roving = itemProps(key)
              return (
                <button
                  key={key}
                  id={`byd-wizard-tab-${key}`}
                  type="button"
                  role="tab"
                  aria-selected={step === key ? 'true' : 'false'}
                  aria-controls={`byd-wizard-panel-${key}`}
                  onClick={() => setStep(key)}
                  {...roving}
                  onFocus={(event) => {
                    roving.onFocus()
                    event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="byd-wizard-body">
            {STEPS.map(([key]) => (
              <div key={key} id={`byd-wizard-panel-${key}`} role="tabpanel" aria-labelledby={`byd-wizard-tab-${key}`} tabIndex={0} hidden={step !== key}>
                {step === key && (
                  <>
                    {key === 'spelet' && handoff}
                    {panels[key]}
                  </>
                )}
              </div>
            ))}
          </div>
          {/* The steps are a tablist, so they can be walked with the arrows; these two are the
              same move said the way a form says it, for someone who reads the page in order. */}
          <nav className="byd-wizard-steps" aria-label="Stegnavigering">
            <button type="button" disabled={at === 0} onClick={() => setStep(STEPS[at - 1]?.[0] ?? step)}>← Föregående</button>
            <button type="button" className="byd-wizard-primary" disabled={at === STEPS.length - 1} onClick={() => setStep(STEPS[at + 1]?.[0] ?? step)}>Nästa →</button>
          </nav>
        </div>
      )}
    </div>
  )
}
