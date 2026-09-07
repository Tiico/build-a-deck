// PROTOTYPE — what a tool-rich surface does when the room runs out (#4 /new, #5 /editor,
// #6 /observe), on /prototype/responsive?variant=A|B|C&yta=wizard|editor|observatör.
//
// The three issues are one problem seen from three surfaces, so they get one answer. The
// question is not "which breakpoint" but "what does a surface with many tools give up when the
// screen is 390 px wide". Three genuinely different answers:
//
//   A  everything stays visible; the surface reflows and shrinks. Nothing is hidden, nothing is
//      summoned, nothing overlaps. The price is size and a long scroll.
//   B  one work surface fills the screen; every secondary tool is a drawer summoned on demand —
//      a sheet on the phone, a docked panel on the desktop. The price is simultaneity.
//   C  the surface splits into named stages you move between, one at a time. Nothing is ever on
//      top of anything. The price is travel, and never seeing two things at once.
//
// Nothing here is wired to a server: the deck, the table and the fields are fixtures, so the
// placement can be judged without a session. Two things are real on purpose — `CardPreview`
// compiles the card and `TableRenderer` draws the table, because one renderer draws a card and
// one renderer draws a table (K9, E2) and a prototype must not fork a second.
// `?bare` drops the switcher.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Snapshot } from '@byd/protocol'
import type { Element, FaceTemplate, Row } from '@byd/template'
import { CardPreview } from '../../editor/CardPreview.js'
import { LayerList } from '../../editor/LayerList.js'
import { TableRenderer } from '../../table/TableRenderer.js'
import { useRoving } from '../../editor/roving.js'
import { Switcher } from './Switcher.js'
import '../../editor/editor.css'
import '../../table/table.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Allt ryms' },
  { key: 'B', name: 'Ark på begäran' },
  { key: 'C', name: 'Etapper' },
]

type Variant = 'A' | 'B' | 'C'
type Surface = 'wizard' | 'editor' | 'observe'
const SURFACES: { key: Surface; label: string; route: string }[] = [
  { key: 'wizard', label: 'Wizarden', route: '/new' },
  { key: 'editor', label: 'Editorn', route: '/editor' },
  { key: 'observe', label: 'Observatören', route: '/observe' },
]

// ---------------------------------------------------------------------------
// Fixtures. A small deck through the real compiler, and a table through the real renderer.
// ---------------------------------------------------------------------------
const FRONT: FaceTemplate = {
  base: [
    { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#f4ead8', stroke: '#3a2a1a', strokeMm: 0.6, radiusMm: 3 },
    { kind: 'shape', id: 'art', x: 4, y: 4, w: 55, h: 36, shape: 'rect', fill: '#c9b8a0', radiusMm: 2 },
    { kind: 'text', id: 'title', x: 5, y: 42, w: 53, h: 9, bind: { field: 'title' }, font: { family: 'Georgia, serif', sizePt: 13, weight: 800 }, color: '#1c1c1c' },
    { kind: 'text', id: 'typ', x: 5, y: 50, w: 53, h: 5, bind: { field: 'typ' }, font: { family: 'system-ui', sizePt: 7 }, color: '#7a6a55', fit: 'fixed' },
    { kind: 'text', id: 'body', x: 5, y: 56, w: 53, h: 27, bind: { field: 'body' }, font: { family: 'system-ui', sizePt: 8.5 }, color: '#333' },
    { kind: 'shape', id: 'costbg', x: 49, y: 4.5, w: 9, h: 9, shape: 'circle', fill: '#8b2e2e' },
    { kind: 'text', id: 'cost', x: 48, y: 5.5, w: 11, h: 8, bind: { field: 'cost' }, font: { family: 'system-ui', sizePt: 14, weight: 800, align: 'center' }, color: '#fff', fit: 'fixed' },
  ],
  variants: {},
}
const ROW: Row = { title: 'Drake', typ: 'varelse', cost: '5', body: 'Flygande. När detta kort spelas: dra ett kort.' }
const ICONS: Record<string, string> = {}
// Top-most first, the way the layer list is read.
const LAYERS: Element[] = [...FRONT.base].reverse()
const FIELDS = ['title', 'typ', 'cost', 'body', 'antal']
const GROUPS = ['varelse', 'besvärjelse', 'land']
const TOOLS = [
  { kind: 'text', name: 'Text', glyph: 'T' },
  { kind: 'image', name: 'Bild', glyph: '▣' },
  { kind: 'icons', name: 'Ikonrad', glyph: '●●' },
  { kind: 'shape', name: 'Form', glyph: '◻' },
]
const DECK = ['Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa', 'Bard', 'Jätte', 'Vargar', 'Fälla']
const FEED = [
  'Bordet flyttade ett kort till Spelyta',
  'Bordet vände ett kort',
  'Ada spelade Drake',
  'Bordet drog 3 från Draghög',
  'Bo la Torn i Kasthög',
  'Cy vände ett kort',
  'Bordet flyttade ett kort till Marknad',
  'Di drog ett kort',
]
const SEATS = [
  { id: 'A', name: 'Ada' },
  { id: 'B', name: 'Bo' },
  { id: 'C', name: 'Cy' },
  { id: 'D', name: 'Di' },
]

// The table the observer watches, in the shape the projection sends (K2). A fixture, not a
// second renderer: `TableRenderer` below is the one that draws it.
const VIEW: Snapshot = (() => {
  const type = { id: 'card.standard.63x88', version: 1 }
  const zones: Snapshot['zones'] = [
    { mode: 'order', id: 'table', kind: 'area', name: 'Spelyta', dynamic: false, geometry: { x: -600, y: -400, w: 1200, h: 800, rot: 0 }, order: [] },
    { mode: 'count', id: 'draw', kind: 'pile', name: 'Draghög', dynamic: false, geometry: { x: -140, y: 0, w: 0, h: 0, rot: 0 }, count: 8 },
    { mode: 'order', id: 'discard', kind: 'pile', name: 'Kasthög', dynamic: false, geometry: { x: 140, y: 0, w: 0, h: 0, rot: 0 }, order: ['c-discard'] },
    { mode: 'order', id: 'market', kind: 'area', name: 'Marknad', dynamic: false, geometry: { x: -330, y: -330, w: 660, h: 120, rot: 0 }, order: [] },
    ...SEATS.map((s, i) => {
      const box = [
        { x: -250, y: -400, w: 500, h: 60 },
        { x: 540, y: -250, w: 60, h: 500 },
        { x: -250, y: 340, w: 500, h: 60 },
        { x: -600, y: -250, w: 60, h: 500 },
      ][i] ?? { x: 0, y: 0, w: 0, h: 0 }
      return {
        mode: 'order' as const,
        id: `hand:${s.id}`,
        kind: 'hand' as const,
        name: 'Hand',
        owner: s.id,
        dynamic: false,
        geometry: { ...box, rot: 0 },
        order: [`h${s.id}1`, `h${s.id}2`, `h${s.id}3`],
      }
    }),
  ]
  const components: Snapshot['components'] = [
    { id: 'c-discard', type, zone: 'discard', face: 'front', x: 140, y: 0, rot: 0, cardRef: 'torn' },
    ...SEATS.flatMap((s, si) =>
      [0, 1, 2].map((k) => {
        const along = -70 + k * 70
        const pos = [
          { x: along, y: -370 },
          { x: 570, y: along },
          { x: along, y: 370 },
          { x: -570, y: along },
        ][si] ?? { x: 0, y: 0 }
        return { id: `h${s.id}${k + 1}`, type, zone: `hand:${s.id}`, face: 'front' as const, ...pos, rot: si % 2 === 0 ? 0 : 90, cardRef: DECK[(si * 3 + k + 4) % DECK.length] ?? 'kort' }
      }),
    ),
  ]
  return { seq: 25, seat: null, floor: 'table', seats: SEATS.map((s) => ({ id: s.id, name: s.name })), zones, components, rewind: null, undo: null, ended: false }
})()

// ---------------------------------------------------------------------------
// The prototype's own frame.
// ---------------------------------------------------------------------------
export function ResponsivePrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState<Variant>((params.get('variant') as Variant) || 'A')
  const [surface, setSurface] = useState<Surface>((params.get('yta') as Surface) || 'editor')
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('variant', variant)
    url.searchParams.set('yta', surface)
    history.replaceState(null, '', url)
  }, [variant, surface])
  const { itemProps } = useRoving({ ids: SURFACES.map((s) => s.key), selected: surface, orientation: 'horizontal' })
  return (
    <div className="byd-rp" data-variant={variant}>
      <div className="byd-rp-bar">
        <div role="tablist" aria-label="Yta" className="byd-rp-surfaces">
          {SURFACES.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={surface === s.key ? 'true' : 'false'}
              onClick={() => setSurface(s.key)}
              {...itemProps(s.key)}
            >
              {s.label} <em>{s.route}</em>
            </button>
          ))}
        </div>
        <span className="byd-rp-width" role="status">
          {width}&nbsp;px
        </span>
      </div>
      <div className="byd-rp-stage">
        {surface === 'wizard' && <WizardScene variant={variant} />}
        {surface === 'editor' && <EditorScene variant={variant} />}
        {surface === 'observe' && <ObserverScene variant={variant} />}
      </div>
      <Switcher variants={VARIANTS} current={variant} onChange={(k) => setVariant(k as Variant)} />
    </div>
  )
}

// Which shape the room allows. C mounts either its stages or its desk, never both: the same
// panel rendered twice would put two of every widget — and two of every element id — in one
// document, and a screen reader would read the hidden copy as real.
function useDesk(): boolean {
  const [desk, setDesk] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setDesk(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desk
}

// ---------------------------------------------------------------------------
// A sheet: variant B's one new widget. A dialog, not a trap — it is announced modal, it takes
// focus, Escape closes it, and the focus goes back to the button that opened it.
// ---------------------------------------------------------------------------
function Sheet({ title, side = 'bottom', onClose, children }: { title: string; side?: 'bottom' | 'right'; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const headingId = useId()
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      if (e.key !== 'Tab' || !ref.current) return
      // Contained while it is open, and only then: a modal keeps the tab ring inside itself, and
      // Escape is always the way out — that is a dialog, not a focus trap.
      const focusable = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <>
      <div className="byd-rp-scrim" onClick={onClose} />
      <div className="byd-rp-sheet" data-side={side} role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1} ref={ref}>
        <div className="byd-rp-sheet-head">
          <h2 id={headingId}>{title}</h2>
          <button type="button" onClick={onClose}>
            Stäng
          </button>
        </div>
        <div className="byd-rp-sheet-body">{children}</div>
      </div>
    </>
  )
}

// A button that opens a sheet, and gets the focus back when it closes. Used by variant B.
function useSheet() {
  const [open, setOpen] = useState<string | null>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    setOpen(null)
    opener.current?.focus()
  }
  const openProps = (key: string) => ({
    type: 'button' as const,
    'aria-expanded': open === key,
    'aria-haspopup': 'dialog' as const,
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      opener.current = e.currentTarget
      setOpen(key)
    },
  })
  return { open, close, openProps }
}

// ---------------------------------------------------------------------------
// Stages: variant C's one new idea. A flat tablist with a roving tabindex — the pattern the
// editor already uses (#11, #18) — and one panel at a time. No nesting, nothing overlapping.
// ---------------------------------------------------------------------------
type Stage = { key: string; label: string }
function Stages({ stages, current, onSelect, place = 'top', label, after }: { stages: Stage[]; current: string; onSelect(key: string): void; place?: 'top' | 'bottom'; label: string; after?: ReactNode }) {
  const { itemProps } = useRoving({ ids: stages.map((s) => s.key), selected: current, orientation: 'horizontal' })
  return (
    <div className="byd-rp-stagebar" data-place={place}>
      <div className="byd-rp-stages" role="tablist" aria-label={label}>
      {stages.map((s) => (
        <button
          key={s.key}
          type="button"
          role="tab"
          id={`stage-tab-${s.key}`}
          aria-controls={`stage-panel-${s.key}`}
          aria-selected={current === s.key ? 'true' : 'false'}
          onClick={() => onSelect(s.key)}
          {...itemProps(s.key)}
          // The strip scrolls on a phone, so the tab the arrows moved to must come into view or
          // the roving tabindex would move focus somewhere nobody can see.
          onFocus={(e) => {
            itemProps(s.key).onFocus()
            e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }}
        >
          {s.label}
        </button>
      ))}
      </div>
      {after}
    </div>
  )
}
function StagePanel({ stage, current, children }: { stage: string; current: string; children: ReactNode }) {
  return (
    <div className="byd-rp-stage-panel" id={`stage-panel-${stage}`} role="tabpanel" aria-labelledby={`stage-tab-${stage}`} tabIndex={0} hidden={stage !== current}>
      {stage === current && children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// /new — the wizard.
// ---------------------------------------------------------------------------
function WizardScene({ variant }: { variant: Variant }) {
  const [players, setPlayers] = useState(2)
  const [frame, setFrame] = useState('Klassisk')
  const [step, setStep] = useState('korten')
  const sheet = useSheet()
  const steps: Stage[] = [
    { key: 'spelet', label: '1 · Spelet' },
    { key: 'falten', label: '2 · Fälten' },
    { key: 'korten', label: '3 · Korten' },
  ]
  const spelet = (
    <section className="byd-rp-w-block" aria-labelledby="w-spelet">
      <h2 id="w-spelet">
        <b>1</b> Spelets namn
      </h2>
      <label className="byd-rp-field">
        <span>Namn</span>
        <input defaultValue="" placeholder="Skogens herrar" />
      </label>
      <fieldset className="byd-rp-players">
        <legend>Spelare</legend>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button key={n} type="button" aria-pressed={players === n} onClick={() => setPlayers(n)}>
            {n}
          </button>
        ))}
      </fieldset>
    </section>
  )
  const falten = (
    <section className="byd-rp-w-block" aria-labelledby="w-falten">
      <h2 id="w-falten">
        <b>2</b> Fält
      </h2>
      <p>Varje fält blir direkt en kontroll på varje exempelkort.</p>
      <ul className="byd-rp-w-fields">
        {[
          ['Text', 'Titel'],
          ['Tal', 'Kostnad'],
          ['Text', 'Text'],
          ['Bild', 'Illustration'],
        ].map(([kind, name]) => (
          <li key={name}>
            <span className="byd-rp-tag">{kind}</span>
            <input defaultValue={name} aria-label={`Fältets namn: ${name}`} />
            <button type="button" aria-label={`Ta bort fältet ${name}`}>×</button>
          </li>
        ))}
      </ul>
      <div className="byd-rp-w-add">
        <button type="button">+ Textfält</button>
        <button type="button">+ Talfält</button>
        <button type="button">+ Bildfält</button>
      </div>
      <fieldset className="byd-rp-w-frames">
        <legend>Startram</legend>
        {['Klassisk', 'Minimal', 'Mörk'].map((f) => (
          <button key={f} type="button" aria-pressed={frame === f} onClick={() => setFrame(f)}>
            {f}
          </button>
        ))}
      </fieldset>
    </section>
  )
  const preview = (
    <div className="byd-rp-w-preview">
      <CardPreview id="rp-wizard-card" face={FRONT} row={ROW} icons={ICONS} scale={0.72} />
      <span>Levande förhandsvisning</span>
    </div>
  )
  const cardForm = (
    <div className="byd-rp-w-form">
      <label className="byd-rp-field">
        <span>Titel</span>
        <input defaultValue="Drake" />
      </label>
      <label className="byd-rp-field">
        <span>Kostnad</span>
        <input defaultValue="5" inputMode="numeric" />
      </label>
      <label className="byd-rp-field is-wide">
        <span>Text</span>
        <textarea defaultValue="Flygande. När detta kort spelas: dra ett kort." rows={3} />
      </label>
      <div className="byd-rp-field is-wide">
        <span>Illustration</span>
        <div className="byd-rp-w-image">
          <i>Ingen bild vald</i>
          <button type="button">Välj bild</button>
        </div>
      </div>
    </div>
  )
  const korten = (
    <section className="byd-rp-w-block" aria-labelledby="w-korten">
      <h2 id="w-korten">
        <b>3</b> Gör några exempelkort
      </h2>
      {/* A — the preview sticks to the top of the scroll, so the card never leaves while the
          fields under it are typed in. B — the preview is a dock at the bottom of the screen and
          opens large in a sheet. C — the preview owns the top of its own step. */}
      {variant !== 'B' && <div className="byd-rp-w-workspace">{preview}</div>}
      {cardForm}
      <div className="byd-rp-w-tabs">
        <button type="button" aria-pressed="true">
          <b>1</b> Drake
        </button>
        <button type="button">+ Nytt kort</button>
      </div>
      <footer className="byd-rp-w-footer">
        <p>Du kan lägga till resten av leken, importera CSV och finjustera mallen efter nästa steg.</p>
        <button type="button" className="byd-rp-primary">
          Skapa spelet och fortsätt i editorn →
        </button>
      </footer>
    </section>
  )
  return (
    <div className="byd-rp-wizard" data-page="new">
      <header>
        <div>
          <span>Guidad start</span>
          <h1>Ge spelet en flygande start</h1>
        </div>
        <span className="byd-rp-w-meta">3 enkla steg · cirka 3 min</span>
      </header>
      {variant === 'C' ? (
        <>
          <Stages stages={steps} current={step} onSelect={setStep} label="Steg" />
          <div className="byd-rp-w-body">
            <StagePanel stage="spelet" current={step}>
              {spelet}
            </StagePanel>
            <StagePanel stage="falten" current={step}>
              {falten}
            </StagePanel>
            <StagePanel stage="korten" current={step}>
              {korten}
            </StagePanel>
          </div>
          <nav className="byd-rp-w-steps" aria-label="Stegnavigering">
            <button type="button" disabled={step === 'spelet'} onClick={() => setStep(steps[steps.findIndex((s) => s.key === step) - 1]?.key ?? step)}>
              ← Föregående
            </button>
            <button type="button" className="byd-rp-primary" disabled={step === 'korten'} onClick={() => setStep(steps[steps.findIndex((s) => s.key === step) + 1]?.key ?? step)}>
              Nästa →
            </button>
          </nav>
        </>
      ) : (
        <div className="byd-rp-w-body">
          <aside>
            {spelet}
            {falten}
          </aside>
          <main>{korten}</main>
        </div>
      )}
      {variant === 'B' && (
        <>
          <div className="byd-rp-w-dock">
            <CardPreview id="rp-wizard-dock" face={FRONT} row={ROW} icons={ICONS} scale={0.2} />
            <span>Drake · förhandsvisning</span>
            <button className="byd-rp-primary" {...sheet.openProps('preview')}>
              Visa stort
            </button>
          </div>
          {sheet.open === 'preview' && (
            <Sheet title="Förhandsvisning" onClose={sheet.close}>
              {preview}
            </Sheet>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// /editor — the tool-rich one. Four modes; Mall has four panels of its own.
// ---------------------------------------------------------------------------
type Mode = 'wall' | 'template' | 'table' | 'tables'
const MODES: { key: Mode; label: string }[] = [
  { key: 'wall', label: 'Kortvägg' },
  { key: 'template', label: 'Mall' },
  { key: 'table', label: 'Tabell' },
  { key: 'tables', label: 'Bord' },
]
// Variant C flattens Mall's four panels into the same list: on a phone there is one tablist and
// seven stages, not a tablist inside a tablist.
const C_STAGES: Stage[] = [
  { key: 'wall', label: 'Kortvägg' },
  { key: 'tools', label: 'Verktyg' },
  { key: 'layers', label: 'Lager' },
  { key: 'canvas', label: 'Duk' },
  { key: 'props', label: 'Egenskaper' },
  { key: 'table', label: 'Tabell' },
  { key: 'tables', label: 'Bord' },
]

const MALL_STAGES = new Set(['tools', 'layers', 'canvas', 'props'])
function EditorScene({ variant }: { variant: Variant }) {
  const [stage, setStage] = useState('canvas')
  const [ownMode, setMode] = useState<Mode>('template')
  // C has one state: which stage is open. The header's four modes are that state seen coarsely.
  const mode: Mode = variant !== 'C' ? ownMode : MALL_STAGES.has(stage) ? 'template' : (stage as Mode)
  const [element, setElement] = useState<string | null>('title')
  const [group, setGroup] = useState<string | null>(null)
  const [face, setFace] = useState('front')
  const sheet = useSheet()
  const desk = useDesk()
  const modeTabs = useRoving({ ids: MODES.map((m) => m.key), selected: mode, orientation: 'horizontal' })

  const tools = (
    <div className="byd-rp-tools" role="toolbar" aria-label="Verktyg" aria-orientation="vertical">
      <ToolButtons />
    </div>
  )
  const layers = (
    <div className="byd-rp-layers">
      <h2 id="rp-layers-heading">Lager · framsida</h2>
      <p className="byd-rp-quiet">Alla 30 kort</p>
      <LayerList layers={LAYERS} selected={element} onSelect={setElement} labelledBy="rp-layers-heading" />
    </div>
  )
  const strip = (
    <div className="byd-rp-strip">
      <label className="byd-rp-groupcol">
        <span>Grupperas av</span>
        <select defaultValue="typ">
          <option value="">— ingen —</option>
          {FIELDS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <GroupTabs group={group} onSelect={setGroup} />
      <FaceSwitch face={face} onSelect={setFace} />
    </div>
  )
  const canvas = (
    <div className="byd-rp-canvas">
      {strip}
      <div className="byd-rp-stagecard">
        <CardPreview id="rp-editor-card" face={FRONT} row={ROW} icons={ICONS} scale={1} selectedElement={element} onSelectElement={setElement} />
      </div>
    </div>
  )
  const props = (
    <div className="byd-rp-props">
      <h2>Egenskaper</h2>
      {element ? <PropertyForm element={element} /> : <p className="byd-rp-quiet">Välj ett lager eller ett element på kortet.</p>}
    </div>
  )
  const wall = (
    <div className="byd-rp-wall" role="list">
      {DECK.map((name) => (
        <div key={name} role="listitem" className="byd-rp-wall-card" tabIndex={0}>
          <CardPreview id={`rp-wall-${name}`} face={FRONT} row={{ ...ROW, title: name }} icons={ICONS} scale={0.42} />
        </div>
      ))}
    </div>
  )
  const data = <DataGrid />
  const tables = (
    <div className="byd-rp-tables">
      <h2>Bord</h2>
      <p className="byd-rp-quiet">Inget bord igång. &quot;Uppdatera bordet&quot; startar ett.</p>
    </div>
  )

  const header = (
    <header className="byd-rp-e-head">
      <a className="byd-rp-home" href="#">
        Mina spel
      </a>
      <strong>Skogens herrar</strong>
      <span className="byd-rp-quiet">rev 1</span>
      <span className="byd-rp-saved" role="status" data-unsaved="true">
        Osparade ändringar
      </span>
      {/* C's four modes live in the stage bar below the desk and in the header above it; only
          one of the two is ever in the document's focus order, the other is display:none. */}
      <nav role="tablist" aria-label="Editorlägen" className="byd-rp-modes">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={mode === m.key ? 'true' : 'false'}
              onClick={() => {
                setMode(m.key)
                // On the desk C shows the four Mall columns at once, so "Mall" means the canvas.
                if (variant === 'C') setStage(m.key === 'template' ? 'canvas' : m.key === 'table' ? 'table' : m.key)
              }}
              {...modeTabs.itemProps(m.key)}
              onFocus={(e) => {
                modeTabs.itemProps(m.key).onFocus()
                e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
              }}
            >
              {m.label}
            </button>
        ))}
      </nav>
      <span className="byd-rp-spacer" />
      {/* A keeps every action in the header and lets the header wrap. B keeps one row and puts
          the secondary actions in a sheet. C keeps one row because the modes have left it. */}
      {variant === 'B' ? (
        <>
          <button type="button" className="byd-rp-primary">
            Uppdatera bordet
          </button>
          <button className="byd-rp-more" aria-label="Fler åtgärder" {...sheet.openProps('actions')}>
            ⋯
          </button>
        </>
      ) : (
        <span className="byd-rp-head-actions">
          <button type="button">Spara</button>
          <button type="button" className="byd-rp-primary">
            Uppdatera bordet
          </button>
          <button type="button" aria-label="Fler bordsval">
            ▾
          </button>
        </span>
      )}
    </header>
  )

  if (variant === 'C') {
    if (desk) {
      return (
        <div className="byd-rp-editor" data-page="editor" data-variant="C">
          {header}
          <div className="byd-rp-e-body">
            {mode === 'wall' ? wall : mode === 'table' ? data : mode === 'tables' ? tables : (
              <div className="byd-rp-e-desk">
                {tools}
                {layers}
                {canvas}
                {props}
              </div>
            )}
          </div>
        </div>
      )
    }
    return (
      <div className="byd-rp-editor" data-page="editor" data-variant="C">
        {header}
        <div className="byd-rp-e-body">
          <StagePanel stage="wall" current={stage}>
            {wall}
          </StagePanel>
          <StagePanel stage="tools" current={stage}>
            <div className="byd-rp-tools" data-wide role="toolbar" aria-label="Verktyg">
              <ToolButtons />
            </div>
          </StagePanel>
          <StagePanel stage="layers" current={stage}>
            {layers}
          </StagePanel>
          <StagePanel stage="canvas" current={stage}>
            {canvas}
          </StagePanel>
          <StagePanel stage="props" current={stage}>
            {props}
          </StagePanel>
          <StagePanel stage="table" current={stage}>
            {data}
          </StagePanel>
          <StagePanel stage="tables" current={stage}>
            {tables}
          </StagePanel>
        </div>
        <Stages
          stages={C_STAGES}
          current={stage}
          onSelect={setStage}
          place="bottom"
          label="Editorns etapper"
          after={
            <div className="byd-rp-stagebar-actions">
              <button type="button">Spara</button>
              <button type="button" className="byd-rp-primary">
                Uppdatera bordet
              </button>
            </div>
          }
        />
      </div>
    )
  }

  const body =
    mode === 'wall' ? wall : mode === 'table' ? data : mode === 'tables' ? tables : null
  return (
    <div className="byd-rp-editor" data-page="editor">
      {header}
      <div className="byd-rp-e-body">
        {body ?? (
          <div className="byd-rp-e-canvasgrid">
            {variant === 'A' ? (
              <>
                {tools}
                {canvas}
                {layers}
                {props}
              </>
            ) : (
              <>
                {tools}
                {layers}
                {canvas}
                {props}
              </>
            )}
          </div>
        )}
      </div>
      {variant === 'B' && mode === 'template' && (
        <div className="byd-rp-dockbar">
          <button {...sheet.openProps('tools')}>Verktyg</button>
          <button {...sheet.openProps('layers')}>Lager</button>
          <button {...sheet.openProps('props')}>Egenskaper</button>
        </div>
      )}
      {variant === 'B' && sheet.open === 'tools' && (
        <Sheet title="Verktyg" onClose={sheet.close}>
          <div className="byd-rp-tools" data-wide role="toolbar" aria-label="Verktyg">
            <ToolButtons />
          </div>
        </Sheet>
      )}
      {variant === 'B' && sheet.open === 'layers' && (
        <Sheet title="Lager" side="right" onClose={sheet.close}>
          {layers}
        </Sheet>
      )}
      {variant === 'B' && sheet.open === 'props' && (
        <Sheet title="Egenskaper" side="right" onClose={sheet.close}>
          {props}
        </Sheet>
      )}
      {variant === 'B' && sheet.open === 'actions' && (
        <Sheet title="Åtgärder" onClose={sheet.close}>
          <div className="byd-rp-sheet-actions">
            <button type="button">Spara</button>
            <button type="button">Nytt bord</button>
            <button type="button">Visa bord</button>
            <button type="button">Öppna bordet i ny flik</button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function ToolButtons() {
  const { itemProps } = useRoving({ ids: TOOLS.map((t) => t.kind), selected: null, orientation: 'vertical' })
  return (
    <>
      {TOOLS.map((t) => (
        <button key={t.kind} type="button" {...itemProps(t.kind)}>
          <span aria-hidden="true">{t.glyph}</span>
          {t.name}
        </button>
      ))}
    </>
  )
}

function GroupTabs({ group, onSelect }: { group: string | null; onSelect(g: string | null): void }) {
  const ids = ['', ...GROUPS]
  const { itemProps } = useRoving({ ids, selected: group ?? '', orientation: 'horizontal' })
  return (
    <div className="byd-rp-grouptabs" role="tablist" aria-label="Kortgrupper">
      {ids.map((g) => (
        <button
          key={g || 'base'}
          type="button"
          role="tab"
          aria-selected={(group ?? '') === g ? 'true' : 'false'}
          onClick={() => onSelect(g || null)}
          {...itemProps(g)}
          onFocus={(e) => {
            itemProps(g).onFocus()
            e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }}
        >
          {g === '' ? 'Bas (alla)' : `typ = ${g}`}
        </button>
      ))}
    </div>
  )
}

function FaceSwitch({ face, onSelect }: { face: string; onSelect(f: string): void }) {
  const faces = ['front', 'back']
  const names: Record<string, string> = { front: 'Framsida', back: 'Baksida' }
  const { itemProps } = useRoving({ ids: faces, selected: face, orientation: 'horizontal', followFocus: true, onActivate: onSelect })
  return (
    <div className="byd-rp-faces" role="radiogroup" aria-label="Kortsida">
      {faces.map((f) => (
        <button key={f} type="button" role="radio" aria-checked={f === face ? 'true' : 'false'} onClick={() => onSelect(f)} {...itemProps(f)}>
          {names[f]}
        </button>
      ))}
    </div>
  )
}

function PropertyForm({ element }: { element: string }) {
  return (
    <div className="byd-rp-propform">
      <p className="byd-rp-quiet">text · {element}</p>
      {[
        ['X (mm)', '5'],
        ['Y (mm)', '42'],
        ['Bredd (mm)', '53'],
        ['Höjd (mm)', '9'],
        ['Storlek (pt)', '13'],
      ].map(([label, value]) => (
        <label key={label} className="byd-rp-field">
          <span>{label}</span>
          <input type="number" defaultValue={value} />
        </label>
      ))}
      <label className="byd-rp-field">
        <span>Fält</span>
        <select defaultValue="title">
          {FIELDS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

// The data table. The one thing every variant answers the same way, because there is only one
// honest answer for a wide table on a narrow screen: the table scrolls inside its own box, the
// page does not, and the column that deletes a row is pinned where it cannot be scrolled away.
function DataGrid() {
  return (
    <div className="byd-rp-data">
      <div className="byd-rp-data-tools">
        <input className="byd-rp-search" placeholder="Sök i alla fält" aria-label="Sök i alla fält" />
        <button type="button">Importera CSV</button>
        <button type="button">Exportera CSV</button>
      </div>
      <div className="byd-rp-data-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">title</th>
              <th scope="col">typ</th>
              <th scope="col">cost</th>
              <th scope="col">body</th>
              <th scope="col">antal</th>
              <th scope="col" className="byd-rp-data-del">
                <span className="byd-rp-sr">Ta bort</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {DECK.map((name, i) => (
              <tr key={name}>
                <td>
                  <input defaultValue={name} aria-label={`title för ${name}`} />
                </td>
                <td>
                  <input defaultValue={['varelse', 'besvärjelse', 'land'][i % 3]} aria-label={`typ för ${name}`} />
                </td>
                <td>
                  <input defaultValue={String(1 + (i % 5))} aria-label={`cost för ${name}`} />
                </td>
                <td>
                  <input defaultValue="När detta kort spelas: dra ett kort." aria-label={`body för ${name}`} />
                </td>
                <td>
                  <input defaultValue={String(1 + (i % 3))} aria-label={`antal för ${name}`} />
                </td>
                <td className="byd-rp-data-del">
                  <button type="button" aria-label={`Ta bort raden ${name}`}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// /observe — the one rule that is not open to variation: chrome never covers the game.
// ---------------------------------------------------------------------------
function ObserverScene({ variant }: { variant: Variant }) {
  const [stage, setStage] = useState('bordet')
  const sheet = useSheet()
  const desk = useDesk()
  const stages: Stage[] = [
    { key: 'bordet', label: 'Bordet' },
    { key: 'senast', label: 'Senast' },
    { key: 'platser', label: 'Platser' },
  ]
  const feed = (
    <section className="byd-rp-feed" aria-labelledby="rp-feed">
      <h2 id="rp-feed">Senast</h2>
      <ol>
        {FEED.map((line, i) => (
          <li key={line}>
            <b>{25 - i}</b>
            <span>{line}</span>
          </li>
        ))}
      </ol>
    </section>
  )
  const seats = (
    <section className="byd-rp-seats" aria-labelledby="rp-seats">
      <h2 id="rp-seats">Platser</h2>
      <ul>
        {SEATS.map((s, i) => (
          <li key={s.id} data-seat={i}>
            <i aria-hidden="true">{s.id}</i>
            <div>
              <strong>{s.name}</strong>
              <span>3 kort på hand</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
  // The observer's own status, and the one thing she may do. In every variant it is a row of the
  // layout — never a floating banner over the table, which is what #6 is about.
  const status = (
    <div className="byd-rp-obs-status">
      <span className="byd-rp-obs-mark">
        <i aria-hidden="true" />
        Eva tittar på · ser allas händer
      </span>
      <button type="button" className="byd-rp-primary">
        ⚑ Flagga
      </button>
    </div>
  )
  // The one renderer (K9): the observer never gets a second way to draw a table.
  const table = (
    <div className="byd-rp-felt">
      <TableRenderer view={VIEW} mode="tv" />
    </div>
  )
  if (variant === 'C') {
    if (desk) {
      return (
        <div className="byd-rp-observe" data-page="observe" data-variant="C">
          {status}
          <div className="byd-rp-obs-body byd-rp-obs-desk">
            {table}
            <aside>
              {feed}
              {seats}
            </aside>
          </div>
        </div>
      )
    }
    return (
      <div className="byd-rp-observe" data-page="observe" data-variant="C">
        {status}
        <div className="byd-rp-obs-body">
          <StagePanel stage="bordet" current={stage}>
            {table}
          </StagePanel>
          <StagePanel stage="senast" current={stage}>
            {feed}
          </StagePanel>
          <StagePanel stage="platser" current={stage}>
            {seats}
          </StagePanel>
        </div>
        <Stages stages={stages} current={stage} onSelect={setStage} place="bottom" label="Observatörens etapper" />
      </div>
    )
  }
  if (variant === 'B') {
    return (
      <div className="byd-rp-observe" data-page="observe" data-variant="B">
        <div className="byd-rp-obs-body">
          {table}
          <aside>
            {feed}
            {seats}
          </aside>
        </div>
        <div className="byd-rp-obs-handle">
          <span className="byd-rp-obs-mark">
            <i aria-hidden="true" />
            Eva tittar på
          </span>
          <button {...sheet.openProps('more')}>
            Senast ▲
          </button>
          <button type="button" className="byd-rp-primary">
            ⚑ Flagga
          </button>
        </div>
        {sheet.open === 'more' && (
          <Sheet title="Senast och platser" onClose={sheet.close}>
            <p className="byd-rp-obs-full">Du är observatör: du ser allas händer och alla högar. Alla vet att du är här.</p>
            {feed}
            {seats}
          </Sheet>
        )}
      </div>
    )
  }
  return (
    <div className="byd-rp-observe" data-page="observe" data-variant="A">
      {status}
      <div className="byd-rp-obs-body">
        {table}
        <aside>
          {feed}
          {seats}
        </aside>
      </div>
    </div>
  )
}
