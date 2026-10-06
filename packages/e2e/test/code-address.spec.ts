import type { APIRequestContext, Page } from '@playwright/test'
import { logIn, makeProject, startTable, type Table } from '../support/api.js'
import { PHONE, SMALL_TV, TV, type Device } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The code is the address (#675, beslut C 2026-10-06).
//
// The television says the box's own name and, on the line under it, `/KOD`. A phone that types
// what it reads lands in the seat picker: one page load and two presses — «Gå» on the keyboard
// and «Sätt dig» — from the room to a hand. Everything else here is a door into that same picker:
// the row under the login card, `/join` without a code, and the one sentence a code that names
// nothing gets, whether it never was or has gone out.

const SMALL_PHONE: Device = { name: 'small phone', viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true }
const LAPTOP: Device = SMALL_TV
const SAYS = 'Koden finns inte eller har gått ut — fråga värden efter den nya.'

/** A table started from a game, so that the game has a name to say (L5). */
async function namedTable(request: APIRequestContext, name: string): Promise<Table> {
  await logIn(request)
  const project = await makeProject(request, { name })
  return { ...(await startTable(request, project.id)), seats: [] }
}

/** Every page load in the main frame from here on. */
function loads(page: Page): () => number {
  let n = 0
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame() && f.url() !== 'about:blank') n++
  })
  return () => n
}

test.describe('the code is the address (#675)', () => {
  test('a 390 phone goes from what the TV says to a seat in one page load and two presses', async ({ table, open, baseURL }) => {
    const tv = await open(TV, table.tvUrl)
    const host = (await tv.page.locator('.byd-tv-address').innerText()).trim()
    const code = (await tv.page.locator('.byd-tv-join strong').innerText()).trim()
    // The screen says its own name — the box's on the box, the stack's here — and this table's code.
    expect(host).toBe(new URL(baseURL ?? '').host)
    expect(code).toBe(table.code)
    // At the sizes the decision set: the host at K26's 24 px, the code at 40 (CSS pixels, not glyphs).
    expect(await tv.page.locator('.byd-tv-address').evaluate((el) => getComputedStyle(el).fontSize)).toBe('24px')
    expect(await tv.page.locator('.byd-tv-join strong').evaluate((el) => getComputedStyle(el).fontSize)).toBe('40px')
    // The slash is drawn, so the two lines read as one address.
    expect(await tv.page.locator('.byd-tv-join strong').evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"/"')

    const phone = await open(PHONE, 'about:blank')
    const loaded = loads(phone.page)
    // Press one: «Gå» on the keyboard, after typing exactly what the room reads.
    await phone.page.goto(`http://${host}/${code}`)
    const free = phone.page.locator('button[data-seat][aria-pressed="true"]')
    await expect(free, 'the next free seat is chosen already (K12)').toBeVisible()
    expect(loaded(), 'the picker is the first page the address opens').toBe(1)
    await phone.page.locator('form input').fill('Bea')
    // Press two: «Sätt dig».
    await phone.page.locator('form button[type="submit"]').click()
    await phone.page.waitForURL('**/play*')
    await expect(phone.page.locator('[data-page="player"]')).toBeVisible()
    await expect(tv.page.locator('[data-seat-plate]').filter({ hasText: 'Bea' })).toHaveCount(1)
  })

  test('the address tells the phone nothing that /join?code= did not', async ({ table, open, request }) => {
    // What each door asks of the server before the seats are drawn, and what it is answered.
    const asked = async (path: string) => {
      const phone = await open(PHONE, 'about:blank')
      const seen: { path: string; body: string }[] = []
      phone.page.on('response', async (r) => {
        const url = new URL(r.url())
        if (url.pathname.startsWith('/assets/') || /\.(svg|ico|png|webmanifest)$/.test(url.pathname)) return
        seen.push({ path: url.pathname, body: r.request().resourceType() === 'document' ? '' : await r.text().catch(() => '') })
      })
      await phone.page.goto(path)
      await expect(phone.page.locator('button[data-seat]').first()).toBeVisible()
      return { seen: seen.sort((a, b) => a.path.localeCompare(b.path)) }
    }
    const byAddress = await asked(`/${table.code}`)
    const byQuery = await asked(`/join?code=${table.code}`)
    // The same questions, in the same words, apart from the page's own address.
    expect(byAddress.seen.filter((s) => s.path !== `/${table.code}`)).toEqual(byQuery.seen.filter((s) => s.path !== '/join'))
    expect(byAddress.seen.map((s) => s.path)).toContain(`/rooms/${table.code}`)
    // And the page itself is the app, not an answer about the code.
    const page = await (await request.get(`/${table.code}`, { headers: { accept: 'text/html' } })).text()
    const other = await (await request.get('/ZZZZZZ', { headers: { accept: 'text/html' } })).text()
    expect(page).toContain('<div id="root">')
    expect(page).toBe(other)
  })

  test('the start page has a code row under the login card that takes the code to the picker', async ({ table, open }) => {
    for (const device of [PHONE, SMALL_PHONE]) {
      const { page } = await open(device, '/?lang=sv')
      const field = page.getByLabel('Ska du spela? Skriv rumskoden')
      const email = page.locator('.byd-login input[type="email"]')
      // At 320 both the code field and the e-mail field are on the first screen.
      for (const f of [field, email]) await expect(f).toBeInViewport({ ratio: 1 })
      // Under the card, never in it.
      const card = (await page.locator('[data-login]').boundingBox())!
      expect((await field.boundingBox())!.y).toBeGreaterThan(card.y + card.height)
      expect(await targetsUnder44(page)).toEqual([])
      if (device === PHONE) {
        await field.fill(table.code.toLowerCase())
        await page.getByRole('button', { name: 'Gå in' }).click()
        await page.waitForURL((url) => url.pathname === `/${table.code}`)
        await expect(page.locator('button[data-seat]').first()).toBeVisible()
      }
    }
  })

  test('/join without a code asks for one, and the code typed lands in the picker', async ({ table, open }) => {
    for (const device of [PHONE, SMALL_PHONE]) {
      const { page } = await open(device, '/join?lang=sv')
      const field = page.getByLabel('Rumskod')
      await expect(field).toBeFocused()
      expect(await targetsUnder44(page)).toEqual([])
      if (device === PHONE) {
        await field.fill(` ${table.code.slice(0, 3)} ${table.code.slice(3).toLowerCase()}`)
        await field.press('Enter')
        await page.waitForURL((url) => url.pathname === `/${table.code}`)
        await expect(page.locator('button[data-seat]').first()).toBeVisible()
        expect(await targetsUnder44(page)).toEqual([])
      }
    }
  })

  test('a code that never was and one that has been replaced are said the same way, with the code kept', async ({ table, open, request }) => {
    // The host takes a new code: the old one names nothing now, as a lapsed one does.
    const rotated = await request.post(`/sessions/${encodeURIComponent(table.session)}/code`, { headers: { authorization: `Bearer ${table.hostKey}` } })
    expect(rotated.ok()).toBe(true)
    const said: string[] = []
    for (const code of ['ZZZZZZ', table.code]) {
      const { page } = await open(PHONE, `/${code}?lang=sv`)
      const field = page.getByLabel('Rumskod')
      await expect(field).toHaveValue(code)
      await expect(field).toBeFocused()
      await expect(field).toHaveAttribute('aria-invalid', 'true')
      const why = page.locator(`#${await field.getAttribute('aria-describedby')}`)
      await expect(why).toHaveText(SAYS)
      said.push(await page.locator('main').innerText())
      // And the server's answer is the same bytes for both.
      said.push(await (await request.get(`/rooms/${code}`)).text())
    }
    expect(said[0]?.replace('ZZZZZZ', '')).toBe(said[2]?.replace(table.code, ''))
    expect(said[1]).toBe(said[3])
  })

  test('a laptop is shown a card with the game’s name, and playing on this screen is the suggestion', async ({ request, open }) => {
    const table = await namedTable(request, "Sal's Saloon")
    const { page } = await open(LAPTOP, `/${table.code}?lang=sv`)
    await expect(page.getByRole('heading', { level: 1, name: "Sal's Saloon" })).toBeVisible()
    const card = (await page.locator('[data-page="join"]').boundingBox())!
    expect(Math.round(card.width)).toBe(520)
    expect(Math.abs(card.x + card.width / 2 - 1280 / 2)).toBeLessThanOrEqual(1)
    const buttons = page.locator('[data-page="join"] form button')
    await expect(buttons.first()).toHaveText(/Spela på den här skärmen/)
    await expect(buttons.first()).toHaveClass(/byd-primary/)
    await expect(buttons.nth(1)).toHaveText('Sätt dig')
    await expect(buttons.nth(1)).toHaveClass(/byd-secondary/)
    // Enter does what the suggestion does.
    await page.locator('form input').fill('Ada')
    await page.locator('form input').press('Enter')
    await page.waitForURL('**/online*')
    // Below 1024 it is a phone's page again.
    const narrow = await open({ name: 'narrow', viewport: { width: 1000, height: 800 } }, `/${table.code}?lang=sv`)
    await expect(narrow.page.locator('[data-page="join"] form button').first()).toHaveText('Sätt dig')
  })

  test('table mode says the address on its plate, and draws no square', async ({ table, open, baseURL }) => {
    const { page } = await open(LAPTOP, table.tableUrl)
    const address = page.locator('.byd-table-plate [data-address]')
    await expect(address).toHaveText(`${new URL(baseURL ?? '').host}/${table.code}`)
    expect(await address.evaluate((el) => getComputedStyle(el).fontSize)).toBe('20px')
    await expect(page.locator('img.byd-qr')).toHaveCount(0)
    await expect(page.locator('.byd-zone').first()).toBeVisible()
    const over = await page.evaluate(() => {
      const plate = document.querySelector('.byd-table-plate')!.getBoundingClientRect()
      return [...document.querySelectorAll('.byd-zone, .byd-card, [data-hand]')]
        .filter((el) => {
          const b = el.getBoundingClientRect()
          return b.width > 0 && plate.left < b.right && b.left < plate.right && plate.top < b.bottom && b.top < plate.bottom
        })
        .map((el) => el.className.toString())
    })
    expect(over).toEqual([])
  })
})

/** Every control a thumb has to hit that is less than 44 px across either way. */
function targetsUnder44(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('input, button, a, select')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        // The help pattern's «?» is L32's own business, and is measured there.
        return r.width > 0 && r.height > 0 && !el.matches('.byd-help-ask') && Math.min(r.width, r.height) < 44
      })
      .map((el) => `${el.tagName.toLowerCase()} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`),
  )
}
