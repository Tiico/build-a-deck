import type { Page } from '@playwright/test'
import { boxFaceSize, type BoxFace } from '@byd/engine'
import { boxOf } from '@byd/server/doc'
import type { ProjectDoc } from '@byd/server'
import { expect, test } from '../../support/test.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// Produktbilden i «Visa upp» (#1414, L91), mätt på det som målats och inte på det som deklarerats.
//
// Varje yta på lådan får en egen färg i sin egen mall, så att bilden kan läsas: den ritas av den enda
// renderaren (E2) och sätts på sitt plan, och färgen som målas på skärmen där planet står säger vilken
// mall som hamnade på vilken sida. Ljuset är bakat ur planets normal, så samma sida målas mörkare
// eller ljusare när lådan vrids. Och vridningen ändrar bara transform och opacitet: ingenting läggs ut
// igen, och bildrutorna kommer i takt.

const COLOURS: Record<BoxFace, string> = { front: '#d02020', right: '#2050d0', lid: '#20a030', back: '#d0c020', left: '#c020c0', bottom: '#20c0c0' }
type Hue = 'red' | 'blue' | 'green' | 'yellow' | 'magenta' | 'cyan'
const HUE: Record<BoxFace, Hue> = { front: 'red', right: 'blue', lid: 'green', back: 'yellow', left: 'magenta', bottom: 'cyan' }

function painted(): ProjectDoc {
  const doc = gameDoc({ name: 'Skogens råd', cards: 30, copies: 2 }) as ProjectDoc
  const size = boxOf(doc).size
  const faces = Object.fromEntries(
    (Object.keys(COLOURS) as BoxFace[]).map((face) => {
      const { widthMm: w, heightMm: h } = boxFaceSize(face, size)
      return [face, { base: [{ kind: 'shape', id: `ground-${face}`, x: 0, y: 0, w, h, shape: 'rect', fill: COLOURS[face] }], variants: {} }]
    }),
  )
  return { ...doc, box: { type: { id: 'box.tuck', version: 1 }, faces } } as ProjectDoc
}

async function shownOff(page: Page): Promise<void> {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, painted())
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-box').click()
  await page.getByRole('button', { name: 'Visa upp' }).click()
  await expect(page.locator('.byd-box-show')).toHaveAttribute('data-look', 'show', { timeout: 5000 })
  // The light comes on as the fold ends; measured once it has.
  await page.waitForTimeout(900)
}

type Spot = { face: BoxFace; rgb: [number, number, number] }

// The painted colour at the middle of each named plane: a 9 × 9 patch of the page as photographed,
// averaged. The middle of a plane's box on the screen is inside the plane, since a plane seen in
// perspective is still a convex shape.
async function spots(page: Page, faces: BoxFace[]): Promise<Spot[]> {
  const at = await page.evaluate((names) => names.map((face) => {
    const r = document.querySelector(`[data-show-face="${face}"]`)!.getBoundingClientRect()
    return { face, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }), faces)
  const shot = await page.screenshot()
  return page.evaluate(async ({ png, at }) => {
    const img = new Image()
    img.src = `data:image/png;base64,${png}`
    await img.decode()
    const canvas = new OffscreenCanvas(img.width, img.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const k = img.width / innerWidth
    return at.map(({ face, x, y }) => {
      const px = ctx.getImageData(Math.round(x * k) - 4, Math.round(y * k) - 4, 9, 9).data
      const sum = [0, 0, 0]
      for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += px[i + c]!
      return { face, rgb: sum.map((s) => Math.round(s / (px.length / 4))) as [number, number, number] }
    })
  }, { png: shot.toString('base64'), at }) as Promise<Spot[]>
}

// Which of the six colours a painted one is, by which channels stand above the third: shading
// darkens a colour and the lacquer lightens it, but neither turns red into blue.
function hueOf([r, g, b]: [number, number, number]): Hue | 'grey' {
  const hi = Math.max(r, g, b)
  const lo = Math.min(r, g, b)
  if (hi - lo < 30) return 'grey'
  const on = (c: number) => c - lo > (hi - lo) / 2
  const [R, G, B] = [on(r), on(g), on(b)]
  if (R && G && !B) return 'yellow'
  if (R && B && !G) return 'magenta'
  if (G && B && !R) return 'cyan'
  return R ? 'red' : G ? 'green' : 'blue'
}
const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

test.describe('the box shown off, still', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE', reducedMotion: 'reduce' })

  test('wears each face’s own picture on its own side, from the front and from behind', async ({ page }) => {
    await shownOff(page)
    // The planes carry the renderer's drawing of the face, and nothing drawn beside it (E2).
    for (const face of Object.keys(COLOURS) as BoxFace[]) {
      await expect(page.locator(`[data-show-face="${face}"] .byd-preview [data-element="ground-${face}"]`)).toHaveCount(1)
    }
    await expect(page.locator('.byd-box-show canvas')).toHaveCount(0)

    // At rest the front, the right side and the lid are seen.
    const rest = await spots(page, ['front', 'right', 'lid'])
    expect(rest.map((s) => [s.face, hueOf(s.rgb)])).toEqual(rest.map((s) => [s.face, HUE[s.face]]))

    // Half a turn round, by the keys, and the back and the left side are.
    await page.locator('.byd-box-show-scene').focus()
    for (let i = 0; i < 18; i++) await page.keyboard.press('ArrowRight')
    const behind = await spots(page, ['back', 'left', 'lid'])
    expect(behind.map((s) => [s.face, hueOf(s.rgb)])).toEqual(behind.map((s) => [s.face, HUE[s.face]]))
  })

  test('is lit by the side’s normal, so a side is painted darker as it turns from the light', async ({ page }) => {
    await shownOff(page)
    const [front0, lid0, right0] = await spots(page, ['front', 'lid', 'right'])
    // The lid faces the light and the right side turns away from it: the light is baked, not flat.
    expect(luminance(lid0!.rgb) / luminance([32, 160, 48])).toBeGreaterThan(luminance(right0!.rgb) / luminance([32, 80, 208]))
    await page.locator('.byd-box-show-scene').focus()
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
    const [front1] = await spots(page, ['front'])
    expect(hueOf(front1!.rgb)).toBe('red')
    // Turned 40° on, the front faces further from the light: by the light's own sum its red falls
    // from about 166 to about 142.
    expect(front0!.rgb[0] - front1!.rgb[0]).toBeGreaterThan(12)
  })
})

test.describe('the box turning', () => {
  test.use({ viewport: { width: 1440, height: 900 }, locale: 'sv-SE', reducedMotion: 'no-preference' })

  test('turns by transform and opacity alone, and keeps its frames coming', async ({ page }) => {
    await shownOff(page)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    const layouts = async () => ((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'LayoutCount')?.value ?? 0)
    // Every style the picture is given while it turns, by name, and every frame's time.
    await page.evaluate(() => {
      const w = window as unknown as { changed: Set<string>; frames: number[] }
      w.changed = new Set()
      w.frames = []
      new MutationObserver((records) => {
        for (const r of records) {
          const was = document.createElement('i')
          was.setAttribute('style', r.oldValue ?? '')
          const now = (r.target as HTMLElement).style
          const names = new Set([...Array.from(was.style), ...Array.from(now)])
          for (const name of names) if (was.style.getPropertyValue(name) !== now.getPropertyValue(name)) w.changed.add(name)
        }
      }).observe(document.querySelector('.byd-box-show')!, { attributes: true, attributeFilter: ['style'], attributeOldValue: true, subtree: true })
      let last = performance.now()
      const tick = (t: number) => {
        w.frames.push(t - last)
        last = t
        if (w.frames.length < 400) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const before = await layouts()
    // Two seconds of its own calm turn, and then a turn by hand.
    await page.waitForTimeout(2000)
    const scene = (await page.locator('.byd-box-show-scene').boundingBox())!
    await page.mouse.move(scene.x + 30, scene.y + 30)
    await page.mouse.down()
    await page.mouse.move(scene.x + 230, scene.y + 60, { steps: 30 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    const after = await layouts()
    const { changed, frames } = await page.evaluate(() => {
      const w = window as unknown as { changed: Set<string>; frames: number[] }
      return { changed: [...w.changed].sort(), frames: w.frames.slice(1) }
    })
    // It moved, so the measurement is of something.
    expect(changed).toContain('transform')
    expect(changed.filter((name) => name !== 'transform' && name !== 'opacity')).toEqual([])
    // A layout a frame would be a hundred and more; what is left is the editor's own, not the turn's.
    expect(after - before).toBeLessThan(5)
    const sorted = [...frames].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]!
    const slow = sorted[Math.floor(sorted.length * 0.95)]!
    test.info().annotations.push({ type: 'frames', description: `${frames.length} frames, median ${median.toFixed(1)} ms, 95th ${slow.toFixed(1)} ms` })
    expect(frames.length).toBeGreaterThan(90)
    expect(median).toBeLessThan(25)
  })
})
