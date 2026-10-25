import type { Page } from '@playwright/test'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { join, tableOf as tableFromSetup, withQuery } from '../support/api.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'
import { pastTheWaitingRoom } from '../support/waiting.js'

// Bordsläget utan telefoner (#682, beställarens beslut 2026-10-17: raden E och ångra/avsluta C).
//
// Speltestet 2026-10-02 spelade direkt på filten utan en enda telefon. Ett kort släppt på en tom
// plats flög tillbaka utan ett ord — meningen fanns bara i en live-region på 1 × 1 px — och det som
// hände, blandningen och dragningen, gick inte att läsa efteråt. Ångra fanns bara på telefonerna
// och avsluta bara i editorn. Det här är hela vägen i den byggda appen: släppet, raden, ångra och
// avsluta, med mus och tangentbord som en grupp vid en skärm har dem.
const LAPTOP = { name: 'laptop', viewport: { width: 1280, height: 800 } }
const centre = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 14 })
  await page.mouse.up()
}

// Hur fort meningen syns, räknat i sidan själv: från släppet (eller klicket) till första bildrutan
// där ett element med texten står inom fönstret, ritat och ogenomskinligt. Acceptansen är 300 ms.
async function stopwatch(page: Page, start: 'pointerup' | 'click', selector: string, text: string): Promise<void> {
  await page.evaluate(
    ({ start, selector, text }) => {
      const w = window as unknown as { __seen?: Promise<number> }
      w.__seen = new Promise((resolve) => {
        addEventListener(
          start,
          () => {
            const t0 = performance.now()
            const tick = () => {
              const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => e.textContent?.includes(text))
              const r = el?.getBoundingClientRect()
              const cs = el ? getComputedStyle(el) : null
              const shown = el && r && cs && r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && cs.visibility === 'visible' && Number(cs.opacity) >= 0.9
              if (shown) resolve(performance.now() - t0)
              else if (performance.now() - t0 < 5000) requestAnimationFrame(tick)
              else resolve(Infinity)
            }
            requestAnimationFrame(tick)
          },
          { capture: true, once: true },
        )
      })
    },
    { start, selector, text },
  )
}
const seenAfter = (page: Page) => page.evaluate(() => (window as unknown as { __seen: Promise<number> }).__seen)

// Det plattan inte får ligga över: det en spelare läser på filten, och skärmens egna knappar.
const READ = '.byd-card, .byd-pile-top, .byd-pile-caption, .byd-pile-name, .byd-seat-name, [data-seat-plate], .byd-hand-count, .byd-token, .byd-zone > span, .byd-felt-corner > *, .byd-table-plate > *, .byd-table-last'
const covers = (page: Page, selector: string) =>
  page.evaluate(
    ({ selector, read }) => {
      const el = document.querySelector(selector)!
      const a = el.getBoundingClientRect()
      return [...document.querySelectorAll(read)]
        .filter((o) => o !== el && !o.contains(el) && !el.contains(o))
        .filter((o) => {
          const b = o.getBoundingClientRect()
          return b.width > 0 && b.height > 0 && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0
        })
        .map((o) => `${o.className} «${o.textContent?.trim().slice(0, 20)}»`)
    },
    { selector, read: READ },
  )

test.describe('bordsläget utan telefoner (#682)', () => {
  test('ett släpp på en tom plats sägs vid kortet, bordets ångra tar tillbaka draget och avsluta stänger bordet', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 4, counters: [], cards: 12, copies: 1 })
    const { page } = await open(LAPTOP, `${table.tableUrl}&lang=sv`)
    const deck = page.locator('.byd-pile[data-zone="draw"]')
    await expect(deck).toHaveAttribute('data-count', '12')

    // Släppt på C, där ingen sitter: kortet går tillbaka, och skälet står vid släppet.
    const hand = centre((await page.locator('[data-zone="hand:C"]').first().boundingBox())!)
    await stopwatch(page, 'pointerup', '[data-felt-refusal]', 'Ingen sitter vid C än')
    await drag(page, centre((await deck.locator('.byd-pile-top').boundingBox())!), hand)
    expect(await seenAfter(page), 'avvisningen syns inom 300 ms').toBeLessThan(300)
    const said = page.locator('[data-felt-refusal]')
    await expect(said).toHaveText('Ingen sitter vid C än, så kortet går tillbaka.')
    await expect(page.locator('[data-status-live="assertive"]')).toHaveText('Ingen sitter vid C än, så kortet går tillbaka.')
    expect(await covers(page, '[data-felt-refusal]'), 'plattan viker undan för allt en spelare läser').toEqual([])
    await expect(deck).toHaveAttribute('data-count', '12')
    // Den tonar bort efter fyra sekunder, och är sedan borta.
    await expect(said).toHaveCount(0, { timeout: 8000 })

    // Ett drag bordet själv gör: översta kortet ut på filten. Hörnet säger det, och står kvar.
    const top = centre((await deck.locator('.byd-pile-top').boundingBox())!)
    await stopwatch(page, 'pointerup', '[data-table-last]', 'Bordet')
    await drag(page, top, { x: top.x + 40, y: top.y - 200 })
    expect(await seenAfter(page), 'det som hände syns inom 300 ms').toBeLessThan(300)
    await expect(deck).toHaveAttribute('data-count', '11')
    await expect(page.locator('[data-table-last]')).toHaveText(/^Senast: Bordet .* · nyss$/)
    expect(await covers(page, '[data-table-last]'), 'hörnets rad täcker ingenting').toEqual([])

    // Ångra senaste draget: menyn säger vilket, och trycket tar tillbaka det.
    const more = page.getByRole('button', { name: 'Mer' })
    await more.click()
    const undo = page.getByRole('menuitem', { name: /Ångra senaste draget/ })
    await expect(undo).toContainText('Bordet')
    await expect(undo).toBeFocused()
    await undo.click()
    await expect(deck).toHaveAttribute('data-count', '12')
    await expect(page.locator('.byd-card[data-component]')).toHaveCount(0)
    await expect(page.getByRole('menu')).toHaveCount(0)

    // Avsluta frågar först och öppnar på «Inte än»; Escape lämnar bordet öppet.
    await more.click()
    await page.getByRole('menuitem', { name: /Avsluta bordet…/ }).click()
    const ask = page.getByRole('alertdialog', { name: 'Avsluta bordet?' })
    await expect(ask.getByRole('button', { name: 'Avbryt' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(ask).toHaveCount(0)
    await expect(more).toBeFocused()
    await more.click()
    await page.getByRole('menuitem', { name: /Avsluta bordet…/ }).click()
    await page.getByRole('alertdialog', { name: 'Avsluta bordet?' }).getByRole('button', { name: 'Avsluta för alla' }).click()
    await expect(page.getByRole('heading', { name: 'Bordet är avslutat' })).toBeVisible()
  })

  // Vid 1024 får menyn ligga över Räknare A:s bricka medan den är öppen, men «Starta om», «?» och
  // linsens «+» ska stå fria (beslutet).
  test('menyn växer ur sin knapp och lämnar hörnets andra knappar fria vid 1024', async ({ request, open }) => {
    // En lek som blandas vid start, så att «Starta om» står i hörnet när menyn öppnas.
    const doc = gameDoc({ players: 4, cards: 12, copies: 1 })
    const shuffled = { ...doc, setup: { ...doc.setup, zones: doc.setup.zones.map((z) => (z.id === doc.setup.deckZone ? { ...z, actions: [{ id: 'start', label: 'Blanda leken', when: 'start' as const, steps: [{ v: 'shuffle' as const }] }] } : z)) } }
    const table = await tableFromSetup(request, setupFromProject(shuffled), deckFromProject(shuffled))
    const { page } = await open({ name: 'laptop-1024', viewport: { width: 1024, height: 768 } }, `${table.tableUrl}&lang=sv`, { facesReady: true })
    await page.locator('[data-table-start]').click()
    await expect(page.getByRole('button', { name: 'Starta om' })).toBeVisible()
    const more = page.getByRole('button', { name: 'Mer' })
    await more.click()
    const menu = (await page.getByRole('menu').boundingBox())!
    const button = (await more.boundingBox())!
    expect(Math.abs(menu.x + menu.width - (button.x + button.width)), 'menyns högerkant är knappens').toBeLessThan(1)
    expect(menu.y + menu.height).toBeLessThanOrEqual(button.y)
    // Linsens «+» med sin ram, som är bredare än «?» den står över.
    const lens = page.locator('.byd-camera-controls')
    await expect(lens).toBeVisible()
    for (const [name, other] of [['Kortkommandon', page.getByRole('button', { name: /Kortkommandon/ })], ['linsens «+»', lens], ['Starta om', page.getByRole('button', { name: 'Starta om' })]] as const) {
      const b = (await other.first().boundingBox())!
      const apart = b.x >= menu.x + menu.width || b.x + b.width <= menu.x || b.y >= menu.y + menu.height || b.y + b.height <= menu.y
      expect(apart, `${name} står fri från menyn`).toBe(true)
    }
    expect(menu.x).toBeGreaterThanOrEqual(0)
    expect(menu.y).toBeGreaterThanOrEqual(0)
  })
})

// Ett drag som *servern* avvisar kastades med `void client.send` (#682) — på bordet och på filten i
// /online, som delar renderaren. Svaret läses nu och sägs vid släppet, på läsarens språk. Linan
// görs om här så att servern svarar nej på första kuvertet, som den gör när två händer tar samma kort.
for (const surface of ['bordsläget', '/online'] as const) {
  test.describe(`ett drag servern avvisar, på ${surface} (#682)`, () => {
    test('sägs vid släppet, och kortet går tillbaka direkt', async ({ tableOf, open, request }) => {
      const table = await tableOf({ players: 4, counters: [], cards: 12, copies: 1 })
      const url = surface === 'bordsläget' ? table.tableUrl : (await join(request, table, { name: 'Ada', seat: 'A' })).onlineUrl
      const { page } = await open(LAPTOP, 'about:blank')
      let refused = 0
      await page.routeWebSocket('**/sessions/**', (ws) => {
        const server = ws.connectToServer()
        ws.onMessage((message) => {
          const frame = JSON.parse(String(message)) as { t: string; envelope?: { id: string; intents: { v: string }[] } }
          if (frame.t === 'envelope' && frame.envelope && refused === 0 && frame.envelope.intents.some((i) => i.v === 'split' || i.v === 'move')) {
            refused++
            ws.send(JSON.stringify({ t: 'reject', id: frame.envelope.id, reason: 'zone table is not a pile' }))
            return
          }
          server.send(message)
        })
      })
      await page.goto(withQuery(url, 'lang=sv'))
      if (surface === '/online') await pastTheWaitingRoom(page)
      const deck = page.locator('.byd-pile[data-zone="draw"]')
      await expect(deck).toHaveAttribute('data-count', '12')
      const top = centre((await deck.locator('.byd-pile-top').boundingBox())!)
      await stopwatch(page, 'pointerup', '[data-felt-refusal]', 'Korten kan inte läggas där.')
      await drag(page, top, { x: top.x + 40, y: top.y - 200 })
      expect(await seenAfter(page), 'avvisningen syns inom 300 ms').toBeLessThan(300)
      expect(refused).toBe(1)
      await expect(page.locator('[data-status-live="assertive"]')).toHaveText('Korten kan inte läggas där.')
      await expect(deck).toHaveAttribute('data-count', '12')
      await expect(page.locator('.byd-card[data-component]')).toHaveCount(0)
      // Och inget «Bordet har inte svarat» fyra sekunder senare: bordet svarade.
      await page.waitForTimeout(4500)
      await expect(page.locator('[data-status-live="polite"]')).not.toHaveText('Bordet har inte svarat på draget än.')
    })
  })
}
