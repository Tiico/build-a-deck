import type { Page } from '@playwright/test'
import { expect, test } from '../support/test.js'
import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'

// «Visa upp» (#1414, L91, #1406 runda 2), hela vägen i den byggda appen: fliken «Låda» öppnar på
// nätet, «Visa upp» viker ihop det till lådan på ungefär 0,9 s, lådan vrids med pekaren, och ett klick
// på en sida viker ut den igen med den sidan vald. Samma vy nås ur Mina spel. Vid
// `prefers-reduced-motion` byts läget direkt och lådan står still.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

const game = () => gameDoc({ name: 'Skogens råd', cards: 30, copies: 2 })
const shown = (page: Page) => page.locator('.byd-box-show')
const turn = (page: Page) => page.locator('.byd-box-show-turn')
const onTheNet = async (page: Page) => {
  await expect(shown(page)).toHaveCount(0)
  await expect(page.locator('.byd-box-net')).toBeVisible()
}

// A point where the side is seen: the deck stands beside the box and may cover some of a side, so the
// point is looked for in the side's box on the screen rather than assumed to be its middle.
async function pointOn(page: Page, face: string): Promise<{ x: number; y: number }> {
  const at = await page.evaluate((face) => {
    const r = document.querySelector(`[data-show-face="${face}"]`)!.getBoundingClientRect()
    for (let fy = 0.3; fy <= 0.7; fy += 0.1)
      for (let fx = 0.1; fx <= 0.9; fx += 0.1) {
        const x = r.left + r.width * fx
        const y = r.top + r.height * fy
        if ((document.elementFromPoint(x, y)?.closest('[data-show-face]') as HTMLElement | null)?.dataset['showFace'] === face) return { x, y }
      }
    return null
  }, face)
  if (!at) throw new Error(`the ${face} side is nowhere to be seen`)
  return at
}

async function boxTab(page: Page): Promise<string> {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, game())
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-box').click()
  await expect(page.locator('.byd-box-net')).toBeVisible()
  return project.id
}

test('viker ihop nätet, vrids med pekaren och viker ut med en klickad sida vald', async ({ page }) => {
  await boxTab(page)
  // Framsidan är vald från start; lådan viks ihop på sin plats.
  await expect(page.locator('.byd-box-panel[data-face="front"]')).toHaveAttribute('data-chosen', '')
  const pressed = Date.now()
  await page.getByRole('button', { name: 'Visa upp' }).click()
  await expect(shown(page)).toHaveAttribute('data-look', 'folding')
  await expect(shown(page)).toHaveAttribute('data-look', 'show', { timeout: 5000 })
  // Ungefär 0,9 s: inte direkt, och inte långt efter.
  expect(Date.now() - pressed).toBeGreaterThan(700)
  // Panelerna är undan och går inte att nå medan lådan visas.
  await expect(page.locator('.byd-canvas-layers')).toHaveAttribute('inert', '')
  await expect(page.locator('.byd-canvas-props')).toHaveAttribute('inert', '')
  await expect(page.getByText('Dra för att vrida lådan.', { exact: false })).toBeVisible()

  // Dragen vrider lådan och väljer ingen sida: 20 bildpunkter åt vänster är 10° till, så att höger
  // sida vänder sig mot den som tittar.
  const scene = await page.locator('.byd-box-show-scene').boundingBox()
  expect(scene).not.toBeNull()
  const from = { x: scene!.x + 40, y: scene!.y + 40 }
  const ry = async () => Number(/rotateY\((-?[\d.]+)deg\)/.exec(await turn(page).evaluate((el) => (el as HTMLElement).style.transform))?.[1])
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const before = await ry()
  await page.mouse.move(from.x - 20, from.y, { steps: 4 })
  expect(await ry()).toBeCloseTo(before - 10, 0)
  await page.mouse.up()
  await expect(shown(page)).toHaveAttribute('data-look', 'show')

  // Ett klick på höger sida viker ut lådan med den sidan vald, där sidan syns och inte leken framför den.
  const on = await pointOn(page, 'right')
  await page.mouse.click(on.x, on.y)
  await expect(shown(page)).toHaveAttribute('data-look', /unfolding|settling/)
  await onTheNet(page)
  await expect(page.locator('.byd-box-panel[data-face="right"]')).toHaveAttribute('data-chosen', '')
  await expect(page.getByRole('button', { name: /^Höger sida/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.byd-canvas-layers')).not.toHaveAttribute('inert', '')

  // Escape går tillbaka till nätet med samma sida, och «Redigera nätet» likaså.
  await page.getByRole('button', { name: 'Visa upp' }).click()
  await expect(shown(page)).toHaveAttribute('data-look', 'show', { timeout: 5000 })
  await page.keyboard.press('Escape')
  await onTheNet(page)
  await expect(page.locator('.byd-box-panel[data-face="right"]')).toHaveAttribute('data-chosen', '')
  await page.getByRole('button', { name: 'Visa upp' }).click()
  await page.getByRole('button', { name: 'Redigera nätet' }).click()
  await onTheNet(page)
  await expect(page.getByRole('button', { name: 'Visa upp' })).toBeFocused()
})

test('nås ur Mina spel, och adressen blir spelets egen', async ({ page }) => {
  await logIn(page.request)
  await makeProjectOf(page.request, game())
  await page.goto('/')
  await page.getByRole('button', { name: 'Fler val för Skogens råd' }).first().click()
  await page.getByRole('link', { name: 'Visa upp lådan' }).click()
  await expect(shown(page)).toHaveAttribute('data-look', 'show', { timeout: 15_000 })
  await expect(page.locator('#byd-editor-tab-box')).toHaveAttribute('aria-selected', 'true')
  expect(new URL(page.url()).searchParams.has('show')).toBe(false)
  await page.keyboard.press('Escape')
  await onTheNet(page)
})

test.describe('vid prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('byts läget direkt och lådan står still', async ({ page }) => {
    await boxTab(page)
    const pressed = Date.now()
    await page.getByRole('button', { name: 'Visa upp' }).click()
    await expect(shown(page)).toHaveAttribute('data-look', 'show')
    expect(Date.now() - pressed).toBeLessThan(600)
    const at = await turn(page).evaluate((el) => (el as HTMLElement).style.transform)
    expect(at).toBe('rotateX(-12deg) rotateY(-28deg)')
    await page.waitForTimeout(800)
    expect(await turn(page).evaluate((el) => (el as HTMLElement).style.transform)).toBe(at)
    const durations = await page.locator('[data-show-face="front"]').evaluate((el) => getComputedStyle(el).transitionDuration)
    expect(durations.split(',').map((d) => parseFloat(d))).toEqual(durations.split(',').map(() => 0))
    await page.keyboard.press('Escape')
    await onTheNet(page)
  })
})
