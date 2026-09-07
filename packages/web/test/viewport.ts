// jsdom answers no media query at all, and the editor and the wizard ask the window how much
// room they have before they decide what shape to be (L10). A test that renders at a width says
// so here, so that what is mounted and what is measured are the same width.
export function atWidth(width: number): void {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    const max = /max-width:\s*(\d+)px/.exec(query)
    return {
      matches: min ? width >= Number(min[1]) : max ? width <= Number(max[1]) : false,
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
