// PROTOTYPE — physical validation in the editor (E5): /prototype/checks?variant=A|B|C.
// Question: how does the designer meet a fault that only shows up in the hand? All three read
// the same issues from the real validator and draw the same deck with the real compiler.
import { useMemo, useState } from 'react'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { validateCard, type Issue } from '@byd/template'
import type { ProjectDoc } from '@byd/server'
import { CardPreview } from '../../editor/CardPreview.js'
import { Switcher } from './Switcher.js'
import { sampleDoc } from './deck.js'
import '../../editor/editor.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Markerat på kortet' },
  { key: 'B', name: 'En rapport över hela leken' },
  { key: 'C', name: 'Se med läsarens ögon' },
]
type Found = Issue & { cardRef: string }
type Ctx = { doc: ProjectDoc; found: Found[]; fix(): void; fixed: boolean }

const SEVERITY: Record<string, string> = { error: 'fel', warning: 'varning' }
const WORDS: Record<string, string> = {
  'text-too-small': 'för liten text',
  'low-contrast': 'för svag kontrast',
  'outside-safe-area': 'för nära kanten',
  'short-of-bleed': 'når inte utfallet',
  hairline: 'för tunn linje',
  'colour-only': 'skiljs bara av färg',
}

export function ChecksPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [doc, setDoc] = useState<ProjectDoc>(sampleDoc)
  const [fixed, setFixed] = useState(false)
  // One repair, to see the panel empty out: the flavour line up to a readable size and weight.
  const fix = () => {
    setFixed(true)
    setDoc((d) => ({
      ...d,
      template: {
        faces: Object.fromEntries(
          Object.entries(d.template.faces).map(([id, face]) => [
            id,
            { ...face, base: face.base.map((el) => (el.id === 'flavour' && el.kind === 'text' ? { ...el, font: { ...el.font, sizePt: 8.5 }, color: '#6b6255' } : el)) },
          ]),
        ),
      },
    }))
  }
  const found = useMemo<Found[]>(
    () =>
      doc.rows.flatMap((row) =>
        Object.values(doc.template.faces).flatMap((face) => validateCard({ type: CARD_STANDARD_63x88, face, row: row.fields }).map((issue) => ({ ...issue, cardRef: row.id }))),
      ),
    [doc],
  )
  const ctx: Ctx = { doc, found, fix, fixed }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  const errors = found.filter((f) => f.severity === 'error').length
  return (
    <div className="ck-stage">
      <div className="ck-state">
        <span>
          {found.length} anmärkningar · <b>{errors}</b> fel · <b>{found.length - errors}</b> varningar · {errors > 0 ? 'en order stoppas' : 'inget stoppar en order'}
        </span>
      </div>
      <V {...ctx} />
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

function Card({ doc, cardRef, scale = 0.62, children, className }: { doc: ProjectDoc; cardRef: string; scale?: number; children?: React.ReactNode; className?: string }) {
  const row = doc.rows.find((r) => r.id === cardRef)!
  return (
    <div className={`ck-card ${className ?? ''}`} data-card-ref={cardRef}>
      <CardPreview id={`ck-${cardRef}-${Math.round(scale * 100)}`} face={doc.template.faces['front']!} row={row.fields} icons={doc.icons} scale={scale} />
      {children}
    </div>
  )
}

// ---------- A — marked on the card ----------
// The fault is shown where it is: the element is outlined on the card and the note sits beside
// it, the way a spelling mistake is underlined in the word it is in.
function VariantA({ doc, found }: Ctx) {
  const [card, setCard] = useState(doc.rows[0]?.id ?? '')
  const mine = found.filter((f) => f.cardRef === card)
  const [picked, setPicked] = useState<string | null>(null)
  const face = doc.template.faces['front']!
  const boxOf = (element: string) => {
    const el = face.base.find((e) => e.id === element)
    return el && 'w' in el ? el : null
  }
  const mm = (v: number) => `${(v * 1.15 * 96) / 25.4}px`
  return (
    <div className="ck-a">
      <div className="ck-a-deck">
        {doc.rows.map((r) => {
          const worst = found.filter((f) => f.cardRef === r.id)
          const bad = worst.some((f) => f.severity === 'error')
          return (
            <button key={r.id} type="button" className="ck-a-thumb" aria-pressed={card === r.id} onClick={() => setCard(r.id)}>
              <Card doc={doc} cardRef={r.id} scale={0.34} />
              {worst.length > 0 && <i data-bad={bad ? 'true' : undefined}>{worst.length}</i>}
            </button>
          )
        })}
      </div>
      <div className="ck-a-big">
        <Card doc={doc} cardRef={card} scale={1.15}>
          {mine.map((f, i) => {
            const box = boxOf(f.element)
            if (!box) return null
            return (
              <button
                key={i}
                type="button"
                className="ck-mark"
                data-severity={f.severity}
                data-on={picked === `${i}` ? 'true' : undefined}
                style={{ left: mm(box.x), top: mm(box.y), width: mm(box.w), height: mm(Math.max(box.h, 2)) }}
                onClick={() => setPicked(picked === `${i}` ? null : `${i}`)}
                aria-label={`${WORDS[f.code]} på ${f.element}`}
              />
            )
          })}
        </Card>
      </div>
      <ul className="ck-a-notes">
        {mine.length === 0 && <li className="ck-ok">Inget att anmärka på det här kortet.</li>}
        {mine.map((f, i) => (
          <li key={i} data-severity={f.severity} data-on={picked === `${i}` ? 'true' : undefined} onMouseEnter={() => setPicked(`${i}`)} onMouseLeave={() => setPicked(null)}>
            <b>{WORDS[f.code]}</b>
            <span>{f.element}</span>
            <small>{f.detail}</small>
          </li>
        ))}
      </ul>
      <p className="ck-foot">A · felet visas där det sitter · ett kort i taget, som en stavningskontroll</p>
    </div>
  )
}

// ---------- B — a report over the whole deck ----------
// Not one card but the deck: every fault of a kind gathered on one line with how many cards it
// touches, because a fault in the template is a fault on forty cards.
function VariantB({ doc, found, fix, fixed }: Ctx) {
  const [open, setOpen] = useState<string | null>(null)
  const byCode = [...new Set(found.map((f) => f.code))].map((code) => {
    const rows = found.filter((f) => f.code === code)
    return { code, rows, severity: rows.some((r) => r.severity === 'error') ? 'error' : 'warning', cards: [...new Set(rows.map((r) => r.cardRef))] }
  })
  return (
    <div className="ck-b">
      <div className="ck-b-report">
        <h2>Fysisk kontroll</h2>
        {byCode.length === 0 ? (
          <p className="ck-ok">Leken klarar kontrollen. Inget stoppar en order.</p>
        ) : (
          <ul>
            {byCode.map(({ code, rows, severity, cards }) => (
              <li key={code} data-severity={severity}>
                <button type="button" onClick={() => setOpen(open === code ? null : code)} aria-expanded={open === code}>
                  <b>{WORDS[code]}</b>
                  <span>{cards.length} kort</span>
                  <small>{SEVERITY[severity]}</small>
                </button>
                {open === code && (
                  <div className="ck-b-detail">
                    <p>{rows[0]?.detail}</p>
                    <div className="ck-b-cards">
                      {cards.map((c) => (
                        <Card key={c} doc={doc} cardRef={c} scale={0.4} />
                      ))}
                    </div>
                    <span>element: {[...new Set(rows.map((r) => r.element))].join(', ')}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="ck-fix" onClick={fix} disabled={fixed}>
          {fixed ? 'Smaktexten är rättad' : 'Rätta smaktexten (en storlek upp)'}
        </button>
        <p className="ck-hint">En anmärkning här är nästan alltid mallens, inte kortets: den syns på varje kort som ärver elementet.</p>
      </div>
      <div className="ck-wall">
        {doc.rows.map((r) => (
          <Card key={r.id} doc={doc} cardRef={r.id} scale={0.55} />
        ))}
      </div>
      <p className="ck-foot">B · en rapport över hela leken · anmärkningar samlade per slag, med korten de gäller</p>
    </div>
  )
}

// ---------- C — with the reader's eyes ----------
// No list at all to begin with: the deck is shown as it will be seen — trimmed, in another eye,
// or with the colour gone — and the fault becomes visible rather than described.
const EYES = [
  { key: 'normal', name: 'Som du ser det' },
  { key: 'deuteranopia', name: 'Deuteranopi' },
  { key: 'protanopia', name: 'Protanopi' },
  { key: 'tritanopia', name: 'Tritanopi' },
  { key: 'gray', name: 'Gråskala' },
] as const

function VariantC({ doc, found }: Ctx) {
  const [eye, setEye] = useState<string>('normal')
  const [trim, setTrim] = useState(true)
  const [arm, setArm] = useState(false)
  return (
    <div className="ck-c">
      <Filters />
      <div className="ck-c-tools">
        <div role="group" aria-label="Ögon">
          {EYES.map((e) => (
            <button key={e.key} type="button" aria-pressed={eye === e.key} onClick={() => setEye(e.key)}>
              {e.name}
            </button>
          ))}
        </div>
        <label>
          <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} /> snitt och skyddsmarginal
        </label>
        <label>
          <input type="checkbox" checked={arm} onChange={(e) => setArm(e.target.checked)} /> på armlängds avstånd
        </label>
        <span className="ck-hint">{found.length} anmärkningar finns; här ser du dem i stället för att läsa dem.</span>
      </div>
      <div className="ck-wall" data-eye={eye} data-trim={trim ? 'true' : undefined} data-arm={arm ? 'true' : undefined}>
        {doc.rows.map((r) => (
          <Card key={r.id} doc={doc} cardRef={r.id} scale={arm ? 0.38 : 0.85} className="ck-c-card" />
        ))}
      </div>
      <p className="ck-foot">C · leken som läsaren möter den · ett annat öga, snittet inritat, kortet på avstånd</p>
    </div>
  )
}

// The dichromatic simulations as SVG filters, the same transforms the validator uses.
function Filters() {
  const m = {
    protanopia: '0.11238 0.88762 0 0 0  0.11238 0.88762 0 0 0  0.00401 -0.00401 1 0 0  0 0 0 1 0',
    deuteranopia: '0.29275 0.70725 0 0 0  0.29275 0.70725 0 0 0  -0.02234 0.02234 1 0 0  0 0 0 1 0',
    tritanopia: '1 0.14461 -0.14461 0 0  0 0.85924 0.14076 0 0  0 0.85924 0.14076 0 0  0 0 0 1 0',
  }
  return (
    <svg className="ck-filters" aria-hidden="true">
      <defs>
        {Object.entries(m).map(([id, values]) => (
          <filter key={id} id={`ck-${id}`} colorInterpolationFilters="linearRGB">
            <feColorMatrix type="matrix" values={values} />
          </filter>
        ))}
      </defs>
    </svg>
  )
}
