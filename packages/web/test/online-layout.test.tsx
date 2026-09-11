// @vitest-environment jsdom
// The felt view's own furniture, measured in a real engine at phone widths: jsdom lays nothing
// out, and the fault this is about is the seat's line and the session's tools growing into each
// other in the row they share (#25).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import type { Snapshot } from '@byd/protocol'
import { SeatLine } from '../src/online/SeatLine.js'
import { SessionButtons } from '../src/player/SessionOverlays.js'
import { translate } from '../src/i18n/index.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = read('src/online/online.css') + read('src/player/player.css') + read('src/buttons.css')
const noop = (): undefined => undefined
const idle = { send: async () => undefined } as unknown as Parameters<typeof SessionButtons>[0]['client']
const view = { seq: 3, zones: [], components: [], seats: [{ id: 'A', name: 'The designer' }] } as unknown as Snapshot

// Two boxes that do not lie over each other: beside each other, or one under the other.
type Box = { left: number; right: number; top: number; bottom: number }
const apart = (a: Box, b: Box) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top

const page = (body: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

describe('the felt view on a phone (C5)', () => {
  it('keeps who you are apart from what you can do, however long the name is', async () => {
    const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate('en', key, params)
    const body = renderToStaticMarkup(
      <div className="byd-online-top">
        <SeatLine name="The designer" hand={0} observers={[]} t={t} />
        <div className="byd-online-tools">
          <SessionButtons client={idle} view={view} sheet={null} onSheet={noop} />
        </div>
      </div>,
    )
    const tab = await browser.newPage({ viewport: { width: 375, height: 812 } })
    try {
      await tab.setContent(page(body))
      const boxes = await tab.evaluate(() => {
        const box = (sel: string) => {
          const el = document.querySelector(sel)
          if (!el) throw new Error(`no ${sel}`)
          const r = el.getBoundingClientRect()
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
        }
        return { me: box('.byd-online-me'), tools: box('.byd-online-tools') }
      })
      // The row gives the two ends of itself: the one must never lie over the other, or a tap
      // meant for "undo" lands on the name. Where the width runs out the row wraps, and being on
      // a line of one's own is as apart as being at the other end of one.
      expect(apart(boxes.me, boxes.tools)).toBe(true)
      expect(boxes.me.left).toBeGreaterThanOrEqual(0)
      // A name far longer than the screen still gives way rather than pushing the buttons off.
      const long = renderToStaticMarkup(
        <div className="byd-online-top">
          <SeatLine name="Ada Augusta Byron King, Countess of Lovelace" hand={12} observers={['Bo', 'Cilla']} t={t} />
          <div className="byd-online-tools">
            <SessionButtons client={idle} view={view} sheet={null} onSheet={noop} />
          </div>
        </div>,
      )
      await tab.setContent(page(long))
      const wide = await tab.evaluate(() => {
        const box = (sel: string) => {
          const r = document.querySelector(sel)!.getBoundingClientRect()
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
        }
        return { me: box('.byd-online-me'), tools: box('.byd-online-tools'), width: document.documentElement.clientWidth }
      })
      expect(apart(wide.me, wide.tools)).toBe(true)
      expect(wide.tools.right).toBeLessThanOrEqual(wide.width)
    } finally {
      await tab.close()
    }
  }, 60_000)
})
