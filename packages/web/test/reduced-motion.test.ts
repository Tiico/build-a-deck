import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'

// Non-essential motion has to stop when the reader asks for it, and the only honest place to
// measure that is an engine that knows the media query.
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const SHEETS = ['src/a11y.css', 'src/table/table.css', 'src/table/texture.css', 'src/online/online.css', 'src/player/player.css', 'src/status/status.css']

// Every element in the app that moves on its own, with the property that carries the motion.
const MOVERS = {
  'the rewind frame pulsing': { html: '<div class="byd-rewind-preview"></div>', sel: '.byd-rewind-preview', pseudo: '::after', prop: 'animationDuration' },
  'the pointing ring': { html: '<div class="byd-peer-pulse"><i></i><i></i><i></i></div>', sel: '.byd-peer-pulse i', pseudo: null, prop: 'animationDuration' },
  'the glow on a card someone moved': { html: '<div class="byd-card" data-by="A"></div>', sel: '.byd-card[data-by]', pseudo: null, prop: 'animationDuration' },
  "a peer's cursor gliding": { html: '<div class="byd-peer-cursor"></div>', sel: '.byd-peer-cursor', pseudo: null, prop: 'transitionDuration' },
  "a peer's carried card gliding": { html: '<div class="byd-peer-ghost"></div>', sel: '.byd-peer-ghost', pseudo: null, prop: 'transitionDuration' },
  'a card in the online fan tilting': { html: '<div class="byd-fan-card"></div>', sel: '.byd-fan-card', pseudo: null, prop: 'transitionDuration' },
  'a card waiting for its texture': { html: '<span class="byd-texture-state" data-texture="pending"></span>', sel: '.byd-texture-state[data-texture="pending"]', pseudo: null, prop: 'animationDuration' },
  'the ring while a connection is being waited for': { html: '<span class="byd-status-spin"></span>', sel: '.byd-status-spin', pseudo: null, prop: 'animationDuration' },
} as const

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

async function durations(reducedMotion: 'reduce' | 'no-preference'): Promise<Record<string, number>> {
  const page = await browser.newPage({ reducedMotion })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${SHEETS.map(read).join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root">${Object.values(MOVERS).map((m) => m.html).join('')}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    return await page.evaluate(
      (movers) =>
        Object.fromEntries(
          movers.map(([name, sel, pseudo, prop]) => {
            const el = document.querySelector(sel)!
            const value = getComputedStyle(el, pseudo)[prop as 'animationDuration']
            return [name, Math.max(...value.split(',').map((v) => parseFloat(v)))]
          }),
        ),
      Object.entries(MOVERS).map(([name, m]) => [name, m.sel, m.pseudo, m.prop] as const),
    )
  } finally {
    await page.close()
  }
}

describe('the app under prefers-reduced-motion', () => {
  it('still moves when nobody asked it to stop, so the measurement means something', async () => {
    const live = await durations('no-preference')
    for (const [name, seconds] of Object.entries(live)) expect({ [name]: seconds > 0 }).toEqual({ [name]: true })
  }, 60_000)

  it('stops every non-essential animation and transition', async () => {
    const still = await durations('reduce')
    expect(still).toEqual(Object.fromEntries(Object.keys(MOVERS).map((name) => [name, expect.closeTo(0, 3)])))
  }, 60_000)
})

describe('the app entry', () => {
  it('ships the reduced-motion rules on every route', () => {
    expect(read('src/main.tsx')).toContain("import './a11y.css'")
  })
})
