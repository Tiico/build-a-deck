import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CardPreview } from '../editor/CardPreview.js'
import { useRoving } from '../editor/roving.js'
import { useRoom } from '../room.js'
import { loginUrl, withCredentials } from '../account/api.js'
import { assetRef, bytesOfDataUrl, imageTypeOf } from '../editor/assets.js'
import { ASSET_MAX_BYTES, assetAccept } from '@byd/protocol'
import { DropSays, dropSurface, oneFile } from '../editor/dropping.js'
import { suggestFieldKey } from '../editor/fields.js'
import { buildBlankProject, buildProject, DEFAULT_THEME, themeOfState, typedFields, type WizardState } from './build.js'
import { themeFaceSources, uploadTheme } from './fonts.js'
import { NotMade } from './not-made.js'
import { forgetDraft, isImageRef, keepDraft, readDraft, restoreImages } from './draft.js'
import { columnOf, defaultFields, FRAMES, type Field } from './frames.js'
import { previewFonts as stacksOf } from '../editor/fonts.js'
import { THEMES } from '../editor/themes.js'
import { ThemeTile } from '../editor/ThemeTile.js'
import { fieldLabel } from '../editor/fields.js'
import { ANTAL } from '@byd/server/doc'
import { useT, type Key, type T } from '../i18n/index.js'
import { Help } from '../editor/HelpDrawer.js'
import { Stepper } from '../Stepper.js'
import { MAX_PLAYERS, PROJECT_NAME_MAX } from '@byd/server/doc'
import './wizard.css'

export type NewProjectPageProps = { onNavigate?(url: string): void }

// The first card is the designer's own content from the moment it appears, so its title is the
// game's language and not the tool's; the fields around it are the tool's suggestion.
// The example card the wizard starts with. Its title is a word the designer reads and writes
// over, so it is written in the language they are building the game in (A4).
// The example cards the guide opens on (#733, beslut 2026-10-04): three, two of each, so a table made
// from the defaults has six cards to draw from, and every field shows what it does — a cost, a line
// of text, and a meaning written the way the deck writes one. In the designer's language, and theirs
// to write over or take away like any card they add.
const exampleRows = (t: T): Record<string, string>[] =>
  ([1, 2, 3] as const).map((n) => ({ title: t(`wizard.example.${n}.title`), cost: String(n), body: t(`wizard.example.${n}.body`), art: '', antal: '2' }))
const emptyState = (t: T): WizardState => ({ name: '', players: 2, fields: defaultFields(t), frame: 'classic', theme: DEFAULT_THEME.id, rows: exampleRows(t) })
// The draft (`draft.ts`) is only ever *sent* on the way back from the login it was waiting for —
// the `resume` mark on that one address — and never because `/new` was opened again later.
const RESUME = 'resume'
// The two doors out of the wizard: through its three steps, or past them with a blank game.
type Via = 'guided' | 'blank'
// What the page says at its head about the draft (#686), when a reload would not give it back.
type DraftSays = 'wizard.draft.unsaved' | 'wizard.draft.lost-image'

// The draft as the page starts on it: words at once, and every picture empty until the store has
// given it back — never the reference standing in for it.
const withoutImageRefs = (state: WizardState): WizardState => ({
  ...state,
  rows: state.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, isImageRef(value) ? '' : value]))),
})

const mappedByStarterFrame = (key: string) => ['title', 'cost', 'body', 'art'].includes(key)

// Vad fältet pekar på: exemplet alltid, beskedet när det finns (#416).
const NAME_EXAMPLE = 'byd-wizard-name-example'
const NAME_SAYS = 'byd-wizard-name-says'
const NAME_LIMIT = 'byd-wizard-name-limit'

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
  const pending = useMemo(() => readDraft(server), [server])
  const resuming = useMemo(() => params.get(RESUME) === '1', [params])
  // What an untouched wizard holds, so a draft is only a draft once something has been written.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- what an untouched wizard holds is taken once, in the language `s` was begun in
  const pristine = useMemo(() => JSON.stringify(emptyState(t)), [])
  const [s, setS] = useState<WizardState>(pending ? withoutImageRefs(pending.state) : emptyState(t))
  // The draft's pictures come back from their store after the words (#686), and nothing is kept
  // until they have — a save before that would keep the draft without them.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- asked once, of the draft the page started on
  const restoring = useMemo(() => pending && pending.state.rows.some((row) => Object.values(row).some(isImageRef)) ? restoreImages(pending.state) : null, [])
  const [restored, setRestored] = useState(restoring === null)
  const [draftSays, setDraftSays] = useState<DraftSays | null>(null)
  const dirty = JSON.stringify(s) !== pristine
  // Set on the way out through one of the page's own doors, so the question below is not asked
  // about a leaving the page itself asked for.
  const leaving = useRef(false)
  const [selectedRow, setSelectedRow] = useState(0)
  const desk = useRoom() === 'desk'
  const [step, setStep] = useState<Step>('spelet')
  const at = STEPS.findIndex(([key]) => key === step)
  const { itemProps } = useRoving({ ids: STEPS.map(([key]) => key), selected: step, orientation: 'horizontal' })
  const [busy, setBusy] = useState(false)
  // Which door the game is being made through, so the wait and the error stand at that door.
  const [via, setVia] = useState<Via>('guided')
  const [error, setError] = useState<string | null>(null)
  // Vad ett släpp på ett bildfält blev, när det inte blev en bild: beskedet står vid det fält som
  // tog emot det och ingen annanstans, eftersom det är det fältet som står kvar som det var.
  const [refused, setRefused] = useState<{ field: string; said: string } | null>(null)
  // Vilket fält draget står över just nu. Ett fält i taget, så att markeringen aldrig påstår att
  // två mottagare väntar på samma släpp.
  const [over, setOver] = useState<string | null>(null)
  // Namnet krävs, och villkoret sägs vid tryck (#416, variant B). Båda utgångarna står öppna; den
  // som trycker med tomt fält får beskedet vid fältet i stället för en grå knapp utan förklaring.
  // `asked` räknar tryckningarna och inte om något sagts, så ett andra tryck flyttar markören en
  // andra gång — och flytten görs efter målningen, eftersom fältet under skrivbordsbredd bor i ett
  // steg som kan behöva öppnas först.
  const [says, setSays] = useState<string | null>(null)
  const [asked, setAsked] = useState(0)
  const nameField = useRef<HTMLInputElement>(null)
  const resumed = useRef(false)
  const theme = themeOfState(s)
  const named = s.name.trim().length > 0
  const atLimit = s.name.length >= PROJECT_NAME_MAX
  // Det namnet stänger är inte längre knappen utan bara vägen igenom den (#416). Vad som faktiskt
  // låser den guidade utgången är ett spel utan kort eller fält, vilket den inte kan göra något av.
  const hasCards = s.rows.length > 0 && s.fields.length > 0
  // What stands in the way of a name becoming a column (#476, L44), field by field.
  const problems = useMemo(() => fieldProblems(s.fields, t), [s.fields, t])
  // «Utseende» (L57, #633): the frame says where things stand and the theme how it feels, and the
  // preview is the card the game will be — the theme laid over the frame by `buildProject`, the
  // same edit Speltema sends, so its headings, its prose and its meanings' colours are the theme's.
  // The cards themselves are not needed for that, so typing on one does not build it again.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- what the look depends on, and not the cards
  const look = useMemo(() => buildProject({ ...s, rows: [] }, t), [s.fields, s.frame, s.theme, t])
  const front = look.template.faces['front'] ?? { base: [], variants: {} }
  // Each theme's faces, once a press on that theme has fetched them (#476, L27): the preview is drawn
  // in them from then on, and until then it says the faces come with the choice. Nothing is asked of
  // the catalogue before a theme is pressed — the wizard opening, and a frame pressed, ask for
  // nothing, since a frame carries no face of its own any more.
  // The asking itself is kept too, so «Skapa» pressed before it has answered waits for the same
  // answer instead of asking the catalogue a second time.
  const [faces, setFaces] = useState<Record<string, Record<string, { stack: string; src: string }>>>({})
  const asking = useRef(new Map<string, Promise<Record<string, { stack: string; src: string }> | null>>())
  const pickTheme = (id: string) => {
    setS((current) => ({ ...current, theme: id }))
    const chosen = THEMES.find((candidate) => candidate.id === id)
    if (!chosen || asking.current.has(id)) return
    const asked = themeFaceSources(chosen)
    asking.current.set(id, asked)
    void asked.then((face) => {
      if (face) setFaces((known) => ({ ...known, [id]: face }))
      else asking.current.delete(id)
    })
  }
  const face = faces[theme.id]
  const fonts = useMemo(() => ({ ...stacksOf(look, undefined), ...face }), [look, face])
  // With every card taken away the preview still draws one, blank under its tool name.
  const row = s.rows[selectedRow] ?? s.rows[0] ?? { title: t('wizard.card.n', { n: 1 }), cost: '', body: '', art: '' }
  // The card as the game will hold it, under the columns the fields were named (#476).
  const card = useMemo(() => typedFields(row, s.fields), [row, s.fields])

  const suffix = (q: URLSearchParams) => {
    if (server) q.set('server', server)
    return q.toString()
  }
  // `state` is what is made: the page's own, or — on the way back from a login — the draft as its
  // store gave it back, pictures and all (#686), since the page's own may not have them yet.
  const toEditor = async (door: Via = 'guided', state: WizardState = s) => {
    const s = state
    // A second press while the first is on its way is not a second game.
    if (busy) return
    // Den utgång som trycks utan namn går ingenstans — den säger vad som saknas, vid fältet, och
    // lämnar markören där det rättas.
    if (!named) {
      setSays(t('wizard.name.says'))
      setStep('spelet')
      setAsked((n) => n + 1)
      return
    }
    setSays(null)
    // A field whose name the document cannot hold is put right where it is written first.
    const faulty = door === 'guided' ? s.fields.find((field) => problems[field.key]) : undefined
    if (faulty) {
      if (!desk) setStep('falten')
      setFocusOn({ at: `[data-field="${faulty.key}"] input` })
      return
    }
    setBusy(true)
    setVia(door)
    setError(null)
    // A login asked for here is the same login the project needs; the draft waits for it in
    // this tab and comes back through the same door.
    const login = async () => {
      // Kept before the page is left, pictures and all, or the way back finds the draft without them.
      await keepDraft({ state: s, server, blank: door === 'blank' })
      const back = new URLSearchParams(location.search)
      back.set(RESUME, '1')
      leaving.current = true
      onNavigate(loginUrl(`${location.pathname}?${back.toString()}`, server))
      return new Error(t('wizard.error.login'))
    }
    try {
      let doc
      if (door === 'blank') {
        // Past the guided start (L42) there is nothing to upload: the game has no images yet.
        doc = buildBlankProject(s, t)
      } else {
        // The chosen images go up first (E1): the project's rows point at them by hash, not by
        // carrying the bytes.
        const uploaded = await uploadImages(t, http, s)
        if (uploaded === 'login') throw await login()
        // And the theme's own faces and icons with them (#420, #633): the game is set in typefaces
        // it carries, so the first screen in the editor is a card that can be printed as it stands.
        const known = await asking.current.get(theme.id)
        const files = await uploadTheme(t, http, theme, Object.fromEntries(Object.entries(known ?? {}).map(([family, at]) => [family, at.src])))
        if (files === 'login') throw await login()
        doc = buildProject(uploaded, t, files)
      }
      const res = await fetch(`${http}/projects`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) }))
      if (res.status === 401) throw await login()
      if (!res.ok) throw new NotMade('wizard.error.create')
      forgetDraft()
      const { id } = (await res.json()) as { id: string }
      leaving.current = true
      onNavigate(`/editor?${suffix(new URLSearchParams({ project: id }))}`)
    } catch (err) {
      // Said as what did not happen and what to do (#476): a reason of the wizard's own, the
      // service out of reach (the browser's words for that are a `TypeError`), or a sentence the
      // catalogue already wrote — and never a status code.
      const why = err instanceof NotMade ? t(err.reason) : err instanceof TypeError ? t('wizard.error.offline') : err instanceof Error ? err.message : String(err)
      setError(`${t('wizard.error.not-made')} ${why}`)
      setBusy(false)
      setSaid((n) => n + 1)
    }
  }
  useEffect(() => {
    if (asked === 0) return
    nameField.current?.focus()
  }, [asked])
  // Where the focus goes after a press that makes, removes or moves something (#476): into what
  // was just made, onto what is left when a thing goes, into the step that was walked to — never
  // onto <body>. Asked for by what it is, and found after the render that drew it.
  const [focusOn, setFocusOn] = useState<{ at: string } | null>(null)
  useEffect(() => {
    if (focusOn) document.querySelector<HTMLElement>(focusOn.at)?.focus()
  }, [focusOn])
  // The focus goes to what went wrong, where it is read, rather than staying on a button that has
  // just come back to life.
  const [said, setSaid] = useState(0)
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (said > 0) errorRef.current?.focus()
  }, [said])
  useEffect(() => {
    if (!pending || !resuming || resumed.current) return
    resumed.current = true
    // Said once: the address stops carrying the mark, so a reload of the page it lands on is a
    // reload and not a second «Skapa».
    const rest = new URLSearchParams(location.search)
    rest.delete(RESUME)
    history.replaceState(history.state, '', `${location.pathname}${rest.toString() ? `?${rest.toString()}` : ''}`)
    const door = pending.blank ? 'blank' : 'guided'
    if (restoring) void restoring.then((back) => toEditor(door, back.state))
    else void toEditor(door)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- said once, on arrival: the mark leaves the address as it is read
  }, [])
  useEffect(() => {
    if (!restoring) return
    let live = true
    void restoring.then((back) => {
      if (!live) return
      // Every picture goes back where it stood, unless something was written there meanwhile.
      setS((current) => ({
        ...current,
        rows: current.rows.map((row, index) => ({
          ...row,
          ...Object.fromEntries(Object.entries(back.state.rows[index] ?? {}).filter(([key, value]) => value.startsWith('data:') && key in row && !row[key])),
        })),
      }))
      if (back.lost > 0) setDraftSays('wizard.draft.lost-image')
      setRestored(true)
    })
    return () => {
      live = false
    }
  }, [restoring])
  // The draft follows every keystroke into the tab's storage, and an untouched wizard keeps nothing.
  // A draft the browser would not keep is said at the head of the page (#686): a reload would not
  // give it back, and the page must not let it look as if it would.
  useEffect(() => {
    if (!restored) return
    if (!dirty) {
      forgetDraft()
      setDraftSays((said) => (said === 'wizard.draft.unsaved' ? null : said))
      return
    }
    let live = true
    void keepDraft({ state: s, server }).then((kept) => {
      if (live) setDraftSays((said) => (kept ? (said === 'wizard.draft.unsaved' ? null : said) : 'wizard.draft.unsaved'))
    })
    return () => {
      live = false
    }
  }, [s, dirty, server, restored])
  // And the browser asks before a reload or a closed tab takes it, as the editor does.
  useEffect(() => {
    if (!dirty) return
    const hold = (event: BeforeUnloadEvent) => {
      if (leaving.current) return
      event.preventDefault()
      // Older browsers read the answer off the event instead of the cancellation.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', hold)
    return () => window.removeEventListener('beforeunload', hold)
  }, [dirty])

  // A step walked to by the buttons takes the focus with it: the button pressed may lock at the
  // end it has reached, and a locked button cannot keep the focus.
  const walk = (by: number) => {
    const to = STEPS[at + by]?.[0]
    if (!to) return
    setStep(to)
    setFocusOn({ at: `#byd-wizard-panel-${to}` })
  }
  const setFields = (fields: Field[]) => setS((current) => ({ ...current, fields }))
  const updateRow = (index: number, key: string, value: string) => setS((current) => ({
    ...current,
    rows: current.rows.map((candidate, rowIndex) => rowIndex === index ? { ...candidate, [key]: value } : candidate),
  }))
  // Ett bildfält i guiden är en mottagare (#291, variant B): samma väg in för ett släpp som för
  // filväljaren, och samma regel — fältet tar en bild, och flera filer är en fråga utan svar.
  const chooseImage = (index: number, key: string, files: readonly File[]) => {
    const one = oneFile(files, t)
    if (one === null) return
    if ('said' in one) {
      setRefused({ field: key, said: one.said })
      return
    }
    // Said at the field the moment the file is chosen (#476), and not as «413» or «415» when the
    // game is made: the weight before anything is read, and then what the bytes say they are — the
    // same reading the service makes, so the two cannot disagree.
    const file = one.file
    if (file.size > ASSET_MAX_BYTES) {
      setRefused({ field: key, said: t('wizard.image.too-big', { mb: ASSET_MAX_BYTES / 1024 / 1024 }) })
      return
    }
    void file.arrayBuffer().then((buffer) => {
      if (!imageTypeOf(new Uint8Array(buffer))) {
        setRefused({ field: key, said: t('wizard.image.not-image') })
        return
      }
      setRefused(null)
      const reader = new FileReader()
      reader.onload = () => updateRow(index, key, String(reader.result ?? ''))
      reader.readAsDataURL(file)
    })
  }
  const addField = (kind: Field['kind']) => {
    // The key is the form's own handle for the field — what the rows are kept under while the
    // wizard is open — and never reaches the document: the field becomes the column it is *named*
    // (#476, L44), and the frame finds it by this key, which is its place on the card. The editor's
    // own form suggests keys from the same place (#32).
    // The suggested name is the column the field becomes (#476, L44), so it is one no other field
    // has: a second «Nytt textfält» is «Nytt textfält 2», not a field born refused.
    const suggested = t(kind === 'image' ? 'wizard.field.new.image' : kind === 'number' ? 'wizard.field.new.number' : 'wizard.field.new.text')
    const names = new Set(s.fields.map((f) => columnOf(f).toLowerCase()))
    let label = suggested
    for (let n = 2; names.has(label.toLowerCase()); n++) label = `${suggested} ${n}`
    const field: Field = {
      key: suggestFieldKey(kind, s.fields.map((f) => f.key)),
      label,
      kind,
    }
    setS((current) => ({
      ...current,
      fields: [...current.fields, field],
      rows: current.rows.map((candidate) => ({ ...candidate, [field.key]: '' })),
    }))
    setFocusOn({ at: `[data-field="${field.key}"] input` })
  }
  const removeField = (key: string) => {
    // The × that was pressed goes with its field, so the keys go to its neighbour (#555, WCAG 2.4.3):
    // the next field's ×, the one before it when it was the last, and the way to add a field when
    // none is left to take away.
    const removable = s.fields.filter((field) => field.key !== 'title')
    const at = removable.findIndex((field) => field.key === key)
    const neighbour = removable[at + 1] ?? removable[at - 1]
    setFocusOn({ at: neighbour ? `[data-field="${neighbour.key}"] > button` : '.byd-wizard-add-fields button' })
    setS((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.key !== key),
      rows: current.rows.map((candidate) => Object.fromEntries(Object.entries(candidate).filter(([field]) => field !== key))),
    }))
  }
  const addRow = () => {
    const next = Object.fromEntries(s.fields.map((field) => [field.key, field.key === 'title' ? t('wizard.card.n', { n: s.rows.length + 1 }) : field.key === 'cost' ? '1' : '']))
    setS((current) => ({ ...current, rows: [...current.rows, next] }))
    setSelectedRow(s.rows.length)
    setFocusOn({ at: '.byd-wizard-card-form :is(input, textarea)' })
  }
  const removeRow = (index: number) => {
    if (s.rows.length === 1) return
    setS((current) => ({ ...current, rows: current.rows.filter((_, rowIndex) => rowIndex !== index) }))
    setSelectedRow(Math.max(0, Math.min(selectedRow, s.rows.length - 2)))
    setFocusOn({ at: '.byd-wizard-card-tabs [aria-pressed="true"]' })
  }

  // Steps 1 and 2 are one panel each, and the cards are the third. On a desk they are read side
  // by side, the way they always have been; below one they are three steps with one job each —
  // the wizard has said "3 enkla steg" all along, and now it is three (L10, #4).
  const spelet = (
    <section className="byd-wizard-block" aria-labelledby="byd-wizard-h1">
      {/* One question mark per step, at the step's heading (L36): the box carries what the
          handoff and the blank door used to say on the surface. */}
      <div className="byd-help-row">
        <h2 id="byd-wizard-h1"><span className="byd-wizard-step">1</span>{t('wizard.block.game')}</h2>
        <Help topic={t('wizard.help.spelet')}>
          <p>{t('wizard.handoff.body')}</p>
          <p>{t('wizard.blank.help')}</p>
        </Help>
      </div>
      {/* The words over the field are its name. A second, shorter one in `aria-label` would win
          over them, and then what is written on the screen and what the field is called are two
          different things — which is the whole of WCAG 2.5.3. */}
      {/* Exemplet står under fältet i stället för inuti det: en platshållare som lyder «Skogens
          herrar» ser ut som ett ifyllt värde, och då är det fältet som ljuger och inte knappen
          som tiger (#416). */}
      <label className="byd-wizard-label">{t('wizard.name')}<input
        ref={nameField}
        value={s.name}
        onChange={(event) => {
          setS({ ...s, name: event.target.value })
          // Villkoret gäller inte längre så snart något står i fältet.
          if (event.target.value.trim()) setSays(null)
        }}
        onKeyDown={(event) => {
          // Enter goes on to the fields, which is what comes next whether they stand beside the
          // name or behind the next step.
          if (event.key !== 'Enter') return
          event.preventDefault()
          if (!desk) setStep('falten')
          setFocusOn({ at: '.byd-wizard-field input' })
        }}
        autoFocus={desk}
        aria-required="true"
        aria-invalid={says ? 'true' : 'false'}
        maxLength={PROJECT_NAME_MAX}
        aria-describedby={[NAME_EXAMPLE, says ? NAME_SAYS : null, atLimit ? NAME_LIMIT : null].filter(Boolean).join(' ')}
      /></label>
      <p className="byd-wizard-hint" id={NAME_EXAMPLE}>{t('wizard.name.example')}</p>
      {/* Villkoret, sagt en gång per skärm och vid fältet — inte en gång per utgång, fastän de två
          ligger i var sin spalt. Det föds efter trycket och föds därför som en levande region. */}
      {/* The limit is said once it is reached (#476): a name that stops growing without a word
          looks like a keyboard that stopped working. */}
      {atLimit && (
        <p className="byd-wizard-hint" id={NAME_LIMIT}>
          {t('wizard.name.max', { n: PROJECT_NAME_MAX })}
        </p>
      )}
      {says && (
        <p className="byd-wizard-says" id={NAME_SAYS} role="alert" aria-live="assertive">
          {says}
        </p>
      )}
      {/* Every seat count the table can hold, `MAX_PLAYERS` and not six (K18, K19) — as the same
          stepper Bord's recipe column has (#620), one row of three targets rather than eight. */}
      <fieldset>
        <legend>{t('wizard.players')}</legend>
        <Stepper value={s.players} min={1} max={MAX_PLAYERS} onChange={(players) => setS({ ...s, players })} label={t('players.count', { min: 1, max: MAX_PLAYERS })} fewer={t('players.fewer')} more={t('players.more')} />
      </fieldset>
      {/* The guided start is a door, not a gate (L42): the name and the seats above are all a
          game needs in order to exist, and whoever would rather make the cards, the fields and
          the faces in the editor goes there now, with none of them. It is the second action in
          the view (L13): the guided way is the first, and this one stands beside it, bordered. */}
      <div className="byd-wizard-blank">
        <strong>{t('wizard.blank.title')}</strong>
        <p>{t('wizard.blank.body')}</p>
        <button type="button" className="byd-secondary" {...working(busy)} onClick={() => void toEditor('blank')}><Held busy={busy && via === 'blank'} idle={t('wizard.blank.create')} working={t('wizard.creating')} /></button>
        {error && via === 'blank' && <p ref={errorRef} className="byd-wizard-error" role="alert" tabIndex={-1}>{error}</p>}
      </div>
    </section>
  )
  const falten = (
    <section className="byd-wizard-block" aria-labelledby="byd-wizard-h2">
      <div className="byd-help-row">
        <h2 id="byd-wizard-h2"><span className="byd-wizard-step">2</span>{t('wizard.fields')}</h2>
        <Help topic={t('wizard.help.falten')}>
          <p>{t('wizard.fields.help')}</p>
        </Help>
      </div>
      <p>{t('wizard.fields.body')}</p>
      <div className="byd-wizard-fields">
        <div className="byd-wizard-field-list">{s.fields.map((field) => <div className="byd-wizard-field" key={field.key} data-field={field.key}>
          <span>{t(field.kind === 'image' ? 'wizard.kind.image' : field.kind === 'number' ? 'wizard.kind.number' : 'wizard.kind.text')}</span>
          {field.key === 'title' ? (
            // The tool's own column (#476): what every card is called, shown in the designer's
            // language and not written over, as `antal` is in the editor.
            <b className="byd-wizard-field-fixed">{fieldLabel('title', t)}</b>
          ) : (
            <input
              aria-label={t('wizard.field.name', { label: field.label })}
              value={field.label}
              onChange={(event) => setFields(s.fields.map((candidate) => candidate.key === field.key ? { ...candidate, label: event.target.value } : candidate))}
              {...(problems[field.key] ? { 'aria-invalid': true, 'aria-describedby': `byd-wizard-field-says-${field.key}` } : {})}
            />
          )}
          <small>{t(mappedByStarterFrame(field.key) ? 'wizard.field.in-frame' : 'wizard.field.in-editor')}</small>
          {field.key !== 'title' && <button type="button" aria-label={t('wizard.field.remove', { label: field.label })} onClick={() => removeField(field.key)}>×</button>}
          {problems[field.key] && <p className="byd-wizard-field-says" id={`byd-wizard-field-says-${field.key}`}>{problems[field.key]}</p>}
        </div>)}</div>
        <div className="byd-wizard-add-fields"><button type="button" onClick={() => addField('text')}>{t('wizard.add.text')}</button><button type="button" onClick={() => addField('number')}>{t('wizard.add.number')}</button><button type="button" onClick={() => addField('image')}>{t('wizard.add.image')}</button></div>
      </div>
      {/* «Utseende» (L57, #633, prototyp B): the frame and the theme chosen where the frame always
          was, and no step of their own. */}
      <fieldset className="byd-wizard-look">
        <legend>{t('wizard.look')}</legend>
        <div className="byd-wizard-frames" role="group" aria-labelledby="byd-wizard-look-frame">
          <p id="byd-wizard-look-frame">{t('wizard.look.frame')}</p>
          {FRAMES.map((candidate) => <button key={candidate.id} type="button" className="byd-choice" aria-pressed={s.frame === candidate.id} onClick={() => setS((current) => ({ ...current, frame: candidate.id }))}>{t(candidate.name)}</button>)}
        </div>
        <div className="byd-wizard-themes" role="group" aria-labelledby="byd-wizard-look-theme">
          <p id="byd-wizard-look-theme">{t('wizard.look.theme')}</p>
          {THEMES.map((candidate) => <ThemeTile key={candidate.id} theme={candidate} pressed={theme.id === candidate.id} onPress={() => pickTheme(candidate.id)} />)}
        </div>
        <p className="byd-wizard-hint">{t('wizard.look.later')}</p>
      </fieldset>
    </section>
  )
  const korten = (
    <section className="byd-wizard-block" aria-labelledby="byd-wizard-h3">
      <div className="byd-wizard-cards-head">
        <div className="byd-help-row">
          <h2 id="byd-wizard-h3"><span className="byd-wizard-step">3</span>{t('wizard.cards.title')}</h2>
          <Help topic={t('wizard.help.korten')}>
            <p>{t('wizard.cards.body')}</p>
            <p>{t('wizard.footer')}</p>
          </Help>
        </div>
        <span>{t(s.rows.length === 1 ? 'wizard.cards.count.one' : 'wizard.cards.count.other', { n: s.rows.length })}</span>
      </div>
      <div className="byd-wizard-card-workspace">
        <div className="byd-wizard-preview"><div role="img" aria-label={t('wizard.preview.card', { n: selectedRow + 1, title: row['title'] || t('wizard.card.untitled') })}><CardPreview id="wizard-live" face={front} row={card} icons={look.icons} fonts={fonts} palette={look.palette} /></div><span>{t('wizard.preview')}</span>{!face && <span className="byd-wizard-preview-font">{t('wizard.preview.font')}</span>}</div>
        <div className="byd-wizard-card-form">{s.fields.map((field) => field.kind === 'image' ? <div key={field.key} className="byd-wizard-image-field is-wide" data-image-field={field.key}><span>{field.label}{!mappedByStarterFrame(field.key) && <em>{t('wizard.field.place')}</em>}</span><div
          role="group"
          aria-label={t('wizard.image.field', { label: field.label })}
          {...dropSurface({
            // Det aktuella bildfältet är mottagaren, och varje fält äger sitt eget svar: ett
            // släpp får inte oavsiktligt ändra ett annat mål (#291).
            over: over === field.key,
            onOver: (on) => setOver(on ? field.key : null),
            onFiles: (files) => chooseImage(selectedRow, field.key, files),
          })}
        >{row[field.key] ? <img src={row[field.key]} alt={t('wizard.image.preview', { label: field.label })} /> : <i>{t('wizard.image.none')}</i>}{over === field.key && <DropSays />}<label className="byd-wizard-file-button byd-secondary">{t(row[field.key] ? 'wizard.image.change' : 'wizard.image.choose')}<input className="byd-offscreen" type="file" accept={assetAccept('image')} aria-label={t('wizard.card.field', { n: selectedRow + 1, label: field.label })} onChange={(event) => chooseImage(selectedRow, field.key, [...(event.target.files ?? [])])} /></label>{row[field.key] && <button type="button" onClick={() => { updateRow(selectedRow, field.key, ''); setFocusOn({ at: `[data-image-field="${field.key}"] input[type="file"]` }) }}>{t('wizard.image.remove')}</button>}</div>{refused?.field === field.key && <span role="alert">{refused.said}</span>}</div> : <label key={field.key} className={field.key === 'body' ? 'is-wide' : ''}><span>{field.label}{!mappedByStarterFrame(field.key) && <em>{t('wizard.field.place')}</em>}</span>{field.key === 'body' ? <textarea rows={4} aria-label={t('wizard.card.field', { n: selectedRow + 1, label: field.label })} value={row[field.key] ?? ''} onChange={(event) => updateRow(selectedRow, field.key, event.target.value)} /> : <input type={field.kind === 'number' ? 'number' : 'text'} aria-label={t('wizard.card.field', { n: selectedRow + 1, label: field.label })} value={row[field.key] ?? ''} onChange={(event) => updateRow(selectedRow, field.key, event.target.value)} />}</label>)}</div>
      </div>
      <div className="byd-wizard-card-tabs">{s.rows.map((candidate, index) => <button type="button" key={index} className="byd-choice" aria-pressed={selectedRow === index} onClick={() => setSelectedRow(index)}><b>{index + 1}</b>{candidate['title'] || t('wizard.card.untitled')}</button>)}<button type="button" className="is-add" onClick={addRow}>{t('wizard.card.add')}</button><button type="button" disabled={s.rows.length === 1} onClick={() => removeRow(selectedRow)}>{t('wizard.card.remove')}</button></div>
      <footer><button type="button" className="byd-wizard-primary byd-primary" disabled={!hasCards} {...working(busy)} onClick={() => void toEditor()}><Held busy={busy && via === 'guided'} idle={t('wizard.create')} working={t('wizard.creating')} /></button>{error && via === 'guided' && <p ref={errorRef} className="byd-wizard-error" role="alert" tabIndex={-1}>{error}</p>}</footer>
    </section>
  )
  // The handoff's body is said behind the first step's question mark (L36); the title stays.
  const handoff = <div className="byd-wizard-handoff"><strong>{t('wizard.handoff.title')}</strong></div>
  const panels: Record<Step, ReactNode> = { spelet, falten: <>{falten}</>, korten }

  return (
    <div className="byd-wizard" data-page="new" data-room={desk ? 'desk' : 'steps'}>
      <header>
        {/* The way back, where the editor has its own (#476): the draft stays in the tab, and the
            browser asks first if something is written. */}
        <a className="byd-wizard-home" href={server ? `/?${new URLSearchParams({ server }).toString()}` : '/'}>
          {t('editor.home')}
        </a>
        <div><span>{t('wizard.eyebrow')}</span><h1>{t('wizard.title')}</h1></div>
        <span>{t('wizard.steps')}</span>
        {draftSays && <p className="byd-wizard-draft-says" role="alert">{t(draftSays)}</p>}
      </header>
      {desk ? (
        // All three steps are the page's main content (#555): the first two are the form as much
        // as the third, not something beside it.
        <main className="byd-wizard-grid">
          <div className="byd-wizard-side">
            {handoff}
            {spelet}
            {falten}
          </div>
          <div className="byd-wizard-main">{korten}</div>
        </main>
      ) : (
        <main className="byd-wizard-flow">
          <div className="byd-wizard-stepbar" role="tablist" aria-label={t('wizard.steplist')}>
            {STEPS.map(([key, label]) => {
              const roving = itemProps(key)
              return (
                <button
                  key={key}
                  id={`byd-wizard-tab-${key}`}
                  type="button"
                  className="byd-choice"
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
            <button type="button" disabled={at === 0} onClick={() => walk(-1)}>{t('wizard.prev')}</button>
            <button type="button" className="byd-wizard-primary byd-primary" disabled={at === STEPS.length - 1} onClick={() => walk(1)}>{t('wizard.next')}</button>
          </nav>
        </main>
      )}
    </div>
  )
}

// Why a field's name cannot become a column (#476, L44): none at all, one another field already
// has, or one of the tool's own — the card's id, `antal`, and the title in any of its words. The
// comparison is the one a reader makes, without regard to case.
function fieldProblems(fields: readonly Field[], t: T): Record<string, string> {
  const owned = ['id', 'title', ANTAL, fieldLabel('title', t), fieldLabel(ANTAL, t)].map((n) => n.toLowerCase())
  const out: Record<string, string> = {}
  for (const field of fields) {
    if (field.key === 'title') continue
    const name = columnOf(field)
    if (name === '') out[field.key] = t('wizard.field.empty')
    else if (owned.includes(name.toLowerCase())) out[field.key] = t('wizard.field.owned', { name })
    else if (fields.some((other) => other !== field && columnOf(other).toLowerCase() === name.toLowerCase())) out[field.key] = t('wizard.field.twice', { name })
  }
  return out
}

// A button at work is not a locked button (#476): it keeps its look and its width, says it is
// busy, and a press on it does nothing — the handler refuses it — rather than greying out under
// the pointer as a locked one does.
const working = (busy: boolean) => (busy ? { 'aria-disabled': true, 'aria-busy': true } : {})

// A button's two words in one place (#476): both are laid out, and only the one that is true is
// seen and read, so the button is as wide as its longer word through the wait and does not
// shrink under the pointer that pressed it.
function Held({ busy, idle, working }: { busy: boolean; idle: string; working: string }) {
  return (
    <span className="byd-wizard-held">
      <span data-on={!busy} aria-hidden={busy}>
        {idle}
      </span>
      <span data-on={busy} aria-hidden={!busy}>
        {working}
      </span>
    </span>
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
      if (!res.ok) throw new NotMade(res.status === 413 ? 'wizard.error.too-big' : 'wizard.error.upload')
      next[key] = assetRef(((await res.json()) as { hash: string }).hash)
    }
    rows.push(next)
  }
  return { ...state, rows }
}
