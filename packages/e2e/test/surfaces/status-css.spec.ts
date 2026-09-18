import { expect, test } from '@playwright/test'
import { standing } from '../../support/surface.js'

// The family of states (#12, #7) as it ships, measured in an engine that knows the media query
// and the box model. Reduced motion, hit targets and a visible focus ring are all UX-KONTROLLER
// requirements (UX-10), and none of them can be checked by reading the stylesheet.
//
// Migrated from `packages/web/test/status-css.test.ts`. That version pasted four stylesheets out
// of `src/` into a bare document; this stands the same markup in the built app, so the rules that
// apply are the ones the build emitted. The list of files to paste is gone with it — a rule moved
// from `status.css` to `buttons.css` used to need this test edited, and now does not.
const SHELL = `
<section class="byd-status" data-status-notice="offline" data-surface="page" data-tone="broken">
  <span class="byd-status-mark">Ingen kontakt</span>
  <h1 tabindex="-1"><span class="byd-status-spin" aria-hidden="true"></span>Vi når inte tjänsten</h1>
  <p>Det kan vara nätet där du är.</p>
  <p class="byd-status-countdown"><span class="byd-status-spin" aria-hidden="true"></span>Nytt försök om 3 s · försök 2 av 4</p>
  <div class="byd-status-acts">
    <button type="button" class="byd-status-act" data-primary data-stop="the retry">Försök igen</button>
    <a class="byd-status-act" href="/" data-stop="the way home">Till mina spel</a>
  </div>
</section>
<div class="byd-sheet">
  <div class="byd-sheet-targets">
    <button type="button" class="byd-status-refused-control" data-stop="a refused control" aria-describedby="r1"><span>Kasthög</span><small>7 kort · lägg överst</small></button>
  </div>
  <span id="r1" class="byd-status-refusal">Bordet är avslutat.</span>
</div>`


const measure = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const spin = document.querySelector('.byd-status-spin')
    if (!spin) throw new Error('nothing is waiting, so there is no ring to measure')
    const style = getComputedStyle(spin)
    return {
      targets: [...document.querySelectorAll('[data-stop]')].map((el) => {
        const box = el.getBoundingClientRect()
        return { what: el.getAttribute('data-stop')!, w: Math.round(box.width), h: Math.round(box.height) }
      }),
      spin: {
        seconds: Math.max(...style.animationDuration.split(',').map((v) => parseFloat(v))),
        style: style.borderTopStyle,
        // A ring that has stopped must not still be a ring with a gap in it, pretending to turn:
        // it has to look like something that was never going to move.
        topTransparent: style.borderTopColor === 'rgba(0, 0, 0, 0)',
      },
      // The page never scrolls sideways, at the narrowest viewport the audit checks.
      overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    }
  })

// A phone, and Swedish: the states are read in words, and a hit area is a measurement of a word.
// jsdom asked for no language and got the catalogue's own; a real browser asks for the machine's,
// so the language this is measured in has to be said rather than inherited (A4).
test.use({ viewport: { width: 390, height: 844 }, locale: 'sv-SE' })

test.describe('every way out of a state', () => {
  test('is at least 44 by 44 CSS pixels on a phone, and nothing hangs off the side', async ({ page }) => {
    await standing(page, SHELL)
    const { targets, overflow } = await measure(page)
    expect(targets.length, 'the ways out exist at all, so this cannot pass by measuring nothing').toBeGreaterThan(0)
    for (const t of targets) expect({ ...t, big: t.w >= 44 && t.h >= 44 }).toMatchObject({ big: true })
    expect(overflow).toBe(true)
  })
})

test.describe('waiting under prefers-reduced-motion', () => {
  test.describe('with nobody asking it to stop', () => {
    test.use({ reducedMotion: 'no-preference' })
    test('turns, so the measurement below means something', async ({ page }) => {
      await standing(page, SHELL)
      const { spin } = await measure(page)
      expect(spin.seconds).toBeGreaterThan(0)
      expect(spin.topTransparent).toBe(true)
    })
  })

  test.describe('with the reader asking for less', () => {
    test.use({ reducedMotion: 'reduce' })
    test('stops turning, and stops looking like something that turns', async ({ page }) => {
      await standing(page, SHELL)
      const { spin } = await measure(page)
      expect(spin.seconds).toBeCloseTo(0, 3)
      expect(spin.style).toBe('dashed')
      expect(spin.topTransparent).toBe(false)
    })
  })
})
