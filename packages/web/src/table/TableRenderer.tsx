import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent, type ReactNode, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react'
import { BackTexture, Texture } from './Texture.js'
import type { Intent, Presence, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'
import type { Peer, Pulse, Recent } from './presence.js'
import { hue } from './hue.js'
import { seatColor } from './seatColor.js'
import { feltScale, fitScale, leaningSquare, woodLayout, TOUCH_PX, TV_AIR_PX } from './fit.js'
import { activeBounds, cameraOf, fitFloor, frameRect, pad, reachOf, same, tween, zoomAround, type Rect, type Size } from './camera.js'
import { flatToTable, tiltedToTable, unrotate, type Point, type Rotation } from './geometry.js'
import { CARD_MM, TOKEN_MM, absoluteOf, besidePile, dropIntents, type Drag, type DragTarget } from './drop.js'
import { isCounter } from '../components.js'
import { counterActs, drawOne, feltShortcuts, flipUnder, modifierHeld, ownerOf, type Act } from './keyboard.js'
import { ShortcutHelp } from './ShortcutHelp.js'
import { CounterEntry } from './CounterEntry.js'
import { DEFAULT_TIMING } from '../status/connection.js'
import { RadialMenu, type RadialItem } from './RadialMenu.js'
import { ActionSheet } from './ActionSheet.js'
import { RING_AIR, RING_REACH, ringCentre } from './ring.js'
import { FAN_MAX, HAND_CARD_BOX, HAND_COUNT_ABOVE_MM, HAND_COUNT_MM, countSide, edgeRotation, fanPlace, feltWithHands, handAnchor, handExtent, handRotation, type TableMode } from './hand.js'
import { gapAbove, nameAt, type Grow, type Rim } from './labels.js'
import { useT, type T } from '../i18n/index.js'

export type { TableMode } from './hand.js'
// Without an explicit `scale`, the renderer fits the table to its own frame.
// `faces` is the HTTP origin that serves /faces/:hash; without it cards are plain colours.
// With `onAct` the table can be played on (K1, K2, C): drag cards, the top of a pile, or a whole
// pile by its label; click or hold either for a ring of verbs. Without it the table only shows.
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
  // What the pointer is standing on right now, for the commands that act on it (#224). Null when
  // it leaves. A surface that only shows a table never points at anything and passes none.
  onPoint?: ((target: DragTarget | null) => void) | undefined
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
  // What a face-down card wears where nothing serves textures (L17, K9). A played table gets its
  // backs from the render farm through `faces`; the editor's Bord tab has no farm behind it and
  // no version to render, so it compiles the deck's own back in the browser and hands it here.
  // It is a function of the fit for the same reason `overlay` is: a card is drawn in the felt's
  // millimetres, and only the felt knows what one of them is worth in pixels. `at` names the card
  // asking, so a supplier whose picture carries ids of its own can keep them apart — the
  // compiler scopes a card's CSS to the node it is drawn in. Without a back, a face-down card is
  // the stand-in weave `table.css` draws, which is what every surface showed before: a back that
  // belonged to no game (L17).
  back?: ((fit: FeltFit, at: string) => ReactNode) | undefined
  // Whose hand is whose. Table mode always says so on the felt; TV mode leaves it to the dock
  // that says it already (K9). A TV-mode surface with no dock — the editor's Bord tab — asks for
  // the cards here, so that a hand is named by the renderer like every other zone (K19).
  seatNames?: boolean | undefined
  // Which of those place cards is the reader's own (C5, #77). A seat's felt used to be turned so
  // that the reader's edge was the one at the bottom, and that turn was the whole answer to "which
  // edge is mine"; it is no longer given in a landscape window, so the answer moves onto the
  // table's own furniture — the place card at that seat's border is marked as yours, the way a
  // place card at a real table is the one with your name on it. A surface with no reader sitting
  // anywhere marks none.
  me?: string | null | undefined
  // The seat whose own hand is folded to its count, drawing no fan at all (#77). A surface that
  // already draws the reader's hand somewhere else draws it twice otherwise, and the second copy
  // is not free: `feltWithHands` grows the rectangle the fit has to pass into the frame by *every*
  // seat's fan, and the reader's own runs along the axis the frame is bound by. On `/online` at
  // 1280 x 800 a hand of thirteen cost the felt three pixels of card that way, at every seat,
  // which is the difference between K9's forty-five being a floor and nearly being one. Other
  // seats' fans are untouched: theirs are the only picture of their hands there is.
  foldHand?: string | null | undefined
  keyboard?: FeltKeyboard | undefined
}

const HOLD_MS = 350
// How long after a click the press that follows it is still the other half of a double one. The
// browser has already decided it is a double press before it fires `dblclick`; this only rules
// out a stale memory of something clicked a while ago.
const DOUBLE_MS = 700
const POINT_MS = 450
const DRAG_MM = 4
const TABLE_GREY = '#8a93a8'
// The narrowest chip that still has room for the name under the number, in screen pixels.
const TOKEN_NAME_PX = 34
// How the number on a chip is sized (K9, #89).
//
// The chip is 24 mm of felt and nothing here changes that: `CHIP_MM` is what the whole of #89's
// layout was derived from. What changes is the ink. A number set in a fixed twelve pixels fits a
// chip drawn at forty and paints straight out through one drawn at thirteen — which is what eight
// seats at 1280 × 800 draw — so the value broke its own outline on every seat of the tightest
// table the product supports.
//
// So the number is the chip's, twice over: it takes a share of the chip's diameter, and that
// share is divided by the width the value itself needs. Three figures and a minus is the widest
// thing a counter is ever given, and `-120` on a chip must fit the same chip `0` does. The
// fractions are a chord across a circle rather than a square's side — ink to the disc's edge
// would leave no amber around it — and a chip that also carries its name (`TOKEN_NAME_PX`) gives
// the number less, because the two stack.
//
// What it does not do is grow the chip when the value is wide. The alternative rule, a floor
// under the chip in pixels, would have made a counter a different size from every other thing on
// the felt at exactly the seat counts where room is scarcest, and it would have moved the targets
// `counter-zone.test.tsx` measures. At the tightest tables the chip is a dot and its number is a
// dot's number; the value read exactly is read in the ring's hub, which draws it at 24 px, and in
// the counter panel — the same division K18 already makes between the felt and INSPEKTION.
const TOKEN_INK_TALL = 0.52
const TOKEN_INK_WIDE = 0.74
const TOKEN_NAMED_INK_TALL = 0.42
const TOKEN_NAMED_INK_WIDE = 0.66
// What one character of a value costs, as a share of its own size. The felt's own letters (K20)
// set a figure in about 0.52 em and a minus in less; the number here is deliberately larger, so
// that a machine that somehow falls back to a wider face still keeps its ink inside the chip.
const TOKEN_FIGURE_EM = 0.62
const tokenInkPx = (chipPx: number, value: string, named: boolean): number =>
  Math.min(chipPx * (named ? TOKEN_NAMED_INK_TALL : TOKEN_INK_TALL), (chipPx * (named ? TOKEN_NAMED_INK_WIDE : TOKEN_INK_WIDE)) / (Math.max(1, value.length) * TOKEN_FIGURE_EM))
// The camera: room around what is in play, how close it may come, and how long a zoom holds.
// The felt's width across the reader's view under which its names no longer fit beside the zones
// they name (K19, #76). Two seats facing each other across the felt each want about 76 px for a
// name, and the shared piles and their count badges stand between them; below this the two reaches
// meet in the middle. It is the same number `table.css` hides the played felt's names at.
const TIGHT_FELT_PX = 460
// How far a name above its own zone stands off it, there. One pixel, because the room it is
// standing in is the room the seat at the next rim has already been given.
const NAME_RIM_PX = 1
const CAMERA_PAD_MM = 60
const CAMERA_MIN_MM = 520
const CAMERA_RETURN_MS = 6000
const GLIDE_MS = 700

type Live = Drag & { started: boolean }
// A card that has been put down but that the table has not moved yet (K1). The drop and the patch
// are different moments; this is what is drawn in between, so a move never looks like a flinch.
// `top` is a card drawn off a pile: it is held by its own corner and by how tall the pile was,
// because a hidden pile hands out no component id to hold it by (K15). The corner and not the
// pointer, because where in the card the hand took hold of it is the card's to keep (#223).
type Settled = { ids: string[]; origin: Drag['origin']; pile: { id: string; x: number; y: number } | null; top: { pile: string; at: Point; count: number } | null; dx: number; dy: number }
// The ring opens on what the ring has verbs for: a card, a pile by its top or its label, and a
// chip — whose verbs are a counter's own and not a card's (C4, #67).
type Ring = { target: DragTarget; x: number; y: number }

export const TableRenderer = forwardRef<TableHandle, TableRendererProps>(function TableRenderer({ view, mode, scale: fixedScale, rotate = 0, faces, onAct, peers = [], pulses = [], recent = [], onPresence, camera = false, onInspect, size: fixedSize, glideMs = GLIDE_MS, overlay, back, seatNames = false, me = null, foldHand = null, keyboard }, ref) {
  const t = useT()
  const floor = view.zones.find((z) => z.id === view.floor)
  if (!floor) throw new Error(`floor ${view.floor} is not among the zones`)
  const frame = useRef<HTMLDivElement | null>(null)
  const wood = useRef<HTMLDivElement | null>(null)
  const table = useRef<HTMLDivElement | null>(null)
  // Nothing is painted until the frame has been measured: a first paint at 1:1 would flash.
  const [measuredSize, setMeasuredSize] = useState<Size | null>(null)
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
  // The fan is drawn by one rotation, measured by it and hit-tested by it (`dropAt`): one rule.
  const hands = view.zones.filter((z) => z.kind === 'hand')
  const handRot = (z: ZoneView) => handRotation(z, floor, mode)
  // A hand this surface draws somewhere else of its own is folded to its count here, and a folded
  // hand is no fan: it is drawn about its zone's own middle and it reaches past nothing.
  const folded = (z: ZoneView) => foldHand !== null && z.owner === foldHand
  // What the fit has to pass into the frame is the felt *with its hands on* (#23): a hand is part
  // of the table, so a table fitted to the floor alone would clip one that reaches past the rim.
  const felted = feltWithHands(floorRect, hands.map((z) => (folded(z) ? null : handExtent(z, floor, handRot(z)))))
  // A quarter turn (C5) puts the table's width where its height was, so that is the shape the
  // fit has to pass into the frame — otherwise a seat at a side edge gets a table cut off at the
  // top and bottom of its own screen.
  const drawn = rotate % 180 === 0 ? felted : { w: felted.h, h: felted.w }
  // How the felt meets its frame is one rule per mode, and each leaves the air its own furniture
  // needs (K9, K17): the felt table lies on wood that stands on the dark and holds back to its
  // share of it, the TV has no rim and leaves only what a hand's count hangs out into. They were
  // one number until #76 measured what that cost a phone.
  const fitted = size === null ? null : size.w > 0 && size.h > 0 ? (mode === 'table' ? feltScale(drawn, size) : fitScale(drawn, size, TV_AIR_PX)) : 1

  // Inspection (K8): "Titta" in the ring, private to this screen, until tapped away.
  const [held, setHeld] = useState<VisibleComponentState | null>(null)
  const [drag, setDrag] = useState<Live | null>(null)
  const [settling, setSettling] = useState<Settled | null>(null)
  const [ring, setRing] = useState<Ring | null>(null)
  // "Sätt värde…" (#67): the chip whose value is being said outright, on this screen's own keys.
  const [entry, setEntry] = useState<VisibleComponentState | null>(null)

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
  // Opening the ring is one act however it was asked for, so both ways in pull it inside the
  // window together: a card at the rim must not put Vänd past the edge of the screen.
  const openRing = (target: Ring['target'], x: number, y: number) => {
    const room = typeof window === 'undefined' ? null : { w: window.innerWidth, h: window.innerHeight }
    setRing({ target, ...(room ? ringCentre({ x, y }, room) : { x, y }) })
  }
  // What the last press that was a click and not a drag was on, and when. It is what a double
  // press is about (#224); a press on bare felt or a drag clears it.
  const clicked = useRef<{ target: DragTarget; at: number } | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
  }
  useEffect(() => clearHold, [])

  const zoneById = new Map(view.zones.map((z) => [z.id, z]))
  const byId = new Map(view.components.map((c) => [c.id, c]))
  // The drop's own placement is let go the moment the table has moved the card: from there on the
  // table is the truth, as it always was (#29). A card that has left the view — into a hidden pile
  // — has moved too.
  useEffect(() => {
    if (!settling) return
    const cardMoved = settling.ids.some((id) => {
      const c = byId.get(id)
      if (!c) return true
      const was = settling.origin[id]
      const now = absoluteOf(view, c)
      return was === undefined || now.x !== was.x || now.y !== was.y
    })
    const held = settling.pile
    const zone = held ? zoneById.get(held.id) : undefined
    const pileMoved = held !== null && (!zone || zone.geometry.x !== held.x || zone.geometry.y !== held.y)
    // A card drawn off a pile has been moved when the pile it came out of is a card shorter —
    // the one thing the view says about it whether or not the card itself can be named (K15).
    const offPile = settling.top
    const source = offPile ? zoneById.get(offPile.pile) : undefined
    const topMoved = offPile !== null && (!source || countOf(source) !== offPile.count)
    if (cardMoved || pileMoved || topMoved) setSettling(null)
  })
  // A drop the table never answers — refused, or lost — has no patch to wait for, so it cannot
  // hold its placement for ever. It is held exactly as long as the tool still considers the
  // connection fine; after that the table is the truth again and the reader sees where the card
  // really is (#29).
  useEffect(() => {
    if (!settling) return
    const timer = setTimeout(() => setSettling(null), DEFAULT_TIMING.slowAfterMs)
    return () => clearTimeout(timer)
  }, [settling])
  const px = (mm: number) => mm * scale
  // How wide the felt is drawn across the reader's own view (C5). It is the axis a name at a side
  // rim reaches along, and the one thing the stylesheet cannot ask for itself: the felt's own box
  // keeps the floor's shape and is then turned, so a container query on it measures the other
  // side. Under `TIGHT_FELT_PX` the felt is smaller than the names it carries and draws them at
  // its own tightest (K19, #76) — which in practice is the observer on a phone (C8, L12).
  const feltWidePx = px(rotate % 180 === 0 ? floor.geometry.w : floor.geometry.h)
  const tight = mode === 'tv' && measured && feltWidePx > 0 && feltWidePx < TIGHT_FELT_PX
  const left = (mmX: number) => px(mmX - floor.geometry.x)
  const top = (mmY: number) => px(mmY - floor.geometry.y)
  // The box a back is drawn in: the card's own, so the supplier only has to draw a card. A
  // surface that supplies none keeps the stand-in weave `table.css` draws.
  const backAt = (at: string): ReactNode => back && <span className="byd-card-back">{back({ px, left, top, scale }, at)}</span>
  // A chip's target (#67): the finger's 44 × 44 on the screen, laid invisibly over a disc that
  // stays its 24 mm (K9). In table mode the felt leans away, so a box set to 44 in its plane is
  // less than 44 on the screen, and slanted; the target is sized through the same projection the
  // stylesheet draws, at the chip's own place, since the far edge leans further than the near.
  // The wood is the felt with its rim, turned as the felt is turned (C5); a frame not yet
  // measured leans nothing that can be known, and gets the flat answer.
  const leaning = mode === 'table' && size !== null && size.w > 0 && size.h > 0 ? woodLayout(rotate % 180 === 0 ? { w: floor.geometry.w, h: floor.geometry.h } : { w: floor.geometry.h, h: floor.geometry.w }, size, scale) : null
  const hitOf = (centre: Point): number => {
    if (!leaning) return Math.max(px(TOKEN_MM), TOUCH_PX)
    const dx = px(centre.x - (floor.geometry.x + floor.geometry.w / 2))
    const dy = px(centre.y - (floor.geometry.y + floor.geometry.h / 2))
    const a = (rotate * Math.PI) / 180
    const onWood = { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }
    return Math.max(px(TOKEN_MM), leaningSquare(leaning, onWood, TOUCH_PX))
  }
  // K19 on a felt too small to hold its own names beside the zones they name (#76). At the side
  // rims a name stands above its zone instead, anchored at the end nearest the rim and growing
  // inward, so that it keeps to its own half of the felt rather than reaching across it — where
  // the shared piles and their count badges stand, and the opposite seat's name comes the other
  // way. It is said through the same two variables the stylesheet's rim rules use, because the
  // only thing the sheet cannot work out for itself is how large the zone came out in pixels.
  const overRim = (z: ZoneView, rim: Rim, grow: Grow): Record<string, string> => {
    if (!tight || (rim !== 'E' && rim !== 'W')) return {}
    const turnedZone = rotate % 180 === 0 ? { w: z.geometry.w, h: z.geometry.h } : { w: z.geometry.h, h: z.geometry.w }
    const side = rim === 'E' ? `${px(turnedZone.w)}px - 100% - var(--name-in)` : `var(--name-in) - ${px(turnedZone.w)}px`
    return { '--name-side': `calc(${side})`, '--name-end': `calc(-100% - ${NAME_RIM_PX}px${grow === 'back' ? ` - ${px(turnedZone.h)}px` : ''})` }
  }
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
    // «Vänd det jag pekar på» (#224). The modifier press is the whole gesture: it never becomes a
    // drag and it never opens the ring, so the card is turned and nothing else happens on the way.
    if (modifierHeld(e)) {
      e.preventDefault()
      const turn = flipUnder(view, target)
      if (turn) onAct(turn)
      return
    }
    const map = mapper()
    if (!map) return
    toTable.current = map
    const at = map(e.clientX, e.clientY)
    const ids = target.kind === 'card' || target.kind === 'counter' ? [target.id] : target.kind === 'counterPile' ? target.ids : []
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
    // A whole pile is dragged, never held.
    if (target.kind === 'pile') return
    const held = target
    const { clientX, clientY, pointerId } = e
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null
      if (!live.current || live.current.started) return
      live.current = null
      setDrag(null)
      if (typeof el.releasePointerCapture === 'function' && typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
      openRing(held, clientX, clientY)
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
  // Letting go. A pointer that never travelled has not moved anything, so it is a question and
  // not a drop: the ring opens where the hand already is. That is the whole rule on the felt —
  // a drag moves the thing, a click asks what may be done with it (K14). A cancelled pointer
  // asks nothing, which is why it comes in here without a place to open at.
  const release = (asked: Point | null) => {
    const d = live.current
    clearHold()
    live.current = null
    setDrag(null)
    if (d?.started && d.target.kind === 'card') onPresence?.({ kind: 'drop' })
    clicked.current = null
    if (!d || !onAct) return
    if (!d.started) {
      if (asked) {
        clicked.current = { target: d.target, at: Date.now() }
        openRing(d.target, asked.x, asked.y)
      }
      return
    }
    const intents = dropIntents(view, d, mode)
    if (intents.length === 0) return
    onAct(intents)
    // The card stays where it was put until the table has moved it. Between here and the patch the
    // view still says where the card came from, and drawing it there is the flinch (#29).
    // A whole pile waits for the same patch, and is held by where its zone was rather than by ids.
    // And the card drawn off the top of one waits for it too, held by the pile it came out of.
    const target = d.target
    const wholePile = target.kind === 'pile' ? view.zones.find((z) => z.id === target.pile) : undefined
    const source = target.kind === 'pileTop' ? view.zones.find((z) => z.id === target.pile) : undefined
    if (d.ids.length === 0 && !wholePile && !source) return
    setSettling({
      ids: d.ids,
      origin: d.origin,
      pile: wholePile ? { id: wholePile.id, x: wholePile.geometry.x, y: wholePile.geometry.y } : null,
      top: source ? { pile: source.id, at: topCornerOf(source.id, d) ?? d.at, count: countOf(source) } : null,
      dx: d.at.x - d.grab.x,
      dy: d.at.y - d.grab.y,
    })
  }
  const up = (e: RPointerEvent) => release({ x: e.clientX, y: e.clientY })
  const cancel = () => release(null)
  const handlers = (target: DragTarget) => ({ onPointerDown: (e: RPointerEvent) => down(e, target), onPointerMove: move, onPointerUp: up, onPointerCancel: cancel })
  // Pointing at a card is not touching it: it only says what the screen should show large.
  const inspects = (c: VisibleComponentState | undefined) =>
    onInspect && c ? { onPointerEnter: () => onInspect(c), onPointerLeave: () => onInspect(null) } : undefined
  // And what the pointer is standing on, for the commands that act on it (#224). The keyboard
  // track is told; it is the one place on the felt that reads a key, and this is the address it
  // reads it about.
  const points = (target: DragTarget): Pointing | undefined => {
    const say = keyboard?.onPoint
    return say ? { onPointerEnter: () => say(target), onPointerLeave: () => say(null) } : undefined
  }
  // A card answers the pointer twice over: what to show large, and what `F` turns over (#258).
  // Two pairs of handlers on one node would be the second silently dropped, so they are one pair.
  const bothPointing = (a: Pointing | undefined, b: Pointing | undefined): Pointing | undefined =>
    a && b
      ? {
          onPointerEnter: () => {
            a.onPointerEnter()
            b.onPointerEnter()
          },
          onPointerLeave: () => {
            a.onPointerLeave()
            b.onPointerLeave()
          },
        }
      : a ?? b

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
  // A double press turns over what was pressed (#224): the way in for a hand that cannot hold a
  // modifier down. It is read on the frame and not on the card, because by the time the second
  // press lands the ring the first one opened is covering the card — so the browser dispatches
  // its `dblclick` on the frame the two presses have in common, and the card is not in it. What
  // was pressed is therefore remembered, and the frame asks what it was.
  const doubled = (e: RMouseEvent) => {
    const was = clicked.current
    clicked.current = null
    const turn = was && onAct && Date.now() - was.at < DOUBLE_MS ? flipUnder(view, was.target) : null
    if (turn) {
      setRing(null)
      onAct?.(turn)
      return
    }
    doubleTap(e)
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
    clicked.current = null
    pointTimer.current = setTimeout(() => {
      pointTimer.current = null
      onPresence({ kind: 'point', ...at })
    }, POINT_MS)
  }
  const feltLeave = () => {
    clearPoint()
    onPresence?.({ kind: 'away' })
  }

  // What the ring would hold, asked for once: a thing that has left the table while the finger
  // was on the way to it has no verbs, and a ring with none opens on nothing (K14).
  // A ring that opens a second ring — a pile of chips offering the counter inside it (#89) — must
  // survive its own closing: the backdrop closes whatever was open, and what was open by then is
  // the ring the choice just opened. So the close is told which ring it is closing.
  const shut = (open: Ring) => () => setRing((r) => (r === open ? null : r))
  const ringVerbs = ring && onAct ? ringItems(view, ring, setRing, onAct, setHeld, setEntry, t) : []
  const ringOn = ring?.target
  const ringChip = ringOn?.kind === 'counter' ? view.components.find((c) => c.id === ringOn.id) : undefined
  // The game's own actions for the pile the ring is about (K14, extended). They hang under the
  // ring as a list, because a designer's sentence does not fit in a circle's button; a pile with
  // none opens no sheet, for the same reason a ring with no verbs does not open.
  const ringZone = ringOn && (ringOn.kind === 'pile' || ringOn.kind === 'pileTop') ? view.zones.find((z) => z.id === ringOn.pile) : undefined
  const ringActions = ringZone?.actions ?? []
  const ringPile = ringOn?.kind === 'counterPile' ? ringOn.ids.flatMap((id) => view.components.find((c) => c.id === id) ?? []) : undefined

  const areas = view.zones.filter((z) => z.kind === 'area' && z.id !== floor.id)
  const piles = view.zones.filter((z) => z.kind === 'pile')
  // Which of K19's four cases a zone's name is in. It is the table's own millimetres that decide,
  // so the renderer works it out and the stylesheet draws it.
  const handOf = (seat: string | undefined) => (seat ? view.zones.find((z) => z.kind === 'hand' && z.owner === seat) : undefined)
  const loose = view.components.filter((c) => zoneById.get(c.zone)?.kind === 'area')
  // A seat's chips that lie on the same spot are one pile, and a pile is one thing to press (C4,
  // #89). Past the second counter the recipe gives them a single slot to share, because three
  // targets of 44 px do not fit in a seat's 500 mm without reaching into the area in front of the
  // player. What is a pile is read off where the chips lie and never off how many there are, so a
  // chip dragged out of one is its own again the moment the table says where it went — and the log
  // hears nothing about piles, only the `move` a chip always travelled by.
  const spotOf = (c: VisibleComponentState) => `${c.zone}@${Math.round(c.x)},${Math.round(c.y)}`
  const chipsAt = new Map<string, VisibleComponentState[]>()
  for (const c of loose) if (isCounter(c)) chipsAt.set(spotOf(c), [...(chipsAt.get(spotOf(c)) ?? []), c])
  const dx = drag?.started ? drag.at.x - drag.grab.x : (settling?.dx ?? 0)
  const dy = drag?.started ? drag.at.y - drag.grab.y : (settling?.dy ?? 0)
  // Held in the hand, and therefore drawn lifted. A card that has been put down is not.
  const lifted = new Set(drag?.started ? drag.ids : [])
  // Drawn away from where the table says it is: while carried, and while the drop waits for its
  // patch (#29).
  const shifted = new Set(drag?.started ? drag.ids : (settling?.ids ?? []))
  const onPile = drag?.started && (drag.target.kind === 'pile' || drag.target.kind === 'pileTop') ? drag.target : null
  const liftedPile = onPile?.pile ?? null
  const liftedKind = onPile?.kind ?? null
  // The card that is off the top of a pile: in the hand while it is dragged, and still out of the
  // stack after it has been put down, until the table says where it went (#29).
  // Where the corner of a card taken off a pile stands: where that card's corner was — the top of
  // a pile is drawn centred on the pile's geometry — moved by how far the hand has travelled. The
  // ghost used to be drawn centred on the pointer while the drop cornered the card there, so the
  // two disagreed by half a card and the card jumped at the moment it was let go (#223).
  const topCornerOf = (pile: string, d: { grab: Point; at: Point }): Point | null => {
    const g = zoneById.get(pile)?.geometry
    return g ? { x: g.x - CARD_MM.w / 2 + d.at.x - d.grab.x, y: g.y - CARD_MM.h / 2 + d.at.y - d.grab.y } : null
  }
  const liveTop = drag?.started && drag.target.kind === 'pileTop' ? topCornerOf(drag.target.pile, drag) : null
  const offTop =
    drag?.started && drag.target.kind === 'pileTop' && liveTop
      ? { pile: drag.target.pile, at: liveTop }
      : settling?.top
        ? { pile: settling.top.pile, at: settling.top.at }
        : null
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
          {areas.map((z) => {
            const { rim, grow, anchor } = nameAt(z, floor, handOf(z.owner), rotate)
            // Whether the name above is near enough to share this one's strip of felt (#43).
            // The stylesheet moves it to the middle of its own zone when it is; see `gapAbove`.
            const crowded = rim === 'none' && gapAbove(z, areas, handOf, floor, rotate) !== null
            return (
              <div
                key={z.id}
                className="byd-zone"
                data-area={z.id}
                data-rim={rim}
                data-grow={grow}
                {...(crowded ? { 'data-mid': '' } : {})}
                style={{ left: left(z.geometry.x), top: top(z.geometry.y), width: px(z.geometry.w), height: px(z.geometry.h), ['--name-x' as string]: `${anchor.x}%`, ['--name-y' as string]: `${anchor.y}%` }}
              >
                <span style={overRim(z, rim, grow)}>{z.name}</span>
              </div>
            )
          })}
          {piles.map((z) => {
            const whole = liftedPile === z.id && liftedKind === 'pile'
            // Put down, and still drawn where it was put: the patch has not come back yet (#29).
            const settled = settling?.pile?.id === z.id
            const lifting = offTop?.pile === z.id
            const count = countOf(z)
            return (
              <Pile
                key={z.id}
                zone={z}
                count={lifting ? count - 1 : count}
                topCard={lifting ? topOf(z, 1) : topOf(z)}
                faces={faces}
                back={backAt(`pile-${z.id}`)}
                left={left(z.geometry.x + (whole || settled ? dx : 0))}
                top={top(z.geometry.y + (whole || settled ? dy : 0))}
                px={px}
                lifted={whole}
                topInspects={inspects(lifting ? topOf(z, 1) : topOf(z))}
                topHandlers={onAct && count > 0 ? handlers({ kind: 'pileTop', pile: z.id }) : undefined}
                labelHandlers={onAct ? handlers({ kind: 'pile', pile: z.id }) : undefined}
                topKeys={keys(`top:${z.id}`)}
                labelKeys={keys(`pile:${z.id}`)}
                points={points({ kind: 'pile', pile: z.id })}
              />
            )
          })}
          {hands.map((z) => {
            // Drawn about the point the fan is anchored at in its own zone (#84), which is what
            // the fit above measured it by, with the count hung off it on the rim's side. A folded
            // hand has no fan to anchor, so it stands in the middle of its own zone and the count
            // hangs off that, in the same air past the rim every other seat's count hangs in.
            const fold = folded(z)
            const at = fold ? { x: z.geometry.x + z.geometry.w / 2, y: z.geometry.y + z.geometry.h / 2 } : handAnchor(z, floor, handRot(z))
            return (
              <Hand
                key={z.id}
                zone={z}
                color={seatColor(seatIndex(z.owner))}
                rot={handRot(z)}
                countAt={countSide(z, floor, handRot(z))}
                folded={fold}
                left={left(at.x)}
                top={top(at.y)}
                px={px}
                cards={z.mode === 'order' ? z.order.flatMap((id) => byId.get(id) ?? []) : undefined}
                faces={faces}
              />
            )
          })}
          {loose.map((c) => {
            const a = absoluteOf(view, c)
            const m = shifted.has(c.id)
            if (isCounter(c)) {
              // A token is a thing on the felt like any other, so it carries the keyboard's node
              // and the pointer's handles both. `thingsOn` has always counted it, and the single
              // tab stop can land on it; a token that drew no node took that stop with it and
              // left the felt unreachable. Its address says `counter:` and not `card:`, because a
              // counter is not a card and the sentence a reader hears is built from that (C4, A4).
              //
              // The chip is 24 mm and the word in it is not: on a felt scaled down to a screen the
              // name grows wider than the disc it stands in and smears over the table. Below the
              // width the word needs, the number stands alone — which is what a counter is for.
              // The name is still on the table's own screen, in the panel and in the zone's label.
              const wide = px(TOKEN_MM) >= TOKEN_NAME_PX
              // The pile this chip is in, and where in it this chip lies. The topmost is the one
              // the hand meets: it carries the target and the whole pile's handles, and the ones
              // under it are drawn peeking out beneath it and keep nothing but their own name and
              // tab stop — a keyboard still reaches every counter by itself (#1, #2), and the hand
              // reaches them through the ring the top opens (#89).
              const pile = chipsAt.get(spotOf(c)) ?? [c]
              const under = pile.length - 1 - pile.findIndex((p) => p.id === c.id)
              const topmost = under === 0
              // The target is the hand's and only the hand's: a table that is only shown has no
              // finger to answer, and draws none (K16's rule for the keyboard, applied here).
              const hit = onAct && topmost ? hitOf({ x: a.x + TOKEN_MM / 2, y: a.y + TOKEN_MM / 2 }) : 0
              // How far a chip under the top peeks out from beneath it: a tenth of the disc, which
              // keeps the pile a pile at every scale the felt is drawn at and never less than the
              // pixel that is the least a screen can show.
              const peek = under * Math.max(1, px(TOKEN_MM) / 10)
              const grip: DragTarget = pile.length > 1 ? { kind: 'counterPile', ids: pile.map((p) => p.id) } : { kind: 'counter', id: c.id }
              return (
                <div
                  key={c.id}
                  className="byd-token"
                  data-counter-token={c.id}
                  data-stack={pile.length > 1 ? pile.length : undefined}
                  data-dragging={lifted.has(c.id) ? 'true' : undefined}
                  {...(onAct && topmost ? handlers(grip) : {})}
                  {...keys(`counter:${c.id}`)}
                  style={{ position: 'absolute', left: left(a.x + (m ? dx : 0)), top: top(a.y + (m ? dy : 0)) + peek, width: px(TOKEN_MM), height: px(TOKEN_MM) }}
                >
                  <b style={{ fontSize: tokenInkPx(px(TOKEN_MM), String(c.counter ?? 0), wide) }}>{c.counter ?? 0}</b>
                  {wide && <span>{c.cardRef ?? ''}</span>}
                  {hit > 0 && <i className="byd-token-hit" data-counter-hit={c.id} style={{ width: hit, height: hit, left: (px(TOKEN_MM) - hit) / 2, top: (px(TOKEN_MM) - hit) / 2 }} />}
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
                dragging={lifted.has(c.id)}
                carried={carried.has(c.id)}
                by={movedBy.has(c.id) ? { seat: movedBy.get(c.id) ?? null, colour: colourOf(movedBy.get(c.id) ?? null) } : undefined}
                faces={faces}
                back={backAt(`card-${c.id}`)}
                handlers={onAct ? handlers({ kind: 'card', id: c.id }) : undefined}
                points={bothPointing(inspects(c), points({ kind: 'card', id: c.id }))}
                keys={keys(`card:${c.id}`)}
              />
            )
          })}
          {(mode === 'table' || seatNames) &&
            hands.map((z) => (
              // After the cards: a name card lies on the table, on top of what is dealt near it.
              <SeatName key={`name-${z.id}`} zone={z} floor={floor} name={seatName(z.owner)} color={seatColor(seatIndex(z.owner))} mine={me !== null && z.owner === me} left={left} top={top} />
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
                data-back={!c?.cardRef && back ? 'own' : undefined}
                style={{ position: 'absolute', left: left(p.drag.x), top: top(p.drag.y), width: px(CARD_MM.w), height: px(CARD_MM.h), transform: `rotate(${c?.rot ?? 0}deg)`, ['--peer' as string]: colourOf(p.seat), ...(c?.cardRef ? { ['--hue' as string]: hue(c.cardRef) } : {}) }}
              >
                {!c?.cardRef && backAt(`peer-${p.id}`)}
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
          {offTop && (
            <Ghost card={topOf(zoneById.get(offTop.pile) ?? floor)} zoneBack={backOf(zoneById.get(offTop.pile))} faces={faces} back={backAt('ghost')} left={left(offTop.at.x)} top={top(offTop.at.y)} px={px} />
          )}
          {overlay?.({ px, left, top, scale })}
        </div>
      </div>
  )
  return (
    <div
      className="byd-table-frame"
      data-mode={mode}
      data-tight={tight ? 'true' : undefined}
      data-camera={placed ? 'follow' : undefined}
      data-playable={onAct ? 'true' : undefined}
      ref={frame}
      style={measured ? undefined : { visibility: 'hidden' }}
      onWheel={following ? wheel : undefined}
      onDoubleClick={onAct || following ? doubled : undefined}
    >
      {placed ? (
        <div className="byd-camera-world" style={{ left: placed.left, top: placed.top, width: px(floorRect.w), height: px(floorRect.h) }}>
          {felt}
        </div>
      ) : (
        felt
      )}
      {ringVerbs.length > 0 && ring && (
        <RadialMenu
          id={ringName(ring.target)}
          x={ring.x}
          y={ring.y}
          items={ringVerbs}
          hub={ringChip ? <CounterHub view={view} c={ringChip} t={t} /> : ringPile ? <PileHub view={view} chips={ringPile} t={t} /> : undefined}
          onClose={shut(ring)}
        />
      )}
      {ring && onAct && ringZone && ringActions.length > 0 && (
        <ActionSheet
          view={view}
          pile={ringZone.id}
          name={ringZone.name}
          actions={ringActions}
          x={ring.x}
          y={ring.y + RING_REACH + RING_AIR * 2}
          onAct={onAct}
          onClose={shut(ring)}
        />
      )}
      {/* Den diskreta hjälpen (#224), i filtens nedre högra hörn. Den står på en filt som går att
          spela på och ingen annanstans: en yta som bara visar ett bord har inga kommandon att
          lova. Listan är filtens egen; samma knapp på en annan yta skulle hålla den ytans. */}
      {onAct && <ShortcutHelp where={t('help.where.felt')} shortcuts={feltShortcuts(t)} />}
      {entry && onAct && <CounterEntry view={view} c={entry} onSet={(value) => onAct([{ v: 'setCounter', component: entry.id, value }])} onClose={() => setEntry(null)} />}
      {held && (
        <div className="byd-inspect" onClick={() => setHeld(null)}>
          <div data-inspect={held.id} data-face={held.cardRef === null ? 'back' : 'front'} style={held.cardRef === null ? undefined : { ['--hue' as string]: hue(held.cardRef) }}>
            <Texture faces={faces} c={held} retry />
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

// What a ring is drawn about, for the sake of a test that has to find it again.
const ringName = (target: Ring['target']): string =>
  target.kind === 'card' || target.kind === 'counter' ? target.id : target.kind === 'counterPile' ? target.ids.join('+') : target.pile

// The verbs a drag cannot say (C): for a card, for a pile, for a chip, and for a pile of chips.
function ringItems(view: Snapshot, ring: Ring, open: (r: Ring) => void, act: (intents: Intent[]) => void, inspect: (c: VisibleComponentState) => void, enter: (c: VisibleComponentState) => void, t: T): RadialItem[] {
  const target = ring.target
  const flip = (c: VisibleComponentState): RadialItem => ({ label: t('ring.flip'), run: () => act([{ v: 'flip', component: c.id, face: c.face === 'front' ? 'back' : 'front' }]) })
  const look = (c: VisibleComponentState | undefined): RadialItem => ({ label: t('ring.look'), run: c ? () => inspect(c) : null })
  // A pile of chips has no verbs of its own — nothing is done to a pile, only to a counter in it —
  // so its ring is the counters it holds, each said by its name and its value, and choosing one
  // opens that chip's own ring, which is `counterActs` and nothing else (C4, K14, #89).
  if (target.kind === 'counterPile') {
    return target.ids.flatMap((id) => {
      const c = view.components.find((x) => x.id === id)
      if (!c) return []
      return [{ key: c.id, label: t('ring.counter.named', { name: c.cardRef ?? '', n: c.counter ?? 0 }), run: () => open({ target: { kind: 'counter', id: c.id }, x: ring.x, y: ring.y }) }]
    })
  }
  if (target.kind === 'counter') {
    // The same list the keyboard's panel reads (`verbsFor`), so the hand and the keyboard cannot
    // be offered different things on one chip. Every entry is `setCounter` with an absolute value.
    const c = view.components.find((x) => x.id === target.id)
    if (!c) return []
    return counterActs(c, t).map((a: Act): RadialItem => {
      const intents = a.intents
      return { label: a.label, run: a.set !== undefined ? () => enter(c) : intents ? () => act(intents) : null }
    })
  }
  if (target.kind === 'card') {
    const c = view.components.find((x) => x.id === target.id)
    if (!c) return []
    return [
      flip(c),
      { label: t('ring.rotate'), run: () => act([{ v: 'rotate', component: c.id, rot: (c.rot + 90) % 360 }]) },
      look(c),
      { label: t('ring.reveal'), run: c.cardRef === null ? () => act([{ v: 'reveal', components: [c.id] }]) : null },
    ]
  }
  const z = view.zones.find((x) => x.id === target.pile)
  if (!z) return []
  const count = z.mode === 'count' ? z.count : z.order.length
  const top = view.components.find((c) => c.id === topIdOf(z))
  // What is split off lands beside the pile, clear of its label (#87); where that is depends on
  // whether one card or a pile is what lands.
  const split = (cards: number): Intent => ({ v: 'split', pile: z.id, at: cards, ...besidePile(z.geometry, cards, z.beside) })
  // The top is flipped by naming the pile (K15): a hidden pile gives no id, and an unseen top
  // is by definition not face-up.
  const flipTop = (): Intent[] => [{ v: 'flip', component: { top: z.id }, face: top?.face === 'front' ? 'back' : 'front' }]
  return [
    { label: t('ring.shuffle'), run: count > 1 ? () => act([{ v: 'shuffle', pile: z.id }]) : null },
    // One card off the top is `drawOne`, which the panel and the `D` key send too (K16, #224).
    { label: t('ring.draw'), run: count > 0 ? () => act([drawOne(z)]) : null },
    { label: t('ring.half'), run: count > 1 ? () => act([split(Math.ceil(count / 2))]) : null },
    { label: t('ring.flipTop'), run: count > 0 ? () => act(flipTop()) : null },
    look(top),
  ]
}

// What a chip's ring is about, in its hub: the value, the name the designer gave the counter, and
// whose it is. The felt never draws the name — `TOKEN_NAME_PX` against a chip of 10–34 px — and
// a chip lifted into a ring has left the zone that said whose it was, so both are said here.
function CounterHub({ view, c, t }: { view: Snapshot; c: VisibleComponentState; t: T }) {
  const owner = ownerOf(view, c)
  return (
    <>
      <b>{c.counter ?? 0}</b>
      <span>{c.cardRef ?? ''}</span>
      {owner !== null && <i>{t('ring.counter.whose', { name: owner })}</i>}
    </>
  )
}

// What a pile of chips is about, in its hub: how many counters are stacked there, and whose they
// are. What each of them says is on the buttons around it, which is the only place on the felt
// those values can be read at all — the price C pays, and the reason it is paid only at three.
function PileHub({ view, chips, t }: { view: Snapshot; chips: VisibleComponentState[]; t: T }) {
  const owner = chips[0] ? ownerOf(view, chips[0]) : null
  return (
    <>
      <b>{chips.length}</b>
      <span>{t('ring.counter.pile')}</span>
      {owner !== null && <i>{t('ring.counter.whose', { name: owner })}</i>}
    </>
  )
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

function Card({ c, left, top, px, dragging, carried, by, faces, back, handlers, points, keys }: { c: VisibleComponentState; left: number; top: number; px: (mm: number) => number; dragging: boolean; carried?: boolean; by?: { seat: string | null; colour: string } | undefined; faces?: string | undefined; back?: ReactNode | undefined; handlers?: Handlers | undefined; points?: Pointing | undefined; keys?: FeltNodeProps | undefined }) {
  const face = c.cardRef === null ? 'back' : 'front'
  // The deck's own back, when this card lies face down and a back was handed in. It is both what
  // is drawn and what tells the stylesheet to draw no stand-in under it.
  const own = c.cardRef === null ? back : null
  return (
    <div
      className="byd-card"
      data-component={c.id}
      data-face={face}
      data-back={own ? 'own' : undefined}
      data-dragging={dragging ? 'true' : undefined}
      data-carried={carried ? 'true' : undefined}
      data-by={by ? by.seat ?? 'table' : undefined}
      {...points}
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
      {own}
      <Texture faces={faces} c={c} />
      <span>{c.cardRef ?? ''}</span>
    </div>
  )
}

// The top card of a pile while it is being dragged off. A hidden pile's top is no component, so
// the ghost wears the back the zone named for the pile (#313): the card that came off is the one
// that showed, and it must not change back as it lifts.
function Ghost({ card, zoneBack, faces, back, left, top, px }: { card: VisibleComponentState | undefined; zoneBack?: string | undefined; faces: string | undefined; back?: ReactNode | undefined; left: number; top: number; px: (mm: number) => number }) {
  const own = card?.cardRef ? null : zoneBack ? <BackTexture faces={faces} hash={zoneBack} /> : back
  return (
    <div className="byd-card" data-ghost data-dragging="true" data-face={card?.cardRef ? 'front' : 'back'} data-back={own ? 'own' : undefined} style={{ position: 'absolute', left, top, width: px(CARD_MM.w), height: px(CARD_MM.h), pointerEvents: 'none', ...(card?.cardRef ? { ['--hue' as string]: hue(card.cardRef) } : {}) }}>
      {own}
      <Texture faces={faces} c={card} />
      <span>{card?.cardRef ?? ''}</span>
    </div>
  )
}

// The back a hidden pile says its face-down top wears (#313), or nothing where the zone is public
// or the session serves no textures.
function backOf(z: ZoneView | undefined): string | undefined {
  return z?.mode === 'count' ? z.back : undefined
}

// How many cards a pile holds, however much of it this view is allowed to name (K15).
function countOf(z: ZoneView): number {
  return z.mode === 'count' ? z.count : z.order.length
}

// The id of the card `skip` below the top of a pile, as far as this view knows: every card of a
// public pile, only a face-up top of a hidden one (K15).
function topIdOf(z: ZoneView, skip = 0): string | undefined {
  if (z.mode === 'order') return z.order[skip]
  return skip === 0 ? z.top : undefined
}

// A pile is a point; the stack is centred on it. A hidden pile has a count and nothing else,
// unless its top lies face-up.
function Pile({ zone, count, topCard, faces, back, left, top, px, lifted, topHandlers, topInspects, labelHandlers, topKeys, labelKeys, points }: { zone: ZoneView; count: number; topCard: VisibleComponentState | undefined; faces: string | undefined; back?: ReactNode | undefined; left: number; top: number; px: (mm: number) => number; lifted: boolean; topHandlers?: Handlers | undefined; topInspects?: Pointing | undefined; labelHandlers?: Handlers | undefined; topKeys?: FeltNodeProps | undefined; labelKeys?: FeltNodeProps | undefined; points?: Pointing | undefined }) {
  const t = useT()
  // What a face-down pile wears. Its top card's own back first, which is the one thing about a
  // hidden pile that is public in the room (#313): a deck whose cards carry their own back (#14)
  // showed the deck's default until somebody had drawn, because the client was guessing from a
  // deck-wide prop instead of reading what the projection said. The projection says it now — on
  // the zone, since the component is not handed out at all (K15).
  //
  // The deck's own back is what is left when the session has no textures to serve. An empty pile
  // wears nothing but the dashed outline `table.css` draws on it, which is how a pile says it is
  // empty.
  const ownBack = backOf(zone)
  const own = count > 0 && !topCard?.cardRef ? (ownBack ? <BackTexture faces={faces} hash={ownBack} /> : back) : null
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
      {...points}
    >
      <div
        className="byd-pile-top"
        data-face={topCard?.cardRef ? 'front' : 'back'}
        data-back={own ? 'own' : undefined}
        {...topInspects}
        {...topHandlers}
        {...topKeys}
        style={{ boxShadow: thickness, transform: `translateY(${-(layers - 1) * 1.2}px)`, ...(topCard?.cardRef ? { ['--hue' as string]: hue(topCard.cardRef) } : {}) }}
      >
        {own}
        <Texture faces={faces} c={topCard} />
        <span>{count > 0 ? topCard?.cardRef ?? '' : ''}</span>
      </div>
      <span className="byd-pile-count" data-handle={labelHandlers ? 'true' : undefined} {...labelHandlers} {...labelKeys}>
        <span className="byd-pile-name">{zone.dynamic ? t('pile.dynamic') : zone.name}</span>
        <b className="byd-pile-n">{count}</b>
      </span>
    </div>
  )
}

const EDGES: Record<number, 'N' | 'E' | 'S' | 'W'> = { 0: 'S', 180: 'N', [-90]: 'E', 90: 'W' }

// Who sits at this edge (B): the name lies along the table's own border, turned toward the seat
// that reads it — as a name card would on a real table. The count stays on the hand.
function SeatName({ zone, floor, name, color, mine, left, top }: { zone: ZoneView; floor: ZoneView; name: string; color: string; mine?: boolean | undefined; left: (mm: number) => number; top: (mm: number) => number }) {
  if (name === '') return null
  const edge = EDGES[edgeRotation(zone, floor)] ?? 'S'
  const alongX = left(zone.geometry.x + zone.geometry.w / 2)
  const alongY = top(zone.geometry.y + zone.geometry.h / 2)
  const place =
    edge === 'S' ? { left: alongX, bottom: 6 } : edge === 'N' ? { left: alongX, top: 6 } : edge === 'W' ? { top: alongY, left: 6 } : { top: alongY, right: 6 }
  return (
    <div className="byd-seat-name" data-seat-name={zone.owner} data-edge={edge} {...(mine ? { 'data-me': 'true' } : {})} style={{ ...place, ['--seat' as string]: color }}>
      {name}
    </div>
  )
}

// Other seats' hands are a fan of backs and a count; the owner reads theirs on the phone. A hand
// whose order this view may see (the observer, C8) fans the cards themselves. Every measure in
// the fan is a millimetre on the felt, so it shrinks with the table rather than swamping it (#23).
function Hand({ zone, color, rot, countAt, folded = false, left, top, px, cards, faces }: { zone: ZoneView; color: string; rot: number; countAt: 'below' | 'above'; folded?: boolean; left: number; top: number; px: (mm: number) => number; cards?: VisibleComponentState[] | undefined; faces?: string | undefined }) {
  const count = zone.mode === 'count' ? zone.count : zone.order.length
  const fan = folded ? 0 : Math.min(count, FAN_MAX)
  const shown = cards ? Math.min(cards.length, FAN_MAX) : fan
  const box = { left: px(HAND_CARD_BOX.x), top: px(HAND_CARD_BOX.y), width: px(HAND_CARD_BOX.w), height: px(HAND_CARD_BOX.h) }
  const place = (i: number, spread: boolean) => {
    const { step, tilt } = fanPlace(i, shown, spread)
    return `translateX(${px(step)}px) rotate(${tilt}deg)`
  }
  return (
    <div
      className="byd-hand"
      data-zone={zone.id}
      data-count={count}
      data-rot={rot}
      data-count-side={countAt}
      data-folded={folded ? 'true' : undefined}
      style={{ left, top, transform: `rotate(${rot}deg)`, ['--seat' as string]: color, ['--hand-unrot' as string]: `${-rot}deg`, ['--hand-drop' as string]: `${px(HAND_COUNT_MM)}px`, ['--hand-lift' as string]: `${px(HAND_COUNT_ABOVE_MM)}px` }}
    >
      <div className="byd-hand-fan">
        {folded ? null : cards ? (
          cards.slice(0, FAN_MAX).map((c, i) => (
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
        ) : (
          Array.from({ length: fan }, (_, i) => <i key={i} className="byd-back" style={{ ...box, transform: place(i, false) }} />)
        )}
      </div>
      <b className="byd-hand-count">{count}</b>
    </div>
  )
}
