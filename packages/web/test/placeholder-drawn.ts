import { REDACTED } from '@byd/protocol'

// Where a masked field's placeholder (`REDACTED`, U+E000, #1279) reaches what a reader is given
// (#1349): a text the page draws, any attribute an element carries — an aria-label is read aloud,
// a title is shown on hover, an alt stands in for a picture — and the page's own title. A screen
// draws the placeholder as a box or as nothing, so a masked field is said in the reader's words
// (`masked.ts`) before it gets this far. Empty when nothing does, and otherwise where it did and
// what stood there, so a failure names the surface's own words.
export function placeholderDrawn(root: Element = document.body): string[] {
  const found: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent ?? ''
    if (text.includes(REDACTED)) found.push(`text in <${node.parentElement?.tagName.toLowerCase() ?? '?'}>: ${JSON.stringify(text)}`)
  }
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const a of el.attributes) if (a.value.includes(REDACTED)) found.push(`<${el.tagName.toLowerCase()} ${a.name}=${JSON.stringify(a.value)}>`)
  }
  if (document.title.includes(REDACTED)) found.push(`document.title: ${JSON.stringify(document.title)}`)
  return found
}
