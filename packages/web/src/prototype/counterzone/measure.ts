// PROTOTYPE — throwaway (#89). The numbers the issue is about, read off the DOM the same way for
// every variant, so the bar at the bottom of the screen always says what the shots script will
// later write down.
//
// What counts as "the tap target" is the reader's rule and not the author's: whatever a finger
// would actually land on. Three of the four variants let the renderer draw it — `.byd-token-hit`,
// the invisible 44 x 44 #67 landed — and the prototype only stamps `data-proto-target` on it so
// one selector finds them all. C draws one target for a whole pile and says, on the target
// itself, which chips it stands for; those chips are then not targets of their own.
//
// Every box is `getBoundingClientRect()`, so what is reported is the box ON THE SCREEN. In table
// mode the felt lies under `rotateX(13deg)` inside a `perspective`, and a square set to 44 px in
// that plane is not 44 px to the finger.
//
// Beside the pixels there is a second reading in MILLIMETRES, because #89 is a question about the
// recipe and not about the renderer: a target that is 44 px wide but sticks out of the zone it
// belongs to, or into the neighbour's, has moved the problem rather than solved it. The
// millimetre reading is exact — it is the felt's own coordinates — where a pixel comparison
// against a tilted zone's bounding box would over-report.

export type Reading = {
  targets: number
  // The smallest target on the screen, which is the one that has to clear 44.
  target: { w: number; h: number }
  // Targets that reach into each other, counted so an empty list cannot pass.
  collisions: number
  pairs: string[]
  // The narrowest gap between two neighbouring targets; negative means they overlap, and null
  // means there was no neighbour within reach to measure against.
  gap: number | null
  // In millimetres: targets that leave their own counters zone, and targets that reach into any
  // other zone on the felt.
  outside: number
  intruding: number
  cardPx: number
  feltMm: { w: number; h: number }
}

const box = (el: Element): DOMRect | null => {
  const s = getComputedStyle(el)
  if (s.display === 'none' || s.visibility === 'hidden') return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? r : null
}

const hits = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
// How far apart two boxes are; negative when they lie on each other.
const between = (a: DOMRect, b: DOMRect) => Math.max(Math.max(a.left, b.left) - Math.min(a.right, b.right), Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))

// What the prototype stamps on every target: where it is and how big it is in the FELT's own
// millimetres, and which zone it belongs to. `mm` is what makes the zone question answerable
// without guessing at a tilted rectangle's bounding box.
export type TargetMm = { cx: number; cy: number; side: number; zone: string }
export type ZoneMm = { id: string; x: number; y: number; w: number; h: number }

export function read(root: ParentNode): Reading {
  const found: { id: string; r: DOMRect; mm: TargetMm | null }[] = []
  for (const el of root.querySelectorAll('[data-proto-target]')) {
    const r = box(el)
    if (!r) continue
    const raw = (el as HTMLElement).dataset['protoMm']
    found.push({ id: (el as HTMLElement).dataset['protoTarget'] ?? '', r, mm: raw ? (JSON.parse(raw) as TargetMm) : null })
  }

  const pairs: string[] = []
  let gap = Infinity
  for (let i = 0; i < found.length; i++)
    for (let j = i + 1; j < found.length; j++) {
      const a = found[i] as { id: string; r: DOMRect }
      const b = found[j] as { id: string; r: DOMRect }
      const d = between(a.r, b.r)
      // Only neighbours are interesting: two chips at opposite rims of the table never met.
      if (d < 200) gap = Math.min(gap, d)
      if (hits(a.r, b.r)) pairs.push(`${a.id} X ${b.id}`)
    }

  const smallest = found.reduce((acc, f) => (f.r.width * f.r.height < acc.w * acc.h ? { w: f.r.width, h: f.r.height } : acc), { w: Infinity, h: Infinity })

  const zonesRaw = (root instanceof HTMLElement ? root.dataset['protoZones'] : undefined) ?? '[]'
  const zones = JSON.parse(zonesRaw) as ZoneMm[]
  let outside = 0
  let intruding = 0
  for (const f of found) {
    if (!f.mm) continue
    const own = zones.find((z) => z.id === f.mm?.zone)
    const s = f.mm.side / 2
    const rectMm = { l: f.mm.cx - s, t: f.mm.cy - s, r: f.mm.cx + s, b: f.mm.cy + s }
    if (own && (rectMm.l < own.x || rectMm.t < own.y || rectMm.r > own.x + own.w || rectMm.b > own.y + own.h)) outside++
    if (zones.some((z) => z.id !== f.mm?.zone && rectMm.l < z.x + z.w && z.x < rectMm.r && rectMm.t < z.y + z.h && z.y < rectMm.b)) intruding++
  }

  const card = root.querySelector('.byd-pile-top') as HTMLElement | null
  const feltRaw = (root instanceof HTMLElement ? root.dataset['protoFelt'] : undefined) ?? '{"w":0,"h":0}'

  return {
    targets: found.length,
    target: { w: round(Number.isFinite(smallest.w) ? smallest.w : 0), h: round(Number.isFinite(smallest.h) ? smallest.h : 0) },
    collisions: pairs.length,
    pairs,
    gap: Number.isFinite(gap) ? round(gap) : null,
    outside,
    intruding,
    cardPx: card ? Math.round(card.getBoundingClientRect().width) : 0,
    feltMm: JSON.parse(feltRaw) as { w: number; h: number },
  }
}

const round = (n: number) => Math.round(n * 10) / 10
