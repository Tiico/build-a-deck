import type { Page } from '@playwright/test'
import type { ProjectDoc } from '@byd/server'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { tableOf as tableFromSetup, withQuery } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { expect, test } from '../../support/test.js'

// The television's shortcut list lies over everything on the felt, and its last row can be reached
// (#1352). The list stands beside the room's column, over the felt, from the screen's top (#875);
// it is `position: fixed` and had no z-index of its own, so every seat's plate and the start tile —
// which the felt lifts with z-indexes of their own — were painted across its rows. And its
// `max-height` held only the content box, so the padding and the border made it 42 px taller than
// the window allows: at 1280 × 720 «Esc» and «?» stood below the screen's edge, out of reach of the
// list's own scroll.
//
// Read off what is painted, as `start-tile-clear-of-piles.spec.ts` does: the screen with the plates
// and the tile, and again with them made transparent. A pixel inside the list that the two
// photographs disagree on is a pixel the felt painted over the list. Opacity, so nothing is laid
// out again between the photographs.
function threeSeatsWithAStart(): ProjectDoc {
  const doc = gameDoc({ players: 3, counters: [], cards: 8 })
  return {
    ...doc,
    setup: {
      ...doc.setup,
      zones: doc.setup.zones.map((z) =>
        z.id === doc.setup.deckZone ? { ...z, actions: [{ id: 'start', label: 'Blanda', when: 'both' as const, steps: [{ v: 'shuffle' as const }] }] } : z,
      ),
    },
  }
}

const SCREENS = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const

const FELT = '[data-seat-plate], [data-table-start]'

// Until the felt and the list stand still a few frames in a row: the camera glides to its frame
// (#325), and the plates are laid out again when their words resize.
async function still(page: Page): Promise<void> {
  const frames = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 0)))))
  const where = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-seat-plate], [data-table-start], .byd-pile, [data-shortcut-panel]')].map((el) => {
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
  throw new Error('the felt never stood still')
}

type Read = { over: number; under: number }

// `over`: pixels inside the list the plates and the tile change, with the list drawn. `under`: the
// same with the list made transparent too, which is how much of the felt's own lies under it — the
// guard that the first number is not zero because nothing was ever there.
async function painted(page: Page): Promise<Read> {
  const hide = (css: string) => page.addStyleTag({ content: `${css} { opacity: 0 !important; transition: none !important; animation: none !important; }` })
  const quiet = await page.addStyleTag({ content: `${FELT}, [data-shortcut-panel] { transition: none !important; animation: none !important; }` })
  const shot = async (): Promise<string> => (await page.screenshot({ scale: 'css', animations: 'disabled' })).toString('base64')
  const box = await page.locator('[data-shortcut-panel]').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { l: r.left, t: r.top, r: r.right, b: r.bottom }
  })
  const all = await shot()
  const offFelt = await hide(FELT)
  const bare = await shot()
  const bareAgain = await shot()
  const offPanel = await hide('[data-shortcut-panel]')
  const neither = await shot()
  await offFelt.evaluate((el) => (el as Element).remove())
  const feltAlone = await shot()
  await offPanel.evaluate((el) => (el as Element).remove())
  await quiet.evaluate((el) => (el as Element).remove())
  return page.evaluate(
    async ({ shots, box }) => {
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
      const apart = (a: ImageData, b: ImageData, i: number) => Math.max(...[0, 1, 2].map((k) => Math.abs(a.data[i + k]! - b.data[i + k]!))) > 12
      let over = 0
      let under = 0
      for (let y = Math.max(0, Math.ceil(box.t)); y < Math.min(all.height, Math.floor(box.b)); y++)
        for (let x = Math.max(0, Math.ceil(box.l)); x < Math.min(w, Math.floor(box.r)); x++) {
          const i = (y * w + x) * 4
          // A pixel the list's own ground moves between two photographs of it is no pixel the
          // felt painted (a caret, a dither).
          if (apart(bare, bareAgain, i)) continue
          if (apart(all, bare, i)) over++
          if (apart(feltAlone, neither, i)) under++
        }
      return { over, under }
    },
    { shots: [all, bare, bareAgain, neither, feltAlone], box },
  )
}

for (const screen of SCREENS)
  for (const lang of ['sv', 'en'] as const)
    test.describe(`the shortcut list on the owner’s television at ${screen.width} × ${screen.height}, ${lang} (#1352)`, () => {
      test.use({ viewport: screen })

      test('lies over every plate and the start tile, before and after the start, and its last row is in reach', async ({ request, open }) => {
        const doc = threeSeatsWithAStart()
        const table = await tableFromSetup(request, setupFromProject(doc), deckFromProject(doc))
        const { page } = await open({ name: `tv-${screen.width}`, viewport: screen }, withQuery(table.tvUrl, `lang=${lang}`), { facesReady: true })
        await expect(page.locator('[data-seat-plate]')).toHaveCount(3, { timeout: 20_000 })
        await expect(page.locator('[data-table-start]')).toBeVisible()
        await page.locator('.byd-shortcut-open').click()
        const panel = page.locator('[data-shortcut-panel]')
        await expect(panel).toBeVisible()

        for (const phase of ['waiting', 'playing'] as const) {
          if (phase === 'playing') {
            await page.keyboard.press('Escape')
            await expect(panel).toHaveCount(0)
            await page.locator('[data-table-start]').click()
            await expect(page.locator('[data-table-start]')).toHaveText(/Starta om|Start again/)
            await page.locator('.byd-shortcut-open').click()
            await expect(panel).toBeVisible()
          }
          await still(page)
          const where = `${screen.width} × ${screen.height}, ${lang}, ${phase}`
          await test.info().attach(`${where}.png`, { body: await page.screenshot(), contentType: 'image/png' })
          const read = await painted(page)
          // Not vacuous where the issue saw it: at 1280 × 720 the plates and the tile lie under the list.
          if (screen.width === 1280) expect(read.under, `${where}: something of the felt lies under the list`).toBeGreaterThan(200)
          expect({ where, over: read.over }).toEqual({ where, over: 0 })

          // The list stands inside the window, and its own scroll brings its last row there.
          const reach = await panel.evaluate((p) => {
            p.scrollTop = p.scrollHeight
            const box = p.getBoundingClientRect()
            const last = [...p.querySelectorAll('dd')].at(-1)!.getBoundingClientRect()
            return { top: box.top, bottom: box.bottom, lastBottom: last.bottom, window: window.innerHeight }
          })
          expect(reach.top, `${where}: the list starts on the screen`).toBeGreaterThanOrEqual(0)
          expect(reach.bottom, `${where}: the list ends on the screen`).toBeLessThanOrEqual(reach.window)
          expect(reach.lastBottom, `${where}: the last row is inside the list`).toBeLessThanOrEqual(reach.bottom)
        }
      })
    })
