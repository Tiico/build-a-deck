import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CardPreview } from '../editor/CardPreview.js'
import { useRoving } from '../editor/roving.js'
import { useRoom } from '../room.js'
import { loginUrl, withCredentials } from '../account/api.js'
import { assetRef, bytesOfDataUrl } from '../editor/assets.js'
import { buildProject, type WizardState } from './build.js'
import { defaultFields, DEFAULT_FRAME, FRAMES, type Field } from './frames.js'
import { useT, type Key, type T } from '../i18n/index.js'
import './wizard.css'

export type NewProjectPageProps = { onNavigate?(url: string): void }

// The first card is the designer's own content from the moment it appears, so its title is the
// game's language and not the tool's; the fields around it are the tool's suggestion.
// The example card the wizard starts with. Its title is a word the designer reads and writes
// over, so it is written in the language they are building the game in (A4).
const firstRow = (t: T): Record<string, string> => ({ title: t('wizard.card.n', { n: 1 }), cost: '1', body: '', art: '' })
const emptyState = (t: T): WizardState => ({ name: '', players: 2, fields: defaultFields(t), frame: 'classic', rows: [firstRow(t)] })
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
const STEPS: readonly (readonly [Step, Key])[] = [
  ['spelet', 'wizard.step.spelet'],
  ['falten', 'wizard.step.falten'],
  ['korten', 'wizard.step.korten'],
]

// /new?server=http://… — a short graphical starter flow. It creates the same document the
// editor edits, then sends the designer there for the rest of the deck and template work.
export function NewProjectPage({ onNavigate = (url) => location.assign(url) }: NewProjectPageProps) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const server = params.get('server')
  const http = server ?? location.origin
  const pending = useMemo(() => pendingWizard(server), [server])
  const [s, setS] = useState<WizardState>(pending?.state ?? emptyState(t))
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
  const row = s.rows[selectedRow] ?? s.rows[0] ?? firstRow(t)

  const suffix = (q: URLSearchParams) => {
    if (server) q.set('server', server)
    return q.toString()
  }
  const toEditor = async () => {
    setBusy(true)
    setError(null)
    try {
      // The chosen images go up first (E1): the project's rows point at them by hash, not by
      // carrying the bytes. A login asked for here is the same login the project needs.
      const uploaded = await uploadImages(t, http, s)
      if (uploaded === 'login') {
        rememberWizard({ state: s, server })
        onNavigate(loginUrl(location.pathname + location.search, server))
        throw new Error(t('wizard.error.login'))
      }
      const res = await fetch(`${http}/projects`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildProject(uploaded, t)) }))
      if (res.status === 401) {
        rememberWizard({ state: s, server })
        onNavigate(loginUrl(location.pathname + location.search, server))
        throw new Error(t('wizard.error.login'))
      }
      if (!res.ok) throw new Error(t('wizard.error.create', { status: res.status }))
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
    // Decided, not left alone by accident (#27, A4): the key is an identifier in the document
    // and does not follow the reader. Two people clicking the same button must get the same
    // column, or a template that binds `bild2` would break for whoever was reading in the other
    // language — and the four keys the wizard already lays out (`title`, `cost`, `body`, `art`)
    // are English on a Swedish surface for exactly that reason. What the tool suggests at
    // creation and then hands over is the *label* below, which is written in the designer's own
    // language and frozen there.
    const base = kind === 'image' ? 'bild' : kind === 'number' ? 'värde' : 'fält'
    let n = 1
    while (s.fields.some((field) => field.key === `${base}${n}`)) n++
    const field: Field = {
      key: `${base}${n}`,
      label: t(kind === 'image' ? 'wizard.field.new.image' : kind === 'number' ? 'wizard.field.new.number' : 'wizard.field.new.text'),
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
    const next = Object.fromEntries(s.fields.map((field) => [field.key, field.key === 'title' ? t('wizard.card.n', { n: s.rows.length + 1 }) : field.key === 'cost' ? '1' : '']))
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
      <h2 id="byd-wizard-h1"><span className="byd-wizard-step">1</span>{t('wizard.block.game')}</h2>
      <label className="byd-wizard-label">{t('wizard.name')}<input aria-label={t('wizard.name.label')} value={s.name} onChange={(event) => setS({ ...s, name: event.target.value })} placeholder={t('wizard.name.placeholder')} /></label>
      <fieldset><legend>{t('wizard.players')}</legend><div className="byd-wizard-players">{[1, 2, 3, 4, 5, 6].map((n) => <button key={n} type="button" aria-pressed={s.players === n} onClick={() => setS({ ...s, players: n })}>{n}</button>)}</div></fieldset>
    </section>
  )
  const falten = (
    <section className="byd-wizard-block" aria-labelledby="byd-wizard-h2">
      <h2 id="byd-wizard-h2"><span className="byd-wizard-step">2</span>{t('wizard.fields')}</h2>
      <p>{t('wizard.fields.body')}</p>
      <div className="byd-wizard-fields">
        <div className="byd-wizard-field-list">{s.fields.map((field) => <div className="byd-wizard-field" key={field.key}>
          <span>{t(field.kind === 'image' ? 'wizard.kind.image' : field.kind === 'number' ? 'wizard.kind.number' : 'wizard.kind.text')}</span>
          <input aria-label={t('wizard.field.name', { label: field.label })} value={field.label} onChange={(event) => setFields(s.fields.map((candidate) => candidate.key === field.key ? { ...candidate, label: event.target.value } : candidate))} />
          <small>{t(mappedByStarterFrame(field.key) ? 'wizard.field.in-frame' : 'wizard.field.in-editor')}</small>
          <button type="button" aria-label={t('wizard.field.remove', { label: field.label })} onClick={() => removeField(field.key)}>×</button>
        </div>)}</div>
        <div className="byd-wizard-add-fields"><button type="button" onClick={() => addField('text')}>{t('wizard.add.text')}</button><button type="button" onClick={() => addField('number')}>{t('wizard.add.number')}</button><button type="button" onClick={() => addField('image')}>{t('wizard.add.image')}</button></div>
      </div>
      <fieldset className="byd-wizard-frames"><legend>{t('wizard.frame')}</legend>{FRAMES.map((candidate) => <button key={candidate.id} type="button" aria-pressed={s.frame === candidate.id} onClick={() => setS({ ...s, frame: candidate.id })}>{t(candidate.name)}</button>)}</fieldset>
    </section>
  )
  const korten = (
    <section className="byd-wizard-block" aria-labelledby="byd-wizard-h3">
      <div className="byd-wizard-cards-head"><h2 id="byd-wizard-h3"><span className="byd-wizard-step">3</span>{t('wizard.cards.title')}</h2><span>{t(s.rows.length === 1 ? 'wizard.cards.count.one' : 'wizard.cards.count.other', { n: s.rows.length })}</span></div>
      <p>{t('wizard.cards.body')}</p>
      <div className="byd-wizard-card-workspace">
        <div className="byd-wizard-preview"><CardPreview id="wizard-live" face={front} row={row} icons={{}} /><span>{t('wizard.preview')}</span></div>
        <div className="byd-wizard-card-form">{s.fields.map((field) => field.kind === 'image' ? <div key={field.key} className="byd-wizard-image-field is-wide"><span>{field.label}{!mappedByStarterFrame(field.key) && <em>{t('wizard.field.place')}</em>}</span><div>{row[field.key] ? <img src={row[field.key]} alt={t('wizard.image.preview', { label: field.label })} /> : <i>{t('wizard.image.none')}</i>}<label className="byd-wizard-file-button">{t(row[field.key] ? 'wizard.image.change' : 'wizard.image.choose')}<input type="file" accept="image/*" aria-label={t('wizard.card.field', { n: selectedRow + 1, label: field.label })} onChange={(event) => chooseImage(selectedRow, field.key, event.target.files?.[0])} /></label>{row[field.key] && <button type="button" onClick={() => updateRow(selectedRow, field.key, '')}>{t('wizard.image.remove')}</button>}</div></div> : <label key={field.key} className={field.key === 'body' ? 'is-wide' : ''}><span>{field.label}{!mappedByStarterFrame(field.key) && <em>{t('wizard.field.place')}</em>}</span>{field.key === 'body' ? <textarea rows={4} aria-label={t('wizard.card.field', { n: selectedRow + 1, label: field.label })} value={row[field.key] ?? ''} onChange={(event) => updateRow(selectedRow, field.key, event.target.value)} /> : <input type={field.kind === 'number' ? 'number' : 'text'} aria-label={t('wizard.card.field', { n: selectedRow + 1, label: field.label })} value={row[field.key] ?? ''} onChange={(event) => updateRow(selectedRow, field.key, event.target.value)} />}</label>)}</div>
      </div>
      <div className="byd-wizard-card-tabs">{s.rows.map((candidate, index) => <button type="button" key={index} aria-pressed={selectedRow === index} onClick={() => setSelectedRow(index)}><b>{index + 1}</b>{candidate['title'] || t('wizard.card.untitled')}</button>)}<button type="button" className="is-add" onClick={addRow}>{t('wizard.card.add')}</button><button type="button" disabled={s.rows.length === 1} onClick={() => removeRow(selectedRow)}>{t('wizard.card.remove')}</button></div>
      <footer><p>{t('wizard.footer')}</p><button type="button" className="byd-wizard-primary" disabled={!ready || busy} onClick={() => void toEditor()}>{t(busy ? 'wizard.creating' : 'wizard.create')}</button>{error && <span role="alert">{error}</span>}</footer>
    </section>
  )
  const handoff = <div className="byd-wizard-handoff"><strong>{t('wizard.handoff.title')}</strong><p>{t('wizard.handoff.body')}</p></div>
  const panels: Record<Step, ReactNode> = { spelet, falten: <>{falten}</>, korten }

  return (
    <div className="byd-wizard" data-page="new" data-room={desk ? 'desk' : 'steps'}>
      <header>
        <div><span>{t('wizard.eyebrow')}</span><h1>{t('wizard.title')}</h1></div>
        <span>{t('wizard.steps')}</span>
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
          <div className="byd-wizard-stepbar" role="tablist" aria-label={t('wizard.steplist')}>
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
                  {t(label)}
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
          <nav className="byd-wizard-steps" aria-label={t('wizard.stepnav')}>
            <button type="button" disabled={at === 0} onClick={() => setStep(STEPS[at - 1]?.[0] ?? step)}>{t('wizard.prev')}</button>
            <button type="button" className="byd-wizard-primary" disabled={at === STEPS.length - 1} onClick={() => setStep(STEPS[at + 1]?.[0] ?? step)}>{t('wizard.next')}</button>
          </nav>
        </div>
      )}
    </div>
  )
}

// Every image field holding a chosen image becomes an asset reference; the state comes back
// with the references in place. 'login' when the server wants an account first.
async function uploadImages(t: T, http: string, state: WizardState): Promise<WizardState | 'login'> {
  const imageKeys = state.fields.filter((f) => f.kind === 'image').map((f) => f.key)
  const rows: Record<string, string>[] = []
  for (const row of state.rows) {
    const next = { ...row }
    for (const key of imageKeys) {
      const value = row[key] ?? ''
      if (!value.startsWith('data:')) continue
      const image = bytesOfDataUrl(value)
      if (!image) continue
      const res = await fetch(`${http}/assets`, withCredentials({ method: 'POST', headers: { 'content-type': image.type }, body: image.bytes }))
      if (res.status === 401) return 'login'
      if (!res.ok) throw new Error(t('wizard.error.upload', { status: res.status }))
      next[key] = assetRef(((await res.json()) as { hash: string }).hash)
    }
    rows.push(next)
  }
  return { ...state, rows }
}
