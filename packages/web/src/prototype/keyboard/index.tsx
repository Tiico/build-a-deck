// PROTOTYPE — playing with a keyboard on all three surfaces, on
// /prototype/keyboard?variant=A|B|C&route=play|table|online (#1, #2).
//
// The question the three variants answer differently is the only hard one: a card on the table
// has a POSITION, and a drag says "put this there". A keyboard has no position. So:
//   A — the table is a list of places. A card moves between zones and nowhere else.
//   B — the compass. A card is lifted and stepped across the felt; every point is sayable.
//   C — the address. A card is picked, then a destination is picked from named places.
//
// What is NOT variable, and is therefore shared below: the verbs (the vocabulary in
// `packages/protocol` is closed), the fact that names come out of the projection so a face-down
// card can never be named, and how a move is announced.
//
// The table is real: `initialState` → `decide` → `apply` → `project`, the same four calls the
// actor makes (D2), in memory. The felt is the real `TableRenderer` (K9) — no variant draws a
// card. What the variants add to it is attributes on the nodes it already renders, which is
// exactly what the real implementation would have to grow.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CARD_STANDARD_63x88,
  TypeRegistry,
  apply,
  counterIds,
  decide,
  initialState,
  project,
  projectActivity,
  replay,
  seededRng,
  type DecideDeps,
  type SetupDef,
  type TableState,
} from '@byd/engine'
import type { Applied, Intent, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'
import { TableRenderer } from '../../table/TableRenderer.js'
import { CARD_MM, dropIntents, type DragTarget } from '../../table/drop.js'
import { describeActivity } from '../../table/describe.js'
import { seatColor } from '../../table/seatColor.js'
import { hue } from '../../table/hue.js'
import { seatRotation, withoutHand } from '../../online/seat.js'
import { Switcher } from './Switcher.js'
import '../../table/table.css'
import '../../player/player.css'
import '../../online/online.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Zonlistan — bordet är en lista med platser' },
  { key: 'B', name: 'Kompassen — lyft kortet och stega det' },
  { key: 'C', name: 'Adressen — välj kort, välj namngiven plats' },
]
const ROUTES = [
  { key: 'play', name: 'Telefon' },
  { key: 'table', name: 'Bord' },
  { key: 'online', name: 'Distans' },
]

// ==============================================================================================
// The table, run by the real engine in memory.

const registry = new TypeRegistry([CARD_STANDARD_63x88])
const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

const ME = 'S'
const SEATS = ['S', 'N', 'E']
const SEAT_NAMES: Record<string, string> = { S: 'Cy', N: 'Ada', E: 'Bo' }
const NAMES = ['Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa', 'Bard', 'Jätte', 'Vargar', 'Fälla', 'Eldstorm', 'Helande', 'Skugga', 'Gruva', 'Torn', 'Hamn', 'Kung', 'Drottning', 'Narr', 'Spion', 'Lejon', 'Örn', 'Orm', 'Björn']

function protoSetup(): SetupDef {
  return {
    seats: SEATS,
    floor: 'table',
    zones: [
      { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-600, -400, 1200, 800) },
      { id: 'market', kind: 'area', name: 'Marknad', visibility: 'all', geometry: rect(-330, -340, 660, 140) },
      { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-170, 40) },
      { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(170, 40) },
      { id: 'hand:S', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'S', returnTo: 'draw', geometry: rect(-250, 330, 500, 66) },
      { id: 'hand:N', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'N', returnTo: 'draw', geometry: rect(-250, -396, 500, 66) },
      { id: 'hand:E', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'E', returnTo: 'draw', geometry: rect(534, -250, 66, 500) },
    ],
    components: NAMES.map((cardRef) => ({ type: CARD, cardRef, zone: 'draw', face: 'back' as const })),
  }
}

type Box = { state: TableState; log: Applied[]; n: number; initial: TableState }
type ActResult = { ok: true } | { ok: false; reason: string }

function depsFor(box: Box): DecideDeps {
  return {
    rng: seededRng(7),
    ids: counterIds('k'),
    now: () => '2026-09-08T12:00:00.000Z',
    history: { stateAt: (seq) => replay(box.initial, registry, box.log.filter((l) => l.seq <= seq)), lines: () => box.log },
  }
}

function build(): Box {
  const initial = initialState('rev-12', protoSetup(), registry)
  const box: Box = { state: initial, log: [], n: 0, initial }
  const run = (seat: string | null, ...intents: Intent[]) => {
    const d = decide(box.state, registry, { id: `p${box.n++}`, seat, intents }, depsFor(box))
    if (!d.ok) throw new Error(d.reason)
    for (const line of d.applied) {
      box.state = apply(box.state, registry, line)
      box.log.push(line)
    }
  }
  for (const s of SEATS) run(null, { v: 'seat.claim', seat: s, name: SEAT_NAMES[s] ?? s })
  run(null, { v: 'shuffle', pile: 'draw' })
  run(null, { v: 'deal', from: 'draw', to: SEATS.map((s) => `hand:${s}`), each: 3 })
  run(null, { v: 'draw', from: 'draw', to: 'market', count: 3 })
  const market = [...box.state.zones['market']!.order]
  run(null, ...market.flatMap((id, i): Intent[] => [
    { v: 'flip', component: id, face: 'front' },
    { v: 'move', component: id, to: 'market', x: 60 + i * 200, y: 24 },
  ]))
  run(null, { v: 'draw', from: 'draw', to: 'discard', count: 2 })
  for (const id of [...box.state.zones['discard']!.order]) run(null, { v: 'flip', component: id, face: 'front' })
  run(null, { v: 'draw', from: 'draw', to: 'table', count: 3 })
  const loose = box.state.zones['table']!.order.slice(0, 3)
  run(null,
    { v: 'move', component: loose[0]!, to: 'table', x: 450, y: 470, rot: -6 },
    { v: 'flip', component: loose[0]!, face: 'front' },
    { v: 'move', component: loose[1]!, to: 'table', x: 690, y: 460, rot: 5 },
    { v: 'flip', component: loose[1]!, face: 'front' },
    { v: 'move', component: loose[2]!, to: 'table', x: 900, y: 290 },
  )
  return box
}

type ProtoTable = {
  view(seat: string | null): Snapshot
  act(seat: string | null, intents: Intent[]): ActResult
  lines(): readonly Applied[]
  reset(): void
  seq: number
}

function useProtoTable(): ProtoTable {
  const box = useRef<Box | null>(null)
  box.current ??= build()
  const [, bump] = useState(0)
  const b = box.current
  return {
    seq: b.state.seq,
    view: (seat) => project(b.state, registry, seat),
    lines: () => b.log,
    reset: () => {
      box.current = build()
      bump((n) => n + 1)
    },
    act: (seat, intents) => {
      if (intents.length === 0) return { ok: true }
      const d = decide(b.state, registry, { id: `p${b.n++}`, seat, intents }, depsFor(b))
      if (!d.ok) return { ok: false, reason: d.reason }
      for (const line of d.applied) {
        b.state = apply(b.state, registry, line)
        b.log.push(line)
      }
      bump((n) => n + 1)
      return { ok: true }
    },
  }
}

// ==============================================================================================
// What is on the felt, named for a reader. Every name comes out of the projection, so a card the
// view may not see is "dolt kort" and carries no identity: the same filter the wire is tested on.

type Thing =
  | { key: string; kind: 'card'; id: string; name: string; zone: string; x: number; y: number }
  | { key: string; kind: 'pileTop'; pile: string; name: string; x: number; y: number; count: number }
  | { key: string; kind: 'pile'; pile: string; name: string; x: number; y: number; count: number }

const HIDDEN = 'Dolt kort'
const cardName = (c: VisibleComponentState | undefined) => c?.cardRef ?? HIDDEN
const zoneName = (view: Snapshot, id: string) => view.zones.find((z) => z.id === id)?.name ?? id
const countOf = (z: ZoneView) => (z.mode === 'count' ? z.count : z.order.length)
const topIdOf = (z: ZoneView) => (z.mode === 'order' ? z.order[0] : z.top)
const topOf = (view: Snapshot, z: ZoneView) => view.components.find((c) => c.id === topIdOf(z))
const seatOf = (view: Snapshot, id: string | undefined) => view.seats.find((s) => s.id === id)?.name ?? id ?? ''
const handName = (view: Snapshot, z: ZoneView) => (z.owner === view.seat ? 'Min hand' : `${seatOf(view, z.owner)}s hand`)

function absolute(view: Snapshot, c: VisibleComponentState) {
  const z = view.zones.find((x) => x.id === c.zone)
  return z ? { x: z.geometry.x + c.x, y: z.geometry.y + c.y } : { x: c.x, y: c.y }
}

// Everything on the felt a keyboard may stand on, in reading order: down the table, then across.
// Hands are not here — they are destinations with names, not places to stand.
function thingsOn(view: Snapshot): Thing[] {
  const areas = new Set(view.zones.filter((z) => z.kind === 'area').map((z) => z.id))
  const cards: Thing[] = view.components
    .filter((c) => areas.has(c.zone))
    .map((c): Thing => {
      const a = absolute(view, c)
      return { key: `card:${c.id}`, kind: 'card', id: c.id, name: cardName(c), zone: c.zone, x: a.x, y: a.y }
    })
  const piles: Thing[] = view.zones
    .filter((z) => z.kind === 'pile')
    .flatMap((z): Thing[] => {
      const base = { pile: z.id, x: z.geometry.x, y: z.geometry.y, count: countOf(z) }
      return [
        { key: `top:${z.id}`, kind: 'pileTop', name: cardName(topOf(view, z)), ...base },
        { key: `pile:${z.id}`, kind: 'pile', name: z.dynamic ? 'hög' : z.name, ...base },
      ]
    })
  return [...cards, ...piles].sort((a, b) => (Math.abs(a.y - b.y) > 45 ? a.y - b.y : a.x - b.x))
}

function label(view: Snapshot, t: Thing): string {
  if (t.kind === 'card') {
    const c = view.components.find((x) => x.id === t.id)
    return `${t.name}, kort i ${zoneName(view, t.zone)}${c && c.rot % 360 !== 0 ? ', vridet' : ''}`
  }
  if (t.kind === 'pileTop') return t.count === 0 ? `${zoneName(view, t.pile)}, tom` : `Översta kortet i ${zoneName(view, t.pile)}: ${t.name}`
  return `${zoneName(view, t.pile)}, hela högen, ${t.count} kort`
}

// ==============================================================================================
// The verbs. The vocabulary in `packages/protocol` is closed and physical, so the keyboard says
// the SAME verbs the pointer says — never a new one. This list is the pointer's ring, unchanged.

type Act = { key: string; label: string; hint?: string; intents: Intent[] | null; look?: string }

function verbsFor(view: Snapshot, t: Thing): Act[] {
  if (t.kind === 'card') {
    const c = view.components.find((x) => x.id === t.id)
    if (!c) return []
    return [
      { key: 'flip', label: 'Vänd', intents: [{ v: 'flip', component: c.id, face: c.face === 'front' ? 'back' : 'front' }] },
      { key: 'rotate', label: 'Vrid 90°', intents: [{ v: 'rotate', component: c.id, rot: (c.rot + 90) % 360 }] },
      { key: 'reveal', label: 'Avslöja', hint: 'visar kortet för alla', intents: c.cardRef === null ? [{ v: 'reveal', components: [c.id] }] : null },
      { key: 'look', label: 'Titta', hint: 'bara på den här skärmen', intents: [], look: c.id },
    ]
  }
  const z = view.zones.find((x) => x.id === t.pile)
  if (!z) return []
  const n = countOf(z)
  const top = topOf(view, z)
  if (t.kind === 'pileTop') {
    return [
      // The top is flipped by naming the pile (K15) — a hidden pile grants no id.
      { key: 'flipTop', label: 'Vänd översta', intents: n > 0 ? [{ v: 'flip', component: { top: z.id }, face: top?.face === 'front' ? 'back' : 'front' }] : null },
      { key: 'look', label: 'Titta på översta', hint: 'bara på den här skärmen', intents: top ? [] : null, ...(top ? { look: top.id } : {}) },
    ]
  }
  return [
    { key: 'shuffle', label: 'Blanda', intents: n > 1 ? [{ v: 'shuffle', pile: z.id }] : null },
    { key: 'toHand', label: 'Dra 1 till min hand', intents: n > 0 && view.seat ? [{ v: 'split', pile: z.id, at: 1, to: `hand:${view.seat}` }] : null },
    { key: 'half', label: 'Dela på hälften', hint: 'ny hög bredvid', intents: n > 1 ? [{ v: 'split', pile: z.id, at: Math.ceil(n / 2), x: z.geometry.x + CARD_MM.w + 14, y: z.geometry.y }] : null },
  ]
}

// ==============================================================================================
// Destinations. This is where the variants part company, so each one builds its own list; what
// is shared is the set of PLACES that have names at all.

type Place = { key: string; label: string; hint: string; zone: string; kind: 'area' | 'pile' | 'hand' | 'card'; anchor?: VisibleComponentState }

function placesFor(view: Snapshot, moving: ReadonlySet<string>, sourceZone: string | null): Place[] {
  const zones: Place[] = view.zones
    .filter((z) => !(z.kind === 'area' && z.id === view.floor))
    .map((z): Place => ({
      key: `z:${z.id}`,
      label: z.kind === 'hand' ? handName(view, z) : z.name,
      hint: z.kind === 'pile' ? `${countOf(z)} kort · överst` : z.kind === 'hand' ? `${countOf(z)} kort` : `${countOf(z)} kort · fri yta`,
      zone: z.id,
      kind: z.kind,
    }))
  const floor = view.zones.find((z) => z.id === view.floor)
  const onFloor: Place[] = floor ? [{ key: `z:${floor.id}`, label: 'Bordet', hint: 'fri yta', zone: floor.id, kind: 'area' }] : []
  const areas = new Set(view.zones.filter((z) => z.kind === 'area').map((z) => z.id))
  const cards: Place[] = view.components
    .filter((c) => areas.has(c.zone) && !moving.has(c.id))
    .map((c): Place => ({ key: `c:${c.id}`, label: `På ${cardName(c)}`, hint: `bildar en hög i ${zoneName(view, c.zone)}`, zone: c.zone, kind: 'card', anchor: c }))
  return [...zones, ...onFloor, ...cards].filter((p) => p.zone !== sourceZone || p.kind === 'card')
}

// Where variant C puts a card it was told to place in a zone: the next free slot in a row, so
// two cards played by keyboard do not land on top of each other. Relative to the zone (K2).
function slotIn(view: Snapshot, zone: string): { x: number; y: number } {
  const z = view.zones.find((x) => x.id === zone)
  const held = view.components.filter((c) => c.zone === zone)
  const perRow = z ? Math.max(1, Math.floor(z.geometry.w / (CARD_MM.w + 14))) : 6
  const i = held.length
  return { x: 14 + (i % perRow) * (CARD_MM.w + 14), y: 14 + Math.floor(i / perRow) * (CARD_MM.h + 14) }
}

// ==============================================================================================
// Saying it out loud. One rule for all three variants: what I did is said at once; what someone
// else did is gathered up so a busy table cannot flood the reader; a refusal cuts in.

type Say = {
  polite: string
  assertive: string
  banner: string
  mine(text: string): void
  theirs(text: string): void
  refuse(text: string): void
  quiet(text: string): void
}

const COALESCE_MS = 1400

function useSay(): Say {
  const [polite, setPolite] = useState('')
  const [assertive, setAssertive] = useState('')
  const [banner, setBanner] = useState('')
  const pending = useRef<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const flush = () => {
    timer.current = null
    const q = pending.current
    pending.current = []
    if (q.length === 0) return
    setPolite(q.length === 1 ? q[0]! : `${q.length} drag av de andra, senast: ${q[q.length - 1]!}`)
  }
  return {
    polite,
    assertive,
    banner,
    mine: (text) => {
      setBanner(text)
      setAssertive('')
      setPolite(text)
    },
    // The reader is not interrupted per line: the queue empties on a beat, and several lines
    // arrive as one sentence with a count.
    theirs: (text) => {
      setBanner(text)
      pending.current.push(text)
      if (!timer.current) timer.current = setTimeout(flush, COALESCE_MS)
    },
    refuse: (text) => {
      setBanner(text)
      setPolite('')
      setAssertive(text)
    },
    // Movement while carrying: on the screen, never in a live region (see NOTES).
    quiet: (text) => setBanner(text),
  }
}

function Live({ say }: { say: Say }) {
  return (
    <>
      <p className="kb-live" role="status">{say.polite}</p>
      <p className="kb-live" role="alert">{say.assertive}</p>
    </>
  )
}

// ==============================================================================================
// The keyboard layer over the real renderer. It adds nothing to the picture; it puts a role, a
// name, a tab stop and a focus ring on the nodes `TableRenderer` already renders. That is the
// shape the real change would take, and it keeps K9: one renderer, one way to draw a card.

type FeltSpec = { label: string; stop: boolean; state?: string }

function useFeltA11y(root: React.RefObject<HTMLElement | null>, spec: Map<string, FeltSpec>, pending: React.RefObject<string | null>) {
  const nodes = useRef(new Map<string, HTMLElement>())
  const decorate = () => {
    const el = root.current
    if (!el) return
    const found = new Map<string, HTMLElement>()
    el.querySelectorAll<HTMLElement>('[data-table] .byd-card[data-component]').forEach((n) => {
      const id = n.getAttribute('data-component')
      if (id && !n.classList.contains('byd-peer-ghost')) found.set(`card:${id}`, n)
    })
    el.querySelectorAll<HTMLElement>('.byd-pile').forEach((p) => {
      const z = p.getAttribute('data-zone')
      if (!z) return
      const t = p.querySelector<HTMLElement>('.byd-pile-top')
      if (t) found.set(`top:${z}`, t)
      const c = p.querySelector<HTMLElement>('.byd-pile-count')
      if (c) found.set(`pile:${z}`, c)
    })
    el.querySelectorAll<HTMLElement>('.byd-zone[data-area]').forEach((n) => {
      const z = n.getAttribute('data-area')
      if (z) found.set(`zone:${z}`, n)
    })
    nodes.current = found
    const set = (n: HTMLElement, a: string, v: string | null) => {
      if (v === null) {
        if (n.hasAttribute(a)) n.removeAttribute(a)
      } else if (n.getAttribute(a) !== v) n.setAttribute(a, v)
    }
    for (const [key, n] of found) {
      const info = spec.get(key)
      if (!info) {
        for (const a of ['tabindex', 'role', 'aria-label', 'data-kbd', 'data-kbd-state']) set(n, a, null)
        continue
      }
      set(n, 'data-kbd', key)
      set(n, 'role', 'button')
      set(n, 'aria-label', info.label)
      set(n, 'tabindex', info.stop ? '0' : '-1')
      set(n, 'data-kbd-state', info.state ?? null)
    }
    const want = pending.current
    if (want) {
      pending.current = null
      // The thing focus was heading for can have left the felt — a card played into a hand, a
      // pile that dissolved. Focus then goes to the one tab stop that is left, never to nothing.
      const n = found.get(want) ?? [...found].find(([k]) => spec.get(k)?.stop)?.[1]
      n?.focus()
    }
  }
  useLayoutEffect(decorate)
  // The renderer measures its own frame and repaints without the page around it re-rendering,
  // so the layer watches the tree rather than only the render.
  useEffect(() => {
    const el = root.current
    if (!el || typeof MutationObserver === 'undefined') return
    const mo = new MutationObserver(() => decorate())
    mo.observe(el, { childList: true, subtree: true })
    return () => mo.disconnect()
  })
  return nodes
}

const keyOf = (e: React.KeyboardEvent) => (e.target as HTMLElement | null)?.getAttribute?.('data-kbd') ?? null

// ==============================================================================================
// Shells. The chrome of each route, thin, so the three variants are compared on the interaction
// and not on the furniture.

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function Felt({ view, mode, rotate, onAct, wrap }: { view: Snapshot; mode: 'tv' | 'table'; rotate?: 0 | 90 | 180 | 270; onAct?: (i: Intent[]) => void; wrap: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="kb-felt" ref={wrap}>
      <TableRenderer view={view} mode={mode} rotate={rotate} onAct={onAct} glideMs={reducedMotion() ? 0 : 700} />
    </div>
  )
}

function PhoneShell({ view, say, legend, children }: { view: Snapshot; say: Say; legend: ReactNode; children: ReactNode }) {
  const hand = view.components.filter((c) => c.zone === `hand:${view.seat}`)
  return (
    <div className="byd-player kb-phone" data-page="player">
      <header>
        <strong>{seatOf(view, view.seat ?? undefined)}</strong>
        <span>{hand.length} kort</span>
        <button type="button" disabled>↶ Ångra</button>
        <button type="button">⚑ Flagga</button>
        <button type="button" className="byd-end">Avsluta</button>
      </header>
      {children}
      <p className="kb-banner" data-empty={say.banner === '' ? 'true' : undefined}>{say.banner || ' '}</p>
      <p className="kb-legend">{legend}</p>
    </div>
  )
}

function TvShell({ view, say, legend, children }: { view: Snapshot; say: Say; legend: ReactNode; children: ReactNode }) {
  return (
    <div className="kb-tv">
      <header>
        <strong>Skogens herrar</strong>
        <span>rev-12</span>
        <span className="kb-spacer" />
        <span className="kb-room">Rum KX7P</span>
      </header>
      <main>{children}</main>
      <aside>
        <h2>Platser</h2>
        <ul className="kb-seats">
          {view.seats.map((s, i) => (
            <li key={s.id} style={{ ['--seat' as string]: seatColor(i) }}>
              <b>{s.id}</b> {s.name ?? 'ledig'}
            </li>
          ))}
        </ul>
        <h2>Senast</h2>
        <p className="kb-banner" data-empty={say.banner === '' ? 'true' : undefined}>{say.banner || 'Inget än'}</p>
        <h2>Tangenter</h2>
        <p className="kb-legend">{legend}</p>
      </aside>
    </div>
  )
}

function OnlineShell({ view, say, legend, children }: { view: Snapshot; say: Say; legend: ReactNode; children: ReactNode }) {
  return (
    <div className="byd-online kb-online">
      {children}
      <div className="byd-online-me" style={{ ['--seat' as string]: seatColor(view.seats.findIndex((s) => s.id === view.seat)) }}>
        <strong>{seatOf(view, view.seat ?? undefined)}</strong>
        <span>{view.components.filter((c) => c.zone === `hand:${view.seat}`).length} kort</span>
      </div>
      <div className="kb-online-say">
        <p className="kb-banner" data-empty={say.banner === '' ? 'true' : undefined}>{say.banner || ' '}</p>
        <p className="kb-legend">{legend}</p>
      </div>
    </div>
  )
}

// A hand card, as a real control, in whichever of the two hand shapes the route has.
function HandCard({ c, shape, selected, marked, extra, onKeyDown, onClick, refFn, i, n }: {
  c: VisibleComponentState
  shape: 'strip' | 'fan'
  selected: boolean
  marked?: boolean
  extra: string
  onKeyDown(e: React.KeyboardEvent): void
  onClick(): void
  refFn(el: HTMLButtonElement | null): void
  i: number
  n: number
}) {
  const fan = shape === 'fan' ? { ['--fan' as string]: `${(i - (n - 1) / 2) * 8}deg`, ['--dip' as string]: `${Math.abs(i - (n - 1) / 2) * 6}px` } : {}
  return (
    <button
      type="button"
      className={shape === 'strip' ? 'byd-strip-card kb-hand-card' : 'byd-fan-card kb-hand-card'}
      data-hand-card={c.id}
      data-selected={marked ? 'true' : 'false'}
      aria-pressed={marked === undefined ? undefined : marked}
      tabIndex={selected ? 0 : -1}
      ref={refFn}
      aria-label={`${cardName(c)}${extra}`}
      style={{ ['--hue' as string]: hue(c.cardRef ?? ''), ...fan }}
      onKeyDown={onKeyDown}
      onClick={onClick}
    >
      <span aria-hidden="true">{c.cardRef}</span>
    </button>
  )
}

// A roving hand: one tab stop, arrows inside it — the editor's settled pattern (roving.ts),
// which is why no variant invents its own.
function useHandRoving(ids: string[]) {
  const [at, setAt] = useState(0)
  const els = useRef(new Map<string, HTMLButtonElement>())
  const here = Math.min(at, Math.max(0, ids.length - 1))
  const go = (d: number) => {
    if (ids.length === 0) return
    const next = (here + d + ids.length) % ids.length
    setAt(next)
    els.current.get(ids[next]!)?.focus()
  }
  return {
    here: ids[here] ?? null,
    setHere: (id: string) => setAt(Math.max(0, ids.indexOf(id))),
    refFn: (id: string) => (el: HTMLButtonElement | null) => {
      if (el) els.current.set(id, el)
      else els.current.delete(id)
    },
    focus: (id: string) => els.current.get(id)?.focus(),
    arrows: (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(1)
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(-1)
      else if (e.key === 'Home') { setAt(0); els.current.get(ids[0]!)?.focus() }
      else if (e.key === 'End') { setAt(ids.length - 1); els.current.get(ids[ids.length - 1]!)?.focus() }
      else return false
      e.preventDefault()
      return true
    },
  }
}

// ==============================================================================================
// VARIANT A — Zonlistan. The table has no geometry for the keyboard: it is a list of named
// places, and a card moves from one to another. `move` goes without x or y.

function VariantA({ route, table, say }: VariantProps) {
  const seat: string | null = route === 'table' ? null : ME
  const view = table.view(seat)
  const [open, setOpen] = useState<Set<string>>(new Set([`hand:${ME}`, 'market']))
  const [carry, setCarry] = useState<string[]>([])
  const [marks, setMarks] = useState<Set<string>>(new Set())
  const wrap = useRef<HTMLDivElement | null>(null)
  const rows = zoneRowsA(view, open, marks, carry)
  const ids = rows.map((r) => r.key)
  const rov = useHandRoving(ids)

  const run = (intents: Intent[], said: string) => {
    const r = table.act(seat, intents)
    if (r.ok) say.mine(said)
    else say.refuse(`Bordet sa nej: ${r.reason}`)
    return r.ok
  }
  const drop = (zone: string) => {
    if (carry.length === 0) return
    const names = carry.map((id) => cardName(view.components.find((c) => c.id === id))).join(', ')
    // A public zone turns the card face up as a hand would (K11) — the same two verbs the sheet
    // sends today. No x, no y: variant A has nothing to say about where in the zone.
    const isPublic = view.zones.find((z) => z.id === zone)?.mode === 'order' && view.zones.find((z) => z.id === zone)?.kind !== 'hand'
    const intents = carry.flatMap((id): Intent[] => [{ v: 'move', component: id, to: zone }, ...(isPublic ? [{ v: 'flip', component: id, face: 'front' } as Intent] : [])])
    if (run(intents, `${names} till ${zoneName(view, zone)}`)) {
      setCarry([])
      setMarks(new Set())
    }
  }
  const onKey = (e: React.KeyboardEvent, row: RowA) => {
    if (rov.arrows(e)) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') return
    if (e.key === 'Escape' && carry.length > 0) {
      setCarry([])
      say.mine('Släppte kortet')
      e.preventDefault()
      return
    }
    if (e.key === ' ' && row.kind === 'card') {
      setMarks((m) => {
        const n = new Set(m)
        if (n.has(row.id)) n.delete(row.id)
        else n.add(row.id)
        return n
      })
      e.preventDefault()
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (row.kind === 'zone') {
      if (carry.length > 0) drop(row.zone)
      else setOpen((o) => {
        const n = new Set(o)
        if (n.has(row.zone)) n.delete(row.zone)
        else n.add(row.zone)
        return n
      })
      return
    }
    if (row.kind === 'pile') {
      if (carry.length > 0) drop(row.zone)
      return
    }
    if (carry.length > 0) {
      // Onto a card is `stack` (K1): the one placement variant A can express exactly.
      const moving = carry[0]!
      if (run([{ v: 'stack', component: moving, onto: row.id }], `${cardName(view.components.find((c) => c.id === moving))} på ${row.name}`)) setCarry([])
      return
    }
    const picked = marks.size > 0 && marks.has(row.id) ? [...marks] : [row.id]
    setCarry(picked)
    say.mine(picked.length > 1 ? `${picked.length} kort upptagna` : `${row.name} upptaget`)
  }

  const legend = <>↑↓ rad · Enter ta upp / lägg här · Mellanslag markera · Esc släpp · v vänd · r vrid · b blanda</>
  const list = (
    <div className="kb-list" role="tree" aria-label="Bordet som platser">
      {rows.map((r) => (
        <button
          key={r.key}
          type="button"
          className="kb-row"
          data-kind={r.kind}
          data-depth={r.depth}
          data-carry={carry.includes(r.kind === 'card' ? r.id : '') ? 'true' : undefined}
          role="treeitem"
          aria-level={r.depth + 1}
          {...(r.kind === 'zone' ? { 'aria-expanded': open.has(r.zone) } : {})}
          {...(r.kind === 'card' ? { 'aria-selected': marks.has(r.id) } : {})}
          aria-label={r.label}
          tabIndex={rov.here === r.key ? 0 : -1}
          ref={rov.refFn(r.key)}
          onFocus={() => rov.setHere(r.key)}
          onKeyDown={(e) => onKey(e, r)}
        >
          <span className="kb-row-name">{r.name}</span>
          <span className="kb-row-hint">{r.hint}</span>
        </button>
      ))}
    </div>
  )
  const spec = new Map<string, FeltSpec>()
  for (const t of thingsOn(view)) spec.set(t.key, { label: label(view, t), stop: false, ...(carry.includes(t.kind === 'card' ? t.id : '') ? { state: 'carry' } : {}) })
  useFeltA11y(wrap, spec, useRef<string | null>(null))

  const carried = carry.length > 0 ? <p className="kb-carry">Bär {carry.length > 1 ? `${carry.length} kort` : cardName(view.components.find((c) => c.id === carry[0]))} — välj en plats och tryck Enter</p> : null

  if (route === 'play') {
    return (
      <PhoneShell view={view} say={say} legend={legend}>
        <div className="kb-phone-body">
          {carried}
          {list}
        </div>
      </PhoneShell>
    )
  }
  if (route === 'table') {
    return (
      <TvShell view={view} say={say} legend={legend}>
        <div className="kb-split">
          <Felt view={view} mode="tv" wrap={wrap} />
          <div className="kb-aside">{carried}{list}</div>
        </div>
      </TvShell>
    )
  }
  return (
    <OnlineShell view={view} say={say} legend={legend}>
      <div className="kb-split kb-split-online">
        <div className="kb-felt-cell">
          <Felt view={withoutHand(view, ME)} mode="table" rotate={seatRotation(view, ME)} wrap={wrap} />
          {/* The fan stays where C2 put it, as a picture: in A the list is the control, so the
              cards on the felt are not a second, half-working way to reach the same card. */}
          <FanPicture view={view} />
        </div>
        <div className="kb-aside">{carried}{list}</div>
      </div>
    </OnlineShell>
  )
}

type RowA =
  | { key: string; kind: 'zone'; zone: string; name: string; hint: string; label: string; depth: number }
  | { key: string; kind: 'pile'; zone: string; name: string; hint: string; label: string; depth: number }
  | { key: string; kind: 'card'; id: string; name: string; hint: string; label: string; depth: number }

function zoneRowsA(view: Snapshot, open: Set<string>, marks: Set<string>, carry: string[]): RowA[] {
  const rows: RowA[] = []
  const order = [...view.zones].sort((a, b) => (a.owner === view.seat ? -1 : b.owner === view.seat ? 1 : 0))
  for (const z of order) {
    const n = countOf(z)
    const name = z.kind === 'hand' ? handName(view, z) : z.name
    const hidden = z.mode === 'count'
    const hint = `${n} kort${hidden ? ' · dolda' : ''}`
    const verb = carry.length > 0 ? ', lägg här' : hidden ? '' : open.has(z.id) ? ', öppen' : ', stängd'
    if (z.kind === 'pile') {
      rows.push({ key: `p:${z.id}`, kind: 'pile', zone: z.id, name, hint, label: `${name}, ${hint}${carry.length > 0 ? ', lägg överst' : ''}`, depth: 0 })
      continue
    }
    rows.push({ key: `z:${z.id}`, kind: 'zone', zone: z.id, name, hint, label: `${name}, ${hint}${verb}`, depth: 0 })
    if (!open.has(z.id) || hidden) continue
    for (const id of z.mode === 'order' ? z.order : []) {
      const c = view.components.find((x) => x.id === id)
      if (!c) continue
      const nm = cardName(c)
      rows.push({
        key: `c:${id}`,
        kind: 'card',
        id,
        name: nm,
        hint: marks.has(id) ? 'markerat' : c.face === 'back' ? 'nedvänt' : '',
        label: `${nm}, i ${name}${marks.has(id) ? ', markerat' : ''}${carry.length > 0 ? ', lägg på det här kortet' : ''}`,
        depth: 1,
      })
    }
  }
  return rows
}

// ==============================================================================================
// VARIANT B — Kompassen. Focus stands on the felt itself; Enter lifts a card and the arrows step
// it a card at a time (Shift: a quarter). Every point on the table is sayable, and the drop is
// resolved by the pointer's own rules — `dropIntents`, unchanged.

const STEP = CARD_MM.w
const FINE = 16

function VariantB({ route, table, say }: VariantProps) {
  const seat: string | null = route === 'table' ? null : ME
  const base = table.view(seat)
  const wrap = useRef<HTMLDivElement | null>(null)
  const pending = useRef<string | null>(null)
  const [carry, setCarry] = useState<{ target: DragTarget; grab: { x: number; y: number }; at: { x: number; y: number } } | null>(null)
  const rot = route === 'online' ? seatRotation(base, ME) : 0
  const shown = route === 'online' ? withoutHand(base, ME) : base

  // While something is carried the renderer is handed a table where that card has moved: the
  // picture comes from the same renderer as always, off a snapshot that says where the card is.
  const view = useMemo(() => (carry && carry.target.kind === 'card' ? nudged(shown, carry.target.id, carry.at.x - carry.grab.x, carry.at.y - carry.grab.y) : shown), [shown, carry])
  const things = thingsOn(view)
  const [here, setHere] = useState<string | null>(null)
  const at = here && things.some((t) => t.key === here) ? here : things[0]?.key ?? null

  const run = (intents: Intent[], said: string) => {
    const r = table.act(seat, intents)
    if (r.ok) say.mine(said)
    else say.refuse(`Bordet sa nej: ${r.reason}`)
    return r.ok
  }
  const move = (k: string) => {
    setHere(k)
    pending.current = k
  }
  const step = (dx: number, dy: number) => {
    if (!carry) return
    const t = turn(dx, dy, rot)
    const next = { x: carry.at.x + t.x, y: carry.at.y + t.y }
    setCarry({ ...carry, at: next })
    say.quiet(`${describeUnder(base, next, carry)} — ${Math.round(next.x)}, ${Math.round(next.y)} mm`)
  }
  const lift = (t: Thing) => {
    const grab = { x: t.x, y: t.y }
    const target: DragTarget = t.kind === 'card' ? { kind: 'card', id: t.id } : t.kind === 'pileTop' ? { kind: 'pileTop', pile: t.pile } : { kind: 'pile', pile: t.pile }
    setCarry({ target, grab, at: grab })
    say.mine(`${t.name} lyft. Pilarna flyttar, Enter släpper, Esc ångrar.`)
  }
  const put = () => {
    if (!carry) return
    const ids = carry.target.kind === 'card' ? [carry.target.id] : []
    const origin: Record<string, { x: number; y: number }> = {}
    for (const id of ids) {
      const c = base.components.find((x) => x.id === id)
      if (c) origin[id] = absolute(base, c)
    }
    const intents = dropIntents(base, { target: carry.target, ids, origin, grab: carry.grab, at: carry.at })
    if (run(intents, `Släppt: ${describeUnder(base, carry.at, carry)}`)) setCarry(null)
  }

  const onKey = (e: React.KeyboardEvent) => {
    const k = keyOf(e)
    const t = things.find((x) => x.key === k)
    const idx = things.findIndex((x) => x.key === k)
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
    const a = arrows[e.key]
    if (a) {
      e.preventDefault()
      if (carry) {
        const s = e.shiftKey ? FINE : STEP
        step(a[0] * s, a[1] * s)
      } else if (idx >= 0) {
        const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1
        move(things[(idx + d + things.length) % things.length]!.key)
      }
      return
    }
    if (e.key === 'Escape' && carry) {
      setCarry(null)
      say.mine('Lyftet ångrat, kortet ligger kvar')
      e.preventDefault()
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (carry) put()
      else if (t) lift(t)
      return
    }
    if (!t || carry) return
    const quick: Record<string, string> = { v: 'flip', r: 'rotate', b: 'shuffle', a: 'reveal', V: 'flipTop' }
    const want = quick[e.key]
    if (!want) return
    const act = verbsFor(view, t).find((x) => x.key === want || (want === 'flip' && x.key === 'flipTop'))
    if (!act) return
    e.preventDefault()
    if (act.intents === null || act.intents.length === 0) return say.refuse(`${act.label} går inte här`)
    run(act.intents, `${act.label}: ${t.name}`)
  }

  const spec = new Map<string, FeltSpec>()
  for (const t of things) {
    const carried = carry && ((carry.target.kind === 'card' && t.key === `card:${carry.target.id}`) || (carry.target.kind !== 'card' && t.key === `${carry.target.kind === 'pile' ? 'pile' : 'top'}:${carry.target.pile}`))
    spec.set(t.key, {
      label: carried ? `${t.name}, bärs, ${describeUnder(base, carry.at, carry)}` : label(view, t),
      stop: t.key === at,
      ...(carried ? { state: 'carry' } : {}),
    })
  }
  useFeltA11y(wrap, spec, pending)

  const legend = <>Pil: gå mellan sakerna · Enter: lyft / släpp · Pil när du bär: ett kort i taget, Shift = fjärdedel · Esc: ångra · v vänd · r vrid · b blanda · a avslöja</>
  const felt = (
    <div onKeyDown={onKey} className="kb-keys">
      <Felt view={view} mode={route === 'online' ? 'table' : 'tv'} rotate={rot} wrap={wrap} />
    </div>
  )
  if (route === 'play') {
    // The phone has no felt. B has to give it one: C4's "fäll ut bordet", full size, because
    // stepping needs somewhere to step.
    return (
      <PhoneShell view={base} say={say} legend={legend}>
        <div className="kb-phone-felt">{felt}</div>
        <PhoneHandB view={base} table={table} say={say} />
      </PhoneShell>
    )
  }
  if (route === 'table') return <TvShell view={base} say={say} legend={legend}>{felt}</TvShell>
  return (
    <OnlineShell view={base} say={say} legend={legend}>
      {felt}
      <FanB view={base} table={table} say={say} />
    </OnlineShell>
  )
}

// A card carried by the keyboard is a card that has moved, as far as the picture is concerned.
function nudged(view: Snapshot, id: string, dx: number, dy: number): Snapshot {
  return { ...view, components: view.components.map((c) => (c.id === id ? { ...c, x: c.x + dx, y: c.y + dy } : c)) }
}
// The arrows mean the table's directions, not the screen's: a quarter-turned table (C5) still
// steps away from the seat when the up arrow is pressed.
function turn(dx: number, dy: number, rot: number) {
  const r = ((rot % 360) + 360) % 360
  if (r === 90) return { x: dy, y: -dx }
  if (r === 180) return { x: -dx, y: -dy }
  if (r === 270) return { x: -dy, y: dx }
  return { x: dx, y: dy }
}
function describeUnder(view: Snapshot, at: { x: number; y: number }, carry: { target: DragTarget }): string {
  const ignore = new Set(carry.target.kind === 'card' ? [carry.target.id] : [])
  for (const c of [...view.components].reverse()) {
    if (ignore.has(c.id)) continue
    const z = view.zones.find((x) => x.id === c.zone)
    if (!z || z.kind !== 'area') continue
    const a = absolute(view, c)
    if (at.x >= a.x && at.x <= a.x + CARD_MM.w && at.y >= a.y && at.y <= a.y + CARD_MM.h) return `på ${cardName(c)}`
  }
  for (const z of view.zones) {
    if (z.kind !== 'pile') continue
    if (at.x >= z.geometry.x - CARD_MM.w / 2 && at.x <= z.geometry.x + CARD_MM.w / 2 && at.y >= z.geometry.y - CARD_MM.h / 2 && at.y <= z.geometry.y + CARD_MM.h / 2) return `över ${z.name}`
  }
  let best: ZoneView | null = null
  for (const z of view.zones) {
    if (z.kind === 'pile') continue
    const g = z.geometry
    if (at.x < g.x || at.y < g.y || at.x > g.x + g.w || at.y > g.y + g.h) continue
    if (!best || g.w * g.h < best.geometry.w * best.geometry.h) best = z
  }
  if (!best) return 'utanför bordet'
  return `över ${best.kind === 'hand' ? handName(view, best) : best.name}`
}

// B on the phone: the hand is still a strip, and Enter lays the card on the felt above, where the
// arrows take over.
function PhoneHandB({ view, table, say }: { view: Snapshot; table: ProtoTable; say: Say }) {
  const hand = view.components.filter((c) => c.zone === `hand:${ME}`)
  const rov = useHandRoving(hand.map((c) => c.id))
  const play = (c: VisibleComponentState) => {
    const r = table.act(ME, [{ v: 'move', component: c.id, to: view.floor, x: 560, y: 620 }, { v: 'flip', component: c.id, face: 'front' }])
    if (r.ok) say.mine(`${cardName(c)} lagt vid min kant — pilarna flyttar det`)
    else say.refuse(`Bordet sa nej: ${r.reason}`)
  }
  return (
    <div className="byd-strip kb-strip" role="group" aria-label="Min hand">
      {hand.map((c, i) => (
        <HandCard key={c.id} c={c} shape="strip" i={i} n={hand.length} selected={rov.here === c.id} extra=", i min hand. Enter lägger det på bordet." refFn={rov.refFn(c.id)} onClick={() => play(c)} onKeyDown={(e) => { if (rov.arrows(e)) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(c) } }} />
      ))}
    </div>
  )
}
// The seat's own fan, drawn and not operable: variant A reaches these cards through its list.
function FanPicture({ view }: { view: Snapshot }) {
  const hand = view.components.filter((c) => c.zone === `hand:${ME}`)
  return (
    <div className="byd-fan kb-fan" aria-hidden="true">
      {hand.map((c, i) => (
        <div key={c.id} className="byd-fan-card" style={{ ['--hue' as string]: hue(c.cardRef ?? ''), ['--fan' as string]: `${(i - (hand.length - 1) / 2) * 8}deg`, ['--dip' as string]: `${Math.abs(i - (hand.length - 1) / 2) * 6}px` }}>
          <span>{c.cardRef}</span>
        </div>
      ))}
    </div>
  )
}

function FanB({ view, table, say }: { view: Snapshot; table: ProtoTable; say: Say }) {
  const hand = view.components.filter((c) => c.zone === `hand:${ME}`)
  const rov = useHandRoving(hand.map((c) => c.id))
  const play = (c: VisibleComponentState) => {
    const r = table.act(ME, [{ v: 'move', component: c.id, to: view.floor, x: 560, y: 620 }, { v: 'flip', component: c.id, face: 'front' }])
    if (r.ok) say.mine(`${cardName(c)} lagt vid min kant — pilarna flyttar det`)
    else say.refuse(`Bordet sa nej: ${r.reason}`)
  }
  return (
    <div className="byd-fan kb-fan" role="group" aria-label="Min hand">
      {hand.map((c, i) => (
        <HandCard key={c.id} c={c} shape="fan" i={i} n={hand.length} selected={rov.here === c.id} extra=", i min hand. Enter lägger det vid min kant." refFn={rov.refFn(c.id)} onClick={() => play(c)} onKeyDown={(e) => { if (rov.arrows(e)) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(c) } }} />
      ))}
    </div>
  )
}

// ==============================================================================================
// VARIANT C — Adressen. Everything on the felt is a control with a name; Enter opens a panel of
// what can be done and where it can go. The places have names; an arbitrary point does not, and
// the panel says so instead of pretending.

type Panel = { thing: Thing; from: 'felt' | 'hand'; cards: string[] } | null

function VariantC({ route, table, say }: VariantProps) {
  const seat: string | null = route === 'table' ? null : ME
  const view = table.view(seat)
  const wrap = useRef<HTMLDivElement | null>(null)
  const pending = useRef<string | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [look, setLook] = useState<VisibleComponentState | null>(null)
  const [marks, setMarks] = useState<Set<string>>(new Set())
  const things = thingsOn(view)
  const [here, setHere] = useState<string | null>(null)
  const at = here && things.some((t) => t.key === here) ? here : things[0]?.key ?? null
  const returnTo = useRef<HTMLElement | null>(null)
  const rot = route === 'online' ? seatRotation(view, ME) : 0
  const shown = route === 'online' ? withoutHand(view, ME) : view

  const run = (intents: Intent[], said: string) => {
    const r = table.act(seat, intents)
    if (r.ok) say.mine(said)
    else say.refuse(`Bordet sa nej: ${r.reason}`)
    return r.ok
  }
  const openPanel = (t: Thing, from: 'felt' | 'hand', cards: string[] = []) => {
    returnTo.current = (document.activeElement as HTMLElement | null) ?? null
    setPanel({ thing: t, from, cards })
  }
  // Escape hands the focus back to what opened the panel. A move, though, takes that thing off
  // the felt: focus then follows the card to where it landed, which is where the eye goes too.
  const close = (landedOn?: string) => {
    setPanel(null)
    if (landedOn) {
      pending.current = landedOn
      return
    }
    const el = returnTo.current
    if (el && document.contains(el)) el.focus()
    else if (panel?.from === 'felt') pending.current = panel.thing.key
  }
  const onKey = (e: React.KeyboardEvent) => {
    const k = keyOf(e)
    const idx = things.findIndex((x) => x.key === k)
    if (idx < 0) return
    const t = things[idx]!
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (d !== 0) {
      const next = things[(idx + d + things.length) % things.length]!
      setHere(next.key)
      pending.current = next.key
      e.preventDefault()
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openPanel(t, 'felt')
    }
  }

  const spec = new Map<string, FeltSpec>()
  for (const t of things) spec.set(t.key, { label: `${label(view, t)}. Enter öppnar handlingar.`, stop: t.key === at, ...(panel?.thing.key === t.key ? { state: 'open' } : {}) })
  useFeltA11y(wrap, spec, pending)

  const legend = <>Pil: gå mellan korten och högarna · Enter: öppna handlingar · I listan: ↑↓ och Enter · Esc stänger och lämnar tillbaka fokus</>
  const felt = (
    <div onKeyDown={onKey} className="kb-keys">
      <Felt view={shown} mode={route === 'online' ? 'table' : 'tv'} rotate={rot} wrap={wrap} />
    </div>
  )
  const sheet = panel && (
    <ActionPanel
      view={view}
      panel={panel}
      onClose={close}
      onLook={(c) => { setLook(c); close() }}
      onRun={(intents, said, landedOn) => { if (run(intents, said)) { setMarks(new Set()); close(landedOn) } }}
    />
  )
  const hand = view.components.filter((c) => c.zone === `hand:${ME}`)
  const handProps = { view, marks, setMarks, open: (c: VisibleComponentState) => openPanel({ key: `card:${c.id}`, kind: 'card', id: c.id, name: cardName(c), zone: c.zone, x: 0, y: 0 }, 'hand', marks.has(c.id) ? [...marks] : [c.id]) }

  if (route === 'play') {
    return (
      <PhoneShell view={view} say={say} legend={legend}>
        <div className="kb-phone-body">
          <ZoneChips view={view} />
          <p className="kb-hint">Enter på ett kort öppnar Gör och Flytta till. Mellanslag markerar flera.</p>
        </div>
        <HandC shape="strip" hand={hand} {...handProps} />
        {sheet}
        {look && <Looker c={look} onClose={() => setLook(null)} />}
      </PhoneShell>
    )
  }
  if (route === 'table') {
    return (
      <TvShell view={view} say={say} legend={legend}>
        {felt}
        {sheet}
        {look && <Looker c={look} onClose={() => setLook(null)} />}
      </TvShell>
    )
  }
  return (
    <OnlineShell view={view} say={say} legend={legend}>
      {felt}
      <HandC shape="fan" hand={hand} {...handProps} />
      {sheet}
      {look && <Looker c={look} onClose={() => setLook(null)} />}
    </OnlineShell>
  )
}

function ZoneChips({ view }: { view: Snapshot }) {
  return (
    <div className="byd-summary-zones kb-chips">
      {view.zones.filter((z) => z.kind !== 'hand').map((z) => (
        <div key={z.id}>
          <strong>{z.name}</strong>
          <span>{countOf(z)} kort</span>
        </div>
      ))}
    </div>
  )
}

function HandC({ shape, hand, view, marks, setMarks, open }: { shape: 'strip' | 'fan'; hand: VisibleComponentState[]; view: Snapshot; marks: Set<string>; setMarks(f: (s: Set<string>) => Set<string>): void; open(c: VisibleComponentState): void }) {
  const rov = useHandRoving(hand.map((c) => c.id))
  void view
  return (
    <div className={shape === 'strip' ? 'byd-strip kb-strip' : 'byd-fan kb-fan'} role="group" aria-label={`Min hand, ${hand.length} kort`}>
      {hand.map((c, i) => (
        <HandCard
          key={c.id}
          c={c}
          shape={shape}
          i={i}
          n={hand.length}
          selected={rov.here === c.id}
          marked={marks.has(c.id)}
          extra={`, i min hand${marks.has(c.id) ? ', markerat' : ''}. Enter öppnar handlingar.`}
          refFn={rov.refFn(c.id)}
          onClick={() => open(c)}
          onKeyDown={(e) => {
            if (rov.arrows(e)) return
            if (e.key === ' ') {
              e.preventDefault()
              setMarks((m) => {
                const n = new Set(m)
                if (n.has(c.id)) n.delete(c.id)
                else n.add(c.id)
                return n
              })
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              open(c)
            }
          }}
        />
      ))}
    </div>
  )
}

// The panel takes the focus, answers Escape and hands the focus back — the manners `Question.tsx`
// already settled for the editor, applied to a list of verbs and places rather than an answer.
function ActionPanel({ view, panel, onClose, onRun, onLook }: { view: Snapshot; panel: NonNullable<Panel>; onClose(): void; onRun(i: Intent[], said: string, landedOn?: string): void; onLook(c: VisibleComponentState): void }) {
  const t = panel.thing
  const moving = new Set(panel.cards.length > 0 ? panel.cards : t.kind === 'card' ? [t.id] : [])
  const verbs = verbsFor(view, t)
  const places = placesFor(view, moving, t.kind === 'card' ? t.zone : null)
  const first = useRef<HTMLButtonElement | null>(null)
  useEffect(() => first.current?.focus(), [])
  const many = panel.cards.length > 1
  const what = many ? `${panel.cards.length} kort` : t.name
  const placeIntents = (p: Place): Intent[] => {
    const ids = [...moving]
    if (t.kind === 'pile') {
      // A whole pile has to land somewhere exact; the address gives it the zone's own corner.
      const z = view.zones.find((x) => x.id === p.zone)
      return [{ v: 'movePile', pile: t.pile, to: p.kind === 'area' ? p.zone : view.floor, x: (z?.geometry.x ?? 0) + 90, y: (z?.geometry.y ?? 0) + 90 }]
    }
    if (t.kind === 'pileTop') {
      if (p.kind === 'card' && p.anchor) return [{ v: 'stack', component: { top: t.pile }, onto: p.anchor.id }]
      return [{ v: 'split', pile: t.pile, at: 1, to: p.zone }]
    }
    if (p.kind === 'card' && p.anchor) return ids.map((id): Intent => ({ v: 'stack', component: id, onto: p.anchor!.id }))
    const z = view.zones.find((x) => x.id === p.zone)
    const isPublic = z?.kind === 'area' || (z?.kind === 'pile' && z.mode === 'order')
    return ids.flatMap((id, i): Intent[] => {
      const slot = z?.kind === 'area' ? slotIn(view, p.zone) : null
      const to: Intent = { v: 'move', component: id, to: p.zone, ...(slot ? { x: slot.x + i * (CARD_MM.w + 14), y: slot.y } : {}) }
      return isPublic && z?.kind === 'area' ? [to, { v: 'flip', component: id, face: 'front' }] : [to]
    })
  }
  return (
    <div className="kb-panel-backdrop" onClick={onClose}>
      <div
        className="kb-panel"
        role="dialog"
        aria-modal="false"
        aria-label={`Handlingar för ${what}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          onClose()
        }}
      >
        <h2>{what}</h2>
        {verbs.length > 0 && <h3>Gör</h3>}
        <div className="kb-panel-list">
          {verbs.map((a, i) => (
            <button
              key={a.key}
              type="button"
              disabled={a.intents === null}
              ref={i === 0 ? first : undefined}
              onClick={() => {
                if (a.look) {
                  const c = view.components.find((x) => x.id === a.look)
                  if (c) onLook(c)
                  return
                }
                if (a.intents) onRun(a.intents, `${a.label}: ${t.name}`)
              }}
            >
              <span>{a.label}</span>
              {a.hint && <small>{a.hint}</small>}
            </button>
          ))}
        </div>
        <h3>Flytta till</h3>
        <div className="kb-panel-list">
          {places.map((p) => (
            <button key={p.key} type="button" onClick={() => onRun(placeIntents(p), `${what} till ${p.label}`, landedKey(view, p, t))}>
              <span>{p.label}</span>
              <small>{p.hint}</small>
            </button>
          ))}
          <button type="button" disabled className="kb-panel-no">
            <span>Fri placering — en punkt på filten</span>
            <small>kräver pekdon; med tangentbord finns bara platser med namn</small>
          </button>
        </div>
        <button type="button" className="kb-panel-close" onClick={onClose}>Stäng</button>
      </div>
    </div>
  )
}

// Where the focus should stand once a move has been made: on the card itself when it is still on
// the felt, otherwise on the place that swallowed it.
function landedKey(view: Snapshot, p: Place, t: Thing): string {
  const z = view.zones.find((x) => x.id === p.zone)
  if (p.kind === 'card') return `card:${p.anchor?.id ?? ''}`
  if (z?.kind === 'pile') return `top:${z.id}`
  if (z?.kind === 'area' && t.kind === 'card') return `card:${t.id}`
  return `zone:${p.zone}`
}

function Looker({ c, onClose }: { c: VisibleComponentState; onClose(): void }) {
  return (
    <div className="byd-inspect kb-look" onClick={onClose}>
      <div data-inspect={c.id} data-face={c.cardRef === null ? 'back' : 'front'} style={c.cardRef === null ? undefined : { ['--hue' as string]: hue(c.cardRef) }}>
        <span>{c.cardRef ?? ''}</span>
      </div>
      <button type="button" autoFocus onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>Stäng</button>
    </div>
  )
}

// ==============================================================================================

type VariantProps = { route: string; table: ProtoTable; say: Say }

export function KeyboardPrototype() {
  const q = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(q.get('variant') ?? 'A')
  const [route, setRoute] = useState(q.get('route') ?? 'play')
  const table = useProtoTable()
  const say = useSay()
  const seen = useRef(0)
  // Who this screen is when it acts: the phone and the online window are the seat, the table
  // screen is the table itself. A line this screen made was already said by `mine`; everything
  // else is somebody else's and goes through the queue.
  const actor: string | null = route === 'table' ? null : ME
  useEffect(() => {
    const lines = table.lines()
    if (seen.current === 0) {
      seen.current = lines.length
      return
    }
    for (const line of lines.slice(seen.current)) {
      if (line.by === actor) continue
      say.theirs(describeActivity(projectActivity(line), table.view(actor)))
    }
    seen.current = lines.length
  }, [table.seq])

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(location.search)
    p.set(k, v)
    history.replaceState(null, '', `?${p}`)
  }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const bare = q.has('bare')
  return (
    <div className="kb-stage" data-variant={variant} data-route={route} data-bare={bare ? 'true' : undefined}>
      <V key={`${variant}-${route}`} route={route} table={table} say={say} />
      <Live say={say} />
      {!bare && (
        <div className="kb-routebar">
          {ROUTES.map((r) => (
            <button key={r.key} type="button" aria-pressed={route === r.key} onClick={() => { setRoute(r.key); set('route', r.key) }}>{r.name}</button>
          ))}
          <button type="button" onClick={() => { table.act('N', otherMove(table.view('N'))); }}>Ada drar</button>
          <button type="button" onClick={table.reset}>Börja om</button>
        </div>
      )}
      <Switcher variants={VARIANTS} current={variant} onChange={(k) => { setVariant(k); set('variant', k) }} />
    </div>
  )
}

// Something someone else does, so the announcement rule can be seen working.
function otherMove(view: Snapshot): Intent[] {
  const draw = view.zones.find((z) => z.id === 'draw')
  if (!draw || countOf(draw) === 0) return []
  return [{ v: 'split', pile: 'draw', at: 1, to: 'hand:N' }]
}
