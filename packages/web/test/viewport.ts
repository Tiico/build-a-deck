// jsdom answers no media query at all, and the editor and the wizard ask the window how much
// room they have before they decide what shape to be (L10). A test that renders at a width says
// so here, so that what is mounted and what is measured are the same width.
//
// The pointer is the other half of the answer (L12, tillägg 2026-09-30): a mouse or a trackpad is
// a desk however narrow the window has been zoomed to. Unsaid, the window has no pointer at all and
// answers no pointer query — which is how every test written before the rule still reads.
export function atWidth(width: number, { pointer }: { pointer?: 'fine' | 'coarse' } = {}): void {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    const max = /max-width:\s*(\d+)px/.exec(query)
    const asksPointer = /\((?:any-)?pointer:|\((?:any-)?hover:/.test(query)
    const pointerMatches = pointer === 'fine' ? !/coarse|hover:\s*none/.test(query) : pointer === 'coarse' ? !/fine|hover:\s*hover/.test(query) : false
    return {
      matches: asksPointer ? pointerMatches : min ? width >= Number(min[1]) : max ? width <= Number(max[1]) : false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    } as unknown as MediaQueryList
  }) as typeof window.matchMedia
}
