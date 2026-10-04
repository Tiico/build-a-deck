import { Suspense, forwardRef, lazy, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent, type ReactNode, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent, type CSSProperties } from 'react'
import { BackTexture, Texture } from './Texture.js'
import type { Intent, Presence, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'
import type { Peer, Pulse, Recent } from './presence.js'
import { FAN, useStill, type Shuffle } from './shuffle.js'
import { hue } from './hue.js'
import { seatColor } from './seatColor.js'
import { feltScale, fitScale, leaningSquare, lensReach, woodLayout, TOUCH_PX, TV_AIR_PX } from './fit.js'
import { CAMERA_MIN_MM, CAMERA_STEP, activeBounds, cameraOf, centre, fitFloor, frameRect, overscanPx, pad, panBy, reachOf, same, shownRect, tween, union, zoomAround, type Rect, type Size } from './camera.js'
import { recallCamera, rememberCamera, type CameraMemory } from './cameraMemory.js'
import { flatToTable, tiltedToTable, unrotate, type Point, type Rotation } from './geometry.js'
import { CARD_MM, TOKEN_MM, absoluteOf, besidePile, dropIntents, handBound, nobodysHand, type Drag, type DragTarget } from './drop.js'
import { isCounter, standIn } from '../components.js'
import { cardWord, counterActs, drawOne, feltShortcuts, flipUnder, labelOf, modifierHeld, ownerOf, thingsOn, type Act } from './keyboard.js'
import { ShortcutHelp } from './ShortcutHelp.js'
import { CounterEntry } from './CounterEntry.js'
import { useSay } from '../status/StatusLive.js'
import { DEFAULT_TIMING } from '../status/connection.js'
import { RadialMenu, type RadialItem } from './RadialMenu.js'
import { ActionSheet } from './ActionSheet.js'
import { compileStart, startsAt } from './actions.js'
import { Question } from '../editor/Question.js'
import { DragDoor } from '../editor/DragDoor.js'
import { RING_AIR, RING_REACH, ringCentre } from './ring.js'
import { liftBox, type Edges } from './lift.js'
import { useSmallestPt } from './smallest.js'
import { Lifted } from './Lifted.js'
import { FAN_MAX, HAND_CARD_BOX, HAND_COUNT_ABOVE_MM, HAND_COUNT_MM, countSide, edgeRotation, fanPlace, feltWithHands, handAt, handBand, handCountAt, handExtent, handRotation, type TableMode } from './hand.js'
import { gapAbove, nameAt } from './labels.js'
import { placeNames } from './freeSide.js'
import { useT, type Key, type T } from '../i18n/index.js'

// Startbrickans mått och plats i filtens egna millimeter (#451). Den skalar med filten som en
// hög gör, så den är lika stor i förhållande till korten på varje skärm.
//
// `below` är hur långt under filtens mitt dess överkant ligger, och talet är mätt och inte valt.
// Prototypen la brickan i bandet *mellan* högarna; på ett riktigt bord finns inte det bandet.
// Receptet ställer draghögen och kasthögen på (±140, 0), och ett kort är 63 mm brett, så mellan
// dem är det 217 mm — mindre än brickan — och den låg ovanpå båda, sett i den byggda produkten.
//
// Bandet under högarna är fritt vid varje platsantal receptet lägger: kortens underkant är 44 mm
// från mitten, och närmaste zon någon plats äger — ytan framför den — börjar 230 mm ut. Brickan
// ligger mitt i det bandet, alltså 101 mm ned, och tar 72 mm av de 186 som finns.
const START_MM = { w: 260, h: 72, below: 101 }

// Varför starten inte går att köra, i ringens egna ord: det är samma maskin som svarar, så det
// ska vara samma mening. Ett steg som frågar efter ett tal har ingen att fråga i det ögonblick
// spelet ska börja, och säger det i stället för att gissa ett tal.
const whyKey = (made: { ok: false; why: string } | { ok: false; asks: string } | { ok: true }): Key =>
  ('why' in made ? `ring.action.why.${made.why}` : 'ring.action.why.asks') as Key

// Kamerans hörn kommer när vyn blir egen (#325, #346:s väg). Klungan finns bara medan kameran är
// manuell, vilket den inte är när sidan målas — så dess stilmall, `camera-hand.css`, reser i den
// här chunken i stället för i det ark den första bildrutan väntar på. Reserven är tom med flit:
// bygget lägger chunkens ark bredvid dess kod, så `import()` blir klar först när båda är framme,
// och klungan kan därför inte visas oklädd. En platshållare vore precis den oklädda blink flytten
// inte får kosta.
const CameraControls = lazy(() => import('./CameraControls.js').then((m) => ({ default: m.CameraControls })))
const LensEntry = lazy(() => import('./CameraControls.js').then((m) => ({ default: m.LensEntry })))

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
// `onTable` says whether a point on the screen lies on the table's own picture — the felt and the
// wooden frame it lies in — as opposed to the dark around it and whatever stands beside it (#484).
// `cardPx` is a card on the felt as it is drawn now, in pixels across (#484 fynd 4).
export type TableHandle = { toTable(clientX: number, clientY: number): Point | null; onTable(clientX: number, clientY: number): boolean; cardPx(): number }
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
// Vem som kör kameran på en yta (C5, #325).
export type CameraDrive = 'follow' | 'hand'

export type FeltKeyboard = {
  // Every node the keyboard may stand on, keyed `card:<id>`, `counter:<id>` or `pile:<zone>`,
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
  // Which piles are being shuffled right now (L35): the fan is played on each, by the log line
  // that says so and never by a difference between two snapshots. `useShuffles` derives it.
  shuffles?: readonly Shuffle[] | undefined
  onPresence?: ((p: Presence) => void) | undefined
  // Vem som får köra kameran på den här ytan (C5, #325). `follow` är TV:n: den ramar in det som
  // är i spel av sig själv, och vem som helst kan ta över vyn. `hand` är observatören: ingen
  // automatisk inramning, men samma hjul, samma grepp och samma väg hem. Editorns Bord-flik ger
  // ingendera, och telefonen har ingen kamera alls.
  camera?: CameraDrive | undefined
  // Under vilket namn den här skärmen minns sin egen vy (#325). Bordets id, eftersom en bild i
  // bordets millimeter bara betyder något på det bord den mättes på. Utan namn minns skärmen
  // ingenting, vilket är vad editorns miniatyrer och telefonen vill.
  remember?: string | undefined
  // What the pointer is over (C): the TV shows it large beside the table. Null when it leaves.
  onInspect?: ((c: VisibleComponentState | null) => void) | undefined
  // A card tapped to be looked at (#485): on a screen with no pointer to rest on it, pointing
  // cannot say which card the eye is on, so a tap does.
  onPick?: ((c: VisibleComponentState) => void) | undefined
  // Where «Titta» goes on a screen whose large view is the room's (#508): the TV holds a face it
  // sees up over the felt for everyone. A back keeps K8's view, which is all a back has to say.
  onShow?: ((c: VisibleComponentState) => void) | undefined
  // A screen that watches and never touches (C8, #511): the observer. It reads the way the table
  // screen does — a resting mouse or a press lifts the card beside itself (K26) — and asks nothing,
  // since there is nothing it may do; a card in a hand reads like any other, because seeing the
  // hands is the whole of the role.
  watch?: boolean | undefined
  size?: Size | undefined
  glideMs?: number | undefined
  // Room kept clear around the table when it is fitted, in table millimetres (L30, #316). The
  // editor's Bord tab draws where a pile's actions lay their cards, and off the table that
  // outline is the one thing the felt has to say — so the felt leaves a card's width of dark
  // around the table, or the warning is clipped in the case it exists for. Nothing else asks
  // for any: the air the two fits leave is their own, in pixels, and is not this.
  margin?: number | undefined
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
  // Where a card carried from outside the felt would land, as the page that carries it answered
  // (#484 fynd 4): `/online`'s own hand is drawn beside the felt, so its drag is never the felt's.
  // A hand is lit the way the felt's own drags light one (K24); an area or a pile is marked.
  aimed?: { zone: string; cards: number } | null | undefined
  // A lens on the felt in table mode (#502, beslut B, prototyp 36): at rest the whole table as the
  // fit draws it; a step in lands where a card is K9's 45 px, and the whole table is one press away.
  lens?: boolean | undefined
  // The room's own television (#573, beslut C, K26): each seat's words on one plate beside its
  // zones, at the floor's 24 px — its name, its hand and its counters — and the seat's zone names,
  // the hand's badge and the chip's figure left off, since the plate says them. Not the observer's
  // screen, which is read at a desk and not from the sofa.
  forTheRoom?: boolean | undefined
  // The Bord tab's quiet felt (#581, beslut B): when given, the felt names only the zones in it —
  // the ones the list or the felt is pointing at, has focus on or has chosen — and the list beside
  // it is the legend for the rest. The names are still drawn and only hidden, so a name that is lit
  // stands where K19 puts it.
  lit?: ReadonlySet<string> | undefined
}

// The short side a card on the felt is brought to by the lens's first step in (K9).
const LENS_CARD_PX = 45
// How far past that the lens goes in, as a multiple of it.
const LENS_MAX = 2.5

const HOLD_MS = 350
// How long after a click the press that follows it is still the other half of a double one. The
// browser has already decided it is a double press before it fires `dblclick`; this only rules
// out a stale memory of something clicked a while ago.
const DOUBLE_MS = 700
const POINT_MS = 450
const DRAG_MM = 4
// How far the pointer must move off the point a drag let go at before resting on a card reads it.
const DRAG_PX = 4

// A card being read on the felt (K26): what it is, what a second press asks about, and where it
// lay on the screen when it was lifted, which is what the lift is placed beside.
type Lift = { c: VisibleComponentState; target: DragTarget; at: Edges; standIn: boolean }
const edgesOf = (el: Element): Edges => {
  const r = el.getBoundingClientRect()
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
}
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
// The felt's width across the reader's view under which its names are set at the felt's tightest
// (K19, #76): two seats facing each other across the felt each want about 76 px for a name, and the
// shared piles and their count badges stand between them. It is the same number `table.css` hides
// the played felt's names at. Where a name stands is the same rule on every felt (#685): beside its
// zone as K19 says, then a free side (`placeNames`).
const TIGHT_FELT_PX = 460
const CAMERA_PAD_MM = 60
const GLIDE_MS = 700
// Vad en piltangent flyttar kameran, i skärmens egna pixlar (#325): samma steg prototypen mättes
// med, så tangentbordets väg och handens väg rör bilden lika långt.
const CAMERA_KEY_PX = 40
const ARROW_WAY: Record<string, readonly [number, number] | undefined> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

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

export const TableRenderer = forwardRef<TableHandle, TableRendererProps>(function TableRenderer({ view, mode, scale: fixedScale, rotate = 0, faces, onAct, peers = [], pulses = [], recent = [], shuffles = [], onPresence, camera, remember, onInspect, onPick, onShow, watch = false, size: fixedSize, glideMs = GLIDE_MS, margin = 0, overlay, back, seatNames = false, me = null, foldHand = null, keyboard, aimed = null, lens = false, forTheRoom = false, lit }, ref) {
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
  // The margin asked for, around the *floor* and in its own millimetres, so it shrinks with it.
  // A hand that already hangs that far past the rim has made the room by itself, and the air the
  // fit leaves in pixels is not added to it either: both are dark between the table and the
  // frame, so the felt stands the larger of the two from the frame and not their sum. Added up,
  // at 1280 × 800, the felt lost an eighth and two names met (#43).
  const floorDrawn = rotate % 180 === 0 ? { w: floorRect.w, h: floorRect.h } : { w: floorRect.h, h: floorRect.w }
  const room = { w: Math.max(drawn.w, floorDrawn.w + 2 * margin), h: Math.max(drawn.h, floorDrawn.h + 2 * margin) }
  const withMargin = (fitted: number): number => (margin > 0 && size ? Math.min(fitted, fitScale(room, size, 0)) : fitted)
  // How the felt meets its frame is one rule per mode, and each leaves the air its own furniture
  // needs (K9, K17): the felt table lies on wood that stands on the dark and holds back to its
  // share of it, the TV has no rim and leaves only what a hand's count hangs out into. They were
  // one number until #76 measured what that cost a phone.
  const fitted = size === null ? null : size.w > 0 && size.h > 0 ? withMargin(mode === 'table' ? feltScale(drawn, size) : fitScale(drawn, size, TV_AIR_PX)) : 1

  // Inspection (K8): "Titta" in the ring, private to this screen, until tapped away.
  const [held, setHeld] = useState<VisibleComponentState | null>(null)
  // Reading a card on the felt (K26, #509): the first press lifts it up beside itself in the
  // window's size, and the ring is behind a second press. A card that is pointed at with a mouse is
  // lifted for as long as the mouse stays on it (`pointed`); a press keeps it lifted (`read`) until
  // the bare felt is pressed or Escape. The TV reads through its own INSPEKTION (K8, #508); the
  // observer's felt is drawn as the TV's and reads as the table's (#511).
  const lifts = mode === 'table' || watch
  const [read, setRead] = useState<Lift | null>(null)
  const [pointed, setPointed] = useState<Lift | null>(null)
  // Where a drag let go, until the pointer has moved on from it. The card let go lies under a
  // pointer that has not moved, and the browser tells it the pointer entered it when the capture
  // is released — which is not somebody pointing at it (#509).
  const letGo = useRef<{ x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<Live | null>(null)
  const [settling, setSettling] = useState<Settled | null>(null)
  const [ring, setRing] = useState<Ring | null>(null)
  // "Sätt värde…" (#67): the chip whose value is being said outright, on this screen's own keys.
  const [entry, setEntry] = useState<VisibleComponentState | null>(null)

  // The camera (C5): what is in play, or the view somebody took over. A manual view **stands**
  // until it is put back (#325): one who zooms in on a pile does it to see something, and a
  // camera that takes the picture back while she is looking is a camera working against her.
  // It holds still while something is dragged, since the pointer's mapping was fixed when the
  // drag began.
  //
  // Två roller, och skillnaden mellan dem är inramningen och ingenting annat: `driving` är vem
  // som får ta över vyn — TV:n och observatören — och `following` är vem kameran ramar in åt.
  // Ett kvartsvridet bord är undantaget: kamerans värld placeras i oroterade pixlar, så ett varv
  // och en kamera ritar inte samma bild. Det gäller bara observatören i ett stående fönster,
  // alltså en telefon, och telefonen har ingen kamera ändå (C5).
  const drivable = camera !== undefined && mode === 'tv' && size !== null && size.w > 0 && size.h > 0 && rotate === 0
  const following = drivable && camera === 'follow'
  // Vad den här skärmen minns om sin egen kamera, och inget annat: en vy är ingen händelse (L4).
  const recalled = useRef<CameraMemory | null>(null)
  if (recalled.current === null) recalled.current = remember === undefined ? { cam: null, folded: false } : recallCamera(remember)
  const [manual, setManual] = useState<Rect | null>(recalled.current.cam)
  const zoomTo = (rect: Rect | null) => setManual(rect)
  const inPlay = drivable ? activeBounds(view) ?? floorRect : null
  // What the picture owes the hands' counts (#413). The camera frames what is in play, and a hand
  // is not that — it sits at the rim, always, so framing hands would mean framing the rim. But the
  // count badge is not a hand either: it is the number a person across the room reads to know what
  // they are playing against, and at 1920 × 1080 the top seat's was cut in half by the edge of the
  // screen. So the picture is told the one thing about it a picture in millimetres can be told —
  // the line it hangs from (`handCountAt`) — and leaves a pill's air past that line, which is what
  // `TV_AIR_PX` is for and the whole of what it is for. What the badge takes past the line is
  // pixels, and no measure of the felt can own them.
  // The line past the rim is still held on the television, where the count now hangs inward over
  // its fan (#482 fynd 5 B): it is what keeps the fans themselves whole on the screen.
  const counts = union(hands.map((z) => ({ ...handCountAt(z, floor, handRot(z), folded(z)), w: 0, h: 0 })))
  const keepCounts = counts ? { rect: counts, margin: TV_AIR_PX } : undefined
  // How far the camera may reach: the table, anything in play that lies past its rim (#20), and
  // the counts at the rim, which are as much a part of the table as the felt is. The counts belong
  // here as well as in the framing above, or the two would disagree: a view that is pulled back to
  // hold them would be wider than the widest a hand may zoom out to, and the first touch of the
  // wheel would jump the picture inward. The padding around what is in play is room to breathe,
  // not content, so it may be cropped.
  const reach = union([reachOf(floorRect, inPlay), ...(counts ? [counts] : [])]) ?? floorRect
  // The camera follows only on the TV (`following`), and a TV may hide the picture's outer edge,
  // so what it frames by itself stands the overscan margin inside the frame (#322). The observer
  // shares the mode but not the camera, and is fitted below with the air of its own.
  const auto = following && inPlay && size ? frameRect(pad(inPlay, CAMERA_PAD_MM), size, reach, CAMERA_MIN_MM, overscanPx(size), keepCounts) : null
  // Bilden som faktiskt ritas. En bild som hämtats ur minnet mättes i ett fönster som kan ha
  // haft en annan form sedan dess, så den passas in i den ram som finns nu — för allt som just
  // ställts in av en hand är det samma rektangel tillbaka, eftersom både `zoomAround` och
  // `panBy` redan lämnar ifrån sig en som ligger innanför exakt de här gränserna.
  const viewing = manual && size ? frameRect(manual, size, reach, CAMERA_MIN_MM) : null
  const heldCamera = useRef<Rect | null>(null)
  if (!drag) heldCamera.current = viewing ?? auto
  // A reader who has asked for less motion is not asked to watch the felt pan and zoom when somebody
  // else plays (#560 P-13, WCAG 2.3.3): the camera stands where it is going at once, as it does on
  // its first frame. The same `STILL` the shuffle's fan answers to (L35), asked once for the felt
  // and not once per pile.
  const still = useStill()
  const cam = useGlide(drivable ? heldCamera.current : null, still ? 0 : glideMs)
  const placed = drivable && cam ? cameraOf(cam, size, floorRect) : null
  // The lens (#502): a multiple of the fit and an offset of the wood in its frame, in pixels. It is
  // the table mode's own, where the felt is tilted and turned to the seat and the television's
  // camera — flat, in unturned millimetres — cannot go. Scaling the fit and moving the wood is what
  // keeps everything else true: every measure on the felt is `px`, and the pointer's mapping reads
  // the wood where it is laid out.
  const [lensAt, setLensAt] = useState<{ k: number; x: number; y: number }>({ k: 1, x: 0, y: 0 })
  // Whether the corner's focus is to be handed over when one of its two forms takes the other's
  // place: only when the focus stood in the corner, so a wheel on the felt takes nothing.
  const lensHandOver = useRef(false)
  const lensOn = lens && mode === 'table' && fixedScale === undefined && fitted !== null && size !== null && size.w > 0 && size.h > 0
  const zoomed = lensOn ? lensAt.k : 1
  // The felt as it is fitted to its frame, before any camera or lens: the scale the zones' names
  // choose their sides at (#685).
  const fit = fixedScale ?? fitted ?? 1
  const measured = fixedScale !== undefined || (size !== null && (!following || placed !== null))
  // Where the zones' names stand is decided once, at the fitted scale, and then stays put while the
  // camera or the lens moves (#43, #685): a name is hung from a corner of its own zone, which the
  // felt scales, and stepped off it in screen pixels, which it does not. `namesAt` is the felt the
  // names were last laid out for; a felt that differs from it — another table, another window,
  // another zone lit on the Bord tab, a name that changed its size — is drawn once at its fitted
  // scale, the names are laid out on it (`placeNames`), and the next drawing, still before
  // anything is painted, is the camera's again.
  const [namesAt, setNamesAt] = useState<string | null>(null)
  const [namesResized, setNamesResized] = useState(0)
  const namesKey = measured
    ? JSON.stringify([namesResized, mode, rotate, Math.round(fit * 1e4), forTheRoom, [...(lit ?? [])].sort(), view.zones.map((z) => [z.id, z.kind, z.name, z.geometry.x, z.geometry.y, z.geometry.w, z.geometry.h]), view.seats.map((s) => s.name)])
    : null
  const liveScale = (fixedScale ?? placed?.scale ?? fitted ?? 1) * zoomed
  const deciding = namesKey !== null && namesAt !== namesKey && liveScale !== fit
  const scale = deciding ? fit : liveScale
  // What the names were measured by when they were last laid out, so that a name that changes its
  // size afterwards — a face arriving, a wider one on another machine — is laid out again.
  const namesWatch = useRef<ResizeObserver | null>(null)
  useLayoutEffect(() => {
    const felt = table.current
    if (!felt || namesKey === null || namesAt === namesKey) return
    placeNames(felt)
    const spans = [...felt.querySelectorAll<HTMLElement>(':scope > .byd-zone > span')]
    const measure = () => spans.map((el) => `${el.scrollWidth}x${el.offsetHeight}`).join()
    const laidOutFor = measure()
    namesWatch.current?.disconnect()
    namesWatch.current = null
    if (typeof ResizeObserver !== 'undefined') {
      const watch = new ResizeObserver(() => {
        if (measure() !== laidOutFor) setNamesResized((n) => n + 1)
      })
      for (const el of spans) watch.observe(el)
      namesWatch.current = watch
    }
    setNamesAt(namesKey)
  }, [namesKey, namesAt])
  useEffect(() => () => namesWatch.current?.disconnect(), [])
  const live = useRef<Live | null>(null)
  const toTable = useRef<((cx: number, cy: number) => Point) | null>(null)
  // Opening the ring is one act however it was asked for, so both ways in pull it inside the
  // window together: a card at the rim must not put Vänd past the edge of the screen.
  const openRing = (target: Ring['target'], x: number, y: number) => {
    const room = typeof window === 'undefined' ? null : { w: window.innerWidth, h: window.innerHeight }
    setRing({ target, ...(room ? ringCentre({ x, y }, room) : { x, y }) })
  }
  // What a press on a thing reads, when it reads anything: a card whose face this screen sees,
  // loose or on top of a pile. A face-down card or a hidden pile has nothing to read, and a press
  // on it asks what may be done with it, as it always has (K14).
  const readableOf = (target: DragTarget): VisibleComponentState | null => {
    const pile = target.kind === 'pileTop' ? zoneById.get(target.pile) : undefined
    const c = target.kind === 'card' ? byId.get(target.id) : pile ? byId.get(topIdOf(pile) ?? '') : undefined
    return c && c.cardRef !== null ? c : null
  }
  // The first press reads and the second asks (K26). Answers whether the press was taken as a
  // reading, so the caller knows not to open the ring.
  const readFirst = (target: DragTarget, at: Edges): boolean => {
    if (!lifts) return false
    const c = readableOf(target)
    if (!c || read?.c.id === c.id) return false
    setRead({ c, target, at, standIn: false })
    setPointed(null)
    return true
  }
  const putDown = () => {
    setRead(null)
    setPointed(null)
  }
  // Asking puts down what is read: the ring's verbs are not drawn over the text being read.
  const ask = (target: DragTarget, x: number, y: number) => {
    putDown()
    openRing(target, x, y)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- checks every render whether the table has moved the dropped card; it stops itself
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
  //
  // And it is said (#482): a card that went back without a word read as a drop refused, and then
  // happened after all when a quiet line came back.
  const say = useSay()
  useEffect(() => {
    if (!settling) return
    const timer = setTimeout(() => {
      setSettling(null)
      say?.('polite', t('drop.unanswered'))
    }, DEFAULT_TIMING.slowAfterMs)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the wait starts over only with another drop; what is said is said as it stands
  }, [settling])
  const px = (mm: number) => mm * scale
  // How wide the felt is drawn across the reader's own view (C5). It is the axis a name at a side
  // rim reaches along, and the one thing the stylesheet cannot ask for itself: the felt's own box
  // keeps the floor's shape and is then turned, so a container query on it measures the other
  // side. Under `TIGHT_FELT_PX` the felt is smaller than the names it carries and draws them at
  // its own tightest (K19, #76) — which in practice is the observer on a phone (C8, L12).
  // It is the felt as fitted that is tight, and not the picture a camera has zoomed: a name that
  // changed its size when the camera moved would change its side with it (#43, #685).
  const feltWidePx = fit * (rotate % 180 === 0 ? floor.geometry.w : floor.geometry.h)
  const tight = mode === 'tv' && measured && feltWidePx > 0 && feltWidePx < TIGHT_FELT_PX
  const left = (mmX: number) => px(mmX - floor.geometry.x)
  const top = (mmY: number) => px(mmY - floor.geometry.y)
  // Spelstarten (#451, prototypen 2026-09-22, förslag A). Den ligger på filten som en fysisk
  // giv-bricka och inte i en krom: filten är höjdbunden (K9), så en rad över eller under den
  // hade kostat kortstorlek på varje yta, och en kontroll i sändningens spalt hade inte funnits
  // på filtens egen skärm. Brickan är samma sak på varje yta, och syns från andra sidan rummet.
  //
  // En filt där ingen hög bär en startåtgärd ritar ingen bricka alls — samma regel som K14 ger
  // ringen: en ring utan verb öppnas inte, och ett kommando utan något att göra är samma fel.
  const start = onAct && startsAt(view).length > 0 ? compileStart(view) : null
  // Ett andra tryck mitt i spelet är hur en ny giv ges, och det ska gå (K23) — men inte av
  // misstag, eftersom det drar tillbaka varje hand och blandar om leken. Frågan ställs bara när
  // något faktiskt hänt vid bordet; `view.played` är den uppgiften, och den räknar inte den som
  // bara satt sig (#452).
  const [askingStart, setAskingStart] = useState(false)
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
  const seatIndex = (id: string | undefined) => Math.max(0, view.seats.findIndex((s) => s.id === id))
  const ownedBySeat = (zone: string) => view.zones.find((z) => z.id === zone)?.owner !== undefined
  const seatName = (id: string | undefined) => view.seats.find((s) => s.id === id)?.name ?? id ?? ''
  const colourOf = (seat: string | null) => (seat === null ? TABLE_GREY : seatColor(seatIndex(seat)))
  const carried = new Map(peers.filter((p) => p.drag).map((p) => [p.drag?.component ?? '', p]))
  const movedBy = new Map(recent.map((r) => [r.component, r.seat]))
  const shuffling = new Map(shuffles.map((s) => [s.pile, s.seq]))

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
  // On the table as it is painted: inside the frame, and on the wood once the tilt is undone. The
  // wood is the frame's own plane, so its box before the tilt is the whole of the question; on the
  // television there is no wood, and the felt is the table.
  const onTable = (cx: number, cy: number): boolean => {
    const f = frame.current
    const w = wood.current
    const t = table.current
    if (!f || !w || !t) return false
    const fr = f.getBoundingClientRect()
    // A frame that has not been laid out has nothing to say, and a missing answer never takes a
    // play away — the same reading `board` and `column` make of a window not yet measured.
    if (fr.width === 0 || fr.height === 0) return true
    if (cx < fr.left || cx > fr.right || cy < fr.top || cy > fr.bottom) return false
    if (mode === 'tv') {
      const tr = t.getBoundingClientRect()
      return cx >= tr.left && cx <= tr.right && cy >= tr.top && cy <= tr.bottom
    }
    const u = tiltedToTable({ frame: { w: fr.width, h: fr.height }, wood: { left: w.offsetLeft, top: w.offsetTop, w: w.offsetWidth, h: w.offsetHeight } }, cx - fr.left, cy - fr.top)
    return Math.abs(u.x) <= w.offsetWidth / 2 && Math.abs(u.y) <= w.offsetHeight / 2
  }
  useImperativeHandle(ref, () => ({ toTable: (cx, cy) => mapper()?.(cx, cy) ?? null, onTable, cardPx: () => px(CARD_MM.w) }))

  const down = (e: RPointerEvent, target: DragTarget) => {
    if (!onAct) return
    // En panorering är kamerans och inte kortets, hur den än råkar börja ovanpå ett (#325). Den
    // lämnas därför i fred hela vägen upp till ramen, som är den som håller i greppet.
    if (isPan(e)) return
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
    const edges = edgesOf(el)
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null
      if (!live.current || live.current.started) return
      live.current = null
      setDrag(null)
      if (typeof el.releasePointerCapture === 'function' && typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
      if (!readFirst(held, edges)) ask(held, clientX, clientY)
    }, HOLD_MS)
  }
  const move = (e: RPointerEvent) => {
    const d = live.current
    const map = toTable.current
    if (!d || !map) return
    const at = map(e.clientX, e.clientY)
    const started = d.started || Math.hypot(at.x - d.grab.x, at.y - d.grab.y) > DRAG_MM
    if (started) clearHold()
    // A drag moves the thing and reads nothing: the lift would stand over where it is going.
    if (started && !d.started) putDown()
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
  const release = (asked: Point | null, edges: Edges | null = null) => {
    const d = live.current
    clearHold()
    live.current = null
    setDrag(null)
    if (d?.started && d.target.kind === 'card') onPresence?.({ kind: 'drop' })
    if (d?.started && asked) letGo.current = asked
    clicked.current = null
    if (!d || !onAct) return
    if (!d.started) {
      if (asked) {
        clicked.current = { target: d.target, at: Date.now() }
        if (!readFirst(d.target, edges ?? { left: asked.x, right: asked.x, top: asked.y, bottom: asked.y })) ask(d.target, asked.x, asked.y)
      }
      return
    }
    const intents = dropIntents(view, d, mode)
    if (intents.length === 0) {
      // A hand nobody sits at takes no card (#482 fynd 7): the card is already back where it was,
      // and it is said why, or the felt would seem not to have heard the drop.
      const empty = nobodysHand(view, d, mode)
      const seat = empty === null ? undefined : view.zones.find((z) => z.id === empty)?.owner
      if (seat !== undefined) say?.('polite', t('drop.nobody', { seat: view.seats.find((s) => s.id === seat)?.name ?? seat }))
      return
    }
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
  const up = (e: RPointerEvent) => release({ x: e.clientX, y: e.clientY }, edgesOf(e.currentTarget as HTMLElement))
  const cancel = () => release(null)
  // Escape while something is carried takes the drag back (#681, K14), as the editor's (#142) and
  // the hand's (#484) do: the thing is drawn where it lay again, nothing is sent, and the release
  // that follows finds no drag and so neither drops nor asks. The pointer keeps its capture, so
  // that release still comes here and not to whatever happens to be under it.
  const callOff = () => {
    const d = live.current
    clearHold()
    live.current = null
    setDrag(null)
    if (d?.started && d.target.kind === 'card') onPresence?.({ kind: 'drop' })
  }
  const handlers = (target: DragTarget) => ({ onPointerDown: (e: RPointerEvent) => down(e, target), onPointerMove: move, onPointerUp: up, onPointerCancel: cancel })
  // Pointing at a card is not touching it: it only says what the screen should show large.
  const inspects = (c: VisibleComponentState | undefined) =>
    onInspect && c ? { onPointerEnter: () => onInspect(c), onPointerLeave: () => onInspect(null), ...(onPick ? { onClick: () => onPick(c) } : {}) } : undefined
  // A mouse resting on a card reads it (K26), for as long as it rests there. A finger has no
  // resting: its enter is the start of a press, and the press is what reads.
  const reads = (target: DragTarget): Pointing | undefined =>
    lifts && (onAct || watch)
      ? {
          onPointerEnter: (e) => {
            if (!e || e.pointerType !== 'mouse' || live.current) return
            const from = letGo.current
            if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) < DRAG_PX) return
            letGo.current = null
            const c = readableOf(target)
            if (c) setPointed({ c, target, at: edgesOf(e.currentTarget as HTMLElement), standIn: false })
          },
          onPointerLeave: () => setPointed(null),
        }
      : undefined
  // A press on a screen that watches only reads (#511): it lifts a card whose face the screen sees,
  // and does nothing else — there is no drag to start and no ring to ask.
  const watches = (target: DragTarget): Handlers | undefined =>
    watch && !onAct
      ? {
          onPointerDown: (e) => {
            if (isPan(e)) return
            e.stopPropagation()
            const c = readableOf(target)
            if (!c) return
            setPointed(null)
            setRead({ c, target, at: edgesOf(e.currentTarget as HTMLElement), standIn: false })
          },
          onPointerMove: () => undefined,
          onPointerUp: () => undefined,
          onPointerCancel: () => undefined,
        }
      : undefined
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
          onPointerEnter: (e) => {
            a.onPointerEnter(e)
            b.onPointerEnter(e)
          },
          onPointerLeave: (e) => {
            a.onPointerLeave(e)
            b.onPointerLeave(e)
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

  // Att ta över vyn (C5, #325): hjulet eller nypet kring pekaren, dubbeltryck nära och tillbaka,
  // mittenknappen eller Space och drag, och ± och piltangenterna för den som inte pekar. Vad som
  // bes om står kvar tills det lämnas tillbaka. En zoomning för hand får gå in i
  // overscanmarginalen (#322): den binder vad kameran ramar in av sig själv, inte vad någon ber
  // att få se.
  //
  // Vyn en hand utgår från. TV:n har alltid en kamera att räkna från; observatören har ingen
  // förrän hon ber om en, och då är det den bild hon redan tittar på som är utgångsläget.
  const standing = (): Rect | null => (drivable && size ? (viewing ?? cam ?? shownRect(floorRect, size, fitted ?? 1)) : null)
  // De två stegen, sagda en gång: ett steg närmare eller längre bort kring bildens mitt, och ett
  // steg åt sidan. Knapparna i hörnet och tangentbordet ber om exakt samma sak.
  const stepZoom = (factor: number) => {
    const from = standing()
    if (from && size) setManual(zoomAround(from, centre(from), factor, size, reach, CAMERA_MIN_MM))
  }
  const stepPan = (dx: number, dy: number) => {
    const from = standing()
    if (!from || !size) return
    const per = size.w / from.w
    setManual(panBy(from, (dx * CAMERA_KEY_PX) / per, (dy * CAMERA_KEY_PX) / per, size, reach))
  }
  const wheel = (e: RWheelEvent) => {
    const map = mapper()
    const from = standing()
    if (!from || !size || !map) return
    zoomTo(zoomAround(from, map(e.clientX, e.clientY), Math.exp(e.deltaY * 0.002), size, reach, CAMERA_MIN_MM))
  }
  const doubleTap = (e: RMouseEvent) => {
    const map = mapper()
    if (!drivable || !size || !map) return
    zoomTo(viewing ? null : zoomAround(fitFloor(reach, size, overscanPx(size)), map(e.clientX, e.clientY), 1 / 2.6, size, reach, CAMERA_MIN_MM))
  }

  // Panorering (#325): mittenknappen och drag, som i Figma och Miro. Bordet följer handen, och
  // markören visar grepp medan det pågår. Greppet tas på ramen och inte på filten, eftersom det
  // som flyttar sig är kameran och inte något som ligger på bordet.
  const panning = useRef<{ x: number; y: number; from: Rect } | null>(null)
  const [grabbing, setGrabbing] = useState(false)
  // Space + drag är det andra greppet, för den som saknar hjul. Tangenten är inte filtens egen:
  // ett fokuserat kort aktiveras med Space (K17), och det vinner. Två saker säger det — noden
  // har redan sagt nej till pressen genom att ta den (`defaultPrevented`), och den bär `data-kbd`
  // — och båda läses, eftersom den första bara gäller de noder tangentbordsspåret har namngett.
  const [armed, setArmed] = useState(false)
  const spaced = useRef(false)
  // Stegen som de är vid pressen, och inte som de var när lyssnaren hängdes upp: lyssnaren
  // sitter på fönstret och lever längre än ett omritande.
  const stepNow = useRef({ stepZoom, stepPan })
  stepNow.current = { stepZoom, stepPan }
  useEffect(() => {
    if (!drivable) return
    // En tangent som skrivs i ett fält är fältets, och en som trycks medan en panel står öppen
    // är panelens.
    const typing = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest('[role="dialog"]') !== null)
    // Och en tangent som trycks på ett fokuserat kort är kortets (K17). Space aktiverar det, och
    // piltangenterna går genom roverlistan; ingen av dem är kamerans så länge något står där.
    const theirs = (target: EventTarget | null): boolean =>
      typing(target) || (target instanceof HTMLElement && target.closest('[data-kbd]') !== null)
    const hold = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.code === 'Space') {
        if (event.repeat || theirs(event.target)) return
        // Utan detta rullar sidan under filten i stället, vilket är vad Space gör som standard.
        event.preventDefault()
        spaced.current = true
        setArmed(true)
        return
      }
      // Vägen in för den som inte har mus. Plus och minus är ingen annans på filten, så de går
      // även med ett kort i fokus — annars fanns ingen väg alls dit klungans knappar står.
      if (typing(event.target)) return
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        stepNow.current.stepZoom(1 / CAMERA_STEP)
        return
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        stepNow.current.stepZoom(CAMERA_STEP)
        return
      }
      const way = ARROW_WAY[event.key]
      if (!way || !event.shiftKey || theirs(event.target)) return
      event.preventDefault()
      stepNow.current.stepPan(way[0], way[1])
    }
    const release = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      spaced.current = false
      setArmed(false)
    }
    // Ett fönster som tappar fokus med tangenten nere får aldrig sitt `keyup`, och en filt som
    // står kvar i grepp efteråt är en filt som inte går att spela på.
    const drop = () => {
      spaced.current = false
      setArmed(false)
    }
    window.addEventListener('keydown', hold)
    window.addEventListener('keyup', release)
    window.addEventListener('blur', drop)
    return () => {
      window.removeEventListener('keydown', hold)
      window.removeEventListener('keyup', release)
      window.removeEventListener('blur', drop)
      drop()
    }
  }, [drivable])
  // Vem som helst som håller mitten inne panorerar; ett kort som råkar ligga under handen är
  // inte det som greppas, så kortets eget drag lämnar gesten i fred.
  const isPan = (e: { button: number }) => e.button === 1 || spaced.current
  const panDown = (e: RPointerEvent) => {
    const from = standing()
    if (!from || !isPan(e)) return
    e.preventDefault()
    panning.current = { x: e.clientX, y: e.clientY, from }
    setGrabbing(true)
    const el = e.currentTarget as HTMLElement
    if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId)
  }
  const panMove = (e: RPointerEvent) => {
    const held = panning.current
    if (!held || !size) return
    const per = size.w / held.from.w
    setManual(panBy(held.from, -(e.clientX - held.x) / per, -(e.clientY - held.y) / per, size, reach))
  }
  const panUp = () => {
    if (!panning.current) return
    panning.current = null
    setGrabbing(false)
  }

  // Klungan i hörnet (#325). Den finns bara medan vyn är egen, och hundra procent är vad kameran
  // hade visat av sig själv: den automatiska inramningen på TV:n, och hela räckvidden hos
  // observatören, som inte har någon.
  const [tucked, setTucked] = useState(recalled.current.folded)
  const asFramed = auto ?? (drivable && size ? fitFloor(reach, size) : null)
  const level = viewing && asFramed ? Math.round((asFramed.w / viewing.w) * 100) : 100
  // Och det skärmen ska minnas till nästa gång. Bilden nyckelas på sitt eget värde: samma
  // rektangel räknad om till ett nytt objekt är ingen ny bild att skriva ned.
  const lastAsked = useRef(manual)
  lastAsked.current = manual
  const remembering = manual ? `${manual.x},${manual.y},${manual.w},${manual.h}` : ''
  useEffect(() => {
    if (remember !== undefined) rememberCamera(remember, { cam: lastAsked.current, folded: tucked })
  }, [remember, remembering, tucked])
  // A double press turns over what was pressed (#224): the way in for a hand that cannot hold a
  // modifier down. It is read on the frame and not on the card, because by the time the second
  // press lands the ring the first one opened is covering the card — so the browser dispatches
  // its `dblclick` on the frame the two presses have in common, and the card is not in it. What
  // was pressed is therefore remembered, and the frame asks what it was.
  // The lens's own steps (#502). The first step in lands where a card on the felt is K9's 45 px;
  // steps after it go on by the camera's step, up to `LENS_MAX` of that; out, and the last step out
  // is the whole table again. A step is taken about a point on the screen — the pointer, or the
  // frame's middle for a button — and that point stays where it is while the felt grows around it.
  const lensFloor = lensOn && fitted ? Math.max(1, LENS_CARD_PX / (CARD_MM.w * fitted)) : 1
  const lensTo = (k: number, around?: { x: number; y: number }) => {
    lensHandOver.current = document.activeElement instanceof Element && document.activeElement.closest('.byd-camera-controls') !== null
    setLensAt((cur) => {
      if (k <= 1.001 || !size || !fitted) return { k: 1, x: 0, y: 0 }
      const f = frame.current?.getBoundingClientRect()
      const p = around && f ? { x: around.x - (f.left + f.width / 2), y: around.y - (f.top + f.height / 2) } : { x: 0, y: 0 }
      const x = p.x - ((p.x - cur.x) * k) / cur.k
      const y = p.y - ((p.y - cur.y) * k) / cur.k
      // Kept so the painted wood covers the frame where it can: a lens never drifts into the dark,
      // and reaches the tilted near rim (#504).
      const felt = rotate % 180 === 0 ? { w: floorRect.w, h: floorRect.h } : { w: floorRect.h, h: floorRect.w }
      const reach = lensReach(felt, size, fitted * k)
      return { k, x: Math.min(reach.x[1], Math.max(reach.x[0], x)), y: Math.min(reach.y[1], Math.max(reach.y[0], y)) }
    })
  }
  const lensStep = (dir: 1 | -1, around?: { x: number; y: number }) => {
    const k = lensAt.k
    lensTo(dir > 0 ? (k < lensFloor - 1e-3 ? lensFloor : Math.min(lensFloor * LENS_MAX, k * CAMERA_STEP)) : k / CAMERA_STEP, around)
  }
  const lensWheel = (e: RWheelEvent) => {
    if (drag) return
    const k = Math.min(lensFloor * LENS_MAX, Math.max(1, lensAt.k * Math.exp(-e.deltaY * 0.002)))
    lensTo(k, { x: e.clientX, y: e.clientY })
  }
  // A drag on the felt itself — not on anything that lies on it — moves an enlarged view (#502).
  const lensPan = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null)
  const onBare = (el: EventTarget) => el instanceof Element && !el.closest('[data-component], .byd-pile, .byd-hand, button, [role="button"], .byd-radial-backdrop')
  const lensDown = (e: RPointerEvent) => {
    if (!lensOn || lensAt.k <= 1 || e.button !== 0 || !onBare(e.target)) return
    lensPan.current = { x: e.clientX, y: e.clientY, from: { x: lensAt.x, y: lensAt.y } }
    // Held for as long as the button is, as the camera's pan is: let go of over the hand or the
    // top row, the drag still ends here (#504).
    const el = e.currentTarget as HTMLElement
    if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId)
  }
  const lensMove = (e: RPointerEvent) => {
    const held = lensPan.current
    if (!held) return
    const dx = e.clientX - held.x
    const dy = e.clientY - held.y
    const k = lensAt.k
    setLensAt((cur) => ({ ...cur, x: held.from.x + dx, y: held.from.y + dy }))
    lensTo(k)
  }
  const lensUp = () => {
    lensPan.current = null
  }

  const doubled = (e: RMouseEvent) => {
    if (turnAgain()) return
    // A double press on the bare felt is the lens's way in and out (#502), where one is carried.
    if (lensOn && onBare(e.target)) {
      lensTo(lensAt.k > 1 ? 1 : lensFloor, { x: e.clientX, y: e.clientY })
      return
    }
    doubleTap(e)
  }
  // The second press of a double press, read where it lands (#482): on the backdrop of the ring the
  // first press opened. Answers whether it turned something, so the ring knows to take the press.
  const turnAgain = (): boolean => {
    const was = clicked.current
    clicked.current = null
    const turn = was && onAct && Date.now() - was.at < DOUBLE_MS ? flipUnder(view, was.target) : null
    if (!turn) return false
    setRing(null)
    onAct?.(turn)
    return true
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
    const from = letGo.current
    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) >= DRAG_PX) letGo.current = null
    clearPoint()
    const map = mapper()
    if (!map || !onPresence) return
    onPresence({ kind: 'cursor', ...map(e.clientX, e.clientY) })
  }
  const feltDown = (e: RPointerEvent) => {
    if (isPan(e)) return
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('byd-zone')) return
    // The bare felt puts down what is being read.
    putDown()
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
  // «Titta» holds the card up the way the first press does, on the felt that reads (K8, K26): in
  // the window's size, beside where the ring was asked for. A hidden pile's top is a stand-in the
  // view does not carry, so it is held up as itself.
  const look = (c: VisibleComponentState) => {
    if (onShow && c.cardRef !== null && byId.has(c.id)) return onShow(c)
    if (!lifts || !ring) return setHeld(c)
    setPointed(null)
    setRead({ c, target: { kind: 'card', id: c.id }, at: { left: ring.x, right: ring.x, top: ring.y, bottom: ring.y }, standIn: !byId.has(c.id) })
  }
  // «Flytta…» hands the card to the keyboard's own panel, where it stands (#552): the ring closes
  // and the panel opens on the same node, so a pointer that cannot drag is offered the very
  // «Flytta till» the keys are. Without the keyboard layer there is no panel to hand it to.
  const moveOn = (target: Ring['target']) => {
    const key = ringKey(target)
    if (!keyboard?.labels.has(key)) return undefined
    return () => {
      setRing(null)
      keyboard.onActivate(key)
    }
  }
  const ringVerbs = ring && onAct ? ringItems(view, ring, setRing, onAct, look, setEntry, moveOn(ring.target), t) : []
  // What is lifted now, read off the table as it is now: a card turned since is drawn turned, and
  // one that has left what this screen sees is not drawn at all.
  const liftOf = (l: Lift | null): Lift | null => {
    if (!l) return null
    const c = l.standIn ? l.c : byId.get(l.c.id)
    return c ? { ...l, c } : null
  }
  const reading = onAct || watch ? liftOf(pointed) ?? liftOf(read) : null
  // What the lifted card's smallest text was fitted to (#523): a card whose words need it is lifted larger.
  const readingPt = useSmallestPt(faces, reading?.c)
  const readingNow = reading !== null
  useEffect(() => {
    if (!readingNow || ring) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      putDown()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [readingNow, ring])
  // Where the window's corner is, for what is drawn over the felt in window coordinates. The tilted
  // felt's frame carries a `perspective`, and that makes it the box every `position: fixed` inside it
  // is placed in: on the table screen the frame is the window and it makes no difference, but under
  // the distance view's header a ring asked for at the pointer landed a header's height below it,
  // and a lift ran off the bottom of the window (#509).
  const fixedAt = (x: number, y: number): Point => {
    const f = frame.current
    if (!f || typeof getComputedStyle === 'undefined' || getComputedStyle(f).perspective === 'none') return { x, y }
    const r = f.getBoundingClientRect()
    return { x: x - r.left, y: y - r.top }
  }
  const ringAt = ring ? fixedAt(ring.x, ring.y) : null
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
  // Vart det burna är på väg, när det är på väg in i en hand (#444, K24). Frågan ställs till
  // `dropIntents` självt, så det filten lovar medan kortet bärs och det loggen får när det
  // släpps är samma mening. Den ställs bara där filten är spelbar: en skärm som bara visar
  // bordet bär ingenting och har inget att lova.
  const own = drag?.started && onAct ? handBound(view, drag, mode) : null
  const aimedHand = aimed && view.zones.some((z) => z.id === aimed.zone && z.kind === 'hand') ? aimed : null
  const bound = own ?? aimedHand
  const aimedAt = aimed && !aimedHand && aimed.zone !== view.floor ? aimed.zone : null
  // Korten som just nu är på väg att bli dolda: greppets egna, och inget annat. En bricka är
  // inget kort (C4) och har inget ansikte att vända — den reser i ett grepp av sitt eget slag,
  // och bandet vid kanten säger det som ändå är sant om den, att platsen tar emot.
  const hiding = new Set(bound && drag?.target.kind === 'card' ? drag.ids : [])
  // Och högens topp, som reser som en egen ritning och inte som en komponent i `view` (K15).
  const hidingTop = bound !== null && drag?.target.kind === 'pileTop'
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
  const turnedWood = {
    ...(rotate % 180 === 0 ? {} : { width: px(floor.geometry.h), height: px(floor.geometry.w) }),
    // Where the lens has moved the wood (#502). Laid out, not transformed, because the pointer's
    // mapping reads the wood's own offset.
    ...(lensOn && lensAt.k > 1 ? { position: 'relative' as const, left: lensAt.x, top: lensAt.y } : {}),
  }
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
                {...(aimedAt === z.id ? { 'data-aimed': '' } : {})}
                {...(lit?.has(z.id) ? { 'data-lit': '' } : {})}
                data-rim={rim}
                data-grow={grow}
                {...(crowded ? { 'data-mid': '' } : {})}
                style={{ left: left(z.geometry.x), top: top(z.geometry.y), width: px(z.geometry.w), height: px(z.geometry.h), ['--name-x' as string]: `${anchor.x}%`, ['--name-y' as string]: `${anchor.y}%` }}
              >
                {!(forTheRoom && z.owner !== undefined) && <span>{z.name}</span>}
                {/* How much lies in an area this screen may not look into (#414, decision B of
                    2026-09-22). `count` is already on the wire and was being thrown away, so a
                    seat with three cards in front of it drew the same empty box as a seat with
                    none. It says how much and never what: the identities stay behind `project`,
                    and the frames are what proves it. In the middle rather than at the corner —
                    the area is drawn empty to whoever sees this badge at all, and a zone's
                    corners are where names and handles already crowd each other (#424). */}
                {z.mode === 'count' && z.count > 0 && (
                  <b className="byd-area-count" data-area-count={z.id}>
                    {z.count}
                  </b>
                )}
              </div>
            )
          })}
          {forTheRoom && view.seats.map((seat, i) => <SeatPlate key={seat.id} view={view} seat={seat} color={seatColor(i)} left={left} top={top} t={t} />)}
          {/* Platsen tänds medan ett kort är på väg in i dess hand (#444, K24): platsens egna
              millimeter av kanten, i platsens färg. Den ligger vid kanten och inte kring
              fläkten, eftersom kanten är den enda ytan kring en hand som kortet man bär aldrig
              täcker — och den är därtill det enda som finns att se vid en hand som är fälld
              till sitt antal och ritar ingen fläkt alls (#77). Ritad före högarna och korten,
              så att den ligger under allt som spelas på den. */}
          {bound &&
            hands
              .filter((z) => z.id === bound.zone)
              .map((z) => {
                const b = handBand(z, floor)
                return <i key={`band-${z.id}`} className="byd-seat-band" data-seat={z.owner ?? ''} style={{ left: left(b.x), top: top(b.y), width: px(b.w), height: px(b.h), ['--seat' as string]: seatColor(seatIndex(z.owner)) }} />
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
                aimed={aimedAt === z.id}
                lit={lit?.has(z.id) ?? false}
                count={lifting ? count - 1 : count}
                topCard={lifting ? topOf(z, 1) : topOf(z)}
                faces={faces}
                back={backAt(`pile-${z.id}`)}
                left={left(z.geometry.x + (whole || settled ? dx : 0))}
                top={top(z.geometry.y + (whole || settled ? dy : 0))}
                px={px}
                lifted={whole}
                shuffle={shuffling.get(z.id)}
                still={still}
                topInspects={bothPointing(inspects(lifting ? topOf(z, 1) : topOf(z)), reads({ kind: 'pileTop', pile: z.id }))}
                bottomCard={bottomOf(z, byId)}
                bottomInspects={inspects(bottomOf(z, byId) ?? bottomStandIn(z))}
                topHandlers={count > 0 ? (onAct ? handlers({ kind: 'pileTop', pile: z.id }) : watches({ kind: 'pileTop', pile: z.id })) : undefined}
                labelHandlers={onAct ? handlers({ kind: 'pile', pile: z.id }) : undefined}
                // One stop per pile (#572), on the pile itself: a card's box whether or not there is a
                // card on it, so an empty pile stands where it is seen and the arrows aim at it there.
                pileKeys={keys(`pile:${z.id}`)}
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
            const at = handAt(z, floor, handRot(z), fold)
            return (
              <Hand
                key={z.id}
                taking={bound?.zone === z.id ? bound.cards : 0}
                zone={z}
                color={seatColor(seatIndex(z.owner))}
                rot={handRot(z)}
                countAt={countSide(z, floor, handRot(z))}
                // Inward only on the television itself (#482 fynd 5 B): the Bord tab draws the
                // same felt with the seat tiles at the rim, where an inward count lies on the
                // tile, and an editor's screen hides no band that the count would have to clear.
                countIn={mode === 'tv' && !seatNames}
                counted={!forTheRoom}
                folded={fold}
                left={left(at.x)}
                top={top(at.y)}
                px={px}
                cards={z.mode === 'order' ? z.order.flatMap((id) => byId.get(id) ?? []) : undefined}
                // A hand whose faces this screen sees answers the pointer as a card on the felt does
                // (#511): the observer's hands were drawn and could not be pointed at or read.
                reach={(c) => ({ ...bothPointing(inspects(c), reads({ kind: 'card', id: c.id })), ...watches({ kind: 'card', id: c.id }) })}
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
                  {/* On the room's television a seat's chip is said on its plate (#573). */}
                  {!(forTheRoom && ownedBySeat(c.zone)) && <b style={{ fontSize: tokenInkPx(px(TOKEN_MM), String(c.counter ?? 0), wide) }}>{c.counter ?? 0}</b>}
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
                hiding={hiding.has(c.id)}
                carried={carried.has(c.id)}
                by={movedBy.has(c.id) ? { seat: movedBy.get(c.id) ?? null, colour: colourOf(movedBy.get(c.id) ?? null) } : undefined}
                faces={faces}
                back={backAt(`card-${c.id}`)}
                handlers={onAct ? handlers({ kind: 'card', id: c.id }) : watches({ kind: 'card', id: c.id })}
                points={bothPointing(bothPointing(inspects(c), reads({ kind: 'card', id: c.id })), points({ kind: 'card', id: c.id }))}
                keys={keys(`card:${c.id}`)}
              />
            )
          })}
          {(mode === 'table' || seatNames) &&
            hands.map((z) => (
              // After the cards: a name card lies on the table, on top of what is dealt near it.
              // Which way the name faces (#418, decision B of 2026-09-22). A place card only
              // where the felt does not know who is looking — several people around one screen
              // lying on a table, which is what C5's exception was about. Where it knows, or
              // where nobody sits at the edges at all, the name is read like the zone names
              // beside it. The seat tiles `A`–`D` are this same element and follow.
              <SeatName key={`name-${z.id}`} zone={z} floor={floor} name={seatName(z.owner)} color={seatColor(seatIndex(z.owner))} mine={me !== null && z.owner === me} taking={bound?.zone === z.id} read={!(mode === 'table' && me === null)} left={left} top={top} />
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
                <span>{cardWord(c) ?? ''}</span>
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
            <Ghost card={topOf(zoneById.get(offTop.pile) ?? floor)} zoneBack={backOf(zoneById.get(offTop.pile))} faces={faces} back={backAt('ghost')} hiding={hidingTop} left={left(offTop.at.x)} top={top(offTop.at.y)} px={px} />
          )}
          {/* On the felt until something has happened at the table (K25); after that the tile would
              lie over the cards played where it stood, so it leaves for the corner (beslut
              2026-09-27, #482 fynd 3 C). */}
          {start && !view.played && (
            <button
              type="button"
              className="byd-table-start"
              data-table-start={start.ok ? 'ready' : 'why'}
              disabled={!start.ok}
              title={start.ok ? undefined : t('start.blocked', { why: t(whyKey(start)) })}
              style={{ left: left(floor.geometry.x + floor.geometry.w / 2 - START_MM.w / 2), top: top(floor.geometry.y + floor.geometry.h / 2 + START_MM.below), width: px(START_MM.w), height: px(START_MM.h), fontSize: `${Math.max(9, px(START_MM.h) * 0.36)}px` }}
              onClick={() => {
                if (!start.ok) return
                if (view.played) setAskingStart(true)
                else onAct?.(start.intents)
              }}
            >
              {t('start.tile')}
            </button>
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
      {...(lit ? { 'data-quiet': '' } : {})}
      data-camera={placed ? 'follow' : undefined}
      data-drive={camera}
      data-playable={onAct ? 'true' : undefined}
      data-pan={grabbing ? 'panning' : armed ? 'ready' : undefined}
      ref={frame}
      style={measured ? undefined : { visibility: 'hidden' }}
      data-lens={lensOn ? String(Math.round(lensAt.k * 100)) : undefined}
      onWheel={drivable ? wheel : lensOn ? lensWheel : undefined}
      onDoubleClick={onAct || drivable ? doubled : undefined}
      onPointerDown={drivable ? panDown : lensOn ? lensDown : undefined}
      onPointerMove={drivable ? panMove : lensOn ? lensMove : undefined}
      onPointerUp={drivable ? panUp : lensOn ? lensUp : undefined}
      onPointerCancel={drivable ? panUp : lensOn ? lensUp : undefined}
    >
      {placed ? (
        <div className="byd-camera-world" style={{ left: placed.left, top: placed.top, width: px(floorRect.w), height: px(floorRect.h) }}>
          {felt}
        </div>
      ) : (
        felt
      )}
      {drag?.started && <DragDoor onCancel={callOff} />}
      {ringVerbs.length > 0 && ring && ringAt && (
        <RadialMenu
          id={ringName(ring.target)}
          x={ringAt.x}
          y={ringAt.y}
          items={ringVerbs}
          hub={ringChip ? <CounterHub view={view} c={ringChip} t={t} /> : ringPile ? <PileHub view={view} chips={ringPile} t={t} /> : undefined}
          label={ringLabel(view, ring.target, t)}
          returnTo={() => frame.current?.querySelector<HTMLElement>(`[data-kbd="${CSS.escape(ringKey(ring.target))}"]`) ?? null}
          onClose={shut(ring)}
          onPressAgain={turnAgain}
        />
      )}
      {ring && ringAt && onAct && ringZone && ringActions.length > 0 && (
        <ActionSheet
          view={view}
          pile={ringZone.id}
          name={ringZone.name}
          actions={ringActions}
          x={ringAt.x}
          y={ringAt.y + RING_REACH + RING_AIR * 2}
          onAct={onAct}
          onClose={shut(ring)}
        />
      )}
      {/* Den diskreta hjälpen (#224), i filtens nedre högra hörn. Den står på en filt som går att
          spela på och ingen annanstans: en yta som bara visar ett bord har inga kommandon att
          lova. Listan är filtens egen; samma knapp på en annan yta skulle hålla den ytans. */}
      {/* Kamerans kontroller (#325), i hörnet ovanför hjälpens skiva och bara medan vyn är egen. */}
      {drivable && viewing && (
        <Suspense fallback={null}>
          <CameraControls level={level} folded={tucked} onFold={setTucked} onZoom={stepZoom} onWhole={() => zoomTo(null)} />
        </Suspense>
      )}
      {/* The lens's corner (#502): the camera's own cluster while the felt is enlarged, and its one
          step in while it is not — the way in has to be seen, since nothing enlarges on its own. */}
      {lensOn && (
        <Suspense fallback={null}>
          {lensAt.k > 1 ? (
            <CameraControls level={Math.round(lensAt.k * 100)} folded={tucked} onFold={setTucked} onZoom={(factor) => lensStep(factor < 1 ? 1 : -1)} onWhole={() => lensTo(1)} focusIn={lensHandOver.current} />
          ) : (
            <LensEntry onZoom={() => lensStep(1)} focusIn={lensHandOver.current} />
          )}
        </Suspense>
      )}
      {askingStart && start?.ok && (
        <Question
          className="byd-table-start-ask"
          label={t('start.again.label')}
          confirm={t('start.again.yes')}
          onConfirm={() => {
            setAskingStart(false)
            onAct?.(start.intents)
          }}
          onCancel={() => {
            setAskingStart(false)
            // Back on the tile that asked, not on <body> (#482).
            requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-table-start]')?.focus())
          }}
        >
          {/* What the start does, built from its own steps (#482): only the designer's start
              actions run again, and nothing is put back — the sentence used to promise both. */}
          {t('start.again.text', {
            actions: startsAt(view)
              .map(({ zone, action }) => t('start.again.action', { action: action.label, pile: view.zones.find((z) => z.id === zone)?.name ?? zone }))
              .join(t('start.again.and')),
          })}
        </Question>
      )}
      {start && view.played && (
        <button
          type="button"
          className="byd-table-restart"
          data-table-start={start.ok ? 'ready' : 'why'}
          disabled={!start.ok}
          title={start.ok ? undefined : t('start.blocked', { why: t(whyKey(start)) })}
          onClick={() => start.ok && setAskingStart(true)}
        >
          {t('start.again.tile')}
        </button>
      )}
      {onAct && <ShortcutHelp where={t('help.where.felt')} shortcuts={feltShortcuts(t, undefined, drivable)} />}
      {entry && onAct && <CounterEntry view={view} c={entry} onSet={(value) => onAct([{ v: 'setCounter', component: entry.id, value }])} onClose={() => setEntry(null)} />}
      {reading && (
        <Lifted
          c={reading.c}
          box={(() => {
            const box = liftBox(reading.at, { w: window.innerWidth, h: window.innerHeight }, readingPt)
            const at = fixedAt(box.left, box.top)
            return { ...box, left: at.x, top: at.y }
          })()}
          faces={faces}
          // Around the card it lifts, which is what the ring is about, and not around the lift.
          // A screen that watches has nothing to ask, so a press on what it reads puts it down.
          onAsk={() => (onAct ? ask(reading.target, (reading.at.left + reading.at.right) / 2, (reading.at.top + reading.at.bottom) / 2) : putDown())}
        />
      )}
      {held && (
        <div className="byd-inspect" onClick={() => setHeld(null)}>
          <div data-inspect={held.id} data-face={held.cardRef === null ? 'back' : 'front'} style={held.cardRef === null ? undefined : { ['--hue' as string]: hue(held.cardRef) }}>
            <Texture faces={faces} c={held} retry />
            <span>{cardWord(held) ?? ''}</span>
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
    // Ingen kamera alls är ett läge och inte ett uteblivet svar (#325): observatören som lämnar
    // tillbaka vyn ska passas in i sin ram igen, inte stå kvar i den sista bilden hon bad om.
    if (!target) {
      curRef.current = null
      setCur(null)
      return
    }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the target is keyed by value: a fresh object with the same rectangle is no new target
  }, [key, ms])
  return cur
}

// What a ring is drawn about, for the sake of a test that has to find it again.
const ringName = (target: Ring['target']): string =>
  target.kind === 'card' || target.kind === 'counter' ? target.id : target.kind === 'counterPile' ? target.ids.join('+') : target.pile

// The felt node a ring is opened on, keyed the way the keyboard layer knows it (`thingsOn`): where
// focus goes back to when the ring closes (#560 P-10). A pile of chips is its first chip, and a
// pile and its top card are one stop (#572, #723).
const ringKey = (target: Ring['target']): string =>
  target.kind === 'card' ? `card:${target.id}` : target.kind === 'counter' ? `counter:${target.id}` : target.kind === 'counterPile' ? `counter:${target.ids[0] ?? ''}` : `pile:${target.pile}`

// What the ring is called: the sentence the keyboard reader hears on the thing it was opened on.
function ringLabel(view: Snapshot, target: Ring['target'], t: T): string | undefined {
  const thing = thingsOn(view, t).find((x) => x.key === ringKey(target))
  return thing ? labelOf(view, thing, t) : undefined
}

// The verbs a drag cannot say (C): for a card, for a pile, for a chip, and for a pile of chips.
function ringItems(view: Snapshot, ring: Ring, open: (r: Ring) => void, act: (intents: Intent[]) => void, inspect: (c: VisibleComponentState) => void, enter: (c: VisibleComponentState) => void, move: (() => void) | undefined, t: T): RadialItem[] {
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
      ...(move ? [{ label: t('ring.move'), run: move }] : []),
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
    // One card off the top is `drawOne`, which the panel and the `D` key send too (K16, #224): to
    // this screen's own hand when it has one (#746), beside the pile when it has none.
    { label: t('ring.draw'), run: count > 0 ? () => act([drawOne(view, z)]) : null },
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
type Pointing = { onPointerEnter(e?: RPointerEvent): void; onPointerLeave(e?: RPointerEvent): void }

function Card({ c, left, top, px, dragging, hiding = false, carried, by, faces, back, handlers, points, keys }: { c: VisibleComponentState; left: number; top: number; px: (mm: number) => number; dragging: boolean; hiding?: boolean; carried?: boolean; by?: { seat: string | null; colour: string } | undefined; faces?: string | undefined; back?: ReactNode | undefined; handlers?: Handlers | undefined; points?: Pointing | undefined; keys?: FeltNodeProps | undefined }) {
  // A card on its way into a hand is drawn as the card it is about to be (#444, K24): face down,
  // in its own size and with its own lift. It is the same card the table already knows how to
  // draw with its face away, so it is drawn by handing that card on rather than by a look of its
  // own — the deck's back, the stand-in under it and the word on it all follow by themselves.
  const shown = hiding ? { ...c, cardRef: null } : c
  const face = shown.cardRef === null ? 'back' : 'front'
  // The deck's own back, when this card lies face down and a back was handed in. It is both what
  // is drawn and what tells the stylesheet to draw no stand-in under it.
  const own = shown.cardRef === null ? back : null
  return (
    <div
      className="byd-card"
      data-component={c.id}
      data-face={face}
      data-back={own ? 'own' : undefined}
      data-dragging={dragging ? 'true' : undefined}
      data-hiding={hiding ? '' : undefined}
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
        ...(shown.cardRef === null ? {} : { ['--hue' as string]: hue(shown.cardRef) }),
        ...(by ? { ['--peer' as string]: by.colour } : {}),
      }}
    >
      {own}
      <Texture faces={faces} c={shown} />
      <span>{cardWord(shown) ?? ''}</span>
    </div>
  )
}

// The top card of a pile while it is being dragged off. A hidden pile's top is no component, so
// the ghost wears the back the zone named for the pile (#313): the card that came off is the one
// that showed, and it must not change back as it lifts.
function Ghost({ card, zoneBack, faces, back, hiding = false, left, top, px }: { card: VisibleComponentState | undefined; zoneBack?: string | undefined; faces: string | undefined; back?: ReactNode | undefined; hiding?: boolean; left: number; top: number; px: (mm: number) => number }) {
  // On its way into a hand it turns its back like any other carried card (#444, K24), and the
  // back it turns is the one it would have worn face down all along — the zone's, where the pile
  // named one.
  const shown = hiding && card ? { ...card, cardRef: null } : card
  const own = shown?.cardRef ? null : zoneBack ? <BackTexture faces={faces} hash={zoneBack} /> : back
  return (
    <div className="byd-card" data-ghost data-dragging="true" data-hiding={hiding ? '' : undefined} data-face={shown?.cardRef ? 'front' : 'back'} data-back={own ? 'own' : undefined} style={{ position: 'absolute', left, top, width: px(CARD_MM.w), height: px(CARD_MM.h), pointerEvents: 'none', ...(shown?.cardRef ? { ['--hue' as string]: hue(shown.cardRef) } : {}) }}>
      {own}
      <Texture faces={faces} c={shown} />
      <span>{cardWord(shown) ?? ''}</span>
    </div>
  )
}

// The back a hidden pile says its face-down top wears (#313), or nothing where the zone is public
// or the session serves no textures.
function backOf(z: ZoneView | undefined): string | undefined {
  return z?.mode === 'count' ? z.back : undefined
}

// The pile's bottom card as far as this view knows (K23): the component when the zone names
// it — a public pile, or a face-up bottom card, public like a face-up top (K15) — and nothing
// when the zone only says that there is one and what back it wears.
function bottomOf(z: ZoneView, byId: Map<string, VisibleComponentState>): VisibleComponentState | undefined {
  return z.bottom?.id === undefined ? undefined : byId.get(z.bottom.id)
}

// What holding up a face-down bottom card shows (K23): a back, and nothing else. The wire hands
// out no component for it, so the screen makes one that says exactly what the zone said — no
// id of a card, no name, the back it wears — and shows it the way it shows every other card.
function bottomStandIn(z: ZoneView): VisibleComponentState | undefined {
  if (z.bottom === undefined || z.bottom.id !== undefined) return undefined
  return standIn(`bottom:${z.id}`, z.id, z.bottom.back)
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
function Pile({ zone, count, topCard, bottomCard, faces, back, left, top, px, lifted, aimed = false, lit = false, shuffle, still = false, topHandlers, topInspects, bottomInspects, labelHandlers, pileKeys, points }: { zone: ZoneView; count: number; topCard: VisibleComponentState | undefined; bottomCard?: VisibleComponentState | undefined; faces: string | undefined; back?: ReactNode | undefined; left: number; top: number; px: (mm: number) => number; lifted: boolean; aimed?: boolean | undefined; lit?: boolean | undefined; shuffle?: number | undefined; still?: boolean | undefined; topHandlers?: Handlers | undefined; topInspects?: Pointing | undefined; bottomInspects?: Pointing | undefined; labelHandlers?: Handlers | undefined; pileKeys?: FeltNodeProps | undefined; points?: Pointing | undefined }) {
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
  // How thick the pile looks (#314). The cards underneath are drawn as a staircase of shadows
  // behind the top one, trailing away from the reader — the deck's own edge, which is the only
  // way a pile says on a flat felt that it is deep.
  //
  // The staircase is drawn *behind* the top card and never under it: the top card keeps the
  // pile's own rectangle, the one its point names. That is not tidiness. Three things are laid
  // out against that rectangle and nothing tells them the pile has been nudged off it — where a
  // split lands beside the pile (`besidePile`), which pile a drop falls on (`hitAt`), and where
  // the ghost of the top card is drawn while it is dragged off. Lifting the drawn card by the
  // thickness, as this did, put all three a little further out the deeper the pile got: at ten
  // cards a card laid beside the deck sat 10.7 px low, at sixty 13.1 px, and the same pile that
  // looked in line at the start of a game looked as though the card had slipped by the end.
  //
  // A step is 1.2 px, and never more than the card can carry (#652): the whole staircase stays
  // within a fifth of the card's own height. On a television or at a table a card is 65 px tall
  // or more and the twelve steps are what they always were; on the Bord tab's felt it is 28 px,
  // and twelve whole steps stood 13 px of navy above it — half a card, which read as a tab and
  // not as a deck. Thickness is the card's measure, as the fan's turn is.
  const layers = Math.min(Math.max(count, 0), 12)
  const step = Math.min(1.2, (px(CARD_MM.h) * MAX_THICKNESS) / 11)
  const thickness = Array.from({ length: layers }, (_, i) => `0 ${-i * step}px 0 #1f2b4a`).join(', ')
  // The pile's bottom card (K23, variant A): let out under the pile by its lower edge, drawn
  // before the top so the top covers all but that edge. It is the same card node as the top —
  // the same texture path, the same back, the same hue — because a second way to draw a card is
  // a second renderer. A lone card is the top and is not drawn twice: the projection names no
  // bottom then, and it names none for an empty pile.
  const bottom = zone.bottom
  const bottomOwn = bottom !== undefined && !bottomCard?.cardRef ? (bottom.back ? <BackTexture faces={faces} hash={bottom.back} /> : back) : null
  // The shuffle, fanned (L35, #326): four backs fanned out of the pile and gathered back, keyed by
  // the log line so a second shuffle of the same pile starts the fan over. They wear what the
  // pile itself wears face-down — the same back, from the same hash the pile's own top is drawn
  // from — and never a front, so nothing is drawn during the fan that was not on the screen
  // before it; that is what keeps a test on raw frames blind to the animation. A pile being
  // dragged is not fanned: the ghost of it is elsewhere, and the fan would play on an empty spot.
  //
  // Where that hash comes from is the zone's mode and not the fan's business. A hidden pile hands
  // out no component, so the back travels on the zone (#313) and `ownBack` is it. A pile whose
  // order everyone may see hands out its cards instead, and says nothing of its own — so the back
  // is read off the top card, the same way `Texture` reads it when it draws that very card. Asking
  // only the zone, as this did, gave every public pile the stand-in weave that belongs to no game
  // (L17): the draw pile fanned the deck's back and every other pile fanned stripes.
  //
  // Under `prefers-reduced-motion` (`still`) the motion is off and not damped: no fan is mounted
  // at all, and the pile pulses amber instead — something happened, without anything moving.
  const playing = shuffle !== undefined && !lifted && count > 0
  const fanned = playing && !still
  const fanHash = ownBack ?? topCard?.faces?.['back']
  const fanBack = fanHash ? <BackTexture faces={faces} hash={fanHash} /> : back
  return (
    <div
      className="byd-pile"
      data-zone={zone.id}
      data-count={count}
      {...(aimed ? { 'data-aimed': '' } : {})}
      {...(lit ? { 'data-lit': '' } : {})}
      data-dynamic={zone.dynamic ? 'true' : 'false'}
      data-dragging={lifted ? 'true' : undefined}
      data-shuffling={playing ? (still ? 'pulse' : 'fan') : undefined}
      style={{ position: 'absolute', left: left - px(CARD_MM.w / 2), top: top - px(CARD_MM.h / 2), width: px(CARD_MM.w), height: px(CARD_MM.h), transform: `rotate(${zone.geometry.rot}deg)` }}
      {...points}
      {...pileKeys}
    >
      {bottom !== undefined && (
        <div
          className="byd-pile-bottom"
          data-face={bottomCard?.cardRef ? 'front' : 'back'}
          data-back={bottomOwn ? 'own' : undefined}
          {...bottomInspects}
          style={{ transform: `translateY(${px(BOTTOM_EDGE_MM)}px)`, ...(bottomCard?.cardRef ? { ['--hue' as string]: hue(bottomCard.cardRef) } : {}) }}
        >
          {bottomOwn}
          <Texture faces={faces} c={bottomCard} />
          <span>{cardWord(bottomCard) ?? ''}</span>
        </div>
      )}
      <div
        className="byd-pile-top"
        data-face={topCard?.cardRef ? 'front' : 'back'}
        data-back={own ? 'own' : undefined}
        {...topInspects}
        {...topHandlers}
        style={{ boxShadow: thickness, ...(topCard?.cardRef ? { ['--hue' as string]: hue(topCard.cardRef) } : {}) }}
      >
        {own}
        <Texture faces={faces} c={topCard} />
        <span>{count > 0 ? topCard?.cardRef ?? '' : ''}</span>
      </div>
      {fanned && (
        <div className="byd-pile-fan" key={shuffle} aria-hidden="true">
          {FAN.map(([out, turn], i) => (
            <i key={i} className="byd-pile-fan-card" data-face="back" data-back={fanBack ? 'own' : undefined} style={{ ['--fan-out' as string]: `${out}%`, ['--fan-turn' as string]: `${turn}deg` }}>
              {fanBack}
            </i>
          ))}
        </div>
      )}
      <span className="byd-pile-count" data-handle={labelHandlers ? 'true' : undefined} {...labelHandlers}>
        <span className="byd-pile-name">{zone.dynamic ? t('pile.dynamic') : zone.name}</span>
        <b className="byd-pile-n">{count}</b>
      </span>
    </div>
  )
}

// How far the bottom card is let out under the pile (K23): enough to read as a card's edge and
// to take a pointer, and short of the count pill that hangs 22 px under the pile.
const BOTTOM_EDGE_MM = 10

// How deep a pile's staircase may stand above its card, as a share of the card's height (#652).
// Eleven steps of 1.2 px are a fifth of a 65 px card, the smallest a card is drawn at a table.
const MAX_THICKNESS = 0.2

const EDGES: Record<number, 'N' | 'E' | 'S' | 'W'> = { 0: 'S', 180: 'N', [-90]: 'E', 90: 'W' }

// Who sits at this edge (B): the name lies along the table's own border, turned toward the seat
// that reads it — as a name card would on a real table. The count stays on the hand.
function SeatName({ zone, floor, name, color, mine, taking, read, left, top }: { zone: ZoneView; floor: ZoneView; name: string; color: string; mine?: boolean | undefined; taking?: boolean | undefined; read: boolean; left: (mm: number) => number; top: (mm: number) => number }) {
  if (name === '') return null
  const edge = EDGES[edgeRotation(zone, floor)] ?? 'S'
  const alongX = left(zone.geometry.x + zone.geometry.w / 2)
  const alongY = top(zone.geometry.y + zone.geometry.h / 2)
  const place =
    edge === 'S' ? { left: alongX, bottom: 6 } : edge === 'N' ? { left: alongX, top: 6 } : edge === 'W' ? { top: alongY, left: 6 } : { top: alongY, right: 6 }
  return (
    <div className="byd-seat-name" data-seat-name={zone.owner} data-edge={edge} {...(read ? { 'data-read': '' } : {})} {...(mine ? { 'data-me': 'true' } : {})} {...(taking ? { 'data-taking': '' } : {})} style={{ ...place, ['--seat' as string]: color }}>
      {name}
    </div>
  )
}

// Other seats' hands are a fan of backs and a count; the owner reads theirs on the phone. A hand
// whose order this view may see (the observer, C8) fans the cards themselves. Every measure in
// the fan is a millimetre on the felt, so it shrinks with the table rather than swamping it (#23).
// A seat's words on the room's television, on one plate beside the seat's own zones (#573,
// beslut C efter prototyp): its letter and name in its colour, what its hand holds, and its
// counters by name and value. It stands on the side of the zones that faces the middle of the
// table, and a seat at the side stacks its words, since a wide plate there reached the piles
// (measured at four seats). It is drawn before the piles and the cards, so a card played
// beside a seat lies over the plate and never under it.
const PLATE_AIR_PX = 8
function SeatPlate({ view, seat, color, left, top, t }: { view: Snapshot; seat: Snapshot['seats'][number]; color: string; left: (mm: number) => number; top: (mm: number) => number; t: T }) {
  const own = view.zones.filter((z) => z.owner === seat.id && z.kind === 'area')
  const hand = view.zones.find((z) => z.owner === seat.id && z.kind === 'hand')
  const around = own.length > 0 ? own : hand ? [hand] : []
  if (around.length === 0) return null
  const x0 = Math.min(...around.map((z) => z.geometry.x))
  const y0 = Math.min(...around.map((z) => z.geometry.y))
  const x1 = Math.max(...around.map((z) => z.geometry.x + z.geometry.w))
  const y1 = Math.max(...around.map((z) => z.geometry.y + z.geometry.h))
  const edge = seat.edge ?? 'S'
  const at: CSSProperties =
    edge === 'N' ? { left: left(x0), top: top(y1) + PLATE_AIR_PX } :
    edge === 'S' ? { left: left(x0), top: top(y0) - PLATE_AIR_PX, transform: 'translateY(-100%)' } :
    edge === 'W' ? { left: left(x1) + PLATE_AIR_PX, top: top((y0 + y1) / 2), transform: 'translateY(-50%)' } :
    { left: left(x0) - PLATE_AIR_PX, top: top((y0 + y1) / 2), transform: 'translate(-100%, -50%)' }
  const held = hand ? (hand.mode === 'count' ? hand.count : hand.order.length) : null
  const owned = new Set(own.map((z) => z.id))
  const chips = view.components.filter((c) => c.counter !== null && c.counter !== undefined && owned.has(c.zone))
  // A seat nobody sits in keeps its letter in the ball and says it is free where the name goes; the
  // letter written twice read «A A» (#717).
  return (
    <div className="byd-seat-plate" data-seat-plate={seat.id} data-edge={edge} style={{ ...at, ['--seat' as string]: color }}>
      <b>
        <i aria-hidden="true">{(seat.name ?? seat.id).slice(0, 1)}</i>
        {seat.name ?? t('tv.seat.free')}
      </b>
      {held !== null && <span>{t(held === 1 ? 'tv.seat.hand.one' : 'tv.seat.hand.other', { n: held })}</span>}
      {chips.map((c) => (
        <span key={c.id}>{c.cardRef ? `${c.cardRef} ${c.counter ?? 0}` : String(c.counter ?? 0)}</span>
      ))}
    </div>
  )
}

function Hand({ zone, color, rot, countAt, countIn = false, counted = true, folded = false, taking = 0, left, top, px, cards, faces, reach }: { zone: ZoneView; color: string; rot: number; countAt: 'below' | 'above'; countIn?: boolean; counted?: boolean; folded?: boolean; taking?: number; left: number; top: number; px: (mm: number) => number; cards?: VisibleComponentState[] | undefined; faces?: string | undefined; reach?: ((c: VisibleComponentState) => Partial<Pointing & Handlers>) | undefined }) {
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
      data-count-in={countIn ? '' : undefined}
      data-folded={folded ? 'true' : undefined}
      data-taking={taking > 0 ? String(taking) : undefined}
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
                {...(reach?.(c) ?? {})}
              >
                <Texture faces={faces} c={c} />
                <span>{cardWord(c) ?? ''}</span>
              </i>
          ))
        ) : (
          Array.from({ length: fan }, (_, i) => <i key={i} className="byd-back" style={{ ...box, transform: place(i, false) }} />)
        )}
      </div>
      {/* How much the hand holds, and — while a card is on its way into it — how much it is
          about to hold (#444, K24). Figures and an arrow rather than a word: the badge is the
          same one at every table, whatever language its people brought (A4). */}
      {/* On the room's television the hand's count is on its seat's plate (#573). */}
      {counted && <b className="byd-hand-count">{taking > 0 ? `${count} → ${count + taking}` : count}</b>}
    </div>
  )
}
