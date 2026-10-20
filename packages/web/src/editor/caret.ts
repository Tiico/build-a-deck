// Where a click in a rendered paragraph puts the caret in the field it opens (#972, L51). The
// paragraph as read is its source with the markup taken out — a reference's brackets, a bold's
// stars — so the place in what was read is found in what is written by walking the two side by
// side: a character they share moves both on, a character only the source has (markup) moves the
// source on alone. A place the walk never reaches, because what was read is not what is written
// (a reference rewritten to another name), is the end of the field, where typing goes on anyway.
export function caretInSource(read: string, at: number, source: string): number {
  let i = 0
  let j = 0
  while (j < at && i < source.length) {
    if (source[i] === read[j]) j++
    i++
  }
  if (j !== at) return source.length
  // And past the markup that stands in front of the character that was clicked.
  while (at < read.length && i < source.length && source[i] !== read[at]) i++
  return i
}

// The place in an element's own text a pointer stands at, as the browser lays the text out: the
// characters of every text node before the one hit, plus the offset in it. `null` where the
// browser cannot say, which leaves the caret where the field puts it.
export function readOffsetAt(el: Element, x: number, y: number): number | null {
  const doc = el.ownerDocument as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }
  const hit = doc.caretPositionFromPoint?.(x, y) ?? (() => {
    const r = doc.caretRangeFromPoint?.(x, y)
    return r ? { offsetNode: r.startContainer, offset: r.startOffset } : null
  })()
  if (!hit || !el.contains(hit.offsetNode)) return null
  let before = 0
  const walk = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n === hit.offsetNode) return before + hit.offset
    before += n.textContent?.length ?? 0
  }
  return null
}
