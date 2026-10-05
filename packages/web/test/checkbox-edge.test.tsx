// @vitest-environment node
// The editor's unticked box is drawn by the platform (#45, #50), and its edge was painted about
// 2.5:1 against the editor's ground, under WCAG's 3:1 for what is not text (#553 E-8, beställarens
// beslut 2026-09-30). The platform still draws the box, the tick and the greyed state; a line in the
// button language's colour is laid over the unticked box's edge. Measured in painted pixels,
// because the platform's own paint is not in any declaration.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { capture } from '@byd/render'
import { contrastRatio } from '../src/player/contrast.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`
const document_ = (body: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser?.close()
}, 60_000)

const GROUND = '#23262e'
const hex = (rgb: readonly number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

describe('the unticked box in the editor (#553)', () => {
  it('paints its edge at 3:1 against the editor’s ground, and keeps the focus ring when it is reached', async () => {
    const page = await browser.newPage({ viewport: { width: 200, height: 120 }, deviceScaleFactor: 2 })
    try {
      await page.setContent(
        document_(`<div class="byd-editor" style="height:auto;padding:40px;background:${GROUND}"><label><input type="checkbox" aria-label="Markera dragon"> Markera</label></div>`),
        { waitUntil: 'load' },
      )
      const box = (await page.locator('input[type="checkbox"]').boundingBox())!
      const shot = await capture(page, { clip: { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 } })
      // The edge is the darkest-to-lightest step across the box's left side, at its middle: read
      // every pixel along that row and take the one furthest from the ground.
      const edge = await page.evaluate(async ({ data, ground }) => {
        const img = new Image()
        img.src = `data:image/png;base64,${data}`
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const y = Math.floor(img.height / 2)
        const row = ctx.getImageData(0, y, Math.floor(img.width / 2), 1).data
        const g = [parseInt(ground.slice(1, 3), 16), parseInt(ground.slice(3, 5), 16), parseInt(ground.slice(5, 7), 16)]
        let best = g
        let far = 0
        for (let i = 0; i < row.length; i += 4) {
          const p = [row[i]!, row[i + 1]!, row[i + 2]!]
          const d = Math.abs(p[0]! - g[0]!) + Math.abs(p[1]! - g[1]!) + Math.abs(p[2]! - g[2]!)
          if (d > far) {
            far = d
            best = p
          }
        }
        return best
      }, { data: shot.toString('base64'), ground: GROUND })
      expect({ edge: hex(edge), clears: contrastRatio(hex(edge), GROUND) >= 3 }).toEqual({ edge: hex(edge), clears: true })
      // The platform's own edge is its own: 4.1:1 on one machine and about 2.5:1 where the audit was
      // taken. So the edge that clears the bar is the language's line, laid over the platform's,
      // and not whatever grey the platform happens to paint.
      const line = await page.evaluate(() => {
        const el = document.querySelector('input[type="checkbox"]')!
        const probe = el.parentElement!.appendChild(document.createElement('span'))
        probe.style.cssText = 'color: var(--byd-secondary-line)'
        const want = getComputedStyle(probe).color
        probe.remove()
        const cs = getComputedStyle(el)
        return { style: cs.outlineStyle, colour: cs.outlineColor === want, inside: parseFloat(cs.outlineOffset) < 0 }
      })
      expect(line).toEqual({ style: 'solid', colour: true, inside: true })

      // The line is the resting box's; a box reached by the keyboard wears the editor's ring.
      await page.keyboard.press('Tab')
      const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        const cs = getComputedStyle(el)
        return { focusVisible: el.matches(':focus-visible'), width: parseFloat(cs.outlineWidth) }
      })
      expect(ring).toEqual({ focusVisible: true, width: 3 })
    } finally {
      await page.close()
    }
  }, 60_000)
})
