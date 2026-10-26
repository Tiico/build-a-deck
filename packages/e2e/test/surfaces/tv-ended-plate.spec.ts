import type { Page } from '@playwright/test'
import { withQuery } from '../../support/api.js'
import { expect, test } from '../../support/test.js'

// The television's summary of an ended table stands on a plate of its own, and nothing of the felt
// shows through its words (#1354). The screen dims the felt to a fifth and wrote the heading, the
// line under it and the figures straight onto that: the piles' counts, the plates and the cards
// stood behind the words, read from three metres as part of them.
//
// Read off what is painted: the screen as it is, and again with the felt made transparent. A pixel
// under the summary's words that the two photographs disagree on is a pixel of the felt that shows
// through. Opacity, so nothing is laid out again between the photographs.
const SCREENS = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const

const FELT = '.byd-table-frame'
const WORDS = '[data-ended] h1, [data-ended] p, [data-ended] .byd-ended-summary'

async function still(page: Page): Promise<void> {
  const frames = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 0)))))
  const where = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-seat-plate], .byd-pile, [data-ended] *')].map((el) => {
        const r = el.getBoundingClientRect()
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join()
      }),
    )
  let last = JSON.stringify(await where())
  let same = 0
  for (let i = 0; i < 120; i++) {
    await frames()
    const now = JSON.stringify(await where())
    same = now === last ? same + 1 : 0
    if (same >= 2) return
    last = now
  }
  throw new Error('the screen never stood still')
}

// `through`: pixels under the words the felt changes, with the summary drawn. `under`: the same with
// the summary made transparent, which is how much of the felt lies there at all — the guard that the
// first number is not zero because the felt is bare where the words stand.
async function painted(page: Page): Promise<{ through: number; under: number }> {
  const hide = (css: string) => page.addStyleTag({ content: `${css} { opacity: 0 !important; transition: none !important; animation: none !important; }` })
  const shot = async (): Promise<string> => (await page.screenshot({ scale: 'css', animations: 'disabled' })).toString('base64')
  const boxes = await page.evaluate((words) => [...document.querySelectorAll(words)].map((el) => {
    const r = el.getBoundingClientRect()
    return { l: r.left, t: r.top, r: r.right, b: r.bottom }
  }), WORDS)
  const all = await shot()
  const offFelt = await hide(FELT)
  const bare = await shot()
  const bareAgain = await shot()
  const offEnded = await hide('[data-ended]')
  const neither = await shot()
  await offFelt.evaluate((el) => (el as Element).remove())
  const feltAlone = await shot()
  await offEnded.evaluate((el) => (el as Element).remove())
  return page.evaluate(
    async ({ shots, boxes }) => {
      const read = async (src: string) => {
        const img = new Image()
        img.src = `data:image/png;base64,${src}`
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const g = c.getContext('2d')!
        g.drawImage(img, 0, 0)
        return g.getImageData(0, 0, c.width, c.height)
      }
      const [all, bare, bareAgain, neither, feltAlone] = (await Promise.all(shots.map(read))) as [ImageData, ImageData, ImageData, ImageData, ImageData]
      const w = all.width
      const apart = (a: ImageData, b: ImageData, i: number) => Math.max(...[0, 1, 2].map((k) => Math.abs(a.data[i + k]! - b.data[i + k]!))) > 6
      const seen = new Set<number>()
      let through = 0
      let under = 0
      for (const box of boxes)
        for (let y = Math.max(0, Math.ceil(box.t)); y < Math.min(all.height, Math.floor(box.b)); y++)
          for (let x = Math.max(0, Math.ceil(box.l)); x < Math.min(w, Math.floor(box.r)); x++) {
            const i = (y * w + x) * 4
            if (seen.has(i)) continue
            seen.add(i)
            if (apart(bare, bareAgain, i)) continue
            if (apart(all, bare, i)) through++
            if (apart(feltAlone, neither, i)) under++
          }
      return { through, under }
    },
    { shots: [all, bare, bareAgain, neither, feltAlone], boxes },
  )
}

for (const screen of SCREENS)
  for (const lang of ['sv', 'en'] as const)
    test.describe(`the ended summary on the television at ${screen.width} × ${screen.height}, ${lang} (#1354)`, () => {
      test.use({ viewport: screen })

      test('stands on a plate the felt does not show through', async ({ tableOf, open, host }) => {
        const table = await tableOf({ players: 3, counters: [], cards: 40 })
        const { page } = await open({ name: `tv-${screen.width}`, viewport: screen }, withQuery(table.tvUrl, `lang=${lang}`), { facesReady: true })
        await expect(page.locator('[data-seat-plate]')).toHaveCount(3, { timeout: 20_000 })
        const hosting = await host(table)
        await hosting.send([{ v: 'session.end' } as never])
        await expect(page.locator('[data-ended]')).toBeVisible()
        await still(page)
        const where = `${screen.width} × ${screen.height}, ${lang}`
        await test.info().attach(`${where}.png`, { body: await page.screenshot(), contentType: 'image/png' })
        const read = await painted(page)
        expect(read.under, `${where}: the felt lies under the summary`).toBeGreaterThan(1000)
        expect({ where, through: read.through }).toEqual({ where, through: 0 })
      })
    })
