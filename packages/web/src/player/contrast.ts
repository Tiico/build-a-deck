// WCAG contrast, and the custom properties a stylesheet declares.
// The player view keeps its colours as tokens in player.css so a colour change is a testable
// change: the pairs below name what sits on what, and the test measures the shipped values.

const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

const alpha = (raw: string | undefined) => (raw === undefined ? 1 : raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw))

const SECTORS = [
  [1, 2, 0],
  [2, 1, 0],
  [0, 1, 2],
  [0, 2, 1],
  [2, 0, 1],
  [1, 0, 2],
] as const

// `parts` is [chroma, midpoint, zero]; each sector says which of the three each channel takes.
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const parts = [c, c * (1 - Math.abs(((h / 60) % 2) - 1)), 0] as const
  const sector = SECTORS[Math.floor((((h % 360) + 360) % 360) / 60) % 6] ?? SECTORS[0]
  const m = l - c / 2
  return sector.map((i) => Math.round((parts[i] + m) * 255)) as [number, number, number]
}

// #rgb, #rrggbb, hsl(h s% l%) and rgb()/rgba() — what the stylesheet writes and what a browser
// hands back. Alpha comes last; `transparent` is black at zero.
export function parseColor(color: string): [number, number, number, number] {
  const css = color.trim()
  if (css === 'transparent') return [0, 0, 0, 0]
  const digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css)?.[1]
  if (digits) {
    const full = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
    return [r, g, b, 1]
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i.exec(css)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha(rgb[4])]
  const hsl = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i.exec(css)
  if (hsl) return [...hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100), alpha(hsl[4])]
  throw new Error(`not a colour this module reads: ${color}`)
}

export function relativeLuminance(color: string): number {
  const [red, green, blue] = parseColor(color)
  const [r, g, b] = [red, green, blue].map((v) => channel(v / 255)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// The declarations a stylesheet makes under exactly one selector. A sheet shared between surfaces
// binds the same token name once per surface — `--byd-primary-bg` is green on the felt and blue in
// the editor — so reading it flat would hand back whichever surface happens to be written last.
// Comments go first: a comment may tell the story of a colour, and only declarations count.
export function cssDeclaredUnder(css: string, selector: string): string {
  let out = ''
  for (const [, selectors, body] of css.replaceAll(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors?.split(',').some((one) => one.trim() === selector)) out += `${body};`
  }
  return out
}

// Every `--name: value` a stylesheet declares, last declaration winning — and a token whose value
// is another token is followed through to the colour at the end of it. One surface's role may
// honestly be another token it already owns ("the wizard's first action is its own ink"), and a
// test that measured the literal `var(--ink)` would measure nothing at all.
export function cssCustomProperties(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) if (name && value) found.set(name, value.trim())
  // Bounded by the number of declarations, so a token that points at itself stops rather than
  // spinning; what is left still says `var(...)` and fails loudly where it is read.
  for (let pass = 0; pass < found.size; pass++) {
    let moved = false
    for (const [name, value] of found) {
      const pointed = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value)?.[1]
      const to = pointed === undefined || pointed === name ? undefined : found.get(pointed)
      if (to !== undefined && to !== value) {
        found.set(name, to)
        moved = true
      }
    }
    if (!moved) break
  }
  return found
}

export type TextPair = {
  /** What a player reads there, so a failure names the place and not a hex code. */
  what: string
  ink: string
  on: string
  /** WCAG's threshold split: 18.66px bold or 24px is large text, everything else is normal. */
  size: 'normal' | 'large'
}

// Every ink-on-ground pair the player view puts normal text in. Adding a colour to player.css
// without adding it here is the one gap this cannot close, so keep them side by side.
export const PLAYER_TEXT_PAIRS: readonly TextPair[] = [
  { what: 'body text on the view', ink: '--byd-ink', on: '--byd-bg', size: 'normal' },
  { what: 'the seat name in the header', ink: '--byd-ink-strong', on: '--byd-bg', size: 'normal' },
  { what: 'the header meta and the table summary', ink: '--byd-ink-muted', on: '--byd-bg', size: 'normal' },
  { what: 'the hand help line', ink: '--byd-ink-quiet', on: '--byd-bg', size: 'normal' },
  { what: 'a zone name on its summary card', ink: '--byd-ink-strong', on: '--byd-surface', size: 'normal' },
  { what: 'a count on its summary card', ink: '--byd-ink-muted', on: '--byd-surface', size: 'normal' },
  { what: 'text typed into a sheet field', ink: '--byd-ink-strong', on: '--byd-bg', size: 'normal' },
  { what: "a control's label", ink: '--byd-ink-strong', on: '--byd-control', size: 'normal' },
  { what: "a play target's second line", ink: '--byd-ink-muted', on: '--byd-control', size: 'normal' },
  { what: 'the label on the first action', ink: '--byd-primary-ink', on: '--byd-primary-bg', size: 'normal' },
  { what: 'the label of a second action beside it', ink: '--byd-secondary-ink', on: '--byd-bg', size: 'normal' },
  { what: 'the toast', ink: '--byd-warn-bg', on: '--byd-warn', size: 'normal' },
  { what: 'the rewind banner', ink: '--byd-warn', on: '--byd-warn-bg', size: 'normal' },
  { what: "the rewind banner's own button", ink: '--byd-ink-muted', on: '--byd-warn-bg', size: 'normal' },
  { what: 'the label on a destructive button', ink: '--byd-danger', on: '--byd-danger-bg', size: 'normal' },
  { what: 'a survey error', ink: '--byd-danger', on: '--byd-bg', size: 'normal' },
  { what: 'the survey scale labels', ink: '--byd-ink-quiet', on: '--byd-bg', size: 'normal' },
]

// A hand card's face is `hsl(<hue> <s> <l>)` with the hue from the card, so the ink has to read
// on the whole ramp, not on one lucky hue.
export function cardFaceRamp(saturation: string, lightness: string): string[] {
  return Array.from({ length: 360 }, (_, h) => `hsl(${h} ${saturation} ${lightness})`)
}

// Layers from the back forward, each painted over the one before; the first must be opaque.
// Computed styles hand back `rgba(…)` stacks, so measuring them needs the flattened ground.
export function flatten(layers: readonly string[]): string {
  return layers.reduce((under, over) => {
    const [r, g, b, a] = parseColor(over)
    if (a === 1) return `rgb(${r}, ${g}, ${b})`
    const [br, bg, bb] = parseColor(under)
    const mix = (top: number, bottom: number) => Math.round(top * a + bottom * (1 - a))
    return `rgb(${mix(r, br)}, ${mix(g, bg)}, ${mix(b, bb)})`
  })
}
