// Real component markup and the app's combined CSS: a fallback-only card hides both regressions.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium, type Browser } from 'playwright'
import type { VisibleComponentState } from '@byd/protocol'
import { HandSpread } from '../src/online/HandSpread.js'
import { HeldCard } from '../src/player/HeldCard.js'

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser?.close()
}, 60_000)
const css = ['table/table.css', 'table/texture.css', 'player/player.css', 'online/online.css', 'table/keyboard.css', 'buttons.css'].map(path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')).join('\n')
const card: VisibleComponentState = { id: 'c1', type: { id: 'card.standard.63x88', version: 1 }, zone: 'hand:A', face: 'front', x: 0, y: 0, rot: 0, cardRef: 'Spejare', faces: { front: 'a'.repeat(64) } }

describe('rendered cards in the playtest (2026-09-14)', () => {
  it('shows a whole held card at its original aspect ratio, with and without actions', async () => {
    const page = await browser.newPage()
    try {
      for (const size of [{ width: 390, height: 844 }, { width: 320, height: 740 }, { width: 768, height: 600 }]) {
        await page.setViewportSize(size)
        for (const actions of [undefined, <div className="byd-mine-actions"><button>Vänd</button><button>Ta upp</button><button>Spela</button></div>]) {
          const html = renderToStaticMarkup(<div className="byd-player"><HeldCard card={card} faces="http://faces.test" onClose={() => undefined} actions={actions} /></div>)
          await page.setContent(`<style>${css}</style>${html}`)
          const measured = await page.locator('[data-inspect]').evaluate(el => {
            const b = el.getBoundingClientRect()
            const actions = document.querySelector('.byd-mine-actions')?.getBoundingClientRect()
            return { ratio: b.width / b.height, x: b.x, right: b.right, bottom: b.bottom, actionTop: actions?.top }
          })
          expect(measured.ratio).toBeCloseTo(63 / 88, 2)
          expect(measured.x).toBeGreaterThanOrEqual(0)
          expect(measured.right).toBeLessThanOrEqual(size.width)
          expect(measured.bottom).toBeLessThanOrEqual(measured.actionTop ?? size.height)
        }
      }
    } finally { await page.close() }
  }, 60_000)

  it('keeps every spread texture inside its own card and leaves Close reachable', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    try {
      const html = renderToStaticMarkup(<HandSpread cards={[card, { ...card, id: 'c2' }]} faces="http://faces.test" onOpen={() => undefined} onClose={() => undefined} />)
      await page.setContent(`<style>${css}</style><div class="byd-online-play" style="height:739px">${html}</div>`)
      const measured = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[data-spread-card]')).map(el => {
          const box = el.getBoundingClientRect()
          const image = el.querySelector('img')!.getBoundingClientRect()
          return { box: { x: box.x, y: box.y, w: box.width, h: box.height }, image: { x: image.x, y: image.y, w: image.width, h: image.height } }
        })
        const close = document.querySelector('.byd-hand-sheet-head button')!
        const b = close.getBoundingClientRect()
        return { cards, closeReachable: close.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)) }
      })
      for (const { box, image } of measured.cards) expect(image).toEqual(box)
      expect(measured.closeReachable).toBe(true)
    } finally { await page.close() }
  }, 60_000)
})
