import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { painted, type Spot } from '../../../web/test/painted.js'
import { logIn, makeProject } from '../../support/api.js'

// The two piles on the Bord tab's felt, as they are painted (#652). The felt is the real renderer at
// the felt's own scale, and at a desk's width that scale makes a card 20 × 28 px at 1024 and
// 28 × 40 at 1280 — smaller than the things the renderer draws on a pile in screen pixels. Three of
// them went wrong there, and each is read off the photograph, not off a declaration:
//
// - The pile's thickness (#314) was twelve steps of 1.2 px whatever the card's size, so 13 px of
//   navy stood above a 28 px card: with the card itself under its badge, that was all that was
//   left of the draw pile — a dark tab over «12».
// - The count badge was 30 px on a 20 px card, so it covered the whole pile and stood where the
//   pile is not, which K19 (#76) says it never does.
// - The zone's handle was drawn on top of the pile, so its amber line ran across the badge's
//   plate, and on the empty discard it lay on the pile's own dashed outline — two lines on the same
//   pixels, the odd outline around «0».
//
// The fonts are not the subject: nothing here samples where a glyph lands, so DejaVu on CI and
// SF Pro on a Mac paint the same answers.

type Box = { x: number; y: number; width: number; height: number }
type Rgb = [number, number, number]

const hexOf = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb
const apart = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
// The felt's amber, the colour every handle on it is drawn in (#34) — over anything, at any alpha
// it is drawn in, it is red well above blue. Nothing else near a pile is: the felt, the card's
// navy back, the badge's plate and its ink are all blue-or-grey.
const amber = ([r, , b]: Rgb) => r > 120 && r - b > 45

/** Invisible probes over a client rectangle, so `painted` can be pointed at a patch of felt. */
async function probe(page: Page, id: string, box: Box): Promise<string> {
  await page.evaluate(
    ({ id, box }) => {
      document.getElementById(id)?.remove()
      const el = document.createElement('div')
      el.id = id
      Object.assign(el.style, { position: 'fixed', left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px`, visibility: 'hidden', pointerEvents: 'none' })
      document.body.appendChild(el)
    },
    { id, box },
  )
  return `#${id}`
}

/** Every painted pixel in a client rectangle, one per CSS pixel. */
async function pixels(page: Page, box: Box): Promise<{ x: number; y: number; rgb: Rgb }[]> {
  const clip = { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width), height: Math.ceil(box.height) }
  const shot = (await page.screenshot({ clip, scale: 'css' })).toString('base64')
  const flat = await page.evaluate(async (src) => {
    const img = new Image()
    img.src = `data:image/png;base64,${src}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    return { w: c.width, data: [...g.getImageData(0, 0, c.width, c.height).data] }
  }, shot)
  const out: { x: number; y: number; rgb: Rgb }[] = []
  for (let i = 0; i < flat.data.length; i += 4) {
    const n = i / 4
    out.push({ x: clip.x + (n % flat.w) + 0.5, y: clip.y + Math.floor(n / flat.w) + 0.5, rgb: [flat.data[i]!, flat.data[i + 1]!, flat.data[i + 2]!] })
  }
  return out
}

async function bord(page: Page) {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Högarna', players: 4, cards: 12 })
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-tables').click()
  await expect(page.locator('.byd-setup-felt .byd-pile[data-zone="draw"] [data-back="own"] svg path')).toBeAttached()
  await expect(page.locator('.byd-setup-felt .byd-pile[data-zone="discard"]')).toBeVisible()
  // Nothing pointed at or chosen: the piles at rest, with no name plate lit over them (#581).
  await page.mouse.move(0, 0)
}

const card = (page: Page, zone: string) => page.locator(`.byd-setup-felt .byd-pile[data-zone="${zone}"] .byd-pile-top`).boundingBox() as Promise<Box>
const badge = (page: Page, zone: string) => page.locator(`.byd-setup-felt .byd-pile[data-zone="${zone}"] .byd-pile-n`).boundingBox() as Promise<Box>

for (const [width, height] of [[1024, 768], [1280, 800]] as const) {
  test.describe(`the piles on the Bord tab's felt at ${width} × ${height} (#652)`, () => {
    test.use({ viewport: { width, height } })

    test('the deck is no thicker than a fifth of its card, and its thickness is drawn', async ({ page }) => {
      await bord(page)
      const c = await card(page, 'draw')
      const far = await card(page, 'discard')
      const across = { x: c.x + c.width * 0.2, width: c.width * 0.6 }
      // The felt itself at the same height, between the two piles: the ground the deck stands on.
      const felt = await probe(page, 'byd-probe-felt', { x: c.x + c.width * 1.5, width: far.x - c.x - c.width * 2, y: c.y - c.height * 0.4, height: c.height * 0.15 })
      const beyond = await probe(page, 'byd-probe-beyond', { ...across, y: c.y - c.height * 0.4, height: c.height * 0.15 })
      const edge = await probe(page, 'byd-probe-edge', { ...across, y: c.y - c.height * 0.15, height: c.height * 0.12 })
      const spots: Spot[] = [
        { what: 'felt', inside: felt, inset: 0 },
        { what: 'beyond', inside: beyond, inset: 0 },
        { what: 'edge', inside: edge, inset: 0 },
      ]
      const read = await painted(page, spots)
      const ground = hexOf(read['felt']!.shades[1])
      // Non-vacuity: right above the card the deck's edge is drawn, and it is not the felt.
      expect(apart(hexOf(read['edge']!.shades[1]), ground), `the deck's edge above the card is ${read['edge']!.shades[1]}, the felt ${read['felt']!.shades[1]}`).toBeGreaterThan(20)
      // Past a fifth of the card's height above it, there is felt and nothing else.
      expect(apart(hexOf(read['beyond']!.shades[1]), ground), `a third of a card above the deck is ${read['beyond']!.shades[1]}, the felt ${read['felt']!.shades[1]}`).toBeLessThan(12)
    })

    test('the card shows under its count, and the count stands on its pile', async ({ page }) => {
      await bord(page)
      const c = await card(page, 'draw')
      const n = await badge(page, 'draw')
      // The back the felt compiled for this deck, read off its own markup and not written here.
      const fill = await page.locator('.byd-setup-felt .byd-pile[data-zone="draw"] [data-back="own"] svg path').first().getAttribute('fill')
      expect(fill, 'the deck has a back of its own to be recognised by').toMatch(/^#[0-9a-f]{6}$/i)
      const foot = await probe(page, 'byd-probe-foot', { x: c.x + c.width * 0.3, width: c.width * 0.4, y: c.y + c.height * 0.8, height: c.height * 0.15 })
      const read = await painted(page, [{ what: 'foot', inside: foot, inset: 0 }])
      expect(apart(hexOf(read['foot']!.shades[1]), hexOf(fill!)), `the card's foot is painted ${read['foot']!.shades[1]}, its back is ${fill}`).toBeLessThan(30)
      // K19 (#76): the badge stands nowhere the pile is not. Half a pixel for the rounding of a box.
      expect(n.x).toBeGreaterThanOrEqual(c.x - 0.5)
      expect(n.x + n.width).toBeLessThanOrEqual(c.x + c.width + 0.5)
    })

    test("the handle's line crosses neither pile's badge", async ({ page }) => {
      await bord(page)
      for (const zone of ['draw', 'discard']) {
        const c = await card(page, zone)
        const n = await badge(page, zone)
        // The badge is a pill: its ends are half circles of the badge's own height. Inside it, by
        // a pixel and a half for the antialiased rim, only the plate and its ink are painted.
        const r = n.height / 2
        const inside = (x: number, y: number) => {
          const cx = Math.min(Math.max(x, n.x + r), n.x + n.width - r)
          return Math.hypot(x - cx, y - (n.y + r)) <= r - 1.5
        }
        const crossing = (await pixels(page, n)).filter((p) => inside(p.x, p.y) && amber(p.rgb))
        expect(crossing.map((p) => `${p.x},${p.y}`), `amber painted inside the ${zone} pile's badge`).toEqual([])
        // Non-vacuity: the handle is drawn, close around the pile.
        const around = (await pixels(page, { x: c.x - 6, y: c.y - 6, width: c.width + 12, height: c.height + 12 })).filter((p) => amber(p.rgb))
        expect(around.length, `the ${zone} pile's handle is painted around it`).toBeGreaterThan(10)
      }
    })

    test('a pile drawn over its handle still hands the pointer to it, badge and all', async ({ page }) => {
      await bord(page)
      for (const zone of ['draw', 'discard']) {
        // Playwright's own actionability check: a click on the handle that lands on the pile's
        // badge instead is refused as intercepted, which is exactly the failure to rule out.
        const n = (await badge(page, zone))!
        const handle = page.locator(`[data-zone-handle="${zone}"]`)
        const h = (await handle.boundingBox())!
        await handle.click({ position: { x: n.x + n.width / 2 - h.x, y: n.y + n.height / 2 - h.y }, timeout: 5_000 })
        await expect(handle).toHaveAttribute('aria-pressed', 'true')
      }
    })

    test("a pointed-at pile's ring is its handle's line, brightened, and not a square ring over it", async ({ page }) => {
      await bord(page)
      // The empty pile, so no thickness stands where its corner is read.
      const c = await card(page, 'discard')
      await page.locator('[data-zone-handle="discard"]').hover()
      await expect(page.locator('.byd-setup-felt .byd-pile[data-zone="discard"]')).toHaveAttribute('data-lit', '')
      const [side] = await pixels(page, { x: c.x - 3, y: c.y + c.height / 2, width: 1, height: 1 })
      expect(amber(side!.rgb), `the ring beside the pile is painted ${side!.rgb}`).toBe(true)
      const [corner] = await pixels(page, { x: c.x - 3, y: c.y - 3, width: 1, height: 1 })
      expect(amber(corner!.rgb), `the ring's corner, where a round line does not reach, is painted ${corner!.rgb}`).toBe(false)
    })

    test("the empty pile's own outline and its handle's line are not the same pixels", async ({ page }) => {
      await bord(page)
      const c = await card(page, 'discard')
      const n = await badge(page, 'discard')
      const below = Math.max(n.y + n.height, c.y + c.height * 0.5) + 1
      const sides = [
        { x: c.x, y: below, width: 2, height: c.y + c.height - 2 - below },
        { x: c.x + c.width - 2, y: below, width: 2, height: c.y + c.height - 2 - below },
      ]
      expect(sides[0]!.height, 'there is a stretch of the pile’s edge under its badge to read').toBeGreaterThan(3)
      for (const side of sides) {
        const on = (await pixels(page, side)).filter((p) => amber(p.rgb))
        expect(on.map((p) => `${p.x},${p.y}`), 'amber painted on the empty pile’s own outline').toEqual([])
      }
      // Non-vacuity: the handle's line is there, beside the outline rather than on it.
      const near = (await pixels(page, { x: c.x - 6, y: below, width: 6, height: sides[0]!.height })).filter((p) => amber(p.rgb))
      expect(near.length, 'the handle is painted beside the empty pile').toBeGreaterThan(3)
    })
  })
}
