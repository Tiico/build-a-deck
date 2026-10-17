// Text fitting in a real DOM (E6). The compiler stamps every text element with data-fit,
// data-size-pt and data-min-pt; this steps the size down until the text fits its box, using
// the browser's own metrics. It runs unchanged in the editor preview and inside Chromium in
// the renderer — one algorithm everywhere. Self-contained on purpose: it is serialised into
// the page by the renderer, so it must not reference anything outside itself.

// `empty`: the box holds no words, so its size is no text anyone reads (#523).
// `minPt`: the floor the box was allowed to shrink to. `hidden`: how many lines of a text that
// does not fit the box cuts off, a line the box cuts through included — what the card does not
// show of it (#808). Nought for a text that fits.
export type FitReport = { element: string; sizePt: number; minPt: number; overflow: boolean; empty: boolean; hidden: number }

export function fitInDocument(root: ParentNode): FitReport[] {
  const out: FitReport[] = []
  const nodes = root.querySelectorAll<HTMLElement>('[data-element][data-fit]')
  for (const el of nodes) {
    const start = Number(el.dataset['sizePt'])
    const min = Number(el.dataset['minPt'])
    const shrink = el.dataset['fit'] === 'shrink'
    let size = start
    el.style.fontSize = `${size}pt`
    const overflows = () => el.scrollHeight > el.clientHeight + 0.5 || el.scrollWidth > el.clientWidth + 0.5
    if (shrink) {
      while (overflows() && size - 0.5 >= min - 1e-9) {
        size -= 0.5
        el.style.fontSize = `${size}pt`
      }
    }
    const overflow = overflows()
    // The lines are the text's own line boxes, read off its text nodes one at a time: a range over
    // the whole box would also hand back the box of every paragraph in it, which is as tall as all
    // its lines and would be counted as one cut line. A clipped line is still laid out, so the
    // lines the box cuts off are among them; a line is one however many runs it is made of.
    let hidden = 0
    const doc = el.ownerDocument
    if (overflow && typeof doc.createRange === 'function') {
      const bottom = el.getBoundingClientRect().bottom
      const tops: { top: number; bottom: number }[] = []
      // 4 is `NodeFilter.SHOW_TEXT`, written out because this runs serialised in another page.
      const walk = doc.createTreeWalker(el, 4)
      const range = doc.createRange()
      for (let node = walk.nextNode(); node; node = walk.nextNode()) {
        range.selectNodeContents(node)
        for (const r of typeof range.getClientRects === 'function' ? range.getClientRects() : []) {
          if (r.width < 0.5 || r.height < 0.5) continue
          const line = tops.find((l) => Math.abs(l.top - r.top) < r.height / 2)
          if (line) line.bottom = Math.max(line.bottom, r.bottom)
          else tops.push({ top: r.top, bottom: r.bottom })
        }
      }
      hidden = tops.filter((l) => l.bottom > bottom + 0.5).length
    }
    out.push({ element: el.dataset['element'] ?? '', sizePt: size, minPt: min, overflow, empty: (el.textContent ?? '').trim() === '', hidden })
  }
  return out
}
