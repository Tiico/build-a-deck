import type { Browser, Page } from '@playwright/test'
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
// igen, ingen stil räknas om för hela sidan, och ingen bildruta blir lång för vridningens skull (#1446).

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

// What a turn costs, said in what the turn itself decides and not in the wall clock: a frame's length
// on a shared runner is the runner's load as much as the picture's (#1446). Which styles it writes,
// how many layouts and style passes it asks for, how many elements a style pass has to look at, and
// whether its own code ever makes a frame long.
type Turn = {
  changed: string[]
  frames: number
  layouts: number
  styles: number
  // The elements each style pass looked at, from the trace, and the page's own count to hold them to.
  passes: number[]
  elements: number
  // The long animation frames in which the app's own code ran long or forced styles and layout.
  own: string[]
}

async function turnOf(page: Page, browser: Browser): Promise<Turn> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const metric = async (name: 'LayoutCount' | 'RecalcStyleCount') => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === name)?.value ?? 0
  await page.evaluate(() => {
    const w = window as unknown as { changed: Set<string>; frames: number; own: string[] }
    w.changed = new Set()
    w.frames = 0
    w.own = []
    // Every style the picture is given while it turns, by name.
    new MutationObserver((records) => {
      for (const r of records) {
        const was = document.createElement('i')
        was.setAttribute('style', r.oldValue ?? '')
        const now = (r.target as HTMLElement).style
        const names = new Set([...Array.from(was.style), ...Array.from(now)])
        for (const name of names) if (was.style.getPropertyValue(name) !== now.getPropertyValue(name)) w.changed.add(name)
      }
    }).observe(document.querySelector('.byd-box-show')!, { attributes: true, attributeFilter: ['style'], attributeOldValue: true, subtree: true })
    // A frame a loaded machine made long has no script of the app's in it, or a short one. One the turn
    // made long has the app's own code in it, a long task by itself, or forcing the browser to work out
    // styles and layout in the middle of it. The turn's own frame is under a millisecond of script; at
    // twenty times slower it is seven.
    type Script = { sourceURL: string; invoker: string; duration: number; forcedStyleAndLayoutDuration: number }
    new PerformanceObserver((list) => {
      for (const frame of list.getEntries() as unknown as { duration: number; scripts: Script[] }[]) {
        for (const s of frame.scripts) {
          if (!s.sourceURL.startsWith(location.origin)) continue
          if (s.duration < 50 && s.forcedStyleAndLayoutDuration === 0) continue
          w.own.push(`${s.invoker} in ${s.sourceURL.slice(location.origin.length)}: ${Math.round(s.duration)} ms, ${Math.round(s.forcedStyleAndLayoutDuration)} ms forced, in a ${Math.round(frame.duration)} ms frame`)
        }
      }
    }).observe({ type: 'long-animation-frame' })
    const tick = () => {
      w.frames++
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await browser.startTracing(page, { categories: ['devtools.timeline'] })
  const before = { layouts: await metric('LayoutCount'), styles: await metric('RecalcStyleCount'), frames: await page.evaluate(() => (window as unknown as { frames: number }).frames) }
  // Two seconds of its own calm turn, and then a turn by hand.
  await page.waitForTimeout(2000)
  const scene = (await page.locator('.byd-box-show-scene').boundingBox())!
  await page.mouse.move(scene.x + 30, scene.y + 30)
  await page.mouse.down()
  await page.mouse.move(scene.x + 230, scene.y + 60, { steps: 30 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const after = { layouts: await metric('LayoutCount'), styles: await metric('RecalcStyleCount') }
  const seen = await page.evaluate(() => {
    const w = window as unknown as { changed: Set<string>; frames: number; own: string[] }
    return { changed: [...w.changed].sort(), frames: w.frames, own: w.own, elements: document.getElementsByTagName('*').length }
  })
  type Event = { name: string; args?: { elementCount?: number } }
  const trace = JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: Event[] }
  const passes = trace.traceEvents.filter((e) => e.name === 'UpdateLayoutTree' && typeof e.args?.elementCount === 'number').map((e) => e.args!.elementCount!)
  return { changed: seen.changed, frames: seen.frames - before.frames, layouts: after.layouts - before.layouts, styles: after.styles - before.styles, passes, elements: seen.elements, own: seen.own }
}

test.describe('the box turning', () => {
  test.use({ viewport: { width: 1440, height: 900 }, locale: 'sv-SE', reducedMotion: 'no-preference' })

  test('turns by transform and opacity alone, and asks nothing more of a frame', async ({ page, browser }) => {
    await shownOff(page)
    const turn = await turnOf(page, browser)
    test.info().annotations.push({ type: 'turn', description: `${turn.frames} frames, ${turn.layouts} layouts, ${turn.styles} style passes, the largest of ${Math.max(...turn.passes)} of ${turn.elements} elements` })
    // It moved, and was watched while it did, so the measurement is of something.
    expect(turn.changed).toContain('transform')
    expect(turn.passes.length).toBeGreaterThan(10)
    // Only what the compositor can move without the page.
    expect(turn.changed.filter((name) => name !== 'transform' && name !== 'opacity')).toEqual([])
    // A layout a frame would be a hundred and more; what is left is the editor's own, not the turn's.
    expect(turn.layouts).toBeLessThan(5)
    // At most one style pass a frame: nothing reads a style back in the middle of one. The press and
    // the release of the pointer are a pass of their own each.
    expect(turn.styles).toBeLessThanOrEqual(turn.frames + 4)
    // Each pass looks at the planes it changed, never at the whole page: a frame's pass is about a
    // dozen elements and the pointer's about fifty, of some five hundred and fifty.
    expect(Math.max(...turn.passes)).toBeLessThan(turn.elements / 4)
    // No frame is long for the turn's own sake, however loaded the machine it runs on.
    expect(turn.own).toEqual([])
  })
})
