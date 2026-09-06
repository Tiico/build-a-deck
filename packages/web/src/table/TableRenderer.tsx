import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Texture, textureUrl } from './Texture.js'
import type { Intent, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'
import { hue } from './hue.js'
import { seatColor } from './seatColor.js'
import { fitScale } from './fit.js'
import { flatToTable, tiltedToTable, type Point } from './geometry.js'
import { CARD_MM, absoluteOf, dropIntents, type Drag, type DragTarget } from './drop.js'
import { RadialMenu, type RadialItem } from './RadialMenu.js'

export type TableMode = 'table' | 'tv'
// Without an explicit `scale`, the renderer fits the table to its own frame.
// `faces` is the HTTP origin that serves /faces/:hash; without it cards are plain colours.
// With `onAct` the table can be played on (K1, K2, C): drag cards, the top of a pile, or a whole
// pile by its label; hold for a ring of verbs. Without it the table only shows.
export type TableRendererProps = { view: Snapshot; mode: TableMode; scale?: number; faces?: string | undefined; onAct?: ((intents: Intent[]) => void) | undefined }

const FAN_MAX = 12
const HOLD_MS = 350
const DRAG_MM = 4

type Live = Drag & { started: boolean }
type Ring = { target: DragTarget; x: number; y: number }

export function TableRenderer({ view, mode, scale: fixedScale, faces, onAct }: TableRendererProps) {
  const floor = view.zones.find((z) => z.id === view.floor)
  if (!floor) throw new Error(`floor ${view.floor} is not among the zones`)
  const frame = useRef<HTMLDivElement | null>(null)
  const wood = useRef<HTMLDivElement | null>(null)
  const table = useRef<HTMLDivElement | null>(null)
  const [fitted, setFitted] = useState(1)
  const margin = mode === 'table' ? 80 : 44
  useEffect(() => {
    const el = frame.current
    if (fixedScale !== undefined || !el || typeof ResizeObserver === 'undefined') return
    const update = () => setFitted(fitScale({ w: floor.geometry.w, h: floor.geometry.h }, { w: el.clientWidth, h: el.clientHeight }, margin))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fixedScale, floor.geometry.w, floor.geometry.h, margin])
  const scale = fixedScale ?? fitted

  // Inspection (K8): "Titta" in the ring, private to this screen, until tapped away.
  const [held, setHeld] = useState<VisibleComponentState | null>(null)
  const [drag, setDrag] = useState<Live | null>(null)
  const [ring, setRing] = useState<Ring | null>(null)
  const live = useRef<Live | null>(null)
  const toTable = useRef<((cx: number, cy: number) => Point) | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
  }
  useEffect(() => clearHold, [])

  const zoneById = new Map(view.zones.map((z) => [z.id, z]))
  const byId = new Map(view.components.map((c) => [c.id, c]))
  const px = (mm: number) => mm * scale
  const left = (mmX: number) => px(mmX - floor.geometry.x)
  const top = (mmY: number) => px(mmY - floor.geometry.y)
  const seatIndex = (id: string | undefined) => Math.max(0, view.seats.findIndex((s) => s.id === id))
  const seatName = (id: string | undefined) => view.seats.find((s) => s.id === id)?.name ?? id ?? ''

  // Pointer → table millimetres, fixed when a drag begins (the layout does not change under it).
  const mapper = (): ((cx: number, cy: number) => Point) | null => {
    const f = frame.current
    const w = wood.current
    const t = table.current
    if (!f || !w || !t) return null
    if (mode === 'tv') return flatToTable(t.getBoundingClientRect(), scale, floor.geometry)
    const fr = f.getBoundingClientRect()
    const layout = { frame: { w: fr.width, h: fr.height }, wood: { left: w.offsetLeft, top: w.offsetTop, w: w.offsetWidth, h: w.offsetHeight } }
    return (cx, cy) => {
      const u = tiltedToTable(layout, cx - fr.left, cy - fr.top)
      return { x: (u.x + w.offsetWidth / 2 - t.offsetLeft) / scale + floor.geometry.x, y: (u.y + w.offsetHeight / 2 - t.offsetTop) / scale + floor.geometry.y }
    }
  }

  const down = (e: RPointerEvent, target: DragTarget) => {
    if (!onAct) return
    e.stopPropagation()
    const map = mapper()
    if (!map) return
    toTable.current = map
    const at = map(e.clientX, e.clientY)
    const ids = target.kind === 'card' ? [target.id] : []
    const origin: Drag['origin'] = {}
    for (const id of ids) {
      const c = byId.get(id)
      if (c) origin[id] = absoluteOf(view, c)
    }
    const d: Live = { target, ids, origin, grab: at, at, started: false }
    live.current = d
    setDrag(d)
    const el = e.currentTarget as HTMLElement
    if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId)
    clearHold()
    if (target.kind === 'pile') return
    const { clientX, clientY, pointerId } = e
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null
      if (!live.current || live.current.started) return
      live.current = null
      setDrag(null)
      if (typeof el.releasePointerCapture === 'function' && typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
      setRing({ target, x: clientX, y: clientY })
    }, HOLD_MS)
  }
  const move = (e: RPointerEvent) => {
    const d = live.current
    const map = toTable.current
    if (!d || !map) return
    const at = map(e.clientX, e.clientY)
    const started = d.started || Math.hypot(at.x - d.grab.x, at.y - d.grab.y) > DRAG_MM
    if (started) clearHold()
    const next = { ...d, at, started }
    live.current = next
    setDrag(next)
  }
  const up = () => {
    const d = live.current
    clearHold()
    live.current = null
    setDrag(null)
    if (!d || !d.started || !onAct) return
    const intents = dropIntents(view, d)
    if (intents.length > 0) onAct(intents)
  }
  const handlers = (target: DragTarget) => ({ onPointerDown: (e: RPointerEvent) => down(e, target), onPointerMove: move, onPointerUp: up, onPointerCancel: up })

  const areas = view.zones.filter((z) => z.kind === 'area' && z.id !== floor.id)
  const piles = view.zones.filter((z) => z.kind === 'pile')
  const hands = view.zones.filter((z) => z.kind === 'hand')
  const loose = view.components.filter((c) => zoneById.get(c.zone)?.kind === 'area')
  const dx = drag?.started ? drag.at.x - drag.grab.x : 0
  const dy = drag?.started ? drag.at.y - drag.grab.y : 0
  const moving = new Set(drag?.started ? drag.ids : [])
  const liftedPile = drag?.started && drag.target.kind !== 'card' ? drag.target.pile : null
  const liftedKind = drag?.started && drag.target.kind !== 'card' ? drag.target.kind : null
  const topOf = (z: ZoneView, skip = 0) => (z.mode === 'order' ? byId.get(z.order[skip] ?? '') : undefined)

  return (
    <div className="byd-table-frame" data-mode={mode} data-playable={onAct ? 'true' : undefined} ref={frame}>
      <div className="byd-table-wood" ref={wood}>
        <div data-table ref={table} style={{ position: 'relative', width: px(floor.geometry.w), height: px(floor.geometry.h) }}>
          {areas.map((z) => (
            <div key={z.id} className="byd-zone" data-area={z.id} style={{ left: left(z.geometry.x), top: top(z.geometry.y), width: px(z.geometry.w), height: px(z.geometry.h) }}>
              <span>{z.name}</span>
            </div>
          ))}
          {piles.map((z) => {
            const whole = liftedPile === z.id && liftedKind === 'pile'
            const lifting = liftedPile === z.id && liftedKind === 'pileTop'
            const count = z.mode === 'count' ? z.count : z.order.length
            return (
              <Pile
                key={z.id}
                zone={z}
                count={lifting ? count - 1 : count}
                topCard={lifting ? topOf(z, 1) : topOf(z)}
                faces={faces}
                left={left(z.geometry.x + (whole ? dx : 0))}
                top={top(z.geometry.y + (whole ? dy : 0))}
                px={px}
                lifted={whole}
                topHandlers={onAct && count > 0 ? handlers({ kind: 'pileTop', pile: z.id }) : undefined}
                labelHandlers={onAct ? handlers({ kind: 'pile', pile: z.id }) : undefined}
              />
            )
          })}
          {hands.map((z) => (
            <Hand key={z.id} zone={z} name={seatName(z.owner)} color={seatColor(seatIndex(z.owner))} rot={mode === 'table' ? edgeRotation(z, floor) : 0} left={left(z.geometry.x + z.geometry.w / 2)} top={top(z.geometry.y + z.geometry.h / 2)} />
          ))}
          {loose.map((c) => {
            const a = absoluteOf(view, c)
            const m = moving.has(c.id)
            return (
              <Card
                key={c.id}
                c={c}
                left={left(a.x + (m ? dx : 0))}
                top={top(a.y + (m ? dy : 0))}
                px={px}
                dragging={m}
                src={textureUrl(faces, c)}
                handlers={onAct ? handlers({ kind: 'card', id: c.id }) : undefined}
              />
            )
          })}
          {drag?.started && drag.target.kind === 'pileTop' && (
            <Ghost card={topOf(zoneById.get(drag.target.pile) ?? floor)} faces={faces} left={left(drag.at.x) - px(CARD_MM.w / 2)} top={top(drag.at.y) - px(CARD_MM.h / 2)} px={px} />
          )}
        </div>
      </div>
      {ring && onAct && <RadialMenu id={ring.target.kind === 'card' ? ring.target.id : ring.target.pile} x={ring.x} y={ring.y} items={ringItems(view, ring.target, onAct, setHeld)} onClose={() => setRing(null)} />}
      {held && (
        <div className="byd-inspect" onClick={() => setHeld(null)}>
          <div data-inspect={held.id} data-face={held.cardRef === null ? 'back' : 'front'} style={held.cardRef === null ? undefined : { ['--hue' as string]: hue(held.cardRef) }}>
            {textureUrl(faces, held) ? <Texture src={textureUrl(faces, held) ?? ''} /> : null}
            <span>{held.cardRef ?? ''}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// The verbs a drag cannot say (C): for a card, for a pile.
function ringItems(view: Snapshot, target: DragTarget, act: (intents: Intent[]) => void, inspect: (c: VisibleComponentState) => void): RadialItem[] {
  const flip = (c: VisibleComponentState): RadialItem => ({ label: 'Vänd', run: () => act([{ v: 'flip', component: c.id, face: c.face === 'front' ? 'back' : 'front' }]) })
  const look = (c: VisibleComponentState | undefined): RadialItem => ({ label: 'Titta', run: c ? () => inspect(c) : null })
  const close: RadialItem = { label: 'Stäng', run: null, kind: 'no' }
  if (target.kind === 'card') {
    const c = view.components.find((x) => x.id === target.id)
    if (!c) return [close]
    return [
      flip(c),
      { label: 'Vrid', run: () => act([{ v: 'rotate', component: c.id, rot: (c.rot + 90) % 360 }]) },
      look(c),
      { label: 'Avslöja', run: c.cardRef === null ? () => act([{ v: 'reveal', components: [c.id] }]) : null },
      close,
    ]
  }
  const z = view.zones.find((x) => x.id === target.pile)
  if (!z) return [close]
  const count = z.mode === 'count' ? z.count : z.order.length
  const top = z.mode === 'order' ? view.components.find((c) => c.id === z.order[0]) : undefined
  const beside = { x: z.geometry.x + CARD_MM.w + 12, y: z.geometry.y }
  return [
    { label: 'Blanda', run: count > 1 ? () => act([{ v: 'shuffle', pile: z.id }]) : null },
    { label: 'Dra 1', run: count > 0 ? () => act([{ v: 'split', pile: z.id, at: 1, ...beside }]) : null },
    { label: 'Dela på hälften', run: count > 1 ? () => act([{ v: 'split', pile: z.id, at: Math.ceil(count / 2), ...beside }]) : null },
    top ? { label: 'Vänd översta', run: () => act([{ v: 'flip', component: top.id, face: top.face === 'front' ? 'back' : 'front' }]) } : { label: 'Vänd översta', run: null },
    look(top),
    close,
  ]
}

type Handlers = { onPointerDown(e: RPointerEvent): void; onPointerMove(e: RPointerEvent): void; onPointerUp(e: RPointerEvent): void; onPointerCancel(e: RPointerEvent): void }

function Card({ c, left, top, px, dragging, src, handlers }: { c: VisibleComponentState; left: number; top: number; px: (mm: number) => number; dragging: boolean; src?: string | undefined; handlers?: Handlers | undefined }) {
  const face = c.cardRef === null ? 'back' : 'front'
  return (
    <div
      className="byd-card"
      data-component={c.id}
      data-face={face}
      data-dragging={dragging ? 'true' : undefined}
      {...handlers}
      style={{
        position: 'absolute',
        left,
        top,
        width: px(CARD_MM.w),
        height: px(CARD_MM.h),
        transform: `rotate(${c.rot}deg)`,
        ...(c.cardRef === null ? {} : { ['--hue' as string]: hue(c.cardRef) }),
      }}
    >
      {src && <Texture src={src} />}
      <span>{c.cardRef ?? ''}</span>
    </div>
  )
}

// The top card of a pile while it is being dragged off.
function Ghost({ card, faces, left, top, px }: { card: VisibleComponentState | undefined; faces: string | undefined; left: number; top: number; px: (mm: number) => number }) {
  const src = card ? textureUrl(faces, card) : undefined
  return (
    <div className="byd-card" data-ghost data-dragging="true" data-face={card?.cardRef ? 'front' : 'back'} style={{ position: 'absolute', left, top, width: px(CARD_MM.w), height: px(CARD_MM.h), pointerEvents: 'none', ...(card?.cardRef ? { ['--hue' as string]: hue(card.cardRef) } : {}) }}>
      {src && <Texture src={src} />}
      <span>{card?.cardRef ?? ''}</span>
    </div>
  )
}

// A pile is a point; the stack is centred on it. A hidden pile has a count and nothing else.
function Pile({ zone, count, topCard, faces, left, top, px, lifted, topHandlers, labelHandlers }: { zone: ZoneView; count: number; topCard: VisibleComponentState | undefined; faces: string | undefined; left: number; top: number; px: (mm: number) => number; lifted: boolean; topHandlers?: Handlers | undefined; labelHandlers?: Handlers | undefined }) {
  const src = topCard ? textureUrl(faces, topCard) : undefined
  const layers = Math.min(Math.max(count, 0), 12)
  const thickness = Array.from({ length: layers }, (_, i) => `0 ${-i * 1.2}px 0 #1f2b4a`).join(', ')
  return (
    <div
      className="byd-pile"
      data-zone={zone.id}
      data-count={count}
      data-dynamic={zone.dynamic ? 'true' : 'false'}
      data-dragging={lifted ? 'true' : undefined}
      style={{ position: 'absolute', left: left - px(CARD_MM.w / 2), top: top - px(CARD_MM.h / 2), width: px(CARD_MM.w), height: px(CARD_MM.h), transform: `rotate(${zone.geometry.rot}deg)` }}
    >
      <div
        className="byd-pile-top"
        data-face={topCard?.cardRef ? 'front' : 'back'}
        {...topHandlers}
        style={{ boxShadow: thickness, transform: `translateY(${-(layers - 1) * 1.2}px)`, ...(topCard?.cardRef ? { ['--hue' as string]: hue(topCard.cardRef) } : {}) }}
      >
        {src && <Texture src={src} />}
        <span>{count > 0 ? topCard?.cardRef ?? '' : ''}</span>
      </div>
      <span className="byd-pile-count" data-handle={labelHandlers ? 'true' : undefined} {...labelHandlers}>
        {!zone.dynamic && <span>{zone.name} · </span>}
        <span>{count}</span>
      </span>
    </div>
  )
}

// In table mode a hand faces the edge it sits at, like a real player would (C5).
function edgeRotation(hand: ZoneView, floor: ZoneView): number {
  const dx = hand.geometry.x + hand.geometry.w / 2 - (floor.geometry.x + floor.geometry.w / 2)
  const dy = hand.geometry.y + hand.geometry.h / 2 - (floor.geometry.y + floor.geometry.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? -90 : 90
  return dy > 0 ? 0 : 180
}

// Other seats' hands are a fan of backs and a count; the owner reads theirs on the phone.
function Hand({ zone, name, color, rot, left, top }: { zone: ZoneView; name: string; color: string; rot: number; left: number; top: number }) {
  const count = zone.mode === 'count' ? zone.count : zone.order.length
  const fan = Math.min(count, FAN_MAX)
  return (
    <div className="byd-hand" data-zone={zone.id} data-count={count} data-rot={rot} style={{ left, top, transform: `rotate(${rot}deg)`, ['--seat' as string]: color }}>
      <div className="byd-hand-fan">
        {Array.from({ length: fan }, (_, i) => (
          <i key={i} className="byd-back" style={{ transform: `rotate(${(i - (fan - 1) / 2) * 9}deg)` }} />
        ))}
      </div>
      <div className="byd-hand-name">
        <span>{name}</span>
        <b>{count}</b>
      </div>
    </div>
  )
}
