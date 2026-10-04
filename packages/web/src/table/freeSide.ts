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
      // Inside its own box, along the edge it stood off, cut short if it must be.
      const room = Z.r - Z.l - 12
      const inside = () => {
        home(l.el)
        if (w > room) {
          l.el.style.maxWidth = `${Math.max(0, room)}px`
          l.el.style.overflow = 'hidden'
          l.el.style.textOverflow = 'ellipsis'
        }
        const low = side === 'below'
        hang(l.z, l.el, { x: Z.l, y: low ? Z.b : Z.t }, { x: 6, y: low ? -3 - h : 3 })
        return 'inside'
      }
      // The first place that is free of everything. Then inside, where the whole name fits. Then
      // the first place that only lies on the felt's furniture — a pile, a badge, a hand — which is
      // better than a name cut short; and last inside, cut short, except on a felt that shows one
      // name at a time.
      let found = first((o) => !lands(o) && !onFurniture(o))
      if (found === null && w <= room) found = inside()
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
