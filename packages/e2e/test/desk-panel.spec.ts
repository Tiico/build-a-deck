import type { Page } from '@playwright/test'
import { join, logIn, makeProjectOf, startTable, withQuery } from '../support/api.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// A computer at a table around a TV keeps its rare things in a panel at the right (#1376 punkt 3,
// beställarens beslut 2026-10-26: variant A). It flags a card by clicking it where it lies, as
// `/online` does (#1255); Lämna and «Avsluta bordet?» hold the focus in the same panel; and the
// survey stands beside the table as it lay when it ended, answered on the keys 1 to 5 and Enter.
// While the panel stands the targets and the hand give it its width: nothing lies under it, the
// last card of the hand is whole, and the page never scrolls (L10).

// Where everything stands while the panel does: the panel from the head's foot to the window's,
// against the right edge, and every target and hand card to the left of it.
const measure = (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector('.byd-desk-body > :is(.byd-desk-panel, .byd-flag-panel)')!.getBoundingClientRect()
    const head = document.querySelector('.byd-desk-head')!.getBoundingClientRect()
    const row = document.querySelector('.byd-desk-targets')!.getBoundingClientRect()
    const cards = [...document.querySelectorAll('[data-hand-row] [data-hand-card]')].map((el) => el.getBoundingClientRect())
    const last = cards.at(-1)!
    const page = document.documentElement
    return {
      panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom, width: panel.width },
      headBottom: head.bottom,
      targetsRight: row.right,
      cardsRight: Math.max(...cards.map((r) => r.right)),
      lastWhole: last.left >= 0 && last.right <= panel.left + 0.5 && last.bottom <= innerHeight + 0.5,
      pageFits: page.scrollWidth <= innerWidth && page.scrollHeight <= innerHeight,
    }
  })

async function standsBeside(page: Page, width: number) {
  const m = await measure(page)
  const { width: w, height: h } = page.viewportSize()!
  expect(m.pageFits).toBe(true)
  expect(m.panel.right).toBeCloseTo(w, 0)
  expect(m.panel.bottom).toBeCloseTo(h, 0)
  expect(m.panel.top).toBeCloseTo(m.headBottom, 0)
  expect(m.panel.width).toBeCloseTo(width, 0)
  expect(m.targetsRight).toBeLessThanOrEqual(m.panel.left + 0.5)
  expect(m.cardsRight).toBeLessThanOrEqual(m.panel.left + 0.5)
  expect(m.lastWhole).toBe(true)
}

for (const viewport of [
  { width: 1280, height: 800, panel: 380, wide: 480 },
  { width: 1024, height: 768, panel: 340, wide: 440 },
]) {
  test(`flags a card, ends the table from Lämna and answers the survey in the panel at ${viewport.width} × ${viewport.height}`, async ({ request, open, host }) => {
    await logIn(request)
    const doc = gameDoc({ name: 'Skogens råd', players: 2, cards: 8 })
    const project = await makeProjectOf(request, doc)
    const table = { ...(await startTable(request, project.id, 'screen')), seats: doc.setup.seats }
    const dealer = await host(table)
    await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 6 } as never])
    const seat = await join(request, table, { name: 'Kim', seat: 'A' })
    const { page } = await open({ name: 'desk', viewport }, withQuery(seat.playUrl, 'lang=sv'), { facesReady: true })
    const cards = page.locator('[data-hand-row] [data-hand-card]')
    await expect(cards).toHaveCount(6)

    // Flagga: the panel beside the table, the table live, and a click on a card points it out.
    await page.getByRole('button', { name: 'Flagga', exact: true }).click()
    const flag = page.getByRole('dialog', { name: 'Flagga' })
    await expect(flag).toBeVisible()
    await expect(page.getByRole('button', { name: 'Flagga', exact: true }).first()).toHaveAttribute('aria-expanded', 'true')
    await standsBeside(page, viewport.panel)
    const card = cards.nth(2)
    const id = (await card.getAttribute('data-hand-card'))!
    await card.click()
    await expect(flag.getByRole('button', { name: 'Ta bort kortet' })).toBeVisible()
    await expect(card).not.toHaveAttribute('data-turned', 'true')
    // The card in the panel is drawn in its own box, also while its texture is on its way: a
    // waiting face once covered the whole window.
    const spill = await page.evaluate(() => {
      const face = document.querySelector('.byd-flag-panel-face')!.getBoundingClientRect()
      return [...document.querySelectorAll('.byd-flag-panel-face *')].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && (r.left < face.left - 0.5 || r.right > face.right + 0.5 || r.top < face.top - 0.5 || r.bottom > face.bottom + 0.5)).length
    })
    expect(spill).toBe(0)
    await flag.getByRole('textbox').fill('Det här kortet vinner alltid')
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
    await expect(page.getByRole('status').filter({ hasText: 'Flaggat' }).first()).toBeVisible()
    await expect(flag).toHaveCount(0)

    // Lämna: the same panel, holding the focus on «Avbryt»; Tab goes round inside it.
    await page.getByRole('button', { name: /^Lämna… eller avsluta/ }).click()
    const leave = page.getByRole('dialog', { name: 'Lämna bordet?' })
    await expect(leave.getByRole('button', { name: 'Avbryt' })).toBeFocused()
    await standsBeside(page, viewport.panel)
    await page.keyboard.press('Tab')
    await expect(leave.getByRole('button', { name: 'Stäng' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(leave.getByRole('button', { name: 'Avbryt' })).toBeFocused()
    await leave.getByRole('button', { name: 'Avsluta för alla' }).click()
    const end = page.getByRole('alertdialog', { name: 'Avsluta bordet?' })
    await expect(end).toContainText('Spelet avslutas för alla och kan inte fortsätta. Alla spelare får enkäten där de håller sin hand.')
    await expect(end.getByRole('button', { name: 'Avbryt' })).toBeFocused()
    await end.getByRole('button', { name: 'Avsluta för alla' }).click()

    // The survey beside the table as it lay when it ended, one question at a time on the keys.
    const survey = page.locator('.byd-desk-survey')
    await expect(survey.getByRole('heading', { name: 'Hur kul var det?' })).toBeVisible()
    await expect(survey).toBeFocused()
    await expect(cards).toHaveCount(6)
    await standsBeside(page, viewport.wide)
    for (const n of ['4', '3', '2']) {
      await page.keyboard.press(n)
      await expect(survey.getByRole('button', { name: n, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await page.keyboard.press('Enter')
    }
    await survey.getByRole('textbox').fill('Färre kort i handen')
    await survey.getByRole('button', { name: 'Skicka' }).click()
    await expect(survey.getByText('Tack, Kim.')).toBeVisible()
    await expect(survey.getByRole('button', { name: 'Svara igen' })).toBeVisible()

    // What reached the designer: the card the flag is about, and the answers.
    const playtest = (await (await request.get(`/projects/${encodeURIComponent(project.id)}/playtest`)).json()) as { tables: { flags: { note: string; card?: { id: string } }[]; answers: { who: string; answers: { fun: number; clarity: number; balance: number; change: string } }[] }[] }
    const played = playtest.tables.find((t) => t.flags.length > 0)!
    expect(played.flags.map((f) => [f.note, f.card?.id])).toEqual([['Det här kortet vinner alltid', id]])
    expect(played.answers.map((a) => [a.who, a.answers])).toEqual([['Kim', { fun: 4, clarity: 3, balance: 2, change: 'Färre kort i handen' }]])
  })
}
