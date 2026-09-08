// @vitest-environment jsdom
// The felt view's own furniture, measured in a real engine at phone widths: jsdom lays nothing
// out, and the fault this is about is two fixed corners of the screen growing into each other.
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
const css = read('src/online/online.css') + read('src/player/player.css')
const noop = (): undefined => undefined
const idle = { send: async () => undefined } as unknown as Parameters<typeof SessionButtons>[0]['client']
const view = { seq: 3, zones: [], components: [], seats: [{ id: 'A', name: 'The designer' }] } as unknown as Snapshot

const page = (body: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser.close()
})

describe('the felt view on a phone (C5)', () => {
  it('keeps who you are apart from what you can do, however long the name is', async () => {
    const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate('en', key, params)
    const body = renderToStaticMarkup(
      <div className="byd-online-bar">
        <SeatLine name="The designer" hand={0} observers={[]} t={t} />
        <div className="byd-online-tools">
          <SessionButtons client={idle} view={view} onSheet={noop} />
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
      // Two corners of the same row: the one must end before the other starts, or a tap meant
      // for "undo" lands on the name.
      expect(boxes.me.right).toBeLessThanOrEqual(boxes.tools.left)
      expect(boxes.me.left).toBeGreaterThanOrEqual(0)
      // A name far longer than the screen still gives way rather than pushing the buttons off.
      const long = renderToStaticMarkup(
        <div className="byd-online-bar">
          <SeatLine name="Ada Augusta Byron King, Countess of Lovelace" hand={12} observers={['Bo', 'Cilla']} t={t} />
          <div className="byd-online-tools">
            <SessionButtons client={idle} view={view} onSheet={noop} />
          </div>
        </div>,
      )
      await tab.setContent(page(long))
      const wide = await tab.evaluate(() => {
        const box = (sel: string) => {
          const r = document.querySelector(sel)!.getBoundingClientRect()
          return { left: r.left, right: r.right }
        }
        return { me: box('.byd-online-me'), tools: box('.byd-online-tools'), width: document.documentElement.clientWidth }
      })
      expect(wide.me.right).toBeLessThanOrEqual(wide.tools.left)
      expect(wide.tools.right).toBeLessThanOrEqual(wide.width)
    } finally {
      await tab.close()
    }
  }, 60_000)
})
