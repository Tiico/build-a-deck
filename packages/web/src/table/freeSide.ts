// A zone's name never stands in another zone's box (K19, #685, decision G of 2026-10-03).
//
// K19 puts a name outside its own zone, away from the felt's nearest rim and toward the middle of
// the seat that owns it — beside the zone at a side rim, above or below it along the others. That
// says which *side* of its own zone a name stands on, and nothing about what is there: the zones
// are the designer's (K2, B5) and may lie anywhere, so the side K19 picks can be a neighbour's. With
// four seats the saloon lies 30 mm under «Framför B», and each of the two names stood in the
// other's box on every surface; on a phone at eight seats four counters' names stood in the areas
// beside them.
//
// So K19 is where a name starts, and this is the one rule after it: a name that lands on another
// zone's box — or on a pile, a badge, a hand or another name, which is what the prototype measured
// G against — tries, in this order, one line further out on the same side, the opposite side (and
// a line further out there), and, for a name beside its zone, the zone's two ends, anchored at the
// end nearest the rim as #76 placed it. The first place that is free wins. A name is never lifted
// past another box: further out than a line, it has left its own zone and reads as its neighbour's.
// Last, the name stands inside its own box, cut short if it must be — except on a felt that shows
// one name at a time (the Bord tab, #581), where the lit plate may cover a neighbour instead and
// the name is never cut.
//
// The side is decided once, at the felt's fitted scale, and then stays put (#43): every place is
// said as a corner of the zone — which the felt scales — and a step in screen pixels from it, which
// it does not. The camera can then zoom without anything changing sides; measured live, the
// saloon's name flipped from below to above at 3.3 px/mm. The renderer is what makes sure the felt
// is drawn at its fitted scale when this runs.
//
// This is an exported function and not a React effect, and deliberately, for the same reason
// `stepAside` is (#424): the felt's names are measured by putting the renderer's markup on a page,
// where no effect ever runs. It is self-contained, so that a test can run it as a string inside the
// page — a constant or a helper left outside the body would not travel with it.

/**
 * Lays every visible zone name on the felts under `root` out on a free side, and answers where each
 * one went, by the name it carries: `k19` where K19's own place was free, otherwise the place it
 * found (`out`, `opposite`, `opposite-out`, `end-up`, `end-up-out`, `end-down`, `end-down-out`,
 * `inside`) — or, on a felt that shows one name at a time, `plate-` and the place its plate stands
 * on furniture at, or `covers` where it stands over a neighbour.
 */
export function placeNames(root: ParentNode): Record<string, string> {
  // How far a name is pushed off its own edge on the other side, and in from the zone's end, in the
  // reader's pixels: the same steps K19's own sheet takes (`--name-off`, `--name-in`).
  const OFF_Y = 6
  const OFF_X = 3
  const IN = 14
  const END_OFF = 2
  // A name that only touches another zone's outline is not in it: half a pixel for the rounding of a
  // box. Two words get no such slack — the felt's gates read any overlap between them (K19).
  const SLACK = 0.5
  // The felt's other words: a pile's name, count and caption, a hand's count, an area's count, and a
  // seat's card or plate. A zone's name never stands on one, any more than on another zone's name
  // (K19, #76).
  const WORDS = '.byd-pile-n, .byd-pile-name, .byd-pile-caption, .byd-hand-count, .byd-area-count, .byd-seat-name, .byd-seat-plate'
  // The felt's furniture that is drawn in fixed places: a pile's card, a chip, a hand's fan. A name
  // would rather stand clear of it, and may stand on it rather than be cut short. Cards lying loose
  // are play and not furniture, so they are not asked about.
  const FURNITURE = '.byd-pile, .byd-token, .byd-hand-card'

  type Box = { l: number; t: number; r: number; b: number }
  type Pt = { x: number; y: number }
  const placed: Record<string, string> = {}
  const felts = [...((root as Element).matches?.('[data-table]') ? [root as HTMLElement] : []), ...root.querySelectorAll<HTMLElement>('[data-table]')]
  for (const felt of felts) {
    const zones = [...felt.querySelectorAll<HTMLElement>(':scope > .byd-zone')]
    // Whatever an earlier run said is taken back first, so that K19's own place is what is read.
    const home = (el: HTMLElement) => {
      for (const p of ['left', 'top', 'transform', 'max-width', 'overflow', 'text-overflow']) el.style.removeProperty(p)
    }
    for (const z of zones) {
      const el = z.querySelector<HTMLElement>(':scope > span')
      if (!el || !el.hasAttribute('data-name-at')) continue
      home(el)
      el.removeAttribute('data-name-at')
    }
    const shown = (el: Element): DOMRect | null => {
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden') return null
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 ? r : null
    }
    const labels = zones.flatMap((z) => {
      const el = z.querySelector<HTMLElement>(':scope > span')
      return el && shown(el) ? [{ z, el }] : []
    })
    if (labels.length === 0) continue
    // One name at a time is what a quiet felt shows (#581): the Bord tab, which lights the zone that
    // is pointed at and no other.
    const oneAtATime = felt.closest('[data-quiet]') !== null

    // The reader's frame: felt pixels, turned the way the reader sees them, about the felt's middle.
    // A name's `translate()` is said in exactly this frame (`table.css`), whatever the felt's turn.
    const turn = (Number(felt.dataset['rotate'] ?? 0) * Math.PI) / 180
    const cos = Math.round(Math.cos(turn) * 1e6) / 1e6
    const sin = Math.round(Math.sin(turn) * 1e6) / 1e6
    const W = felt.offsetWidth
    const H = felt.offsetHeight
    const toR = (x: number, y: number): Pt => ({ x: (x - W / 2) * cos - (y - H / 2) * sin, y: (x - W / 2) * sin + (y - H / 2) * cos })
    const fromR = (p: Pt): Pt => ({ x: p.x * cos + p.y * sin + W / 2, y: -p.x * sin + p.y * cos + H / 2 })
    // A zone's padding box, which is what a name's `left`/`top` percentages are of.
    const inner = (z: HTMLElement) => ({ x: z.offsetLeft + z.clientLeft, y: z.offsetTop + z.clientTop, w: z.clientWidth, h: z.clientHeight })
    const zoneR = (z: HTMLElement): Box => {
      const ps = [toR(z.offsetLeft, z.offsetTop), toR(z.offsetLeft + z.offsetWidth, z.offsetTop), toR(z.offsetLeft, z.offsetTop + z.offsetHeight), toR(z.offsetLeft + z.offsetWidth, z.offsetTop + z.offsetHeight)]
      return { l: Math.min(...ps.map((p) => p.x)), t: Math.min(...ps.map((p) => p.y)), r: Math.max(...ps.map((p) => p.x)), b: Math.max(...ps.map((p) => p.y)) }
    }
    // Where K19 put the name: the corner it hangs from, and the step off that corner.
    const k19 = (z: HTMLElement, el: HTMLElement) => {
      const box = inner(z)
      const corner = toR(box.x + el.offsetLeft, box.y + el.offsetTop)
      const t = getComputedStyle(el).transform
      const m = new DOMMatrixReadOnly(t === 'none' ? undefined : t)
      return { corner, step: { x: m.e, y: m.f } }
    }
    // Hangs the name from the reader's point `at` — which is a corner or an edge of its own zone,
    // so that the felt's scale carries it — and steps it `step` screen pixels off it.
    const hang = (z: HTMLElement, el: HTMLElement, at: Pt, step: Pt) => {
      const box = inner(z)
      const p = fromR(at)
      const pct = (v: number, of: number) => `${Math.round(((v * 100) / (of || 1)) * 1e4) / 1e4}%`
      el.style.left = pct(p.x - box.x, box.w)
      el.style.top = pct(p.y - box.y, box.h)
      el.style.transform = `translate(${Math.round(step.x * 100) / 100}px, ${Math.round(step.y * 100) / 100}px)`
    }

    const hits = (p: DOMRect, q: DOMRect) => p.left < q.right - SLACK && q.left < p.right - SLACK && p.top < q.bottom - SLACK && q.top < p.bottom - SLACK
    const furniture = [...felt.querySelectorAll(FURNITURE)].flatMap((el) => {
      const r = shown(el)
      return r ? [r] : []
    })
    const feltBox = felt.getBoundingClientRect()
    type Label = { z: HTMLElement; el: HTMLElement }
    // In another zone's box, or past the felt's own edge.
    const onZone = (l: Label) => {
      const r = l.el.getBoundingClientRect()
      if (zones.some((z) => z !== l.z && hits(r, z.getBoundingClientRect()))) return true
      return r.left < feltBox.left - 1 || r.right > feltBox.right + 1 || r.top < feltBox.top - 1 || r.bottom > feltBox.bottom + 1
    }
    const words = [...felt.querySelectorAll(WORDS)].flatMap((el) => {
      const r = shown(el)
      return r ? [r] : []
    })
    const onName = (l: Label) => {
      const r = l.el.getBoundingClientRect()
      const meets = (q: DOMRect) => r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom
      return labels.some((o) => o !== l && meets(o.el.getBoundingClientRect())) || words.some(meets)
    }
    const onFurniture = (l: Label) => {
      const r = l.el.getBoundingClientRect()
      return furniture.some((q) => hits(r, q))
    }
    // What makes a name move at all, and what no place it moves to may do: stand in another zone's
    // box, on another name, or off the felt. K19's own place is kept whenever it does none of them.
    const lands = (l: Label) => onZone(l) || onName(l)
    // Zone boxes only, in the reader's frame: what a name is lifted clear of.
    const boxes = zones.map((z) => ({ z, R: zoneR(z) }))

    for (const l of labels) {
      const name = (l.el.textContent ?? '').trim()
      if (!lands(l)) {
        l.el.setAttribute('data-name-at', 'k19')
        placed[name] = 'k19'
        continue
      }
      const Z = zoneR(l.z)
      const { corner, step } = k19(l.z, l.el)
      const w = l.el.offsetWidth
      const h = l.el.offsetHeight
      const P = { x: corner.x + step.x, y: corner.y + step.y }
      const side = P.y + h <= Z.t + 1 ? 'above' : P.y >= Z.b - 1 ? 'below' : P.x + w <= Z.l + 1 ? 'left' : P.x >= Z.r - 1 ? 'right' : 'on'
      // A place is a point the zone carries and a step off it in screen pixels.
      type Place = { tag: string; at: Pt; step: Pt }
      // One line further out on the same side: as far as it takes to clear the zone boxes it
      // crosses, and never more than a line — past that it has gone by another box.
      const out = (p: Place, way: string): Place | null => {
        const T = { x: p.at.x + p.step.x, y: p.at.y + p.step.y }
        let { x, y } = T
        for (let k = 0; k < 4; k++)
          for (const { z, R } of boxes) {
            if (z === l.z) continue
            const across = way === 'above' || way === 'below' ? x < R.r && R.l < x + w : y < R.b && R.t < y + h
            if (!across) continue
            if (way === 'above' && y + h > R.t - 1 && y < R.b) y = R.t - 2 - h
            if (way === 'below' && y < R.b + 1 && y + h > R.t) y = R.b + 2
            if (way === 'left' && x + w > R.l - 1 && x < R.r) x = R.l - 3 - w
            if (way === 'right' && x < R.r + 1 && x + w > R.l) x = R.r + 3
          }
        if (Math.abs(y - T.y) > h || Math.abs(x - T.x) > h) return null
        // Nothing in the way was a zone: a whole line out, then, clear of a name that is.
        if (x === T.x && y === T.y) {
          if (way === 'above') y -= h
          if (way === 'below') y += h
          if (way === 'left') x -= h
          if (way === 'right') x += h
        }
        return { tag: `${p.tag === 'k19' ? '' : `${p.tag}-`}out`, at: p.at, step: { x: p.step.x + x - T.x, y: p.step.y + y - T.y } }
      }
      const k19Place: Place = { tag: 'k19', at: corner, step }
      const opposite = { above: 'below', below: 'above', left: 'right', right: 'left', on: 'below' }[side]
      const other: Place =
        opposite === 'below'
          ? { tag: 'opposite', at: { x: corner.x, y: Z.b }, step: { x: step.x, y: OFF_Y } }
          : opposite === 'above'
            ? { tag: 'opposite', at: { x: corner.x, y: Z.t }, step: { x: step.x, y: -OFF_Y - h } }
            : opposite === 'left'
              ? { tag: 'opposite', at: { x: Z.l, y: corner.y }, step: { x: -OFF_X - w, y: step.y } }
              : { tag: 'opposite', at: { x: Z.r, y: corner.y }, step: { x: OFF_X, y: step.y } }
      const tries: (Place | null)[] = [out(k19Place, side), other, out(other, opposite)]
      // A name beside its zone may also stand at either end of it, above or below, anchored at the
      // end nearest the rim and growing inward — which is where #76 put it on the narrow felt.
      if (side === 'left' || side === 'right') {
        const east = l.z.dataset['rim'] === 'E'
        const x = east ? Z.r : Z.l
        const dx = east ? -IN - w : IN
        const up: Place = { tag: 'end-up', at: { x, y: Z.t }, step: { x: dx, y: -END_OFF - h } }
        const down: Place = { tag: 'end-down', at: { x, y: Z.b }, step: { x: dx, y: END_OFF } }
        tries.push(up, out(up, 'above'), down, out(down, 'below'))
      }
      // And a name along an edge has the same two ends: it may stand at the far end of the edge it
      // stood off, anchored there with the inset it had, and then at the far end of the other edge.
      if (side === 'above' || side === 'below') {
        const fromLeft = P.x - Z.l
        const fromRight = Z.r - (P.x + w)
        const atLeft = fromLeft <= fromRight
        const x = atLeft ? Z.r : Z.l
        const dx = atLeft ? -Math.max(0, fromLeft) - w : Math.max(0, fromRight)
        const near: Place = { tag: 'far-end', at: { x, y: side === 'above' ? Z.t : Z.b }, step: { x: dx, y: side === 'above' ? -(Z.t - (P.y + h)) - h : P.y - Z.b } }
        const far: Place = { tag: 'far-end-opposite', at: { x, y: other.at.y }, step: { x: dx, y: other.step.y } }
        tries.push(near, out(near, side), far, out(far, opposite))
      }
      const first = (clear: (o: Label) => boolean): string | null => {
        for (const p of tries) {
          if (!p) continue
          hang(l.z, l.el, p.at, p.step)
          if (clear(l)) return p.tag
        }
        return null
      }
      // Inside its own box, along the edge it stood off, cut short if it must be. There it lies on
      // what the zone holds, so it is drawn over it on a plate of its own (#874), and the plate is
      // part of how wide it is: `table.css` gives it to the name marked inside, which is measured
      // marked.
      const room = Z.r - Z.l - 12
      const plated = (): { w: number; h: number } => {
        l.el.setAttribute('data-name-at', 'inside')
        const size = { w: l.el.offsetWidth, h: l.el.offsetHeight }
        l.el.removeAttribute('data-name-at')
        return size
      }
      const inside = () => {
        home(l.el)
        l.el.setAttribute('data-name-at', 'inside')
        const at = { w: l.el.offsetWidth, h: l.el.offsetHeight }
        if (at.w > room) {
          l.el.style.maxWidth = `${Math.max(0, room)}px`
          l.el.style.overflow = 'hidden'
          l.el.style.textOverflow = 'ellipsis'
        }
        const low = side === 'below'
        hang(l.z, l.el, { x: Z.l, y: low ? Z.b : Z.t }, { x: 6, y: low ? -3 - at.h : 3 })
        return 'inside'
      }
      // The first place that is free of everything. Then inside, where the whole name fits. Then
      // the first place that only lies on the felt's furniture — a pile, a badge, a hand — which is
      // better than a name cut short; and last inside, cut short, except on a felt that shows one
      // name at a time.
      let found = first((o) => !lands(o) && !onFurniture(o))
      if (found === null && plated().w <= room) found = inside()
      if (found === null) found = first((o) => !lands(o))
      if (found === null && !oneAtATime) found = inside()
      if (found === null) {
        // The Bord tab shows this one name and no other (#581), on a plate of its own that is drawn
        // over everything else, so the plate may stand on another name — and where even that leaves
        // no place clear of every other zone, over a neighbour. Cutting the name short would hide
        // the one thing the designer asked to see.
        for (const p of [k19Place, ...tries]) {
          if (!p) continue
          hang(l.z, l.el, p.at, p.step)
          if (!onZone(l)) {
            found = `plate-${p.tag}`
            break
          }
        }
        if (found === null) {
          home(l.el)
          found = 'covers'
        }
      }
      l.el.setAttribute('data-name-at', found)
      placed[name] = found
    }
  }
  return placed
}

// A seat's plate on the room's television stands on a free place too (#683, beslut E 2026-10-05).
//
// K26 put the plate beside the seat's own zones, on the side that faces the middle of the table.
// The zones are the designer's, and that side can be a neighbour's: with four seats Sal's Saloon
// lies 30 mm under seat B's zones, so B's plate stood in the saloon's box at 1280 and at 1920.
// #750 then capped how far a plate could grow, and the cap cut the plates at the sides to «5 kor…»
// and «Guld…».
//
// So a plate says the seat's letter, name and hand and nothing more — a counter's figure is on its
// own chip again — and is placed in #685's order: its own place, the other end of its zones, a
// line further out, the opposite side, and the two ends of the seat's row. It may leave its own
// place. The first place that is free of every pile and its words, every zone's box, every zone's
// name, every hand, every chip, the television's chrome and every plate already placed wins. The
// seats at the sides go first, since they have least room. A plate that fits nowhere becomes a
// badge with the seat's mark, the ball and its letter, and is placed by the same order; it is never
// cut short. Its name and hand stay in the page, for whoever reads it out.
//
// Like the names, a plate is measured as this machine draws it, and laid out again when its words
// change their size (a name, a hand, a wider typeface): K20's 15 % is what the gates draw it wider
// by and let the app lay out again, not a margin kept around every plate.
//
// Like the names, the place is decided once, at the felt's fitted scale (#43): it is said as a
// corner, an edge's middle or the middle of the seat's zones — which the felt scales — and a step
// in screen pixels from it, which it does not. The renderer draws the plate from that, so a camera
// that zooms carries every plate on its side. A plate at the east hangs from its right edge, as K26
// hung it, so that its words grow away from its zones.
//
// Self-contained, like `placeNames`, so a test can run it as a string inside the page.

/** Where a seat's plate stands: a point the felt carries and a step off it in screen pixels. */
export type PlateAt = {
  /** `badge`: the seat's mark alone, where the whole plate fits nowhere. */
  form: 'plate' | 'badge'
  /** The point of the seat's zones the plate hangs from: left, middle or right; top, middle or bottom. */
  x: 'l' | 'm' | 'r'
  y: 't' | 'm' | 'b'
  /** The step from that point to the plate's top-left corner — its top-right at the east — in pixels. */
  dx: number
  dy: number
  /** Which place in the order it found. */
  tag: string
}

/**
 * Lays every seat plate on the felts under `root` out on a free place, and answers where each one
 * went, by seat. With `home`, every plate is only put back at its own place, as a whole plate, and
 * nothing is answered: what the zones' names are laid out against before the plates move.
 */
export function placePlates(root: ParentNode, home = false): Record<string, PlateAt> {
  // The air between a plate and its zones, the same as K26's own place keeps, and a line further
  // out: about a plate's row of 24 px text.
  const GAP = 8
  const LINE = 30
  const SLACK = 0.5
  // What a plate stands clear of on the felt: a pile and its words, a zone's box and name, an area's
  // count, a hand, a chip and its figure, a seat's name card.
  const FELT = '.byd-pile, .byd-pile-n, .byd-pile-name, .byd-pile-caption, .byd-zone, .byd-zone > span, .byd-area-count, .byd-hand-fan > i, .byd-hand-count, .byd-token, .byd-token > b, .byd-seat-name'
  // And the television's own chrome where it stands over the felt.
  const CHROME = '.byd-table-restart, .byd-shortcut-open, [data-tv] > aside'

  type Box = { l: number; t: number; r: number; b: number }
  type Found = { tag: string; x: number; y: number; w: number; h: number; form: PlateAt['form'] }
  const placed: Record<string, PlateAt> = {}
  const felts = [...((root as Element).matches?.('[data-table]') ? [root as HTMLElement] : []), ...root.querySelectorAll<HTMLElement>('[data-table]')]
  for (const felt of felts) {
    const plates = [...felt.querySelectorAll<HTMLElement>(':scope > [data-seat-plate]')]
    if (plates.length === 0) continue
    const fb = felt.getBoundingClientRect()
    const k = felt.offsetWidth > 0 ? fb.width / felt.offsetWidth : 0
    // Nothing is laid out (jsdom, or a felt not on the page): the plates stay where they are drawn.
    if (!(k > 0)) continue
    const toFelt = (r: DOMRect): Box => ({ l: (r.left - fb.left) / k, t: (r.top - fb.top) / k, r: (r.right - fb.left) / k, b: (r.bottom - fb.top) / k })
    // The seat's own zones, as the renderer drew them: felt pixels at the fitted scale.
    const zonesOf = (p: HTMLElement): Box | null => {
      const n = (p.dataset['box'] ?? '').split(' ').map(Number)
      const [l = NaN, t = NaN, r = NaN, b = NaN] = n
      return n.length === 4 && [l, t, r, b].every(Number.isFinite) ? { l, t, r, b } : null
    }
    const east = (p: HTMLElement) => p.dataset['edge'] === 'E'
    const size = (p: HTMLElement) => {
      const r = p.getBoundingClientRect()
      return { w: r.width / k, h: r.height / k }
    }
    // Puts the plate's top-left — its top-right at the east — at (x, y), in felt pixels.
    const put = (p: HTMLElement, x: number, y: number) => {
      p.style.left = `${x}px`
      p.style.top = `${y}px`
      p.style.transform = east(p) ? 'translateX(-100%)' : 'none'
    }
    const form = (p: HTMLElement, f: PlateAt['form']) => {
      if (f === 'badge') p.setAttribute('data-form', 'badge')
      else p.removeAttribute('data-form')
    }
    // K26's own place, as a top-left corner: under the zones at the top rim, above them at the
    // bottom, and beside them, level with their middle, at the sides.
    const own = (p: HTMLElement, z: Box, w: number, h: number) => {
      const e = p.dataset['edge']
      return e === 'N' ? { x: z.l, y: z.b + GAP } : e === 'S' ? { x: z.l, y: z.t - GAP - h } : e === 'W' ? { x: z.r + GAP, y: (z.t + z.b) / 2 - h / 2 } : { x: z.l - GAP - w, y: (z.t + z.b) / 2 - h / 2 }
    }
    for (const p of plates) {
      form(p, 'plate')
      p.removeAttribute('data-plate-at')
      const z = zonesOf(p)
      if (!z) continue
      const { w, h } = size(p)
      const at = own(p, z, w, h)
      put(p, east(p) ? at.x + w : at.x, at.y)
    }
    if (home) continue

    const shown = (el: Element): DOMRect | null => {
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden') return null
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 ? r : null
    }
    const fixed: Box[] = [...felt.querySelectorAll(FELT), ...(felt.ownerDocument?.querySelectorAll(CHROME) ?? [])].flatMap((el) => {
      const r = shown(el)
      return r ? [toFelt(r)] : []
    })
    // The felt, and of it what its frame shows.
    const frame = felt.closest('.byd-table-frame')
    const fr = frame ? toFelt(frame.getBoundingClientRect()) : null
    const W = felt.offsetWidth
    const H = felt.offsetHeight
    const bounds: Box = fr ? { l: Math.max(0, fr.l), t: Math.max(0, fr.t), r: Math.min(W, fr.r), b: Math.min(H, fr.b) } : { l: 0, t: 0, r: W, b: H }
    const meet = (a: Box, b: Box) => a.l < b.r - SLACK && b.l < a.r - SLACK && a.t < b.b - SLACK && b.t < a.b - SLACK
    // The plates already placed.
    const taken: Box[] = []
    const clear = (r: Box) => {
      if (r.l < bounds.l - SLACK || r.r > bounds.r + SLACK || r.t < bounds.t - SLACK || r.b > bounds.b + SLACK) return false
      return ![...fixed, ...taken].some((o) => meet(r, o))
    }
    // #685's order from the plate's own place, as top-left corners.
    const places = (p: HTMLElement, z: Box, w: number, h: number): [string, number, number][] => {
      const e = p.dataset['edge']
      const at = own(p, z, w, h)
      const c: [string, number, number][] = [['own', at.x, at.y]]
      if (e === 'N' || e === 'S') {
        const out = e === 'N' ? LINE : -LINE
        c.push(['other-end', z.r - w, at.y], ['out', at.x, at.y + out], ['other-end-out', z.r - w, at.y + out])
        c.push(['opposite', at.x, e === 'N' ? z.t - GAP - h : z.b + GAP])
        // The two ends of the seat's row, level with it: at the rim side, the middle, the inner side.
        const ys = e === 'N' ? [z.t, (z.t + z.b) / 2 - h / 2, z.b - h] : [z.b - h, (z.t + z.b) / 2 - h / 2, z.t]
        ys.forEach((y, i) => c.push([`end-before-${i}`, z.l - GAP - w, y]))
        ys.forEach((y, i) => c.push([`end-after-${i}`, z.r + GAP, y]))
      } else {
        c.push(['upper-end', at.x, z.t], ['lower-end', at.x, z.b - h])
        c.push(['out', at.x + (e === 'W' ? LINE : -LINE), at.y])
        c.push(['opposite', e === 'W' ? z.l - GAP - w : z.r + GAP, at.y])
        c.push(['above', e === 'W' ? z.l : z.r - w, z.t - GAP - h], ['below', e === 'W' ? z.l : z.r - w, z.b + GAP])
      }
      return c
    }
    // The point of the zones nearest the plate's hanging corner, and the step off it.
    const hang = (z: Box, x: number, y: number): Omit<PlateAt, 'form' | 'tag'> => {
      const xs: [PlateAt['x'], number][] = [['l', z.l], ['m', (z.l + z.r) / 2], ['r', z.r]]
      const ys: [PlateAt['y'], number][] = [['t', z.t], ['m', (z.t + z.b) / 2], ['b', z.b]]
      const nx = xs.reduce((a, b) => (Math.abs(b[1] - x) < Math.abs(a[1] - x) ? b : a))
      const ny = ys.reduce((a, b) => (Math.abs(b[1] - y) < Math.abs(a[1] - y) ? b : a))
      return { x: nx[0], y: ny[0], dx: x - nx[1], dy: y - ny[1] }
    }
    // The seats at the sides first: they have the least room.
    const side = (p: HTMLElement) => (p.dataset['edge'] === 'E' || p.dataset['edge'] === 'W' ? 0 : 1)
    const order = [...plates].sort((a, b) => side(a) - side(b))
    for (const p of order) {
      const seat = p.dataset['seatPlate'] ?? ''
      const z = zonesOf(p)
      if (!z) continue
      const toLeft = east(p)
      let found: Found | null = null
      for (const f of ['plate', 'badge'] as const) {
        form(p, f)
        const { w, h } = size(p)
        for (const [tag, x, y] of places(p, z, w, h))
          if (clear({ l: x, t: y, r: x + w, b: y + h })) {
            found = { tag: f === 'badge' ? `badge-${tag}` : tag, x, y, w, h, form: f }
            break
          }
        if (found) break
      }
      if (!found) {
        // Nowhere free even for the badge: it stands at its own place, where it covers least.
        const { w, h } = size(p)
        const at = own(p, z, w, h)
        found = { tag: 'badge-covers', x: at.x, y: at.y, w, h, form: 'badge' }
      }
      const hx = toLeft ? found.x + found.w : found.x
      put(p, hx, found.y)
      taken.push({ l: found.x, t: found.y, r: found.x + found.w, b: found.y + found.h })
      p.setAttribute('data-plate-at', found.tag)
      placed[seat] = { form: found.form, ...hang(z, hx, found.y), tag: found.tag }
    }
  }
  return placed
}
