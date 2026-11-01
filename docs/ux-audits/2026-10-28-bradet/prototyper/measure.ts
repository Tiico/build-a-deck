// PROTOTYPE (#1473): card short side per board variant, from the product's own fit functions.
import { fitScale, feltScale, TV_AIR_PX } from '../../../../packages/web/src/table/fit.ts'
import { handRoom, handRotation, feltWithHands } from '../../../../packages/web/src/table/hand.ts'
import { overscanPx } from '../../../../packages/web/src/table/camera.ts'
import { edgeOf, feltFor } from '../../../../packages/server/src/recipe.ts'

type Size = { w: number; h: number }
type Rect = { x: number; y: number; w: number; h: number }
const CARD = 63
const SEAT_ALONG = 500
const PLACE = 600

// recipe.ts handGeometry, with the felt's size as a parameter (the variants change it).
function seatsAt(edge: string, n: number) {
  return Array.from({ length: n }, (_, k) => edgeOf(k, n)).filter((e) => e === edge).length
}
function along(i: number, n: number) {
  const e = edgeOf(i, n)
  const before = Array.from({ length: i }, (_, k) => edgeOf(k, n)).filter((x) => x === e).length
  return (before - (seatsAt(e, n) - 1) / 2) * PLACE
}
function hand(i: number, n: number, felt: Size): Rect {
  const [x, y] = [felt.w / 2, felt.h / 2]
  const a = along(i, n) - SEAT_ALONG / 2
  switch (edgeOf(i, n)) {
    case 'N': return { x: a, y: -y, w: SEAT_ALONG, h: 60 }
    case 'E': return { x: x - 60, y: a, w: 60, h: SEAT_ALONG }
    case 'W': return { x: -x, y: a, w: 60, h: SEAT_ALONG }
    default: return { x: a, y: y - 60, w: SEAT_ALONG, h: 60 }
  }
}
const zv = (id: string, g: Rect, owner?: string): any => ({ id, kind: owner ? 'hand' : 'area', geometry: { ...g, rot: 0 }, owner, mode: 'count', count: 0, visibility: 'owner', name: id, components: [] })

// What the fit passes into the frame: the felt with every seated hand's full fan on it, plus any
// sheet laid beside it (variant B), in mm.
function drawn(n: number, felt: Size, mode: 'tv' | 'table', beside?: Size): Size {
  const floor = zv('floor', { x: -felt.w / 2, y: -felt.h / 2, w: felt.w, h: felt.h })
  const hands = Array.from({ length: n }, (_, i) => zv(`hand:${i}`, hand(i, n, felt), String(i)))
  const withHands = feltWithHands(floor.geometry, hands.map((z) => handRoom(z, floor, handRotation(z, floor, mode), true)))
  if (!beside) return withHands
  // The sheet stands GAP mm off the hands' reach on the right, and the whole is centred.
  return { w: withHands.w + 40 + beside.w, h: Math.max(withHands.h, beside.h) }
}

const STAGE_MIN = 360, STAGE_MAX = 760, STEP = 8, FLOOR = 45
// The stage is chosen as `stageWidth` chooses it (stage.ts: onFit's model, the felt with its hands);
// the card is then drawn by the TV's camera, which frames what is in play — the felt, and a sheet
// beside it — inside the overscan (camera.ts `withAspect`). Calibrated: today's four-seat table
// gives 57.5 px (built: 57) and the eight-seat 45.7 px (built: 45), DESIGN-BESLUT K9 2026-10-25.
function tvCard(d: Size, framed: Size, vp: Size): { card: number; stage: number } {
  const fit = (stage: number) => {
    const frame = { w: vp.w - stage, h: vp.h }
    const air = overscanPx(frame)
    return CARD * fitScale(d, { w: frame.w - 2 * air, h: frame.h - 2 * air }, TV_AIR_PX)
  }
  let stage = STAGE_MIN
  for (let s = STAGE_MAX; s > STAGE_MIN; s -= STEP) if (fit(s) >= FLOOR) { stage = s; break }
  const frame = { w: vp.w - stage, h: vp.h }
  const air = overscanPx(frame)
  const card = CARD * Math.min((frame.w - 2 * air) / framed.w, (frame.h - 2 * air) / framed.h)
  return { card, stage }
}
// Table mode (/table and /online's felt): tilted, fitted by feltScale. HEAD is the page's header
// row; calibrated in the output against K9's 45 px (1280 × 800) and 61 px (1920 × 1080).
const HEAD = 57
const tableCard = (d: Size, vp: Size) => CARD * feltScale(d, { w: vp.w, h: vp.h - HEAD })

// ---- the variants' felts, in mm
const BOARDS = { kvadrat: { w: 457, h: 457 }, rektangel: { w: 610, h: 457 } }
const PB = { w: 240, h: 150 } // a player board, per seat
const HAND = 60, GAP = 10
const SEAT_DEPTH = 170 // today: hand 60 + gap 10 + Framför 100
const PILE_ROOM = 63 + 2 * 20 // a pile and its air, beside the board

function hasEW(n: number) { return seatsAt('E', n) + seatsAt('W', n) > 0 }

// A: the board in the felt's middle; player boards lie where «Framför» lies, and the felt grows
// only as much as that needs.
function feltA(n: number, board: Size, pb: boolean): Size {
  const base = feltFor(n)
  const depth = pb ? HAND + GAP + PB.h : SEAT_DEPTH
  const h = Math.max(base.h, board.h + 2 * depth + 2 * 20)
  const side = hasEW(n) ? depth : 0
  const w = Math.max(base.w, board.w + 2 * PILE_ROOM + 2 * side + 2 * 20)
  return { w, h }
}
// B: today's felt untouched; the board (and the player boards in a grid under it) is a sheet beside.
function sheetB(n: number, board: Size, pb: boolean): Size {
  if (!pb) return board
  const cols = 2
  const rows = Math.ceil(n / cols)
  const grid = { w: cols * PB.w + (cols - 1) * 10, h: rows * PB.h + (rows - 1) * 10 }
  // Grid beside the board if stacking would grow the height past the felt.
  const stacked = { w: Math.max(board.w, grid.w), h: board.h + 20 + grid.h }
  const side = { w: board.w + 20 + grid.w, h: Math.max(board.h, grid.h) }
  return stacked.h <= feltFor(n).h ? stacked : side
}
// C: the board is the table: the felt is the board plus the seats' rims, nothing else.
function feltC(n: number, board: Size, pb: boolean): Size {
  const depth = pb ? HAND + GAP + PB.h : SEAT_DEPTH
  const ns = Math.max(seatsAt('N', n), seatsAt('S', n))
  const ew = Math.max(seatsAt('E', n), seatsAt('W', n))
  const w = Math.max(board.w + (ew > 0 ? 2 * depth : 0), ns * PLACE - (PLACE - SEAT_ALONG) + 2 * (ew > 0 ? depth : 60))
  const h = Math.max(board.h + 2 * depth, ew * PLACE - (PLACE - SEAT_ALONG) + 2 * depth)
  return { w, h }
}

const screens = { tv1920: { w: 1920, h: 1080 }, tv1280: { w: 1280, h: 720 }, table1280: { w: 1280, h: 800 }, table1920: { w: 1920, h: 1080 } }
const out: any[] = []
for (const n of [4, 8]) {
  for (const [boardName, board] of Object.entries(BOARDS)) {
    for (const pb of [false, true]) {
      const cases: Record<string, { felt: Size; beside?: Size }> = {
        idag: { felt: feltFor(n) },
        A: { felt: feltA(n, board, pb) },
        B: { felt: feltFor(n), beside: sheetB(n, board, pb) },
        C: { felt: feltC(n, board, pb) },
      }
      for (const [v, c] of Object.entries(cases)) {
        if (v === 'idag' && (boardName !== 'kvadrat' || pb)) continue
        const dTv = drawn(n, c.felt, 'tv', c.beside)
        const dTable = drawn(n, c.felt, 'table', c.beside)
        const r: any = { seats: n, board: v === 'idag' ? null : boardName, playerBoards: v === 'idag' ? null : pb, variant: v, felt: c.felt, beside: c.beside ?? null, drawnTv: dTv }
        const over = (dTv.w - (c.beside ? dTv.w - 40 - c.beside.w : c.felt.w)) / 2
        const framed = c.beside ? { w: c.felt.w + over + 40 + c.beside.w, h: Math.max(c.felt.h, c.beside.h) } : c.felt
        r.framedTv = framed
        const t1 = tvCard(dTv, framed, screens.tv1920), t2 = tvCard(dTv, framed, screens.tv1280)
        r.tv1920 = +t1.card.toFixed(1); r.stage1920 = t1.stage
        r.tv1280 = +t2.card.toFixed(1); r.stage1280 = t2.stage
        r.table1280 = +tableCard(dTable, screens.table1280).toFixed(1)
        r.table1920 = +tableCard(dTable, screens.table1920).toFixed(1)
        out.push(r)
      }
    }
  }
}
console.log(JSON.stringify(out, null, 1))
