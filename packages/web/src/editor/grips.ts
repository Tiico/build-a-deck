// What the felt's names do while a zone is being held (#424, decision D of 2026-09-22).
//
// The Bord tab draws a size grip on the zone the designer has taken hold of. A grip sits inside
// its own zone's rectangle, and K19 has always let a *neighbour's* name be drawn over that
// rectangle — so a name can land on a grip that is not its own, and then the grip cannot be
// grabbed. `Räknare A` on the market's grip is the case the issue was written about, and no
// placement of the grip inside its own box can answer it.
//
// The answer is that the one name in the way steps aside for as long as the grip is drawn. It is
// transient by construction: at rest no grip is drawn, so no name has moved and the resting
// picture still says the names on exactly the millimetres the played felt says them (B5).
//
// This is an exported function and not a React effect, and deliberately. The felt's names are
// measured by putting the tab's markup on a page, where no effect ever runs — a rule that lived
// in one could not be measured at all, and this is the gate that would have to catch it.

/**
 * Sends every felt name that crosses a drawn grip out of its way, and puts back the ones that no
 * longer need to move. Answers how far each was sent, by the name it carries.
 *
 * Upward, which is the way K19 already sends a name off its own zone's top edge — so a name that
 * steps aside goes further in the direction it was already going, rather than into the zone it
 * belongs to. One pixel at a time until it is clear, because how far is a question about this
 * layout and not a number anyone can write down in advance.
 *
 * Self-contained on purpose: the felt's own gate runs this as a string inside the page, and a
 * constant or a helper left outside the body would not travel with it.
 */
export function stepAside(root: ParentNode): Record<string, number> {
  // The room a name is given around itself, the same the felt's own reading asks for.
  const MARGIN = 1.15
  // As far as a name may be sent. A grip is 12 px and a name 13; beyond this something is wrong.
  const REACH = 60
  const grown = (r: DOMRect) => {
    const dw = (r.width * (MARGIN - 1)) / 2
    const dh = (r.height * (MARGIN - 1)) / 2
    return { left: r.left - dw, right: r.right + dw, top: r.top - dh, bottom: r.bottom + dh }
  }
  const hits = (a: { left: number; right: number; top: number; bottom: number }, b: DOMRect) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

  for (const el of root.querySelectorAll<HTMLElement>('.byd-zone > span[data-stepped]')) {
    el.style.translate = ''
    el.removeAttribute('data-stepped')
  }
  const grips = [...root.querySelectorAll<HTMLElement>('.byd-setup-corner')].map((g) => g.getBoundingClientRect())
  const sent: Record<string, number> = {}
  if (grips.length === 0) return sent
  for (const el of root.querySelectorAll<HTMLElement>('.byd-zone > span')) {
    let dy = 0
    while (dy < REACH && grips.some((g) => hits(grown(el.getBoundingClientRect()), g))) {
      dy += 1
      el.style.translate = `0 ${-dy}px`
    }
    if (dy > 0) {
      el.setAttribute('data-stepped', String(dy))
      sent[(el.textContent ?? '').trim()] = dy
    }
  }
  return sent
}
