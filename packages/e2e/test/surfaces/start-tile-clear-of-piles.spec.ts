import type { Page } from '@playwright/test'
import type { ProjectDoc } from '@byd/server'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { tableOf as tableFromSetup, withQuery } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { expect, test } from '../../support/test.js'

// The start tile stands clear of the piles' pills (K25, #721). It lies in the band under the piles,
// placed in table millimetres, but the pills that carry the piles' names and counts hang off them
// in pixels and do not shrink with the felt: at 1024 the tile lay 10 px over them, and its shadow
// over the counts. Measured on the built table screen, as a player at the table sees it.
function gameWithAStart(players = 2): ProjectDoc {
  const doc = gameDoc({ players, counters: [], cards: 8 })
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

// The same game with no pile that runs anything at the start, so no tile is drawn (K25).
function gameWithoutAStart(players: number): ProjectDoc {
  const doc = gameWithAStart(players)
  return { ...doc, setup: { ...doc.setup, zones: doc.setup.zones.map((z) => ('actions' in z && z.actions ? { ...z, actions: z.actions.map((a) => ({ ...a, when: 'request' as const })) } : z)) } }
}

for (const width of [1024, 1280, 1440]) {
  test.describe(`the start tile at ${width} (#721)`, () => {
    test.use({ viewport: { width, height: width === 1024 ? 768 : 800 } })

    test('leaves at least 8 px to every pile’s pill above it', async ({ request, open }) => {
      const doc = gameWithAStart()
      const table = await tableFromSetup(request, setupFromProject(doc), deckFromProject(doc))
      const { page } = await open({ name: `desk-${width}`, viewport: { width, height: width === 1024 ? 768 : 800 } }, withQuery(table.tableUrl, 'lang=sv'), { facesReady: true })
      const tile = page.locator('[data-table-start]')
      await expect(tile).toBeVisible()
      const drawn = await page.evaluate(() => {
        const t = document.querySelector('[data-table-start]')!.getBoundingClientRect()
        const pills = [...document.querySelectorAll('.byd-pile-count')].map((p) => p.getBoundingClientRect())
        return { tile: { left: t.left, right: t.right, top: t.top }, pills: pills.map((p) => ({ left: p.left, right: p.right, bottom: p.bottom })) }
      })
      // The pills that stand over the tile, across: those are the ones it can cover.
      const over = drawn.pills.filter((p) => p.right > drawn.tile.left && p.left < drawn.tile.right)
      expect(over.length, 'a pile’s pill stands above the tile').toBeGreaterThan(0)
      for (const p of over) expect(drawn.tile.top - p.bottom).toBeGreaterThanOrEqual(8)
    })
  })
}

// And clear of every seat's plate on the owner's television (#1344). The pills push the tile down
// in pixels, toward the seats, and a plate is pixels too: at 1280 and 1440 the tile lay over seat
// A's «ledig 0 kort», and nothing measured the tile against a plate. The plates are laid out on a
// free place (#683), and the tile is one more thing on the felt that place must be free of.
//
// Read off what is painted, not off boxes: the tile's shadow is part of what covers a plate, and a
// box says nothing about which of two things is drawn on top. Each is photographed alone on the
// same felt — the tile with the plates made transparent, the plates with the tile made so — against
// the felt with neither, and a pixel the two photographs both changed is a pixel the tile covers.
// Opacity, so that nothing is laid out again between the photographs.
//
// In both languages, since the plate says «ledig» or «free», and once more in a face as wide as
// CI's DejaVu (Verdana, which a Mac has; DejaVu, which the runner has): the plates and the tile
// write in the felt's shipped face (K20), so that face is one width everywhere, and the wider one
// is what a television without it, or a longer name, draws instead. The app lays the plates out
// again when their words change their size, as it does for a face arriving late.
type Painted = { tile: number; plates: Record<string, { painted: number; covered: number }> }

const SCREENS = [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const

// Until the plates, the tile and the piles stand still a few frames in a row: the television's
// camera glides to its frame (#325), and the plates are laid out again when their words resize.
async function still(page: Page): Promise<void> {
  const frames = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 0)))))
  const where = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-seat-plate], [data-table-start], .byd-pile, .byd-pile-count')].map((el) => {
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

async function painted(page: Page): Promise<Painted> {
  const hide = (css: string) => page.addStyleTag({ content: `${css} { opacity: 0 !important; transition: none !important; animation: none !important; }` })
  const quiet = await page.addStyleTag({ content: '[data-seat-plate], [data-table-start] { transition: none !important; animation: none !important; }' })
  const shot = async (): Promise<string> => (await page.screenshot({ scale: 'css', animations: 'disabled' })).toString('base64')
  const offTile = await hide('[data-table-start]')
  const plates = await shot()
  const offPlates = await hide('[data-seat-plate]')
  const neither = await shot()
  await offTile.evaluate((el) => (el as Element).remove())
  const tile = await shot()
  // The felt with neither, once more: a pixel that changed between the two is the felt's own
  // (a pulse, a dither), and is no pixel the tile or a plate painted.
  const offAgain = await hide('[data-table-start]')
  const again = await shot()
  await offAgain.evaluate((el) => (el as Element).remove())
  await offPlates.evaluate((el) => (el as Element).remove())
  await quiet.evaluate((el) => (el as Element).remove())
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-seat-plate]')].map((p) => {
      const r = p.getBoundingClientRect()
      return { seat: p.dataset['seatPlate'] ?? '?', l: r.left, t: r.top, r: r.right, b: r.bottom }
    }),
  )
  // Where the tile can paint at all: its box, and as far past it as its outer shadows reach, read
  // from the shadow it is drawn with. A pixel outside it changed for some other reason. The piles'
  // count discs stand beside the plates, and the edge of one is rastered in one of two ways from
  // shot to shot (#1407): at 1024 with four seats the «8» disc's edge lies in D's margin, and it once
  // came out lit in the tile's photograph and the plates' and dark in both of the felt's.
  const reach = await page.evaluate(() => {
    const t = document.querySelector<HTMLElement>('[data-table-start]')!
    const r = t.getBoundingClientRect()
    const k = t.offsetWidth > 0 ? r.width / t.offsetWidth : 1
    const out = { l: 0, t: 0, r: 0, b: 0 }
    for (const s of getComputedStyle(t).boxShadow.split(/,(?![^(]*\))/)) {
      if (/inset/.test(s)) continue
      const [x = 0, y = 0, blur = 0, spread = 0] = (s.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) ?? []).map(parseFloat)
      out.l = Math.max(out.l, blur + spread - x)
      out.r = Math.max(out.r, blur + spread + x)
      out.t = Math.max(out.t, blur + spread - y)
      out.b = Math.max(out.b, blur + spread + y)
    }
    return { l: r.left - out.l * k, t: r.top - out.t * k, r: r.right + out.r * k, b: r.bottom + out.b * k }
  })
  return page.evaluate(
    async ({ shots, boxes, reach }) => {
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
      const [plates, neither, tile, again] = (await Promise.all(shots.map(read))) as [ImageData, ImageData, ImageData, ImageData]
      const w = neither.width
      // Changed: a channel moved by more than the felt's own dithering. The shadow's fringe is a
      // few levels; its body, which reads as a shadow on a plate, is tens.
      const apart = (a: ImageData, b: ImageData, i: number) => Math.max(...[0, 1, 2].map((k) => Math.abs(a.data[i + k]! - b.data[i + k]!))) > 12
      const changed = (a: ImageData, i: number) => apart(a, neither, i) && !apart(again, neither, i)
      // The pixel whose square meets where the tile can paint.
      const tileCan = (x: number, y: number) => x + 1 > reach.l && x < reach.r && y + 1 > reach.t && y < reach.b
      const byTile = (i: number) => changed(tile, i) && tileCan((i / 4) % w, Math.floor(i / 4 / w))
      let tilePainted = 0
      for (let i = 0; i < tile.data.length; i += 4) if (byTile(i)) tilePainted++
      const out: Record<string, { painted: number; covered: number }> = {}
      for (const b of boxes) {
        let paintedHere = 0
        let covered = 0
        // A plate is read in a margin around its box, so that its own shadow is the plate's too.
        for (let y = Math.max(0, Math.floor(b.t) - 4); y < Math.min(neither.height, Math.ceil(b.b) + 4); y++)
          for (let x = Math.max(0, Math.floor(b.l) - 4); x < Math.min(w, Math.ceil(b.r) + 4); x++) {
            const i = (y * w + x) * 4
            if (!changed(plates, i)) continue
            paintedHere++
            if (byTile(i)) covered++
          }
        out[b.seat] = { painted: paintedHere, covered }
      }
      return { tile: tilePainted, plates: out }
    },
    { shots: [plates, neither, tile, again], boxes, reach },
  )
}

const WIDE = "[data-seat-plate], [data-seat-plate] *, [data-table-start], [data-table-start] * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }"

for (const screen of SCREENS)
  for (const lang of ['sv', 'en'] as const)
    test.describe(`the start tile on the owner’s television at ${screen.width}, ${lang} (#1344)`, () => {
      test.use({ viewport: screen })

      for (const seats of [2, 3, 4, 5, 6, 7, 8])
        test(`covers no seat’s plate at ${seats} seats`, async ({ request, open }) => {
          const screenOf = async (doc: ProjectDoc) => {
            const table = await tableFromSetup(request, setupFromProject(doc), deckFromProject(doc))
            const { page } = await open({ name: `tv-${screen.width}`, viewport: screen }, withQuery(table.tvUrl, `lang=${lang}`), { facesReady: true })
            await expect(page.locator('[data-seat-plate]')).toHaveCount(seats, { timeout: 20_000 })
            return page
          }
          const formsOf = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-seat-plate]')].map((p) => `${p.dataset['seatPlate']} ${p.dataset['form'] ?? 'plate'}`))
          // The same table without a start, which draws no tile: what the plates are without it.
          const bare = await screenOf(gameWithoutAStart(seats))
          await expect(bare.locator('[data-table-start]')).toHaveCount(0)
          const page = await screenOf(gameWithAStart(seats))
          await expect(page.locator('[data-table-start]')).toBeVisible()
          for (const face of ['shipped', 'wide'] as const) {
            for (const p of [bare, page]) {
              if (face === 'wide') await p.addStyleTag({ content: WIDE })
              await still(p)
            }
            const where = `${screen.width} × ${screen.height}, ${lang}, ${seats} seats, ${face} face`
            const now = await painted(page)
            await test.info().attach(`${where}.png`, { body: await page.screenshot(), contentType: 'image/png' })
            // Not vacuous: the tile and every plate are painted, each where it was photographed.
            expect(now.tile, `${where}: the tile is painted`).toBeGreaterThan(1000)
            for (const [seat, p] of Object.entries(now.plates)) expect(p.painted, `${where}: plate ${seat} is painted`).toBeGreaterThan(100)
            const covered = Object.entries(now.plates).flatMap(([seat, p]) => (p.covered > 0 ? [`${seat}: ${p.covered} px`] : []))
            expect({ where, covered }).toEqual({ where, covered: [] })
            // And from 1280 up no plate bought its way clear by giving up its words: a plate is a badge
            // beside the tile only where it is one on the same felt without it (#750). At 1024 the
            // plates are laid out on the felt as fitted to a 664 px frame, where the band under the
            // piles holds the pills and the tile and no plate besides, and seat A at two to four
            // seats is drawn as its badge, the last place #683 gives it, until the tile leaves.
            if (screen.width > 1024) expect({ where, forms: await formsOf(page) }).toEqual({ where, forms: await formsOf(bare) })
          }
        })
    })

// The plate gives way to the tile only while the tile lies on the felt: once the game has started
// the tile leaves for the corner (#482), and the plate goes back to its own place.
test.describe('a plate that gave way to the start tile (#1344)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('goes back to its own place when the game starts', async ({ request, open }) => {
    const doc = gameWithAStart(2)
    const table = await tableFromSetup(request, setupFromProject(doc), deckFromProject(doc))
    const { page } = await open({ name: 'tv-1280', viewport: { width: 1280, height: 800 } }, withQuery(table.tvUrl, 'lang=sv'), { facesReady: true })
    const plate = page.locator('[data-seat-plate="A"]')
    await expect(page.locator('[data-table-start]')).toBeVisible()
    await still(page)
    await expect(plate).not.toHaveAttribute('data-plate-at', 'own')
    await page.locator('[data-table-start]').click()
    // «Starta om» in the corner carries the same mark; the tile on the felt is the one that left.
    await expect(page.locator('[data-table-start]')).toHaveText(/Starta om/)
    await expect(plate).toHaveAttribute('data-plate-at', 'own')
  })
})
