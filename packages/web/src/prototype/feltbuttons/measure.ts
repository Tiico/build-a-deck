// PROTOTYPE — throwaway (#90). The numbers L13 gates on, read off the page the same way for every
// variant: 4.5:1 for a button's text against the ground it actually lands on, 3:1 for the line it
// is drawn with and for the bar under a chosen one.
//
// The grounds differ, and that is the whole point of measuring on the felt rather than in a
// fixture: a ring opens where the finger let go, so one disc lands on the felt's green, the next
// on the wooden rim and the next on the dark beyond it, while the sheet's own keys land on the
// sheet's dark plate. A single "the felt is #2e6b46" would be a guess about three of those four.
//
// So the ground is SAMPLED from the painted pixels wherever a sampler is handed in. The felt is a
// `radial-gradient` and the ring's plate is translucent; neither has a `background-color` a
// computed style would report, and compositing declared colours up the ancestor chain would miss
// both. `shots.mjs` screenshots the page, draws it into a canvas and hands the sampler in here,
// so one implementation produces both the live note at the bottom of the screen and the JSON.
// Without a sampler the reading falls back to compositing computed backgrounds, which cannot see
// a gradient — the note says `~` when that happened, and the JSON never does.
//
// The element's own colours are NOT sampled: `color` and `border-color` are read from the
// computed style and composited over the sampled ground, because a glyph's own pixels are
// antialiased against the ground and sampling them would measure the antialiasing.

export type Rgb = [number, number, number]
export type Sample = (x: number, y: number) => Rgb | null

export type Gate = { color: string; ratio: number; pass: boolean }
export type ButtonReading = {
  where: string
  label: string
  box: { w: number; h: number }
  ground: string
  outside: string
  sampled: boolean
  // A control that cannot be pressed is measured and reported, but it is not held to the gates:
  // WCAG exempts an inactive component, and `table.css` fades a disabled disc to `opacity: 0.35`
  // in every variant alike, so counting it would put the same failure under all four positions
  // and say nothing about any of them. The fade IS folded into the numbers below, so the reported
  // ratio is what the eye gets and not what the declaration says.
  disabled: boolean
  text: Gate
  line: Gate | null
  bar: Gate | null
  // What the button's own plate measures against the ground behind it. L13 gates text and line
  // and bar; a filled plate against its ground is not one of its two gates, and it is reported
  // here because a green fill on a green felt is exactly the thing a reader would want the
  // number for. `null` when the button has no fill of its own.
  plate: number | null
}

export type Reading = {
  buttons: ButtonReading[]
  count: number
  failures: string[]
  worstText: number | null
  worstLine: number | null
  sampled: boolean
}

const TEXT_GATE = 4.5
const GRAPHIC_GATE = 3

// ── Colour ───────────────────────────────────────────────────────────────────────────────────
const chan = (v: number): number => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
export const luminance = ([r, g, b]: Rgb): number => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
export function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)]
  const ratio = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  return Math.round(ratio * 100) / 100
}
export const hex = ([r, g, b]: Rgb): string => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

export type Rgba = { rgb: Rgb; a: number }
export function parse(css: string): Rgba | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.%]+))?\s*\)/i.exec(css)
  if (!m) return null
  const alphaRaw = m[4]
  const a = alphaRaw === undefined ? 1 : alphaRaw.endsWith('%') ? parseFloat(alphaRaw) / 100 : parseFloat(alphaRaw)
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number.isFinite(a) ? a : 1 }
}
export const over = (top: Rgba, under: Rgb): Rgb => [0, 1, 2].map((i) => top.rgb[i as 0 | 1 | 2] * top.a + (under[i as 0 | 1 | 2] as number) * (1 - top.a)) as Rgb

// ── The ground ───────────────────────────────────────────────────────────────────────────────
// The most common pixel in a patch, so one antialiased edge inside the patch cannot become the
// answer. The patches are at the button's vertical centre and a little in from each side, which
// is off the glyphs of a centred label and inside the curve of a round 66 px disc — a strip along
// the top edge would fall outside that curve and sample the felt instead of the plate.
const KEY = (c: Rgb) => `${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])}`
function modal(sample: Sample, points: [number, number][]): Rgb | null {
  const seen = new Map<string, { c: Rgb; n: number }>()
  for (const [px, py] of points)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const c = sample(px + dx, py + dy)
        if (!c) continue
        const k = KEY(c)
        const at = seen.get(k)
        if (at) at.n++
        else seen.set(k, { c, n: 1 })
      }
  let best: { c: Rgb; n: number } | null = null
  for (const v of seen.values()) if (!best || v.n > best.n) best = v
  return best?.c ?? null
}

// Without a sampler: the declared backgrounds composited up the ancestor chain. It cannot see a
// gradient, which is why it is the fallback and not the method.
function declared(el: Element | null): Rgb {
  const stack: Rgba[] = []
  for (let node: Element | null = el; node; node = node.parentElement) {
    const c = parse(getComputedStyle(node).backgroundColor)
    if (c && c.a > 0) stack.push(c)
  }
  let out: Rgb = [13, 15, 20]
  for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i] as Rgba, out)
  return out
}

// ── The reading ──────────────────────────────────────────────────────────────────────────────
const NAMES: [string, string][] = [
  ['.byd-set-value-keys', 'ark:tangent'],
  ['.byd-set-value-foot', 'ark:fot'],
  ['.byd-proto-choice', 'ark:val'],
]

function whereOf(el: HTMLElement): string {
  const ring = el.closest('.byd-radial')
  if (ring) return `ring:${ring.getAttribute('data-radial') ?? '?'}`
  for (const [selector, name] of NAMES) if (el.closest(selector)) return name
  return 'filt'
}

const gate = (color: Rgba, ground: Rgb, bar: number): Gate => {
  const on = over(color, ground)
  const ratio = contrast(on, ground)
  return { color: hex(on), ratio, pass: ratio >= bar }
}

// A chosen thing is a 3 px bar and the bar is an inset shadow, so its colour is read out of the
// computed `box-shadow` rather than out of a token — which is what makes the same reading work on
// C, where there is no token to read.
const barColor = (el: HTMLElement): Rgba | null => {
  const shadow = getComputedStyle(el).boxShadow
  if (!shadow || shadow === 'none' || !shadow.includes('inset')) return null
  return parse(shadow)
}

export function read(root: ParentNode, sample?: Sample): Reading {
  const buttons: ButtonReading[] = []
  const failures: string[] = []
  for (const el of root.querySelectorAll<HTMLElement>('button')) {
    if (el.closest('.byd-proto-bar')) continue
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue

    const inset = Math.max(4, Math.round(r.width * 0.12))
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const own = parse(style.backgroundColor) ?? { rgb: [0, 0, 0], a: 0 }
    let ground: Rgb
    let outside: Rgb
    let sampled = false
    const inPoints: [number, number][] = [
      [r.left + inset, cy],
      [r.right - inset, cy],
    ]
    const outPoints: [number, number][] = [
      [cx, r.top - 4],
      [cx, r.bottom + 4],
      [r.left - 4, cy],
      [r.right + 4, cy],
    ]
    const gotIn = sample ? modal(sample, inPoints) : null
    const gotOut = sample ? modal(sample, outPoints) : null
    if (gotIn && gotOut) {
      ground = gotIn
      outside = gotOut
      sampled = true
    } else {
      outside = declared(el.parentElement)
      ground = own.a > 0 ? over(own, outside) : outside
    }

    // The element's own `opacity` fades its ink and its line as well as its plate. The plate is
    // already in the sampled ground; the ink and the line are not, so the fade is folded into
    // their alpha before they are composited.
    const faded = Number(style.opacity) || 1
    const fade = (c: Rgba | null): Rgba | null => (c === null ? null : { rgb: c.rgb, a: c.a * faded })
    const text = gate(fade(parse(style.color)) ?? { rgb: [255, 255, 255], a: faded }, ground, TEXT_GATE)
    const lineColor = fade(parse(style.borderTopColor))
    const width = parseFloat(style.borderTopWidth) || 0
    // A line is measured against what lies OUTSIDE the button: its job is to say where the button
    // ends, and the ground it says that against is the surface the button was laid on.
    const line = width > 0 && style.borderTopStyle !== 'none' && lineColor && lineColor.a > 0 ? gate(lineColor, outside, GRAPHIC_GATE) : null
    const shadow = fade(barColor(el))
    const bar = shadow ? gate(shadow, ground, GRAPHIC_GATE) : null
    const plate = own.a > 0 ? contrast(ground, outside) : null

    const where = whereOf(el)
    const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24) || el.tagName
    const off = (el as HTMLButtonElement).disabled
    const reading: ButtonReading = { where, label, box: { w: Math.round(r.width), h: Math.round(r.height) }, ground: hex(ground), outside: hex(outside), sampled, disabled: off, text, line, bar, plate }
    buttons.push(reading)
    if (off) continue
    if (!text.pass) failures.push(`${where} · ${label} · text ${text.ratio}`)
    if (line && !line.pass) failures.push(`${where} · ${label} · linje ${line.ratio}`)
    if (bar && !bar.pass) failures.push(`${where} · ${label} · stapel ${bar.ratio}`)
  }

  const worst = (all: Gate[]): number | null => (all.length === 0 ? null : Math.min(...all.map((g) => g.ratio)))
  return {
    buttons,
    count: buttons.length,
    failures,
    worstText: worst(buttons.filter((b) => !b.disabled).map((b) => b.text)),
    // Line and bar answer to the same 3:1, so they are one number: the weakest graphic on screen.
    worstLine: worst(buttons.filter((b) => !b.disabled).flatMap((b) => [b.line, b.bar].filter((g): g is Gate => g !== null))),
    sampled: buttons.length > 0 && buttons.every((b) => b.sampled),
  }
}
