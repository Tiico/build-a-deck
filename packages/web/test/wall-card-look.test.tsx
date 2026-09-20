// @vitest-environment jsdom
// What a card on the wall looks like when it is lying still, and what it looks like under the
// pointer (#332, L28, variant C · Kanten).
//
// A corner, an edge and a shadow are all things an engine paints, so the markup the wall renders
// is measured in a real one against the stylesheet the editor ships — the same shape as
// `editor-spacing.test.tsx`. Nothing here pins a text width or a font: the numbers are radii,
// hairlines and boxes, which a Linux engine draws exactly as this one does.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { DeckWall } from '../src/editor/DeckWall.js'
import { cornerPx } from '../src/editor/corner.js'
import { DENSITY, DENSITY_DEFAULT } from '../src/editor/density.js'
import { contrastRatio, flatten } from '../src/player/contrast.js'
import { projectDoc } from './project-doc.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor">${html}</div></div>`)

// The width the wall's own audit was taken at.
const WIDTH = 1440
// The card the wall opens at, which is what every measurement below is read against.
const CARD = DENSITY[DENSITY_DEFAULT]!

let browser: Browser
let page: Page
let markup: string

// The wall as it renders, in a real engine. A page of its own can be opened for a reader who
// has asked for less movement, which is the one thing the shared page cannot be asked about.
const open = async (reducedMotion?: 'reduce'): Promise<Page> => {
  const fresh = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, ...(reducedMotion ? { reducedMotion } : {}) })
  await fresh.setContent(document_(markup), { waitUntil: 'load' })
  return fresh
}

beforeAll(async () => {
  browser = await chromium.launch()
  const { container, unmount } = render(
    <DeckWall doc={projectDoc()} face="front" selectedRow="knight" onSelectRow={() => undefined} onSelectElement={() => undefined} />,
  )
  markup = container.innerHTML
  unmount()
  page = await open()
}, 60_000)

afterAll(async () => {
  await browser.close()
}, 60_000)

// Every shadow a rule declares, as offset, blur, spread and whether it is inset — so a test can
// say "nothing here is blurred" without pinning the colours the room's tokens carry.
const shadowsOf = (css: string): { blur: number; spread: number; inset: boolean }[] =>
  css === 'none'
    ? []
    : // The colour comes first in a computed value and may be an `rgba(…)` with commas of its
      // own, so the parts are split on the commas between shadows only.
      css.split(/,(?![^(]*\))/).map((part) => {
        const lengths = [...part.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]))
        return { blur: lengths[2] ?? 0, spread: lengths[3] ?? 0, inset: part.includes('inset') }
      })

// One card's box and the box of the card compiled inside it, so the two can be held against
// each other: an edge drawn round a tile wider than the card is an edge in the wrong place.
const boxes = () =>
  page.evaluate(() => {
    const tile = document.querySelector('.byd-wall-card') as HTMLElement
    const card = tile.querySelector('[data-card]') as HTMLElement
    const box = (el: HTMLElement) => {
      const b = el.getBoundingClientRect()
      return { x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100, w: Math.round(b.width * 100) / 100, h: Math.round(b.height * 100) / 100 }
    }
    return { tile: box(tile), card: box(card), radius: getComputedStyle(tile).borderRadius }
  })

describe('the corner of a card on the wall is the card’s own (#332)', () => {
  it('is the type’s millimetres in pixels, and not the 8 px the wall used to write', async () => {
    const { radius } = await boxes()
    expect(radius).toBe(`${cornerPx(CARD)}px`)
    expect(radius).not.toBe('8px')
  }, 60_000)

  it('is drawn on the card’s own box, so the corner it rounds is the corner of the card', async () => {
    const { tile, card } = await boxes()
    expect(tile).toEqual(card)
  }, 60_000)

  it('cuts the card, and lets the badges that hang off it alone', async () => {
    const cut = await page.evaluate(() => {
      const face = document.querySelector('.byd-wall-card > .byd-wall-face') as HTMLElement | null
      const tile = document.querySelector('.byd-wall-card') as HTMLElement
      return {
        // The corner can only show if something clips to it.
        overflow: face === null ? null : getComputedStyle(face).overflow,
        radius: face === null ? null : getComputedStyle(face).borderRadius,
        // A badge sits outside the card on purpose, so the tile itself must not clip.
        tileOverflow: getComputedStyle(tile).overflow,
      }
    })
    expect(cut).toEqual({ overflow: 'hidden', radius: `${cornerPx(CARD)}px`, tileOverflow: 'visible' })
  }, 60_000)
})

// C · Kanten. A card lying still gets a hairline dark edge, a faint light along the inside of its
// top, and one tight contact shadow underneath — and no blur of its own. That last part is the
// whole of the decision and it was decided on a measurement: a `box-shadow` blurred 14 px is 308
// blurs to compose per frame on a real deck, and the variant that drew one fell to 55 fps.
describe('a card lying still on the wall carries an edge and not a blur (#332)', () => {
  it('draws the hairline edge and the light inside with nothing blurred', async () => {
    const shadows = shadowsOf(await page.evaluate(() => getComputedStyle(document.querySelector('.byd-wall-card > .byd-wall-face')!).boxShadow))
    // Two: the ring outside, one pixel wide and unblurred, and the light along the top inside it.
    expect(shadows).toEqual([
      { blur: 0, spread: 1, inset: false },
      { blur: 0, spread: 0, inset: true },
    ])
  }, 60_000)

  it('takes the edge and the light out of the room’s own tokens and writes no colour of its own', async () => {
    const { drawn, tokens } = await page.evaluate(() => {
      const face = document.querySelector('.byd-wall-card > .byd-wall-face') as HTMLElement
      const probe = document.querySelector('.byd-editor')!.appendChild(document.createElement('span'))
      const read = (name: string) => {
        probe.style.cssText = `color: var(${name})`
        return getComputedStyle(probe).color
      }
      const tokens = { edge: read('--byd-editor-card-edge'), sheen: read('--byd-editor-card-sheen'), shadow: read('--byd-editor-card-shadow') }
      probe.remove()
      return { drawn: getComputedStyle(face).boxShadow, tokens }
    })
    // Not `rgba(0, 0, 0, 0)`, which is what an undeclared token resolves a colour to.
    for (const [name, value] of Object.entries(tokens)) expect(value, `--byd-editor-card-${name} is not declared`).not.toBe('rgba(0, 0, 0, 0)')
    expect(drawn).toContain(tokens.edge)
    expect(drawn).toContain(tokens.sheen)
  }, 60_000)

  it('lays one tight contact shadow under the card, in the same token the lift is drawn in', async () => {
    const under = await page.evaluate(() => {
      const tile = document.querySelector('.byd-wall-card') as HTMLElement
      const after = getComputedStyle(tile, '::after')
      const probe = document.querySelector('.byd-editor')!.appendChild(document.createElement('span'))
      probe.style.cssText = 'color: var(--byd-editor-card-shadow)'
      const token = getComputedStyle(probe).color
      probe.remove()
      return { content: after.content, background: after.backgroundColor, filter: after.filter, height: after.height, token }
    })
    expect(under.content).toBe('""')
    expect(under.background).toBe(under.token)
    // Tight: a few pixels high and blurred by a few more, not a cloud under the whole card.
    expect(under.filter).toBe('blur(3px)')
    expect(Number.parseFloat(under.height)).toBeLessThanOrEqual(6)
  }, 60_000)
})

// The pointer has arrived and the card has finished moving. Both halves are waited for rather
// than slept through: a hover is an input event the engine processes on its own schedule, and the
// lift glides for 130 ms after it, so a state read straight after `hover()` is a coin toss.
const settled = async (on: Page, at: number): Promise<void> => {
  await on.waitForFunction((n) => document.querySelectorAll('.byd-wall-card')[n]?.matches(':hover, :focus-visible') === true, at)
  await on.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => undefined))
}

// How every card on the wall stands right now: whether it is lifted, and what its paper throws.
const wall = (on: Page) =>
  on.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.byd-wall-card')].map((tile) => {
      const face = tile.querySelector('.byd-wall-face') as HTMLElement
      const lift = new DOMMatrixReadOnly(getComputedStyle(tile).transform).f
      const blurred = getComputedStyle(face)
        .boxShadow.split(/,(?![^(]*\))/)
        .filter((part) => Number([...part.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]))[2] ?? 0) > 0).length
      return { lift, blurred }
    }),
  )

// The card under the pointer is the one card that may cost a blur, and it is where the whole
// saving above is spent.
describe('the card the pointer or the focus stands on is lifted (#332)', () => {
  it('gives the wide shadow and the lift to that card and to no other', async () => {
    const on = await open()
    try {
      expect(await wall(on)).toEqual([
        { lift: 0, blurred: 0 },
        { lift: 0, blurred: 0 },
        { lift: 0, blurred: 0 },
      ])
      // A hover the engine really performs, so `:hover` answers as it does for a hand.
      await on.locator('.byd-wall-card').nth(1).hover()
      await settled(on, 1)
      expect(await wall(on)).toEqual([
        { lift: 0, blurred: 0 },
        { lift: -3, blurred: 1 },
        { lift: 0, blurred: 0 },
      ])
    } finally {
      await on.close()
    }
  }, 60_000)

  it('gives them to the card the keyboard has put the focus on', async () => {
    const on = await open()
    try {
      // A card is a stop the wall hands the focus to when the reader jumps to a band, so the
      // focus arrives from the keyboard — which is what `:focus-visible` is an answer about.
      await on.keyboard.press('Tab')
      await on.evaluate(() => (document.querySelectorAll<HTMLElement>('.byd-wall-card')[2] as HTMLElement).focus())
      await settled(on, 2)
      expect(await wall(on)).toEqual([
        { lift: 0, blurred: 0 },
        { lift: 0, blurred: 0 },
        { lift: -3, blurred: 1 },
      ])
    } finally {
      await on.close()
    }
  }, 60_000)

  it('gives the reader who asked for less movement the shadow without the lift', async () => {
    const on = await open('reduce')
    try {
      await on.locator('.byd-wall-card').nth(1).hover()
      await settled(on, 1)
      expect(await wall(on)).toEqual([
        { lift: 0, blurred: 0 },
        { lift: 0, blurred: 1 },
        { lift: 0, blurred: 0 },
      ])
    } finally {
      await on.close()
    }
  }, 60_000)
})

// The ring out of #234 is the wall's answer to "which card is this view about", and the lift is
// not a second answer to the same question. A form copied onto a new ground has to be measured
// against that ground again, and this one now has a hairline of the card's own edge inside it.
describe('the ring on the chosen card survives the lift (#234, #332)', () => {
  it('is still three pixels of the room’s mark, three pixels out, with the card lifted', async () => {
    const on = await open()
    try {
      const ring = () =>
        on.evaluate(() => {
          const tile = document.querySelector('.byd-wall-card[aria-selected="true"]') as HTMLElement
          const style = getComputedStyle(tile)
          const probe = document.querySelector('.byd-editor')!.appendChild(document.createElement('span'))
          probe.style.cssText = 'color: var(--byd-editor-primary-mark)'
          const mark = getComputedStyle(probe).color
          probe.remove()
          return { width: style.outlineWidth, style: style.outlineStyle, colour: style.outlineColor, offset: style.outlineOffset, mark }
        })
      const still = await ring()
      expect(still).toEqual({ width: '3px', style: 'solid', colour: still.mark, offset: '3px', mark: still.mark })
      await on.locator('.byd-wall-card[aria-selected="true"]').hover()
      await settled(on, 1)
      // The card really is lifted, so the ring below is not unchanged merely because nothing
      // happened.
      expect((await wall(on))[1]).toEqual({ lift: -3, blurred: 1 })
      expect(await ring()).toEqual(still)
    } finally {
      await on.close()
    }
  }, 60_000)

  it('clears 3:1 against the wall behind it and against the card’s own edge beside it', async () => {
    const seen = await page.evaluate(() => {
      const tile = document.querySelector('.byd-wall-card[aria-selected="true"]') as HTMLElement
      // What the ring is actually drawn on: the first ancestor that paints something.
      let ground = 'rgb(255, 255, 255)'
      for (let el = tile.parentElement; el; el = el.parentElement) {
        const paint = getComputedStyle(el).backgroundColor
        if (paint !== 'rgba(0, 0, 0, 0)' && paint !== 'transparent') {
          ground = paint
          break
        }
      }
      const probe = document.querySelector('.byd-editor')!.appendChild(document.createElement('span'))
      probe.style.cssText = 'color: var(--byd-editor-card-edge)'
      const edge = getComputedStyle(probe).color
      probe.remove()
      return { ring: getComputedStyle(tile).outlineColor, ground, edge }
    })
    // Three pixels of offset is not three pixels of the wall: the card's hairline edge is drawn
    // one pixel outside the card and so lies between the card and the ring.
    const beside = flatten([seen.ground, seen.edge])
    expect(contrastRatio(seen.ring, seen.ground)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(seen.ring, beside)).toBeGreaterThanOrEqual(3)
  }, 60_000)
})
