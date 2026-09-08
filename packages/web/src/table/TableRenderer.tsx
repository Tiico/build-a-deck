import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent, type ReactNode, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react'
import { Texture } from './Texture.js'
import type { Intent, Presence, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'
import type { Peer, Pulse, Recent } from './presence.js'
import { hue } from './hue.js'
import { seatColor } from './seatColor.js'
import { fitScale } from './fit.js'
import { activeBounds, cameraOf, fitFloor, frameRect, pad, reachOf, same, tween, zoomAround, type Rect, type Size } from './camera.js'
import { flatToTable, tiltedToTable, unrotate, type Point, type Rotation } from './geometry.js'
import { CARD_MM, absoluteOf, dropIntents, type Drag, type DragTarget } from './drop.js'
import { RadialMenu, type RadialItem } from './RadialMenu.js'
import { FAN_MAX, HAND_CARD_BOX, HAND_COUNT_MM, edgeRotation, fanPlace, feltWithHands, handExtent } from './hand.js'

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
// The keyboard's layer over the felt (#1, #2, variant C). It draws nothing: it puts a role, a
// name, one tab stop and a focus ring on the nodes this renderer already draws, which is what
// keeps K9 — one renderer, one way to draw a card. A table that is only shown passes none of
// this and grows no tab stops: the editor's Bord tab renders thumbnails through this component,
// and a thumbnail nobody can play is not a control.
export type FeltItemProps = {
  tabIndex: number
  ref(el: HTMLElement | null): void
  onKeyDown(event: RKeyboardEvent): void
  onFocus(): void
}
export type FeltKeyboard = {
  // Every node the keyboard may stand on, keyed `card:<id>`, `top:<zone>` or `pile:<zone>`,
  // with the sentence that names it. Nodes this map does not mention stay pictures.
  labels: ReadonlyMap<string, string>
  // Which node the panel currently stands open on, if any.
  open?: string | null | undefined
  itemProps(key: string): FeltItemProps
  onActivate(key: string): void
}
// The felt's own mapping from millimetres to pixels, for whatever is laid over it.
export type FeltFit = { px(mm: number): number; left(mmX: number): number; top(mmY: number): number; scale: number }
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
  // What the pointer is over (C): the TV shows it large beside the table. Null when it leaves.
  onInspect?: ((c: VisibleComponentState | null) => void) | undefined
  size?: Size | undefined
  glideMs?: number | undefined
  // What the editor lays over the felt (B5): zone handles, drawn last with the felt's mapping.
  overlay?: ((fit: FeltFit) => ReactNode) | undefined
  keyboard?: FeltKeyboard | undefined
}

const HOLD_MS = 350
const POINT_MS = 450
const DRAG_MM = 4
const TABLE_GREY = '#8a93a8'
// A counter token (C4) is drawn as a chip, not a card.
const COUNTER_TYPE = 'token.counter'
const TOKEN_MM = 24
// How much room the felt leaves around itself in table mode, as a share of the frame's shorter
// side: prototype B's proportion. 0.16 puts the table at 0.85 of life size on a 1600 × 1000
// screen — the scale B was approved at — and keeps that proportion on any other screen (K9).
const TABLE_MARGIN = 0.16
// TV mode is framed by its own chrome, so the felt only needs a hair of air inside it.
const TV_MARGIN_PX = 44
// The camera: room around what is in play, how close it may come, and how long a zoom holds.
const CAMERA_PAD_MM = 60
const CAMERA_MIN_MM = 520
const CAMERA_RETURN_MS = 6000
const GLIDE_MS = 700

type Live = Drag & { started: boolean }
type Ring = { target: DragTarget; x: number; y: number }

export const TableRenderer = forwardRef<TableHandle, TableRendererProps>(function TableRenderer({ view, mode, scale: fixedScale, rotate = 0, faces, onAct, peers = [], pulses = [], recent = [], onPresence, camera = false, onInspect, size: fixedSize, glideMs = GLIDE_MS, overlay, keyboard }, ref) {
  const floor = view.zones.find((z) => z.id === view.floor)
  if (!floor) throw new Error(`floor ${view.floor} is not among the zones`)
  const frame = useRef<HTMLDivElement | null>(null)
  const wood = useRef<HTMLDivElement | null>(null)
  const table = useRef<HTMLDivElement | null>(null)
  // Nothing is painted until the frame has been measured: a first paint at 1:1 would flash.
  const [measuredSize, setMeasuredSize] = useState<Size | null>(null)
  const margin = marginFor(mode, fixedSize ?? measuredSize)
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
  // A hand is turned toward its own edge in table mode; the fan is drawn by that rotation and
  // measured by it, so both ask the same question of the same rule.
  const hands = view.zones.filter((z) => z.kind === 'hand')
  const handRot = (z: ZoneView) => (mode === 'table' ? edgeRotation(z, floor) : 0)
  // What the fit has to pass into the frame is the felt *with its hands on* (#23): a hand is part
  // of the table, so a table fitted to the floor alone would clip one that reaches past the rim.
  const felted = feltWithHands(floorRect, hands.map((z) => handExtent(z, handRot(z))))
  // A quarter turn (C5) puts the table's width where its height was, so that is the shape the
  // fit has to pass into the frame — otherwise a seat at a side edge gets a table cut off at the
  // top and bottom of its own screen.
  const drawn = rotate % 180 === 0 ? felted : { w: felted.h, h: felted.w }
  const fitted = size === null ? null : size.w > 0 && size.h > 0 ? fitScale(drawn, size, margin) : 1

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
  const inPlay = following ? activeBounds(view) ?? floorRect : null
  // How far the camera may reach: the table, plus anything in play that lies past its rim (#20).
  // The padding around what is in play is room to breathe, not content, so it may be cropped.
  const reach = reachOf(floorRect, inPlay)
  const auto = inPlay && size ? frameRect(pad(inPlay, CAMERA_PAD_MM), size, reach, CAMERA_MIN_MM) : null
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
  // Pointing at a card is not touching it: it only says what the screen should show large.
  const inspects = (c: VisibleComponentState | undefined) =>
    onInspect && c ? { onPointerEnter: () => onInspect(c), onPointerLeave: () => onInspect(null) } : undefined

  // What the keyboard adds to a node this renderer already draws: the role and the name a
  // reader hears, the one tab stop the roving list is holding, and Enter or Space to open the
  // panel. A node the layer does not name keeps nothing.
  const keys = (key: string) => {
    const label = keyboard?.labels.get(key)
    if (!keyboard || label === undefined) return undefined
    const item = keyboard.itemProps(key)
    return {
      role: 'button',
      'aria-label': label,
      'data-kbd': key,
      'data-kbd-state': keyboard.open === key ? 'open' : undefined,
      tabIndex: item.tabIndex,
      ref: item.ref,
      onFocus: item.onFocus,
      onKeyDown: (e: RKeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') {
          item.onKeyDown(e)
          return
        }
        e.preventDefault()
        keyboard.onActivate(key)
      },
    }
  }

  // A zoom for a moment (C5): scroll or pinch around the pointer, double tap to go close and
  // again to come back. The camera returns by itself.
  const wheel = (e: RWheelEvent) => {
    const map = mapper()
    if (!following || !cam || !map) return
    zoomTo(zoomAround(manual ?? cam, map(e.clientX, e.clientY), Math.exp(e.deltaY * 0.002), size, reach, CAMERA_MIN_MM))
  }
  const doubleTap = (e: RMouseEvent) => {
    const map = mapper()
    if (!following || !map) return
    zoomTo(manual ? null : zoomAround(fitFloor(reach, size), map(e.clientX, e.clientY), 1 / 2.6, size, reach, CAMERA_MIN_MM))
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
  const loose = view.components.filter((c) => zoneById.get(c.zone)?.kind === 'area')
  const dx = drag?.started ? drag.at.x - drag.grab.x : 0
  const dy = drag?.started ? drag.at.y - drag.grab.y : 0
  const moving = new Set(drag?.started ? drag.ids : [])
  const liftedPile = drag?.started && drag.target.kind !== 'card' ? drag.target.pile : null
  const liftedKind = drag?.started && drag.target.kind !== 'card' ? drag.target.kind : null
  const topOf = (z: ZoneView, skip = 0) => byId.get(topIdOf(z, skip) ?? '')

  // A quarter-turned table (C5) is as tall as the floor is wide, so the wood it lies on takes
  // that shape too and holds it centred; otherwise the felt hangs over its own frame.
  const turnedWood = rotate % 180 === 0 ? undefined : { width: px(floor.geometry.h), height: px(floor.geometry.w) }
  // The felt's own box keeps the floor's shape whatever the turn, so it is nudged by half the
  // difference to sit centred on the wood that now has the other shape.
  const turnedFelt = rotate % 180 === 0 ? {} : { marginLeft: px((floor.geometry.h - floor.geometry.w) / 2), marginTop: px((floor.geometry.w - floor.geometry.h) / 2) }
  const felt = (
      <div className="byd-table-wood" ref={wood} style={turnedWood}>
        <div
          data-table
          data-rotate={rotate}
          ref={table}
          style={{ position: 'relative', width: px(floor.geometry.w), height: px(floor.geometry.h), ...turnedFelt, transform: rotate ? `rotate(${rotate}deg)` : undefined, ['--unrotate' as string]: `${-rotate}deg` }}
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
                topInspects={inspects(lifting ? topOf(z, 1) : topOf(z))}
                topHandlers={onAct && count > 0 ? handlers({ kind: 'pileTop', pile: z.id }) : undefined}
                labelHandlers={onAct ? handlers({ kind: 'pile', pile: z.id }) : undefined}
                topKeys={keys(`top:${z.id}`)}
                labelKeys={keys(`pile:${z.id}`)}
              />
            )
          })}
          {hands.map((z) => (
            <Hand
              key={z.id}
              zone={z}
              color={seatColor(seatIndex(z.owner))}
              rot={handRot(z)}
              left={left(z.geometry.x + z.geometry.w / 2)}
              top={top(z.geometry.y + z.geometry.h / 2)}
              px={px}
              cards={z.mode === 'order' ? z.order.flatMap((id) => byId.get(id) ?? []) : undefined}
              faces={faces}
            />
          ))}
          {loose.map((c) => {
            const a = absoluteOf(view, c)
            const m = moving.has(c.id)
            if (c.type.id === COUNTER_TYPE) {
              return (
                <div key={c.id} className="byd-token" data-counter-token={c.id} style={{ position: 'absolute', left: left(a.x), top: top(a.y), width: px(TOKEN_MM), height: px(TOKEN_MM) }}>
                  <b>{c.counter ?? 0}</b>
                  <span>{c.cardRef ?? ''}</span>
                </div>
              )
            }
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
                faces={faces}
                handlers={onAct ? handlers({ kind: 'card', id: c.id }) : undefined}
                inspects={inspects(c)}
                keys={keys(`card:${c.id}`)}
              />
            )
          })}
          {mode === 'table' &&
            hands.map((z) => (
              // After the cards: a name card lies on the table, on top of what is dealt near it.
              <SeatName key={`name-${z.id}`} zone={z} floor={floor} name={seatName(z.owner)} color={seatColor(seatIndex(z.owner))} left={left} top={top} />
            ))}
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
                <Texture faces={faces} c={c} />
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
          {overlay?.({ px, left, top, scale })}
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
            <Texture faces={faces} c={held} />
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
// What the keyboard layer hands a drawn node: a role, a name, a tab stop and its key handling.
type FeltNodeProps = {
  role: string
  'aria-label': string
  'data-kbd': string
  'data-kbd-state': string | undefined
  tabIndex: number
  ref(el: HTMLElement | null): void
  onFocus(): void
  onKeyDown(e: RKeyboardEvent): void
}
type Pointing = { onPointerEnter(): void; onPointerLeave(): void }

function Card({ c, left, top, px, dragging, carried, by, faces, handlers, inspects, keys }: { c: VisibleComponentState; left: number; top: number; px: (mm: number) => number; dragging: boolean; carried?: boolean; by?: { seat: string | null; colour: string } | undefined; faces?: string | undefined; handlers?: Handlers | undefined; inspects?: Pointing | undefined; keys?: FeltNodeProps | undefined }) {
  const face = c.cardRef === null ? 'back' : 'front'
  return (
    <div
      className="byd-card"
      data-component={c.id}
      data-face={face}
      data-dragging={dragging ? 'true' : undefined}
      data-carried={carried ? 'true' : undefined}
      data-by={by ? by.seat ?? 'table' : undefined}
      {...inspects}
      {...handlers}
      {...keys}
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
      <Texture faces={faces} c={c} />
      <span>{c.cardRef ?? ''}</span>
    </div>
  )
}

// The top card of a pile while it is being dragged off.
function Ghost({ card, faces, left, top, px }: { card: VisibleComponentState | undefined; faces: string | undefined; left: number; top: number; px: (mm: number) => number }) {
  return (
    <div className="byd-card" data-ghost data-dragging="true" data-face={card?.cardRef ? 'front' : 'back'} style={{ position: 'absolute', left, top, width: px(CARD_MM.w), height: px(CARD_MM.h), pointerEvents: 'none', ...(card?.cardRef ? { ['--hue' as string]: hue(card.cardRef) } : {}) }}>
      <Texture faces={faces} c={card} />
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
function Pile({ zone, count, topCard, faces, left, top, px, lifted, topHandlers, topInspects, labelHandlers, topKeys, labelKeys }: { zone: ZoneView; count: number; topCard: VisibleComponentState | undefined; faces: string | undefined; left: number; top: number; px: (mm: number) => number; lifted: boolean; topHandlers?: Handlers | undefined; topInspects?: Pointing | undefined; labelHandlers?: Handlers | undefined; topKeys?: FeltNodeProps | undefined; labelKeys?: FeltNodeProps | undefined }) {
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
        {...topInspects}
        {...topHandlers}
        {...topKeys}
        style={{ boxShadow: thickness, transform: `translateY(${-(layers - 1) * 1.2}px)`, ...(topCard?.cardRef ? { ['--hue' as string]: hue(topCard.cardRef) } : {}) }}
      >
        <Texture faces={faces} c={topCard} />
        <span>{count > 0 ? topCard?.cardRef ?? '' : ''}</span>
      </div>
      <span className="byd-pile-count" data-handle={labelHandlers ? 'true' : undefined} {...labelHandlers} {...labelKeys}>
        <span className="byd-pile-name">{zone.dynamic ? 'hög' : zone.name}</span>
        <b className="byd-pile-n">{count}</b>
      </span>
    </div>
  )
}

// The room the felt leaves around itself in the frame it was given.
function marginFor(mode: TableMode, size: Size | null): number {
  if (mode !== 'table') return TV_MARGIN_PX
  return size === null ? 0 : Math.round(Math.min(size.w, size.h) * TABLE_MARGIN)
}

const EDGES: Record<number, 'N' | 'E' | 'S' | 'W'> = { 0: 'S', 180: 'N', [-90]: 'E', 90: 'W' }

// Who sits at this edge (B): the name lies along the table's own border, turned toward the seat
// that reads it — as a name card would on a real table. The count stays on the hand.
function SeatName({ zone, floor, name, color, left, top }: { zone: ZoneView; floor: ZoneView; name: string; color: string; left: (mm: number) => number; top: (mm: number) => number }) {
  if (name === '') return null
  const edge = EDGES[edgeRotation(zone, floor)] ?? 'S'
  const alongX = left(zone.geometry.x + zone.geometry.w / 2)
  const alongY = top(zone.geometry.y + zone.geometry.h / 2)
  const place =
    edge === 'S' ? { left: alongX, bottom: 6 } : edge === 'N' ? { left: alongX, top: 6 } : edge === 'W' ? { top: alongY, left: 6 } : { top: alongY, right: 6 }
  return (
    <div className="byd-seat-name" data-seat-name={zone.owner} data-edge={edge} style={{ ...place, ['--seat' as string]: color }}>
      {name}
    </div>
  )
}

// Other seats' hands are a fan of backs and a count; the owner reads theirs on the phone. A hand
// whose order this view may see (the observer, C8) fans the cards themselves. Every measure in
// the fan is a millimetre on the felt, so it shrinks with the table rather than swamping it (#23).
function Hand({ zone, color, rot, left, top, px, cards, faces }: { zone: ZoneView; color: string; rot: number; left: number; top: number; px: (mm: number) => number; cards?: VisibleComponentState[] | undefined; faces?: string | undefined }) {
  const count = zone.mode === 'count' ? zone.count : zone.order.length
  const fan = Math.min(count, FAN_MAX)
  const shown = cards ? Math.min(cards.length, FAN_MAX) : fan
  const box = { left: px(HAND_CARD_BOX.x), top: px(HAND_CARD_BOX.y), width: px(HAND_CARD_BOX.w), height: px(HAND_CARD_BOX.h) }
  const place = (i: number, spread: boolean) => {
    const { step, tilt } = fanPlace(i, shown, spread)
    return `translateX(${px(step)}px) rotate(${tilt}deg)`
  }
  return (
    <div className="byd-hand" data-zone={zone.id} data-count={count} data-rot={rot} style={{ left, top, transform: `rotate(${rot}deg)`, ['--seat' as string]: color, ['--hand-unrot' as string]: `${-rot}deg`, ['--hand-drop' as string]: `${px(HAND_COUNT_MM)}px` }}>
      <div className="byd-hand-fan">
        {cards
          ? cards.slice(0, FAN_MAX).map((c, i) => (
              <i
                key={c.id}
                className="byd-hand-card"
                data-component={c.id}
                data-face={c.cardRef === null ? 'back' : 'front'}
                style={{ ...box, transform: place(i, true), ...(c.cardRef === null ? {} : { ['--hue' as string]: hue(c.cardRef) }) }}
              >
                <Texture faces={faces} c={c} />
                <span>{c.cardRef ?? ''}</span>
              </i>
            ))
          : Array.from({ length: fan }, (_, i) => <i key={i} className="byd-back" style={{ ...box, transform: place(i, false) }} />)}
      </div>
      <b className="byd-hand-count">{count}</b>
    </div>
  )
}
