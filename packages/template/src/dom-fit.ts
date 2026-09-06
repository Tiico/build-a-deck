// Text fitting in a real DOM (E6). The compiler stamps every text element with data-fit,
// data-size-pt and data-min-pt; this steps the size down until the text fits its box, using
// the browser's own metrics. It runs unchanged in the editor preview and inside Chromium in
// the renderer — one algorithm everywhere. Self-contained on purpose: it is serialised into
// the page by the renderer, so it must not reference anything outside itself.

export type FitReport = { element: string; sizePt: number; overflow: boolean }

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
    out.push({ element: el.dataset['element'] ?? '', sizePt: size, overflow: overflows() })
  }
  return out
}
