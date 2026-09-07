import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react'
import { Texture, textureUrl } from './Texture.js'
import type { Intent, Presence, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'
import type { Peer, Pulse, Recent } from './presence.js'
import { hue } from './hue.js'
import { seatColor } from './seatColor.js'
import { fitScale } from './fit.js'
import { activeBounds, cameraOf, fitFloor, frameRect, pad, same, tween, zoomAround, type Rect, type Size } from './camera.js'
import { flatToTable, tiltedToTable, unrotate, type Point, type Rotation } from './geometry.js'
import { CARD_MM, absoluteOf, dropIntents, type Drag, type DragTarget } from './drop.js'
import { RadialMenu, type RadialItem } from './RadialMenu.js'

export type TableMode = 'table' | 'tv'
// Without an explicit `scale`, the renderer fits the table to its own frame.
// `faces` is the HTTP origin that serves /faces/:hash; without it cards are plain colours.
// With `onAct` the table can be played on (K1, K2, C): drag cards, the top of a pile, or a whole
// pile by its label; hold for a ring of verbs. Without it the table only shows.
// Presence (K6): `peers` are the others' cursors and carried cards, `pulses` where someone points,
// `recent` which cards just moved and by whom; `onPresence` reports this screen's own.
// `rotate` turns the table so a seat's edge is at the bottom (C5). The ref answers where a client
// point is on the table, for things dragged in from outside (a hand beside the table).
// `camera` (C5, TV mode): the frame shows what is in play rather than the whole table, gliding as
// that changes; a scroll or a double tap zooms around the pointer and the view returns by itself.
// `size` is the frame's size when the renderer should not measure it; `glideMs` the glide.
export type TableHandle = { toTable(clientX: number, clientY: number): Point | null }
export type TableRendererProps = {
  view: Snapshot
  mode: TableMode
  scale?: number
  rotate?: Rotation | undefined
  faces?: string | undefined
  onAct?: ((intents: Intent[]) => void) | undefined
  peers?: readonly Peer[] | undefined
  pulses?: readonly Pulse[] | undefined
  recent?: readonly Recent[] | undefined
  onPresence?: ((p: Presence) => void) | undefined
  camera?: boolean | undefined
  size?: Size | undefined
  glideMs?: number | undefined
}

const FAN_MAX = 12
const HOLD_MS = 350
const POINT_MS = 450
const DRAG_MM = 4
const TABLE_GREY = '#8a93a8'
// The camera: room around what is in play, how close it may come, and how long a zoom holds.
const CAMERA_PAD_MM = 60
const CAMERA_MIN_MM = 520
const CAMERA_RETURN_MS = 6000
const GLIDE_MS = 700

type Live = Drag & { started: boolean }
type Ring = { target: DragTarget; x: number; y: number }

export const TableRenderer = forwardRef<TableHandle, TableRendererProps>(function TableRenderer({ view, mode, scale: fixedScale, rotate = 0, faces, onAct, peers = [], pulses = [], recent = [], onPresence, camera = false, size: fixedSize, glideMs = GLIDE_MS }, ref) {
  const floor = view.zones.find((z) => z.id === view.floor)
  if (!floor) throw new Error(`floor ${view.floor} is not among the zones`)
  const frame = useRef<HTMLDivElement | null>(null)
  const wood = useRef<HTMLDivElement | null>(null)
  const table = useRef<HTMLDivElement | null>(null)
  // Nothing is painted until the frame has been measured: a first paint at 1:1 would flash.
  const [measuredSize, setMeasuredSize] = useState<Size | null>(null)
  const margin = mode === 'table' ? 80 : 44
  useEffect(() => {
    const el = frame.current
    if (fixedScale !== undefined || fixedSize !== undefined || !el) return
    if (typeof ResizeObserver === 'undefined') {
      setMeasuredSize({ w: 0, h: 0 })
      return
    }
    const update = () => setMeasuredSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fixedScale, fixedSize])
  const size = fixedSize ?? measuredSize
  const floorRect: Rect = { x: floor.geometry.x, y: floor.geometry.y, w: floor.geometry.w, h: floor.geometry.h }
  const fitted = size === null ? null : size.w > 0 && size.h > 0 ? fitScale({ w: floorRect.w, h: floorRect.h }, size, margin) : 1

  // Inspection (K8): "Titta" in the ring, private to this screen, until tapped away.
  const [held, setHeld] = useState<VisibleComponentState | null>(null)
  const [drag, setDrag] = useState<Live | null>(null)
  const [ring, setRing] = useState<Ring | null>(null)

  // The camera (C5): what is in play, or where someone zoomed for a moment. It holds still while
  // something is dragged, since the pointer's mapping was fixed when the drag began.
  const following = camera && mode === 'tv' && size !== null && size.w > 0 && size.h > 0
  const [manual, setManual] = useState<Rect | null>(null)
  const manualTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const zoomTo = (rect: Rect | null) => {
    if (manualTimer.current) clearTimeout(manualTimer.current)
    manualTimer.current = rect ? setTimeout(() => setManual(null), CAMERA_RETURN_MS) : null
    setManual(rect)
  }
  useEffect(() => () => {
    if (manualTimer.current) clearTimeout(manualTimer.current)
  }, [])
  const auto = following ? frameRect(pad(activeBounds(view) ?? floorRect, CAMERA_PAD_MM), size, floorRect, CAMERA_MIN_MM) : null
  const heldCamera = useRef<Rect | null>(null)
  if (!drag) heldCamera.current = manual ?? auto
  const cam = useGlide(following ? heldCamera.current : null, glideMs)
  const placed = following && cam ? cameraOf(cam, size, floorRect) : null
  const scale = fixedScale ?? placed?.scale ?? fitted ?? 1
  const measured = fixedScale !== undefined || (size !== null && (!following || placed !== null))
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
  const colourOf = (seat: string | null) => (seat === null ? TABLE_GREY : seatColor(seatIndex(seat)))
  const carried = new Map(peers.filter((p) => p.drag).map((p) => [p.drag?.component ?? '', p]))
  const movedBy = new Map(recent.map((r) => [r.component, r.seat]))

  // Pointer → table millimetres, fixed when a drag begins (the layout does not change under it).
  const mapper = (): ((cx: number, cy: number) => Point) | null => {
    const f = frame.current
    const w = wood.current
    const t = table.current
    if (!f || !w || !t) return null
    const turned = (p: Point) => unrotate(p, floor.geometry, rotate)
    if (mode === 'tv') {
      const flat = flatToTable(t.getBoundingClientRect(), scale, floor.geometry)
      return (cx, cy) => turned(flat(cx, cy))
    }
    const fr = f.getBoundingClientRect()
    const layout = { frame: { w: fr.width, h: fr.height }, wood: { left: w.offsetLeft, top: w.offsetTop, w: w.offsetWidth, h: w.offsetHeight } }
    return (cx, cy) => {
      const u = tiltedToTable(layout, cx - fr.left, cy - fr.top)
      return turned({ x: (u.x + w.offsetWidth / 2 - t.offsetLeft) / scale + floor.geometry.x, y: (u.y + w.offsetHeight / 2 - t.offsetTop) / scale + floor.geometry.y })
    }
  }
  useImperativeHandle(ref, () => ({ toTable: (cx, cy) => mapper()?.(cx, cy) ?? null }))

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
    if (started && d.target.kind === 'card' && onPresence) {
      const o = d.origin[d.target.id] ?? d.grab
      onPresence({ kind: 'drag', component: d.target.id, x: o.x + at.x - d.grab.x, y: o.y + at.y - d.grab.y })
    }
  }
  const up = () => {
    const d = live.current
    clearHold()
    live.current = null
    setDrag(null)
    if (d?.started && d.target.kind === 'card') onPresence?.({ kind: 'drop' })
    if (!d || !d.started || !onAct) return
    const intents = dropIntents(view, d)
    if (intents.length > 0) onAct(intents)
  }
  const handlers = (target: DragTarget) => ({ onPointerDown: (e: RPointerEvent) => down(e, target), onPointerMove: move, onPointerUp: up, onPointerCancel: up })

  // A zoom for a moment (C5): scroll or pinch around the pointer, double tap to go close and
  // again to come back. The camera returns by itself.
  const wheel = (e: RWheelEvent) => {
    const map = mapper()
    if (!following || !cam || !map) return
    zoomTo(zoomAround(manual ?? cam, map(e.clientX, e.clientY), Math.exp(e.deltaY * 0.002), size, floorRect, CAMERA_MIN_MM))
  }
  const doubleTap = (e: RMouseEvent) => {
    const map = mapper()
    if (!following || !map) return
    zoomTo(manual ? null : zoomAround(fitFloor(floorRect, size), map(e.clientX, e.clientY), 1 / 2.6, size, floorRect, CAMERA_MIN_MM))
  }

  // The felt itself: where this pointer is, and a hold that points (K6).
  const pointTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearPoint = () => {
    if (pointTimer.current) clearTimeout(pointTimer.current)
    pointTimer.current = null
  }
  useEffect(() => clearPoint, [])
  const feltMove = (e: RPointerEvent) => {
    if (live.current) return
    clearPoint()
    const map = mapper()
    if (!map || !onPresence) return
    onPresence({ kind: 'cursor', ...map(e.clientX, e.clientY) })
  }
  const feltDown = (e: RPointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('byd-zone')) return
    const map = mapper()
    if (!map || !onPresence) return
    const at = map(e.clientX, e.clientY)
    clearPoint()
    pointTimer.current = setTimeout(() => {
      pointTimer.current = null
      onPresence({ kind: 'point', ...at })
    }, POINT_MS)
  }
  const feltLeave = () => {
    clearPoint()
    onPresence?.({ kind: 'away' })
  }

  const areas = view.zones.filter((z) => z.kind === 'area' && z.id !== floor.id)
  const piles = view.zones.filter((z) => z.kind === 'pile')
  const hands = view.zones.filter((z) => z.kind === 'hand')
  const loose = view.components.filter((c) => zoneById.get(c.zone)?.kind === 'area')
  const dx = drag?.started ? drag.at.x - drag.grab.x : 0
  const dy = drag?.started ? drag.at.y - drag.grab.y : 0
  const moving = new Set(drag?.started ? drag.ids : [])
  const liftedPile = drag?.started && drag.target.kind !== 'card' ? drag.target.pile : null
  const liftedKind = drag?.started && drag.target.kind !== 'card' ? drag.target.kind : null
  const topOf = (z: ZoneView, skip = 0) => byId.get(topIdOf(z, skip) ?? '')

  const felt = (
      <div className="byd-table-wood" ref={wood}>
        <div
          data-table
          data-rotate={rotate}
          ref={table}
          style={{ position: 'relative', width: px(floor.geometry.w), height: px(floor.geometry.h), transform: rotate ? `rotate(${rotate}deg)` : undefined, ['--unrotate' as string]: `${-rotate}deg` }}
          onPointerMove={feltMove}
          onPointerDown={feltDown}
          onPointerUp={clearPoint}
          onPointerLeave={feltLeave}
        >
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
            <Hand
              key={z.id}
              zone={z}
              name={seatName(z.owner)}
              color={seatColor(seatIndex(z.owner))}
              rot={mode === 'table' ? edgeRotation(z, floor) : 0}
              left={left(z.geometry.x + z.geometry.w / 2)}
              top={top(z.geometry.y + z.geometry.h / 2)}
              cards={z.mode === 'order' ? z.order.flatMap((id) => byId.get(id) ?? []) : undefined}
              faces={faces}
            />
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
                carried={carried.has(c.id)}
                by={movedBy.has(c.id) ? { seat: movedBy.get(c.id) ?? null, colour: colourOf(movedBy.get(c.id) ?? null) } : undefined}
                src={textureUrl(faces, c)}
                handlers={onAct ? handlers({ kind: 'card', id: c.id }) : undefined}
              />
            )
          })}
          {peers.map((p) => {
            if (!p.drag) return null
            const c = byId.get(p.drag.component)
            return (
              <div
                key={`ghost-${p.id}`}
                className="byd-card byd-peer-ghost"
                data-ghost-of={p.id}
                data-component={p.drag.component}
                data-face={c?.cardRef ? 'front' : 'back'}
                style={{ position: 'absolute', left: left(p.drag.x), top: top(p.drag.y), width: px(CARD_MM.w), height: px(CARD_MM.h), transform: `rotate(${c?.rot ?? 0}deg)`, ['--peer' as string]: colourOf(p.seat), ...(c?.cardRef ? { ['--hue' as string]: hue(c.cardRef) } : {}) }}
              >
                {c && textureUrl(faces, c) && <Texture src={textureUrl(faces, c) ?? ''} label={c.cardRef ?? undefined} />}
                <span>{c?.cardRef ?? ''}</span>
                <b className="byd-peer-tag">{p.name}</b>
              </div>
            )
          })}
          {peers.map((p) =>
            p.cursor ? (
              <div key={`cursor-${p.id}`} className="byd-peer-cursor" data-cursor={p.id} style={{ left: left(p.cursor.x), top: top(p.cursor.y), ['--peer' as string]: colourOf(p.seat) }}>
                <span>{p.name}</span>
              </div>
            ) : null,
          )}
          {pulses.map((p) => (
            <div key={`pulse-${p.id}-${p.at}`} className="byd-peer-pulse" data-pulse={p.id} style={{ left: left(p.x), top: top(p.y), ['--peer' as string]: colourOf(p.seat) }}>
              <i />
              <i />
              <i />
              <span>{p.name}</span>
            </div>
          ))}
          {drag?.started && drag.target.kind === 'pileTop' && (
            <Ghost card={topOf(zoneById.get(drag.target.pile) ?? floor)} faces={faces} left={left(drag.at.x) - px(CARD_MM.w / 2)} top={top(drag.at.y) - px(CARD_MM.h / 2)} px={px} />
          )}
        </div>
      </div>
  )
  return (
    <div
      className="byd-table-frame"
      data-mode={mode}
      data-camera={placed ? 'follow' : undefined}
      data-playable={onAct ? 'true' : undefined}
      ref={frame}
      style={measured ? undefined : { visibility: 'hidden' }}
      onWheel={following ? wheel : undefined}
      onDoubleClick={following ? doubleTap : undefined}
    >
      {placed ? (
        <div className="byd-camera-world" style={{ left: placed.left, top: placed.top, width: px(floorRect.w), height: px(floorRect.h) }}>
          {felt}
        </div>
      ) : (
        felt
      )}
      {ring && onAct && <RadialMenu id={ring.target.kind === 'card' ? ring.target.id : ring.target.pile} x={ring.x} y={ring.y} items={ringItems(view, ring.target, onAct, setHeld)} onClose={() => setRing(null)} />}
      {held && (
        <div className="byd-inspect" onClick={() => setHeld(null)}>
          <div data-inspect={held.id} data-face={held.cardRef === null ? 'back' : 'front'} style={held.cardRef === null ? undefined : { ['--hue' as string]: hue(held.cardRef) }}>
            {textureUrl(faces, held) ? <Texture src={textureUrl(faces, held) ?? ''} label={held.cardRef ?? undefined} /> : null}
            <span>{held.cardRef ?? ''}</span>
          </div>
        </div>
      )}
    </div>
  )
})

// The camera glides to its target so the eye can follow; the first frame, and a glide of zero,
// cut straight there.
function useGlide(target: Rect | null, ms: number): Rect | null {
  const [cur, setCur] = useState<Rect | null>(target)
  const curRef = useRef<Rect | null>(target)
  const raf = useRef(0)
  const key = target ? `${target.x},${target.y},${target.w},${target.h}` : ''
  useEffect(() => {
    if (!target) return
    const from = curRef.current
    if (ms <= 0 || !from || same(from, target) || typeof requestAnimationFrame === 'undefined') {
      curRef.current = target
      setCur(target)
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms)
      const next = tween(from, target, 1 - Math.pow(1 - k, 3))
      curRef.current = next
      setCur(next)
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
    // The target is keyed by value: a fresh object with the same rectangle is no new target.
  }, [key, ms])
  return cur
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
  const top = view.components.find((c) => c.id === topIdOf(z))
  const beside = { x: z.geometry.x + CARD_MM.w + 12, y: z.geometry.y }
  // The top is flipped by naming the pile (K15): a hidden pile gives no id, and an unseen top
  // is by definition not face-up.
  const flipTop = (): Intent[] => [{ v: 'flip', component: { top: z.id }, face: top?.face === 'front' ? 'back' : 'front' }]
  return [
    { label: 'Blanda', run: count > 1 ? () => act([{ v: 'shuffle', pile: z.id }]) : null },
    { label: 'Dra 1', run: count > 0 ? () => act([{ v: 'split', pile: z.id, at: 1, ...beside }]) : null },
    { label: 'Dela på hälften', run: count > 1 ? () => act([{ v: 'split', pile: z.id, at: Math.ceil(count / 2), ...beside }]) : null },
    { label: 'Vänd översta', run: count > 0 ? () => act(flipTop()) : null },
    look(top),
    close,
  ]
}

type Handlers = { onPointerDown(e: RPointerEvent): void; onPointerMove(e: RPointerEvent): void; onPointerUp(e: RPointerEvent): void; onPointerCancel(e: RPointerEvent): void }

function Card({ c, left, top, px, dragging, carried, by, src, handlers }: { c: VisibleComponentState; left: number; top: number; px: (mm: number) => number; dragging: boolean; carried?: boolean; by?: { seat: string | null; colour: string } | undefined; src?: string | undefined; handlers?: Handlers | undefined }) {
  const face = c.cardRef === null ? 'back' : 'front'
  return (
    <div
      className="byd-card"
      data-component={c.id}
      data-face={face}
      data-dragging={dragging ? 'true' : undefined}
      data-carried={carried ? 'true' : undefined}
      data-by={by ? by.seat ?? 'table' : undefined}
      {...handlers}
      style={{
        position: 'absolute',
        left,
        top,
        width: px(CARD_MM.w),
        height: px(CARD_MM.h),
        transform: `rotate(${c.rot}deg)`,
        ...(c.cardRef === null ? {} : { ['--hue' as string]: hue(c.cardRef) }),
        ...(by ? { ['--peer' as string]: by.colour } : {}),
      }}
    >
      {src && <Texture src={src} label={c.cardRef ?? undefined} />}
      <span>{c.cardRef ?? ''}</span>
    </div>
  )
}

// The top card of a pile while it is being dragged off.
function Ghost({ card, faces, left, top, px }: { card: VisibleComponentState | undefined; faces: string | undefined; left: number; top: number; px: (mm: number) => number }) {
  const src = card ? textureUrl(faces, card) : undefined
  return (
    <div className="byd-card" data-ghost data-dragging="true" data-face={card?.cardRef ? 'front' : 'back'} style={{ position: 'absolute', left, top, width: px(CARD_MM.w), height: px(CARD_MM.h), pointerEvents: 'none', ...(card?.cardRef ? { ['--hue' as string]: hue(card.cardRef) } : {}) }}>
      {src && <Texture src={src} label={card?.cardRef ?? undefined} />}
      <span>{card?.cardRef ?? ''}</span>
    </div>
  )
}

// The id of the card `skip` below the top of a pile, as far as this view knows: every card of a
// public pile, only a face-up top of a hidden one (K15).
function topIdOf(z: ZoneView, skip = 0): string | undefined {
  if (z.mode === 'order') return z.order[skip]
  return skip === 0 ? z.top : undefined
}

// A pile is a point; the stack is centred on it. A hidden pile has a count and nothing else,
// unless its top lies face-up.
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
        {src && <Texture src={src} label={topCard?.cardRef ?? undefined} />}
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

// Other seats' hands are a fan of backs and a count; the owner reads theirs on the phone. A hand
// whose order this view may see (the observer, C8) fans the cards themselves.
function Hand({ zone, name, color, rot, left, top, cards, faces }: { zone: ZoneView; name: string; color: string; rot: number; left: number; top: number; cards?: VisibleComponentState[] | undefined; faces?: string | undefined }) {
  const count = zone.mode === 'count' ? zone.count : zone.order.length
  const fan = Math.min(count, FAN_MAX)
  return (
    <div className="byd-hand" data-zone={zone.id} data-count={count} data-rot={rot} style={{ left, top, transform: `rotate(${rot}deg)`, ['--seat' as string]: color, ['--hand-unrot' as string]: `${-rot}deg` }}>
      <div className="byd-hand-fan">
        {cards
          ? cards.slice(0, FAN_MAX).map((c, i) => (
              <i
                key={c.id}
                className="byd-hand-card"
                data-component={c.id}
                data-face={c.cardRef === null ? 'back' : 'front'}
                style={{ transform: `translateX(${(i - (Math.min(cards.length, FAN_MAX) - 1) / 2) * 26}px) rotate(${(i - (Math.min(cards.length, FAN_MAX) - 1) / 2) * 7}deg)`, ...(c.cardRef === null ? {} : { ['--hue' as string]: hue(c.cardRef) }) }}
              >
                {textureUrl(faces, c) && <Texture src={textureUrl(faces, c) ?? ''} label={c.cardRef ?? undefined} />}
                <span>{c.cardRef ?? ''}</span>
              </i>
            ))
          : Array.from({ length: fan }, (_, i) => <i key={i} className="byd-back" style={{ transform: `rotate(${(i - (fan - 1) / 2) * 9}deg)` }} />)}
      </div>
      <div className="byd-hand-name">
        <span>{name}</span>
        <b>{count}</b>
      </div>
    </div>
  )
}
