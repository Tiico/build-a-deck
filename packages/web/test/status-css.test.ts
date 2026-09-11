import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'

// The family of states (#12, #7) as it ships, measured in an engine that knows the media query
// and the box model. Reduced motion, hit targets and a visible focus ring are all UX-KONTROLLER
// requirements (UX-10), and none of them can be checked by reading the stylesheet.
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
// The phone's own stylesheet comes along because a refusal stands inside the play sheet, and a
// control's size is the sheet's business rather than the message's.
const CSS = `${read('src/player/player.css')}\n${read('src/buttons.css')}\n${read('src/status/status.css')}\n${read('src/a11y.css')}`

// One state of each shape: a whole page with every kind of way out, and a refusal beside the
// control that caused it.
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

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

async function measure(reducedMotion: 'reduce' | 'no-preference') {
  const page = await browser.newPage({ reducedMotion, viewport: { width: 390, height: 844 } })
  try {
    await page.setContent(`<!doctype html><html lang="sv"><head><style>${CSS}</style></head><body style="margin:0">${SHELL}</body></html>`, { waitUntil: 'load' })
    return await page.evaluate(() => {
      const spin = document.querySelector('.byd-status-spin')!
      const style = getComputedStyle(spin)
      return {
        targets: [...document.querySelectorAll('[data-stop]')].map((el) => {
          const box = el.getBoundingClientRect()
          return { what: el.getAttribute('data-stop')!, w: Math.round(box.width), h: Math.round(box.height) }
        }),
        spin: {
          seconds: Math.max(...style.animationDuration.split(',').map((v) => parseFloat(v))),
          style: style.borderTopStyle,
          // A ring that has stopped must not still be a ring with a gap in it, pretending to
          // turn: it has to look like something that was never going to move.
          topTransparent: style.borderTopColor === 'rgba(0, 0, 0, 0)',
        },
        // The page never scrolls sideways, at the narrowest viewport the audit checks.
        overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      }
    })
  } finally {
    await page.close()
  }
}

describe('every way out of a state', () => {
  it('is at least 44 by 44 CSS pixels on a phone', async () => {
    const { targets } = await measure('no-preference')
    expect(targets.length).toBeGreaterThan(0)
    for (const t of targets) expect({ ...t, big: t.w >= 44 && t.h >= 44 }).toMatchObject({ big: true })
  }, 60_000)

  it('leaves nothing hanging off the side of a 390 px screen', async () => {
    expect((await measure('no-preference')).overflow).toBe(true)
  }, 60_000)
})

describe('waiting under prefers-reduced-motion', () => {
  it('turns while nobody has asked it to stop, so the measurement means something', async () => {
    const { spin } = await measure('no-preference')
    expect(spin.seconds).toBeGreaterThan(0)
    expect(spin.topTransparent).toBe(true)
  }, 60_000)

  it('stops turning, and stops looking like something that turns', async () => {
    const { spin } = await measure('reduce')
    expect(spin.seconds).toBeCloseTo(0, 3)
    expect(spin.style).toBe('dashed')
    expect(spin.topTransparent).toBe(false)
  }, 60_000)
})
