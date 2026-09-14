/* PROTOTYPE — THROWAWAY. Delete or fold in once a variant has won (see NOTES below).
 *
 * The question: what should the editor look like once a shape can be something other than a
 * rectangle, can carry a shadow, and can be filled with a repeated pattern — and where does a
 * designer pick a ready-made back?
 *
 * Three variants on `/prototype/former?variant=A|B|C`, switchable from the bar at the bottom.
 * The card is drawn by the real compiler through the real `CardPreview`, and every glyph in every
 * gallery is drawn by the same `pathFor` and `tileMarkup` the card uses — so nothing here is a
 * mock-up of the geometry, only of the panel around it.
 */
import { useState, type ReactNode } from 'react'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { pathFor, tileMarkup, shapeTakes, type Element, type FaceTemplate, type Pattern, type Shadow } from '@byd/template'
import { CardPreview } from './CardPreview.js'
import './editor.css'

type Shape = Extract<Element, { kind: 'shape' }>
type Geom = Pick<Shape, 'shape' | 'corners' | 'innerRatio' | 'rotationDeg' | 'radiusMm'>

// --- the galleries under test -------------------------------------------------------------

const GALLERY: { id: string; name: string; geom: Geom }[] = [
  { id: 'rect', name: 'Rektangel', geom: { shape: 'rect' } },
  { id: 'rounded', name: 'Rundad', geom: { shape: 'rect', radiusMm: 3 } },
  { id: 'capsule', name: 'Kapsel', geom: { shape: 'rect', radiusMm: 99 } },
  { id: 'circle', name: 'Cirkel', geom: { shape: 'circle' } },
  { id: 'line', name: 'Linje', geom: { shape: 'line' } },
  { id: 'triangle', name: 'Triangel', geom: { shape: 'polygon', corners: 3 } },
  { id: 'diamond', name: 'Romb', geom: { shape: 'polygon', corners: 4 } },
  { id: 'square', name: 'Kvadrat', geom: { shape: 'polygon', corners: 4, rotationDeg: 45 } },
  { id: 'penta', name: 'Femhörning', geom: { shape: 'polygon', corners: 5 } },
  { id: 'hexa', name: 'Sexhörning', geom: { shape: 'polygon', corners: 6 } },
  { id: 'hexa-flat', name: 'Sexhörning, platt', geom: { shape: 'polygon', corners: 6, rotationDeg: 30 } },
  { id: 'octa', name: 'Oktagon', geom: { shape: 'polygon', corners: 8, rotationDeg: 22.5 } },
  { id: 'star5', name: 'Stjärna', geom: { shape: 'star', corners: 5, innerRatio: 0.45 } },
  { id: 'star6', name: 'Sexuddig stjärna', geom: { shape: 'star', corners: 6, innerRatio: 0.55 } },
  { id: 'shield', name: 'Sköld', geom: { shape: 'shield' } },
  { id: 'banner', name: 'Banderoll', geom: { shape: 'banner' } },
  { id: 'arrow', name: 'Pil', geom: { shape: 'arrow' } },
]

const SHADOWS: { id: string; name: string; shadow: Shadow | undefined }[] = [
  { id: 'none', name: 'Ingen', shadow: undefined },
  { id: 'soft', name: 'Mjuk', shadow: { dxMm: 0, dyMm: 0.6, blurMm: 1.2, color: '#000000', opacity: 0.35 } },
  { id: 'hard', name: 'Hård', shadow: { dxMm: 0.5, dyMm: 0.5, blurMm: 0, color: '#000000', opacity: 0.5 } },
  { id: 'lift', name: 'Upphöjd', shadow: { dxMm: 0, dyMm: 1.6, blurMm: 2.6, color: '#000000', opacity: 0.45 } },
]

const PATTERNS: Pattern['kind'][] = ['stripes', 'grid', 'dots', 'diamonds', 'chevron']
const PATTERN_NAME: Record<Pattern['kind'], string> = {
  stripes: 'Ränder',
  grid: 'Rutnät',
  dots: 'Prickar',
  diamonds: 'Romber',
  chevron: 'Fiskben',
}

// The ready-made backs (the "standardmönster"). Each one is an ordinary element list, so the
// designer can take it apart afterwards — a starting point, not a locked picture.
const plate = (fill: string, pattern?: Pattern): Element =>
  ({ kind: 'shape', id: 'botten', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill, ...(pattern ? { pattern } : {}) }) as Element
const border = (stroke: string): Element =>
  ({ kind: 'shape', id: 'kant', x: 4, y: 4, w: 55, h: 80, shape: 'rect', radiusMm: 3, stroke, strokeMm: 0.6 }) as Element

const BACKS: { id: string; name: string; base: Element[] }[] = [
  { id: 'plain', name: 'Enfärgad', base: [plate('#2f4068')] },
  { id: 'diamonds', name: 'Romber', base: [plate('#2f4068', { kind: 'diamonds', color: '#3a4d7a', scaleMm: 7 } as Pattern), border('#8ea2cc')] },
  { id: 'stripes', name: 'Diagonala ränder', base: [plate('#6d2230', { kind: 'stripes', color: '#7d2b3a', scaleMm: 5, angleDeg: 45 }), border('#d9a7b0')] },
  { id: 'grid', name: 'Rutnät', base: [plate('#1f3b2f', { kind: 'grid', color: '#2f5a47', scaleMm: 5 }), border('#8fc2ab')] },
  { id: 'dots', name: 'Prickar', base: [plate('#24262e', { kind: 'dots', color: '#343846', scaleMm: 4 }), border('#8d93a8')] },
  { id: 'chevron', name: 'Fiskben', base: [plate('#2b2350', { kind: 'chevron', color: '#3b3070', scaleMm: 6 }), border('#a79ad6')] },
  {
    id: 'medallion',
    name: 'Medaljong',
    base: [
      plate('#2f4068', { kind: 'diamonds', color: '#3a4d7a', scaleMm: 7 }),
      border('#8ea2cc'),
      { kind: 'shape', id: 'medaljong', x: 16, y: 29, w: 31, h: 31, shape: 'circle', fill: '#1d2a48', stroke: '#8ea2cc', strokeMm: 0.6 } as Element,
      { kind: 'shape', id: 'stjärna', x: 22, y: 35, w: 19, h: 19, shape: 'star', corners: 5, innerRatio: 0.45, fill: '#c9b05f' } as Element,
    ],
  },
]

// --- the bits of chrome the variants share ------------------------------------------------

// A gallery glyph, drawn by the same path generator the card is drawn by, so the picture on the
// button can never disagree with what pressing it produces.
function ShapeGlyph({ geom, size = 20 }: { geom: Geom; size?: number }) {
  const inset = 1.2
  // Wider than tall on purpose: a capsule in a square box is a circle, and a gallery where two
  // buttons draw the same picture is a gallery that cannot be read.
  const h = Math.round(size * 0.74)
  const d = pathFor(geom.shape, { x: inset, y: inset, w: size - 2 * inset, h: h - 2 * inset }, geom)
  const open = geom.shape === 'line'
  return (
    <svg viewBox={`0 0 ${size} ${h}`} width={size} height={h} aria-hidden="true">
      <path d={d} fill={open ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth={open ? 2 : 0} strokeLinejoin="round" />
    </svg>
  )
}

function PatternGlyph({ kind, size = 22 }: { kind: Pattern['kind']; size?: number }) {
  const id = `proto-${kind}-${size}`
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      <defs>
        <pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse" dangerouslySetInnerHTML={{ __html: tileMarkup(kind, 7, 'currentColor') }} />
      </defs>
      <rect width={size} height={size} rx="3" fill="#0f1115" />
      <rect width={size} height={size} rx="3" fill={`url(#${id})`} />
    </svg>
  )
}

function BackGlyph({ base }: { base: Element[] }) {
  return (
    <span className="proto-back-glyph">
      <CardPreview id={`proto-back-${base.length}-${String(base[0]?.kind)}-${Math.random().toString(36).slice(2, 7)}`} face={{ base, variants: {} }} row={{}} icons={{}} scale={0.28} />
    </span>
  )
}

// --- the state every variant edits --------------------------------------------------------

const START: Shape = {
  kind: 'shape',
  id: 'platta',
  x: 8,
  y: 26,
  w: 47,
  h: 36,
  shape: 'polygon',
  corners: 6,
  fill: '#8b2e2e',
  shadow: { dxMm: 0, dyMm: 0.6, blurMm: 1.2, color: '#000000', opacity: 0.35 },
} as Shape

type Model = { el: Shape; face: 'front' | 'back'; back: Element[] }

const frontOf = (el: Shape): FaceTemplate => ({
  base: [
    { kind: 'shape', id: 'papper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#f4ead8' } as Element,
    { kind: 'shape', id: 'ram', x: 3, y: 3, w: 57, h: 82, shape: 'rect', radiusMm: 3, stroke: '#3a2a1a', strokeMm: 0.6 } as Element,
    el as Element,
    { kind: 'text', id: 'rubrik', x: 5, y: 8, w: 53, h: 10, bind: { literal: 'Drakryttaren' }, font: { family: 'Georgia, serif', sizePt: 14, weight: 800 }, color: '#1c1c1c' } as Element,
    { kind: 'text', id: 'text', x: 8, y: 66, w: 47, h: 16, bind: { literal: 'Flyger över alla hinder denna runda.' }, font: { family: 'system-ui', sizePt: 8.5 }, color: '#33302c' } as Element,
  ],
  variants: {},
})

export function ShapesPrototypePage() {
  const variant = (new URLSearchParams(location.search).get('variant') ?? 'A').toUpperCase()
  const [model, setModel] = useState<Model>({ el: START, face: 'front', back: BACKS[1]!.base })
  const set = (patch: Partial<Shape>) => setModel((m) => ({ ...m, el: { ...m.el, ...patch } as Shape }))
  const props = { model, set, setModel }
  return (
    <>
      {variant === 'B' ? <VariantB {...props} /> : variant === 'C' ? <VariantC {...props} /> : <VariantA {...props} />}
      <Switcher current={variant} />
    </>
  )
}

type VariantProps = { model: Model; set(patch: Partial<Shape>): void; setModel(next: (m: Model) => Model): void }

// The card, the same in all three, so what differs between the variants is only the panel.
function Stage({ model, children, strip }: { model: Model; children?: ReactNode; strip?: ReactNode }) {
  const face: FaceTemplate = model.face === 'front' ? frontOf(model.el) : { base: model.back, variants: {} }
  return (
    <main className="byd-canvas-main">
      <div className="byd-canvas-strip">{strip}</div>
      <div className="byd-canvas-stage" style={{ position: 'relative' }}>
        <CardPreview id="proto-card" face={face} row={{}} icons={{}} scale={1.55} selectedElement={model.face === 'front' ? 'platta' : null} />
        {children}
      </div>
    </main>
  )
}

function FaceSwitch({ model, setModel, extra }: { model: Model; setModel: VariantProps['setModel']; extra?: ReactNode }) {
  return (
    <div className="byd-canvas-faces">
      {(['front', 'back'] as const).map((f) => (
        <button key={f} type="button" aria-pressed={model.face === f} onClick={() => setModel((m) => ({ ...m, face: f }))}>
          {f === 'front' ? 'Framsida' : 'Baksida'}
        </button>
      ))}
      {extra}
    </div>
  )
}

function Rail() {
  return (
    <nav className="byd-canvas-tools" aria-label="Verktyg">
      {['T', '▣', '●', '●●', '◻'].map((g) => (
        <button key={g} type="button">
          <span>{g}</span>
        </button>
      ))}
    </nav>
  )
}

function Layers({ model }: { model: Model }) {
  const names = model.face === 'front' ? ['text', 'rubrik', 'platta', 'ram', 'papper'] : [...model.back].reverse().map((e) => e.id)
  return (
    <div className="byd-canvas-layers">
      <h2>Lager, {model.face === 'front' ? 'framsida' : 'baksida'}</h2>
      <div className="byd-layers">
        {names.map((n) => (
          <div key={n} role="row" aria-selected={n === 'platta'}>
            <span role="gridcell" />
            <span role="gridcell" className="byd-layer-pick">
              <span className="byd-layer-name">{n}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- the controls, written once and arranged differently by each variant --------------------

function ShapePicker({ model, set, columns = 5 }: VariantProps & { columns?: number }) {
  const same = (g: Geom) =>
    g.shape === model.el.shape &&
    (g.corners ?? null) === (model.el.corners ?? null) &&
    (g.rotationDeg ?? 0) === (model.el.rotationDeg ?? 0) &&
    (g.innerRatio ?? null) === (model.el.innerRatio ?? null) &&
    (g.radiusMm ?? 0) === (model.el.radiusMm ?? 0)
  return (
    <div className="proto-gallery" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {GALLERY.map((g) => (
        <button
          key={g.id}
          type="button"
          title={g.name}
          aria-label={g.name}
          aria-pressed={same(g.geom)}
          onClick={() =>
            set({
              shape: g.geom.shape,
              corners: g.geom.corners,
              innerRatio: g.geom.innerRatio,
              rotationDeg: g.geom.rotationDeg,
              // A capsule is a radius bigger than the box, written out in the box's own terms so
              // the document says a number and not a magic word.
              radiusMm: g.id === 'capsule' ? Math.min(model.el.w, model.el.h) / 2 : g.geom.radiusMm,
            })
          }
        >
          <ShapeGlyph geom={g.geom} />
        </button>
      ))}
    </div>
  )
}

function ShapeNumbers({ model, set }: VariantProps) {
  const takes = shapeTakes(model.el.shape)
  return (
    <>
      {takes.corners && (
        <label>
          Hörn
          <input type="number" min={3} max={24} value={model.el.corners ?? 6} onChange={(e) => set({ corners: Number(e.target.value) })} />
        </label>
      )}
      {takes.radius && (
        <label>
          Hörnradie (mm)
          <input type="number" min={0} step={0.5} value={model.el.radiusMm ?? 0} onChange={(e) => set({ radiusMm: Number(e.target.value) })} />
        </label>
      )}
      {takes.rotation && (
        <label style={{ gridColumn: '1 / -1' }}>
          Vridning {Math.round(model.el.rotationDeg ?? 0)}°
          <input type="range" min={0} max={360} value={model.el.rotationDeg ?? 0} onChange={(e) => set({ rotationDeg: Number(e.target.value) })} />
        </label>
      )}
      {takes.innerRatio && (
        <label style={{ gridColumn: '1 / -1' }}>
          Uddjup {Math.round((model.el.innerRatio ?? 0.45) * 100)} %
          <input type="range" min={5} max={95} value={(model.el.innerRatio ?? 0.45) * 100} onChange={(e) => set({ innerRatio: Number(e.target.value) / 100 })} />
        </label>
      )}
    </>
  )
}

function FillControls({ model, set }: VariantProps) {
  const pattern = model.el.pattern
  return (
    <>
      <label>
        Fyllning
        <input type="color" value={typeof model.el.fill === 'string' ? model.el.fill : '#000000'} onChange={(e) => set({ fill: e.target.value })} />
      </label>
      <label className="byd-props-switch" style={{ gridColumn: '1 / -1' }}>
        <input
          type="checkbox"
          checked={pattern !== undefined}
          onChange={(e) => set({ pattern: e.target.checked ? { kind: 'diamonds', color: '#ffffff', scaleMm: 6 } : undefined })}
        />
        Mönster över fyllningen
      </label>
      {pattern && (
        <div className="byd-props-paint">
          <div className="proto-gallery" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {PATTERNS.map((kind) => (
              <button key={kind} type="button" title={PATTERN_NAME[kind]} aria-label={PATTERN_NAME[kind]} aria-pressed={pattern.kind === kind} onClick={() => set({ pattern: { ...pattern, kind } })}>
                <PatternGlyph kind={kind} />
              </button>
            ))}
          </div>
          <label>
            Färg
            <input type="color" value={pattern.color} onChange={(e) => set({ pattern: { ...pattern, color: e.target.value } })} />
          </label>
          <label>
            Storlek {pattern.scaleMm} mm
            <input type="range" min={1} max={20} step={0.5} value={pattern.scaleMm} onChange={(e) => set({ pattern: { ...pattern, scaleMm: Number(e.target.value) } })} />
          </label>
          <label>
            Vinkel {pattern.angleDeg ?? 0}°
            <input type="range" min={0} max={180} value={pattern.angleDeg ?? 0} onChange={(e) => set({ pattern: { ...pattern, angleDeg: Number(e.target.value) } })} />
          </label>
        </div>
      )}
    </>
  )
}

function ShadowControls({ model, set, open, onOpen }: VariantProps & { open: boolean; onOpen(v: boolean): void }) {
  const s = model.el.shadow
  const at = (next: Partial<Shadow>) => set({ shadow: { ...(s ?? SHADOWS[1]!.shadow!), ...next } })
  const chosen = SHADOWS.find((p) => JSON.stringify(p.shadow) === JSON.stringify(s))
  return (
    <>
      <div className="proto-chips" style={{ gridColumn: '1 / -1' }}>
        {SHADOWS.map((p) => (
          <button key={p.id} type="button" aria-pressed={chosen?.id === p.id} onClick={() => set({ shadow: p.shadow })}>
            {p.name}
          </button>
        ))}
      </div>
      {s && (
        <button type="button" className="proto-disclose" style={{ gridColumn: '1 / -1' }} aria-expanded={open} onClick={() => onOpen(!open)}>
          {open ? '▾' : '▸'} Anpassa
        </button>
      )}
      {s && open && (
        <div className="byd-props-paint">
          <label>
            Höger/vänster {s.dxMm} mm
            <input type="range" min={-4} max={4} step={0.1} value={s.dxMm} onChange={(e) => at({ dxMm: Number(e.target.value) })} />
          </label>
          <label>
            Upp/ned {s.dyMm} mm
            <input type="range" min={-4} max={4} step={0.1} value={s.dyMm} onChange={(e) => at({ dyMm: Number(e.target.value) })} />
          </label>
          <label>
            Mjukhet {s.blurMm} mm
            <input type="range" min={0} max={8} step={0.1} value={s.blurMm} onChange={(e) => at({ blurMm: Number(e.target.value) })} />
          </label>
          <label>
            Färg
            <input type="color" value={s.color} onChange={(e) => at({ color: e.target.value })} />
          </label>
          <label>
            Genomskinlighet {Math.round((s.opacity ?? 1) * 100)} %
            <input type="range" min={0} max={100} value={(s.opacity ?? 1) * 100} onChange={(e) => at({ opacity: Number(e.target.value) / 100 })} />
          </label>
        </div>
      )}
    </>
  )
}

function BackGallery({ model, setModel, columns = 4 }: { model: Model; setModel: VariantProps['setModel']; columns?: number }) {
  return (
    <div className="proto-backs" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {BACKS.map((b) => (
        <button key={b.id} type="button" aria-pressed={JSON.stringify(model.back) === JSON.stringify(b.base)} onClick={() => setModel((m) => ({ ...m, back: b.base, face: 'back' }))}>
          <BackGlyph base={b.base} />
          <span>{b.name}</span>
        </button>
      ))}
    </div>
  )
}

// --- Variant A: one column, everything stacked in the property panel -----------------------

function VariantA(p: VariantProps) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  return (
    <div className="byd-editor proto-root"><div className="byd-canvas">
      <Rail />
      <Layers model={p.model} />
      <Stage
        model={p.model}
        strip={<FaceSwitch model={p.model} setModel={p.setModel} extra={<button type="button" onClick={() => setPicking(true)}>Välj baksida…</button>} />}
      >
        {picking && (
          <div className="proto-overlay">
            <div className="proto-sheet">
              <h2>Färdiga baksidor</h2>
              <BackGallery model={p.model} setModel={p.setModel} columns={4} />
              <button type="button" className="proto-close" onClick={() => setPicking(false)}>
                Klar
              </button>
            </div>
          </div>
        )}
      </Stage>
      <aside className="byd-canvas-props">
        <h2>Egenskaper · platta</h2>
        <div className="byd-props">
          <h3 className="proto-h3">Form</h3>
          <ShapePicker {...p} columns={5} />
          <ShapeNumbers {...p} />
          <h3 className="proto-h3">Fyllning</h3>
          <FillControls {...p} />
          <h3 className="proto-h3">Skugga</h3>
          <ShadowControls {...p} open={open} onOpen={setOpen} />
        </div>
      </aside>
      </div>
    </div>
  )
}

// --- Variant B: the panel gets tabs, so 280 px is never a mile of scrolling ----------------

function VariantB(p: VariantProps) {
  const [tab, setTab] = useState<'form' | 'färg' | 'skugga'>('form')
  const [open, setOpen] = useState(true)
  return (
    <div className="byd-editor proto-root"><div className="byd-canvas">
      <Rail />
      <div className="byd-canvas-layers">
        {p.model.face === 'back' && (
          <>
            <h2>Färdiga baksidor</h2>
            <BackGallery model={p.model} setModel={p.setModel} columns={2} />
          </>
        )}
        <Layers model={p.model} />
      </div>
      <Stage model={p.model} strip={<FaceSwitch model={p.model} setModel={p.setModel} />} />
      <aside className="byd-canvas-props">
        <div className="proto-tabs" role="tablist">
          {(['form', 'färg', 'skugga'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="byd-props">
          {tab === 'form' && (
            <>
              <ShapePicker {...p} columns={4} />
              <ShapeNumbers {...p} />
            </>
          )}
          {tab === 'färg' && <FillControls {...p} />}
          {tab === 'skugga' && <ShadowControls {...p} open={open} onOpen={setOpen} />}
        </div>
      </aside>
      </div>
    </div>
  )
}

// --- Variant C: the gallery is on the canvas, the panel keeps only numbers -----------------

function VariantC(p: VariantProps) {
  const [open, setOpen] = useState(true)
  const [picking, setPicking] = useState(false)
  return (
    <div className="byd-editor proto-root"><div className="byd-canvas">
      <Rail />
      <Layers model={p.model} />
      <Stage model={p.model} strip={<FaceSwitch model={p.model} setModel={p.setModel} />}>
        {p.model.face === 'front' && (
          <div className="proto-badge">
            <button type="button" aria-expanded={picking} onClick={() => setPicking(!picking)}>
              <ShapeGlyph geom={p.model.el} size={16} /> Byt form
            </button>
            {picking && (
              <div className="proto-popover">
                <ShapePicker {...p} columns={6} />
              </div>
            )}
          </div>
        )}
        {p.model.face === 'back' && p.model.back.length === 0 && <p className="byd-canvas-hint">Baksidan är tom.</p>}
      </Stage>
      <aside className="byd-canvas-props">
        <h2>Egenskaper · platta</h2>
        {p.model.face === 'back' ? (
          <>
            <h3 className="proto-h3">Börja från ett mönster</h3>
            <BackGallery model={p.model} setModel={p.setModel} columns={2} />
          </>
        ) : (
          <div className="byd-props">
            <ShapeNumbers {...p} />
            <FillControls {...p} />
            <h3 className="proto-h3">Skugga</h3>
            <ShadowControls {...p} open={open} onOpen={setOpen} />
          </div>
        )}
      </aside>
      </div>
    </div>
  )
}

// --- the switcher --------------------------------------------------------------------------

const NAMES: Record<string, string> = { A: 'Allt i panelen', B: 'Panel med flikar', C: 'Galleri på duken' }

function Switcher({ current }: { current: string }) {
  const keys = ['A', 'B', 'C']
  const go = (step: number) => {
    const next = keys[(keys.indexOf(current) + step + keys.length) % keys.length]!
    const url = new URL(location.href)
    url.searchParams.set('variant', next)
    history.replaceState(null, '', url)
    location.reload()
  }
  return (
    <div className="proto-switcher">
      <button type="button" onClick={() => go(-1)} aria-label="Föregående variant">
        ←
      </button>
      <strong>
        {current} — {NAMES[current] ?? '?'}
      </strong>
      <button type="button" onClick={() => go(1)} aria-label="Nästa variant">
        →
      </button>
    </div>
  )
}
