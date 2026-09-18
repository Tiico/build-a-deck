import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { standing } from '../../support/surface.js'

// Non-essential motion has to stop when the reader asks for it, and the only honest place to
// measure that is an engine that knows the media query.
//
// Migrated from `packages/web/test/reduced-motion.test.ts`, where it stitched the stylesheets
// together out of `src/` and pasted them into a bare document. It now stands the same markup in
// the built app, so what answers is the sheet the browser was actually served. The list of files
// to stitch is gone with it — a mover whose rules move to a different stylesheet used to need
// this test edited, and now does not.
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

const ALL = Object.values(MOVERS).map((m) => m.html).join('')

const durations = (page: import('@playwright/test').Page) =>
  page.evaluate(
    (movers) =>
      Object.fromEntries(
        movers.map(([name, sel, pseudo, prop]) => {
          const el = document.querySelector(sel)
          if (!el) throw new Error(`nothing matches ${sel}, so "${name}" measures nothing`)
          const value = getComputedStyle(el, pseudo)[prop as 'animationDuration']
          return [name, Math.max(...value.split(',').map((v) => parseFloat(v)))]
        }),
      ),
    Object.entries(MOVERS).map(([name, m]) => [name, m.sel, m.pseudo, m.prop] as const),
  )

test.describe('the app under prefers-reduced-motion', () => {
  test.describe('with nobody asking it to stop', () => {
    test.use({ reducedMotion: 'no-preference' })
    test('still moves, so the measurement below means something', async ({ page }) => {
      // The half that keeps the other half honest. A stylesheet that failed to load at all would
      // report every duration as zero and pass a test that only ever checked for stillness.
      await standing(page, ALL)
      for (const [name, seconds] of Object.entries(await durations(page))) expect({ [name]: seconds > 0 }).toEqual({ [name]: true })
    })
  })

  test.describe('with the reader asking for less', () => {
    test.use({ reducedMotion: 'reduce' })
    test('stops every non-essential animation and transition', async ({ page }) => {
      await standing(page, ALL)
      expect(await durations(page)).toEqual(Object.fromEntries(Object.keys(MOVERS).map((name) => [name, expect.closeTo(0, 3)])))
    })
  })
})

test.describe('the app entry', () => {
  test('ships the reduced-motion rules on every route', () => {
    // Not a browser question: it is about what the entry imports, so it is asked of the file.
    const main = readFileSync(join(import.meta.dirname, '..', '..', '..', 'web', 'src', 'main.tsx'), 'utf8')
    expect(main).toContain("import './a11y.css'")
  })
})
