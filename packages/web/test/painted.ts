// The ground a button lands on, read off the pixels the browser actually painted (#90).
//
// Every other contrast suite in this directory reads a ground out of a declaration: a token in a
// stylesheet, or a `background-color` walked up the ancestor chain. On the felt neither works.
// The felt is a `radial-gradient` and the dark beyond the rim is another; the wooden rim is a
// `linear-gradient`; a card face is `hsl(var(--hue) 40% 86%)` with the hue coming from the card;
// the ring's own backdrop is translucent. None of those has a `background-color` a computed style
// would report, so a walk up the chain comes back `rgba(0, 0, 0, 0)` at every step and measures a
// colour nothing on screen is wearing.
//
// So the page is photographed, the photograph is handed back into the page as a `data:` URL,
// drawn on a canvas, and the ground is read out of `getImageData`. The button's own ink and line
// are NOT sampled: a glyph's pixels are antialiased against the ground behind them, so sampling
// them would measure the antialiasing. Those come from the computed style, with the element's
// `opacity` folded into their alpha, and are composited over the sampled ground by the caller.
//
// A gradient is not one colour, and that is the point: the prototype found the felt's chalk
// passing at 5.97:1 in the middle and failing at 4.37:1 on the felt's lightest patch. So a spot
// does not come back as one reading. It comes back as three — the darkest twentieth, the middle,
// and the lightest twentieth of everything sampled — and a colour has to hold its gate against
// all three. Percentiles rather than the extremes, because one antialiased pixel of a letter is
// not a ground.

import type { Page } from 'playwright'

/** A patch of the painted page, named so a failure says where it was. */
export type Spot = {
  what: string
  /** The element whose painted box is the ground — the felt, the rim, a card, a disc's plate. */
  inside: string
  /** Cut this element's box out of it: the wooden rim is the felt's parent minus the felt. */
  outside?: string
  /**
   * Things lying on top of it. A point whose hit test lands in one of these is not the ground —
   * the felt's green is the felt where no card, pile, chip or open ring is covering it.
   */
  avoid?: string
  /**
   * How far in from the element's own edges to start, as a fraction of its box. The felt is drawn
   * in perspective, so its box is the bounding rectangle of a trapezoid and the corners of that
   * rectangle are wood, not felt. The default keeps well inside; a strip between two boxes sets
   * it to zero, since there the edges are the subject.
   */
  inset?: number
}

/** One ground, at three depths: a gradient is not a colour and has to be measured as a range. */
export type Ground = {
  /** The darkest twentieth, the middle, and the lightest twentieth, as `#rrggbb`. */
  shades: [string, string, string]
  /** How many pixels the three were drawn from. Zero would be a ground nobody looked at. */
  points: number
}

/** The colours an element is drawn in, with its own `opacity` already folded into each alpha. */
export type Drawn = {
  /** The label's colour. */
  ink: string
  /** The button's own fill, `rgba(0, 0, 0, 0)` where it has none. */
  plate: string
  /**
   * Every hard line the boundary is made of, innermost first: the border, and any box-shadow
   * drawn with no blur and no offset, which is how a second line is laid just outside the first.
   * A boundary is legible when *one* of them carries its gate against the ground — which is the
   * only way an edge can be seen both on a near-black surround and on a pale card face.
   */
  lines: string[]
  /** The 3 px bar under a chosen thing, read out of the inset shadow. `null` where there is none. */
  bar: string | null
}

const hex = ([r, g, b]: number[]) => `#${[r, g, b].map((v) => v!.toString(16).padStart(2, '0')).join('')}`

/** The three shades at each named spot. */
export async function painted(page: Page, spots: readonly Spot[]): Promise<Record<string, Ground>> {
  const shot = (await page.screenshot()).toString('base64')
  const read = await page.evaluate(
    async ({ shot, spots }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${shot}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      // The shot is the viewport at whatever scale the browser took it in; the boxes below are in
      // CSS pixels, so one is expressed in the other rather than assumed equal.
      const scale = image.naturalWidth / window.innerWidth
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const at = (x: number, y: number): number[] | null => {
        const px = Math.round(x * scale)
        const py = Math.round(y * scale)
        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return null
        const i = (py * canvas.width + px) * 4
        return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]
      }
      // Relative luminance, only ever used to sort one patch's own pixels into an order.
      const channel = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
      const lit = (c: number[]) => 0.2126 * channel(c[0]!) + 0.7152 * channel(c[1]!) + 0.0722 * channel(c[2]!)

      const out: Record<string, { shades: [string, string, string]; points: number }> = {}
      for (const spot of spots) {
        const el = document.querySelector(spot.inside)
        if (!el) throw new Error(`nothing matches ${spot.inside}, so "${spot.what}" measures nothing`)
        const box = el.getBoundingClientRect()
        const hole = spot.outside ? (document.querySelector(spot.outside)?.getBoundingClientRect() ?? null) : null
        if (spot.outside && !hole) throw new Error(`nothing matches ${spot.outside}, so "${spot.what}" is not a strip`)
        const inset = spot.inset ?? 0.15
        const found: number[][] = []
        const STEPS = 40
        for (let i = 0; i <= STEPS; i++)
          for (let j = 0; j <= STEPS; j++) {
            const x = box.left + box.width * (inset + ((1 - 2 * inset) * i) / STEPS)
            const y = box.top + box.height * (inset + ((1 - 2 * inset) * j) / STEPS)
            if (x < 1 || y < 1 || x > window.innerWidth - 2 || y > window.innerHeight - 2) continue
            if (hole && x > hole.left && x < hole.right && y > hole.top && y < hole.bottom) continue
            if (spot.avoid) {
              const hit = document.elementFromPoint(x, y)
              if (hit?.closest(spot.avoid)) continue
            }
            const colour = at(x, y)
            if (colour) found.push(colour)
          }
        // A patch nobody could sample is the failure this whole file exists to prevent: it would
        // otherwise come back as some default and be measured as if it were the page.
        if (found.length < 40) throw new Error(`"${spot.what}" was sampled at ${found.length} points; that is not a ground`)
        found.sort((a, b) => lit(a) - lit(b))
        const pick = (part: number) => found[Math.min(found.length - 1, Math.floor(found.length * part))]!
        out[spot.what] = { shades: [pick(0.05), pick(0.5), pick(0.95)].map((c) => c.join(',')) as unknown as [string, string, string], points: found.length }
      }
      return out
    },
    { shot, spots: spots as Spot[] },
  )
  return Object.fromEntries(Object.entries(read).map(([what, { shades, points }]) => [what, { shades: shades.map((c) => hex(c.split(',').map(Number))) as [string, string, string], points }]))
}

/**
 * How each named element is drawn, from the computed style. Its own `opacity` is folded into every
 * alpha, so what comes back is what the eye gets and not what the declaration says — a disabled
 * disc is faded to `opacity: 0.35` and its ink is that much weaker wherever it lands.
 */
export async function drawnAs(page: Page, named: Record<string, string>): Promise<Record<string, Drawn>> {
  return page.evaluate((named) => {
    // `rgb(13, 15, 20) 0px 0px 0px 1px, rgba(0, 0, 0, 0.6) 0px 8px 20px 0px` — one shadow per
    // comma, but rgba() has commas of its own, so the split is on the commas that start a shadow.
    const shadows = (value: string) => (value === 'none' || value === '' ? [] : value.split(/,(?=\s*(?:inset\s+)?(?:rgba?\(|#))/))
    const colourOf = (shadow: string) => /(?:rgba?\([^)]*\)|#[0-9a-f]{3,8})/i.exec(shadow)?.[0] ?? null
    const lengths = (shadow: string) => [...shadow.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]))
    const faded = (colour: string, by: number): string => {
      const parts = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+))?\s*\)/.exec(colour)
      if (!parts) return colour
      return `rgba(${parts[1]}, ${parts[2]}, ${parts[3]}, ${(Number(parts[4] ?? 1) * by).toFixed(4)})`
    }

    const out: Record<string, Drawn> = {}
    for (const [what, selector] of Object.entries(named)) {
      const el = document.querySelector<HTMLElement>(selector)
      if (!el) throw new Error(`nothing matches ${selector}, so "${what}" is drawn as nothing`)
      const style = getComputedStyle(el)
      const by = Number(style.opacity) || 1
      const lines: string[] = []
      const width = parseFloat(style.borderTopWidth) || 0
      if (width > 0 && style.borderTopStyle !== 'none') lines.push(faded(style.borderTopColor, by))
      for (const shadow of shadows(style.boxShadow)) {
        if (shadow.includes('inset')) continue
        const [dx = 0, dy = 0, blur = 0, spread = 0] = lengths(shadow)
        // A ring and not a shadow: no offset, no blur, and a spread that puts it just outside.
        if (dx !== 0 || dy !== 0 || blur !== 0 || spread <= 0) continue
        const colour = colourOf(shadow)
        if (colour) lines.push(faded(colour, by))
      }
      const inset = shadows(style.boxShadow).find((one) => one.includes('inset'))
      const bar = inset ? colourOf(inset) : null
      out[what] = { ink: faded(style.color, by), plate: faded(style.backgroundColor, by), lines, bar: bar === null ? null : faded(bar, by) }
    }
    return out
  }, named)
}
