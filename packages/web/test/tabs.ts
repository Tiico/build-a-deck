// The tab order as a browser would walk it, for a document jsdom does not walk. jsdom knows the
// `inert` attribute but does not enforce it, and user-event's Tab walks past it too, so a test
// that asks where Tab lands from a control has to answer the way the browser does: every
// focusable, in document order, that is not disabled, not hidden from the sequence by a negative
// tabindex, and not under anything `inert`.
const FOCUSABLE = 'input:not([type=hidden]), button, select, textarea, a[href], [tabindex], [contenteditable="true"], details > summary'

export function tabStops(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !(el as HTMLButtonElement).disabled && !(Number(el.getAttribute('tabindex')) < 0) && el.closest('[inert]') === null,
  )
}

// Where Tab lands from `from`: the next stop in the sequence, wrapping around the document the
// way a browser wraps to the top once the last stop is behind it.
export function tabFrom(from: HTMLElement): HTMLElement | undefined {
  const stops = tabStops()
  const at = stops.indexOf(from)
  return stops[(at + 1) % stops.length]
}
