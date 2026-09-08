// PROTOTYPE — the bottom band of /online (#24 the fan turns into a rainbow, #25 the fan and the
// corner controls fight over the same forty pixels at 390). One place, one problem, one answer:
// a fan that packs tighter also collides less, so the arc and the corner cannot be decided apart.
//
// /prototype/band?variant=A|B|C&kort=3|8|13|21
//
// Measured first, not designed out of the issue text. At 1280 the step between two cards is
// already 50 px at twenty-one cards — wide enough — and the fault is only the arc, 160°. At 390
// the whole band is 358 px, which holds eight forty-four pixel targets and no more: a hand of
// thirteen or twenty-one cannot be one row of touchable cards at any tilt. Every variant below
// is a different answer to that one fact, and each gives up something different.
//
//   A  Facket      the fan survives. Arc capped at 30°, the step never under 44 px, and when the
//                  hand is wider than the band the fan scrolls sideways as a fan. The corners
//                  leave the bottom for a top bar. Price: on a phone you no longer see the whole
//                  hand at once, and a scrolling surface competes with drag-to-play.
//   B  Remsan      K10's strip, at /online too: flat cards, no fan, no overlap, one interaction
//                  model shared with /play. Nothing is `fixed` — the bottom is a laid-out column.
//                  Price: the fan, which is a decided look (K9, C2 prototype B), is gone.
//   C  Uppslaget   the hand is summoned rather than permanent. At rest a rail shows the cards'
//                  top edges and the count and shares its row with the tools; pressing it raises
//                  the whole hand at reading size over a dimmed table. Price: the hand is not on
//                  screen while you play, and every play costs a gesture first.
//
// Nothing here talks to a server: the table is a fixture. One thing is real on purpose —
// `TableRenderer` draws the felt, because one renderer draws a table (K9) and a prototype must
// not fork a second. `?bare` drops the prototype's own chrome.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Snapshot } from '@byd/protocol'
import { TableRenderer } from '../../table/TableRenderer.js'
import { withoutHand } from '../../online/seat.js'
import { useRoving } from '../../editor/roving.js'
import { hue } from '../../table/hue.js'
import { Switcher } from './Switcher.js'
import '../../table/table.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Facket' },
  { key: 'B', name: 'Remsan' },
  { key: 'C', name: 'Uppslaget' },
]
type Variant = 'A' | 'B' | 'C'
const COUNTS = [3, 8, 13, 21]

// ---------------------------------------------------------------------------
// The one fact every variant answers to.
// ---------------------------------------------------------------------------
// The smallest a control may ever be (#6, L10's gate).
const TARGET = 44
// The card at the size it is read at, and the smallest it may shrink to and still be a card
// rather than a chip. `online/fan.ts` says 112 px is prototype B's size; that stands.
const CARD_MAX = 112
const CARD_MIN = 56
const GUTTER = 16

const cardWidth = (w: number) => Math.round(Math.max(CARD_MIN, Math.min(CARD_MAX, w * 0.22)))
const room = (w: number) => w - 2 * GUTTER
// How many cards a single row of this width can hold and still give each one a fingertip.
const fits = (w: number) => Math.max(1, Math.floor(1 + (room(w) - cardWidth(w)) / TARGET))

// ---------------------------------------------------------------------------
// Fixtures. A hand of names, and a table in the shape the projection sends (K2).
// ---------------------------------------------------------------------------
const NAMES = ['Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa', 'Bard', 'Ogre', 'Alv', 'Dvärg', 'Jätte', 'Nisse', 'Orm', 'Varg', 'Björn', 'Korp', 'Räv', 'Uggla', 'Lo', 'Älg', 'Grävling', 'Mård', 'Hök']
type Card = { id: string; name: string }
const handOf = (n: number): Card[] => Array.from({ length: n }, (_, i) => ({ id: `h${i}`, name: NAMES[i % NAMES.length] ?? 'Kort' }))

const TYPE = { id: 'card.standard.63x88', version: 1 }
function tableView(n: number): Snapshot {
  const zones: Snapshot['zones'] = [
    { mode: 'order', id: 'table', kind: 'area', name: 'Spelyta', dynamic: false, geometry: { x: -500, y: -300, w: 1000, h: 600, rot: 0 }, order: ['c1', 'c2'] },
    { mode: 'count', id: 'draw', kind: 'pile', name: 'Draghög', dynamic: false, geometry: { x: -200, y: 0, w: 0, h: 0, rot: 0 }, count: 12 },
    { mode: 'order', id: 'discard', kind: 'pile', name: 'Kasthög', dynamic: false, geometry: { x: 200, y: 0, w: 0, h: 0, rot: 0 }, order: ['c3'] },
    { mode: 'order', id: 'hand:A', kind: 'hand', name: 'Hand', owner: 'A', dynamic: false, geometry: { x: -300, y: 320, w: 600, h: 100, rot: 0 }, order: handOf(n).map((c) => c.id) },
    { mode: 'count', id: 'hand:B', kind: 'hand', name: 'Hand', owner: 'B', dynamic: false, geometry: { x: -300, y: -420, w: 600, h: 100, rot: 0 }, count: 7 },
  ]
  const components: Snapshot['components'] = [
    { id: 'c1', type: TYPE, zone: 'table', face: 'front', x: -60, y: -40, rot: 0, cardRef: 'Häxa' },
    { id: 'c2', type: TYPE, zone: 'table', face: 'front', x: 20, y: -10, rot: 12, cardRef: 'Bard' },
    { id: 'c3', type: TYPE, zone: 'discard', face: 'front', x: 200, y: 0, rot: 0, cardRef: 'Ogre' },
    ...handOf(n).map((c, i) => ({ id: c.id, type: TYPE, zone: 'hand:A', face: 'front' as const, x: -300 + i * 20, y: 340, rot: 0, cardRef: c.name })),
  ]
  return { seq: 42, seat: 'A', floor: 'table', seats: [{ id: 'A', name: 'Ada' }, { id: 'B', name: 'Bo' }], zones, components, rewind: null, undo: null, ended: false }
}

// ---------------------------------------------------------------------------
// The prototype's frame.
// ---------------------------------------------------------------------------
export function BandPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState<Variant>((params.get('variant') as Variant) || 'A')
  const [count, setCount] = useState<number>(Number(params.get('kort')) || 13)
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('variant', variant)
    url.searchParams.set('kort', String(count))
    history.replaceState(null, '', url)
  }, [variant, count])

  const cards = handOf(count)
  const view = withoutHand(tableView(count), 'A')
  const bare = params.has('bare')
  return (
    <div className="byd-bp" data-variant={variant} data-kort={count}>
      {!bare && (
        <div className="byd-bp-lab">
          <span>kort</span>
          {COUNTS.map((c) => (
            <button key={c} type="button" aria-pressed={c === count ? 'true' : 'false'} onClick={() => setCount(c)}>
              {c}
            </button>
          ))}
          <em>{width} px · {fits(width)} ryms per rad</em>
        </div>
      )}
      {variant === 'A' && <SceneA cards={cards} view={view} width={width} />}
      {variant === 'B' && <SceneB cards={cards} view={view} width={width} />}
      {variant === 'C' && <SceneC cards={cards} view={view} width={width} />}
      <Switcher variants={VARIANTS} current={variant} onChange={(k) => setVariant(k as Variant)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pieces every variant shares: the felt, the seat's own line, the session's tools.
// ---------------------------------------------------------------------------
function Felt({ view }: { view: Snapshot }) {
  return (
    <div className="byd-bp-felt">
      <TableRenderer view={view} mode="table" rotate={0} />
    </div>
  )
}

function SeatLine({ n }: { n: number }) {
  return (
    <p className="byd-bp-seat">
      <strong>Ada</strong>
      <span>{n} kort</span>
    </p>
  )
}

// The phone's controls (C4): whatever band they end up in, they are real buttons at 44 px and
// they never lie on top of a card.
function Tools() {
  return (
    <div className="byd-bp-tools">
      <button type="button">↶ Ångra</button>
      <button type="button">⚑ Flagga</button>
      <button type="button" className="byd-bp-end">Avsluta</button>
    </div>
  )
}

// A card face in the band. No textures here — the fixture has no renders — so it is `hue`'s
// colour and the name, exactly as `HandFan` falls back to.
function Face({ card, style, className }: { card: Card; style?: CSSProperties; className?: string }) {
  return (
    <span className={className} style={{ ['--hue' as string]: hue(card.name), ...style }}>
      {card.name}
    </span>
  )
}

// ---------------------------------------------------------------------------
// A — Facket. The fan survives: the arc is capped, the step is floored at a fingertip, and a
// hand wider than the band scrolls sideways as a fan. The corners leave the bottom band.
// ---------------------------------------------------------------------------
const ARC_MAX = 30
const CARD_RATIO = 88 / 63
const PIVOT_Y = 1.3
const DIP = 6 / 112

const tiltOf = (n: number) => (n > 1 ? Math.min(8, ARC_MAX / (n - 1)) : 0)
function placeA(i: number, n: number): { tilt: number; dip: number } {
  const k = i - (n - 1) / 2
  const t = tiltOf(n)
  return { tilt: k * t, dip: Math.abs(k) * DIP * (t / 8) }
}

// Where the browser actually paints the fan, in card widths, so the band can reserve exactly the
// room the shape needs instead of guessing it — `online/fan.ts` does the same for the real fan.
function extentA(n: number, step: number): { left: number; right: number; bottom: number; top: number } {
  const h = CARD_RATIO
  const out = { left: 0, right: 0, bottom: h, top: 0 }
  for (let i = 0; i < n; i++) {
    const { tilt, dip } = placeA(i, n)
    const x0 = i * step
    const about = { x: x0 + 0.5, y: PIVOT_Y * h }
    const a = (tilt * Math.PI) / 180
    const [cos, sin] = [Math.cos(a), Math.sin(a)]
    for (const p of [{ x: x0, y: 0 }, { x: x0 + 1, y: 0 }, { x: x0, y: h }, { x: x0 + 1, y: h }]) {
      const dx = p.x - about.x
      const dy = p.y - about.y + dip
      const x = about.x + dx * cos - dy * sin
      const y = about.y + dx * sin + dy * cos
      out.left = Math.min(out.left, x)
      out.right = Math.max(out.right, x)
      out.bottom = Math.max(out.bottom, y)
      out.top = Math.min(out.top, y)
    }
  }
  return out
}

function SceneA({ cards, view, width }: { cards: Card[]; view: Snapshot; width: number }) {
  const n = cards.length
  const card = cardWidth(width)
  const step = TARGET / card
  const e = extentA(n, step)
  const scroller = useRef<HTMLDivElement>(null)
  const roving = useRoving({ ids: cards.map((c) => c.id), selected: null, orientation: 'horizontal' })
  const wide = (e.right - e.left) * card > room(width)
  return (
    <div className="byd-bp-stage byd-bp-a">
      {/* #25's answer here: the seat's line and the session's tools move out of the bottom band
          altogether, so the hand owns it alone. On a phone that costs the thumb its reach. */}
      <div className="byd-bp-topbar">
        <SeatLine n={n} />
        <Tools />
      </div>
      <Felt view={view} />
      <div className="byd-bp-band" data-scrolls={wide ? 'true' : undefined}>
        <div
          className="byd-bp-fanwrap"
          ref={scroller}
          style={{
            ['--card' as string]: `${card}px`,
            paddingTop: `${Math.max(0, -e.top) * card + 34}px`,
            paddingBottom: `${(e.bottom - CARD_RATIO) * card + 6}px`,
            paddingLeft: `${Math.max(0, -e.left) * card + 8}px`,
            paddingRight: `${Math.max(0, e.right - (n - 1) * step - 1) * card + 8}px`,
          }}
        >
          <div className="byd-bp-fan" role="group" aria-label={`Hand, ${n} kort`} style={{ width: `${((n - 1) * step + 1) * card}px`, height: `${CARD_RATIO * card}px` }}>
            {cards.map((c, i) => {
              const { tilt, dip } = placeA(i, n)
              const item = roving.itemProps(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  className="byd-bp-fan-card"
                  aria-label={`${c.name}, kort i handen. Enter öppnar handlingar.`}
                  style={{ left: `${i * step * card}px`, ['--hue' as string]: hue(c.name), ['--tilt' as string]: `${tilt}deg`, ['--dip' as string]: `${dip}` }}
                  tabIndex={item.tabIndex}
                  ref={item.ref}
                  onFocus={() => {
                    item.onFocus()
                    // A card the arrows reach must be a card the eye reaches: the scroller
                    // brings it in, which is L10's rule for a strip that scrolls sideways.
                    scroller.current?.querySelector(':focus')?.scrollIntoView({ block: 'nearest', inline: 'center' })
                  }}
                  onKeyDown={item.onKeyDown}
                >
                  <span aria-hidden="true">{c.name}</span>
                </button>
              )
            })}
          </div>
        </div>
        {wide && <p className="byd-bp-hint">Handen är bredare än bandet — den rullar i sidled.</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// B — Remsan. K10's answer for the phone, given to /online too: flat cards in a row that
// scrolls, no overlap, nothing on top of anything.
// ---------------------------------------------------------------------------
function SceneB({ cards, view, width }: { cards: Card[]; view: Snapshot; width: number }) {
  const n = cards.length
  const card = cardWidth(width)
  const strip = useRef<HTMLDivElement>(null)
  const roving = useRoving({ ids: cards.map((c) => c.id), selected: null, orientation: 'horizontal' })
  return (
    <div className="byd-bp-stage byd-bp-b">
      <Felt view={view} />
      {/* #25's answer here: nothing in the bottom is `position: fixed`. The controls are a row of
          the layout, and the strip is the row under it, so they cannot share a pixel. */}
      <div className="byd-bp-row">
        <SeatLine n={n} />
        <Tools />
      </div>
      <div className="byd-bp-strip" ref={strip} role="group" aria-label={`Hand, ${n} kort`} style={{ ['--card' as string]: `${card}px` }}>
        {cards.map((c) => {
          const item = roving.itemProps(c.id)
          return (
            <button
              key={c.id}
              type="button"
              className="byd-bp-strip-card"
              aria-label={`${c.name}, kort i handen. Enter öppnar handlingar.`}
              style={{ ['--hue' as string]: hue(c.name) }}
              tabIndex={item.tabIndex}
              ref={item.ref}
              onFocus={() => {
                item.onFocus()
                strip.current?.querySelector(':focus')?.scrollIntoView({ block: 'nearest', inline: 'center' })
              }}
              onKeyDown={item.onKeyDown}
            >
              <span aria-hidden="true">{c.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// C — Uppslaget. The hand is summoned, not permanent: a rail at rest, the whole hand at reading
// size when it is raised, and the table dimmed behind it.
// ---------------------------------------------------------------------------
function SceneC({ cards, view, width }: { cards: Card[]; view: Snapshot; width: number }) {
  const n = cards.length
  const card = cardWidth(width)
  const [up, setUp] = useState(false)
  // On a phone the raised hand is the whole screen, so the session's tools travel with it: a
  // surface that covers the only Ångra on the page has made it unreachable, not merely hidden.
  const phone = width <= 600
  const rail = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const roving = useRoving({ ids: cards.map((c) => c.id), selected: null, orientation: 'both' })
  // `Question.tsx`'s manners applied to a surface (L9, K16): it takes focus so it is answered
  // where it is read, it answers Escape, and it hands focus back to what opened it.
  useEffect(() => {
    if (!up) return
    // Focus lands on the first card, not on Stäng: the sheet was raised to be read, and the
    // reader should already be standing in the hand.
    ;(sheet.current?.querySelector('.byd-bp-grid-card') as HTMLElement | null)?.focus()
  }, [up])
  const close = () => {
    setUp(false)
    rail.current?.focus()
  }
  return (
    <div className="byd-bp-stage byd-bp-c" data-up={up ? 'true' : undefined}>
      <div className="byd-bp-c-top">
      <Felt view={view} />
      {up && (
        <div className="byd-bp-sheet" ref={sheet} role="group" aria-label={`Hand, ${n} kort`} style={{ ['--card' as string]: `${card}px` }} onKeyDown={(e) => e.key === 'Escape' && close()}>
          <div className="byd-bp-sheet-head">
            <SeatLine n={n} />
            {phone && <Tools />}
            <button type="button" onClick={close}>Stäng</button>
          </div>
          <div className="byd-bp-grid">
            {cards.map((c) => {
              const item = roving.itemProps(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  className="byd-bp-grid-card"
                  aria-label={`${c.name}, kort i handen. Enter öppnar handlingar.`}
                  style={{ ['--hue' as string]: hue(c.name) }}
                  tabIndex={item.tabIndex}
                  ref={item.ref}
                  onFocus={item.onFocus}
                  onKeyDown={item.onKeyDown}
                >
                  <span aria-hidden="true">{c.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      </div>
      {/* #25's answer here: the rail and the tools are one row, laid out side by side, so the
          bottom band has exactly one occupant. */}
      <div className="byd-bp-railrow">
        <button type="button" className="byd-bp-rail" ref={rail} aria-expanded={up ? 'true' : 'false'} onClick={() => setUp(!up)}>
          <span className="byd-bp-rail-edges" aria-hidden="true">
            {cards.slice(0, 12).map((c) => (
              <Face key={c.id} card={c} className="byd-bp-edge" />
            ))}
          </span>
          <span className="byd-bp-rail-label">
            <strong>Ada</strong> · {n} kort
          </span>
          <span className="byd-bp-rail-chevron" aria-hidden="true">{up ? '⌄' : '⌃'}</span>
        </button>
        {!(up && phone) && <Tools />}
      </div>
    </div>
  )
}
