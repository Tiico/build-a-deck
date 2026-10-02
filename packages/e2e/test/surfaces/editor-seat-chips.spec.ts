import type { Page } from '@playwright/test'
import { logIn, makeProjectOf, startTable } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { expect, test, type Fixtures } from '../../support/test.js'

// The seats in the table strip, as chips (#621, beslut A 2026-10-01). Each seat used to cost an
// outlined «Sparka Ada» of 112–130 px beside its name, so the strip grew with the players and ran
// past the edge of the window — from eight seats at 1280 and from five at 1024. A seat is now its
// name and an × in one chip, the × a full target that is called «Sparka Ada»; at 1024 the chips
// go to a second row together rather than out of the window.
//
// Measured on the built app with eight people at the table, the most a table seats, in both of the
// editor's languages because the two are not the same length. Nothing here is a text width: the
// facts are about what fits inside what, so a wider font on Linux moves the numbers and not the
// answers.
const NAMES = ['Ada', 'Bo', 'Cy', 'Di', 'Eva', 'Fia', 'Gun', 'Hal']

async function eightAtTheTable(page: Page, host: Fixtures['host']) {
  await logIn(page.request)
  const doc = gameDoc({ name: 'Åtta vid bordet', players: 8, cards: 3 })
  const project = await makeProjectOf(page.request, doc)
  const table = await startTable(page.request, project.id)
  const seats = doc.setup.seats
  const dealer = await host({ ...table, seats })
  await dealer.send(seats.map((seat, i) => ({ v: 'seat.claim', seat, name: NAMES[i] }) as never))
  await page.goto(project.editorUrl)
}

const kick = (locale: string, name: string) => (locale === 'sv-SE' ? `Sparka ${name}` : `Kick ${name}`)

for (const locale of ['sv-SE', 'en-GB']) {
  for (const width of [1024, 1280]) {
    test.describe(`the table strip at ${width} in ${locale} (#621)`, () => {
      test.use({ viewport: { width, height: 800 }, locale })

      test('holds eight seats as chips, every × a full target named for its seat, and nothing past the edge', async ({ page, host }) => {
        await eightAtTheTable(page, host)
        const strip = page.locator('.byd-editor-table-link')
        for (const name of NAMES) await expect(strip.getByRole('button', { name: kick(locale, name), exact: true })).toBeVisible()

        const drawn = await strip.evaluate((band) => {
          const box = (el: Element) => el.getBoundingClientRect()
          const outer = box(band)
          const chips = [...band.querySelectorAll('[data-host-seat]')].map((chip) => {
            const button = chip.querySelector('button')!
            return { text: (chip.textContent ?? '').replace(/\s+/g, ''), chip: box(chip).toJSON() as DOMRect, button: box(button).toJSON() as DOMRect, form: chip.classList.contains('byd-chip') }
          })
          const code = box(band.querySelector('.byd-editor-room button')!)
          return {
            over: band.scrollWidth - band.clientWidth,
            across: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            outer: { left: outer.left, right: outer.right },
            code: { bottom: code.bottom, height: code.height },
            chips,
          }
        })
        expect({ over: drawn.over, across: drawn.across }).toEqual({ over: 0, across: 0 })
        expect(drawn.chips).toHaveLength(8)
        for (const [i, { text, chip, button, form }] of drawn.chips.entries()) {
          // The same chip the search field's filter token is (#648): one form for «a thing with
          // × beside it», drawn once in `buttons.css`.
          expect(form).toBe(true)
          // The name is read on the chip, and the × beside it is a mark: the name a screen
          // reader gives the button is the sentence, the eye gets the seat and the cross.
          expect(text).toBe(`${NAMES[i]}×`)
          // A full target, square, and wholly inside its chip and the chip wholly inside the
          // strip: a chip broken over two lines, or half out of the window, is not one.
          expect(button.width).toBeGreaterThanOrEqual(44)
          expect(button.height).toBeGreaterThanOrEqual(44)
          expect(Math.abs(button.width - button.height)).toBeLessThan(1)
          expect(button.left).toBeGreaterThanOrEqual(chip.left - 0.5)
          expect(button.right).toBeLessThanOrEqual(chip.right + 0.5)
          expect(chip.height).toBeLessThan(button.height * 1.5)
          expect(chip.left).toBeGreaterThanOrEqual(drawn.outer.left)
          expect(chip.right).toBeLessThanOrEqual(drawn.outer.right)
          // As tall as the strip's other button, so the row reads as one row of targets.
          expect(Math.abs(chip.height - drawn.code.height)).toBeLessThan(1)
        }
        // At 1024 eight chips do not fit after the room code, and they go below it together
        // rather than one by one: the first chip starts a row of its own.
        if (width === 1024) expect(drawn.chips[0]!.chip.top).toBeGreaterThanOrEqual(drawn.code.bottom)
      })
    })
  }
}

test.describe('a seat kicked from the keyboard (#621)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

  test('is reached by Tab, shows the ring, and hands the focus to the next seat when it goes', async ({ page, host }) => {
    await eightAtTheTable(page, host)
    const strip = page.locator('.byd-editor-table-link')
    const ada = strip.getByRole('button', { name: 'Sparka Ada', exact: true })
    await expect(ada).toBeVisible()
    // From «Ny kod» the next stop is the first seat's ×: nothing between them takes a Tab.
    await strip.getByRole('button', { name: 'Ny kod' }).focus()
    await page.keyboard.press('Tab')
    await expect(ada).toBeFocused()
    // The ring is drawn on a real keypress only (Chromium's :focus-visible), which is why this
    // presses Tab rather than calling focus() on the ×.
    const ring = await ada.evaluate((b) => {
      const s = getComputedStyle(b)
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }
    })
    expect(ring.style).not.toBe('none')
    expect(ring.width).toBeGreaterThanOrEqual(2)

    await page.keyboard.press('Enter')
    await expect(ada).toHaveCount(0)
    // The pressed × went with its seat. The focus does not fall to the page, where the next Tab
    // would start over from the top (#477, fynd 6): it lands on the seat that took Ada's place.
    await expect(strip.getByRole('button', { name: 'Sparka Bo', exact: true })).toBeFocused()
  })

  test('hands the focus to «Ny kod» when the last seat goes', async ({ page, host }) => {
    await logIn(page.request)
    const doc = gameDoc({ name: 'En vid bordet', players: 2, cards: 3 })
    const project = await makeProjectOf(page.request, doc)
    const table = await startTable(page.request, project.id)
    const dealer = await host({ ...table, seats: doc.setup.seats })
    await dealer.send([{ v: 'seat.claim', seat: doc.setup.seats[0]!, name: 'Ada' } as never])
    await page.goto(project.editorUrl)
    const strip = page.locator('.byd-editor-table-link')
    const ada = strip.getByRole('button', { name: 'Sparka Ada', exact: true })
    await strip.getByRole('button', { name: 'Ny kod' }).focus()
    await page.keyboard.press('Tab')
    await expect(ada).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(ada).toHaveCount(0)
    await expect(strip.getByRole('button', { name: 'Ny kod' })).toBeFocused()
  })
})

test.describe('the room code in the table strip (#650)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

  // The code is what the host reads out to the table, so it is drawn white as the prototype for
  // #621 drew it, and as the link to the table is: in the strip's own green it read as one more
  // word of «Bordet kör» rather than the thing to say aloud.
  test('is white on the strip, not the strip’s green', async ({ page, host }) => {
    await eightAtTheTable(page, host)
    const strip = page.locator('.byd-editor-table-link')
    const code = strip.locator('[data-room-code]')
    await expect(code).toHaveText(/^[A-Z0-9]{6}$/)
    const ink = await code.evaluate((el) => ({
      code: getComputedStyle(el).color,
      strip: getComputedStyle(el.closest('.byd-editor-table-link')!).color,
    }))
    // Not vacuous: the strip around it is still the green the code used to inherit.
    expect(ink.strip).not.toBe('rgb(255, 255, 255)')
    expect(ink.code).toBe('rgb(255, 255, 255)')
  })
})
