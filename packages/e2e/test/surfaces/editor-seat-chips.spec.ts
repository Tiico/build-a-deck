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

// The × inside its chip, as painted (#849). The strip's own rule for its buttons — an outlined
// box with an 8 px corner — matched the × as well, so it drew a square with its own line inside
// the chip's: a stroke between the name and the ×, and corners that stood out past the chip's
// round end. The boxes' rectangles said nothing was wrong, since the square's box is the chip's
// end; only the paint shows it.
//
// So this reads the pixels: around each chip, everything outside its pill is the strip's ground,
// and inside it, above and below the name and the ×, nothing is drawn in the chip's line. The
// colours are read off the page, not written here, and the glyphs are left out, so the machine's
// font moves nothing.
test.describe('the × of a seat, as painted (#849)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

  test('lies wholly inside its chip, with no line of its own', async ({ page, host }) => {
    await eightAtTheTable(page, host)
    const strip = page.locator('.byd-editor-table-link')
    await expect(strip.getByRole('button', { name: 'Sparka Hal', exact: true })).toBeVisible()
    await page.mouse.move(0, 0)
    const chips = strip.locator('[data-host-seat]')
    const colours = await chips.first().evaluate((chip) => ({
      ground: getComputedStyle(chip.closest('.byd-editor-table-link')!).backgroundColor,
      line: getComputedStyle(chip).outlineColor,
    }))
    const rgb = (c: string) => (c.match(/\d+/g) ?? []).slice(0, 3).map(Number)
    for (let i = 0; i < (await chips.count()); i++) {
      const chip = chips.nth(i)
      const box = (await chip.boundingBox())!
      const pad = 6
      const clip = { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad }
      const shot = await page.screenshot({ clip })
      // What else the strip draws within `pad` of this chip — the next chip, «Ny kod», the words
      // «vid bordet:» — is somebody else's paint and not this ×'s. Where the strip wraps
      // depends on the machine's font, so which neighbour lies that close is the machine's too:
      // on CI's Linux, «Eva» came to stand under the row above and was charged for its pixels.
      const others = await chip.evaluate((me) => {
        const strip = me.closest('.byd-editor-table-link')!
        const rects = [...strip.querySelectorAll('*')].filter((el) => !el.contains(me) && !me.contains(el)).map((el) => el.getBoundingClientRect())
        for (const node of [...strip.querySelectorAll('*')].flatMap((el) => [...el.childNodes])) {
          if (node.nodeType !== Node.TEXT_NODE || me.contains(node)) continue
          const range = document.createRange()
          range.selectNodeContents(node)
          rects.push(...range.getClientRects())
        }
        return rects.filter((r) => r.width > 0 && r.height > 0).map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }))
      })
      const drawn = await page.evaluate(
        async ({ data, clip, box, pad, ground, line, others }) => {
          const img = new Image()
          img.src = `data:image/png;base64,${data}`
          await img.decode()
          const canvas = new OffscreenCanvas(img.width, img.height)
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0)
          const px = img.width / clip.width
          const all = ctx.getImageData(0, 0, img.width, img.height).data
          const near = (at: number, c: number[], by: number) => Math.abs(all[at]! - c[0]!) + Math.abs(all[at + 1]! - c[1]!) + Math.abs(all[at + 2]! - c[2]!) <= by
          // How far a point lies outside the chip's pill (negative inside), in CSS px.
          const r = box.height / 2
          const outside = (x: number, y: number) => {
            const dx = Math.max(Math.abs(x - box.width / 2) - (box.width / 2 - r), 0)
            const dy = Math.abs(y - r)
            return dx > 0 ? Math.hypot(dx, dy) - r : dy - r
          }
          // Within a pixel of somebody else's box, at the page's own coordinates.
          const theirs = (x: number, y: number) => others.some((o) => x + box.x >= o.x - 1 && x + box.x <= o.x + o.w + 1 && y + box.y >= o.y - 1 && y + box.y <= o.y + o.h + 1)
          let past = 0
          let stroke = 0
          let edge = 0
          for (let py = 0; py < img.height; py++) {
            for (let qx = 0; qx < img.width; qx++) {
              const x = (qx + 0.5) / px - pad
              const y = (py + 0.5) / px - pad
              const at = (py * img.width + qx) * 4
              const d = outside(x, y)
              // Outside the pill, past the edge's own anti-aliasing: the strip's ground only.
              if (d > 1.5 && !near(at, ground, 6) && !theirs(x, y)) past++
              // The chip's own line on its edge: the guard that the colours read are the ones drawn.
              if (Math.abs(d + 0.5) <= 0.5 && near(at, line, 24)) edge++
              // Inside, clear of the edge and of the row the name and the × are written on.
              const written = y > box.height * 0.25 && y < box.height * 0.75
              if (d < -2.5 && !written && near(at, line, 24)) stroke++
            }
          }
          return { past, stroke, edge }
        },
        { data: shot.toString('base64'), clip, box, pad, ground: rgb(colours.ground), line: rgb(colours.line), others },
      )
      const name = await chip.evaluate((el) => el.firstChild?.textContent ?? '')
      expect(drawn.edge, name).toBeGreaterThan(20)
      expect({ past: drawn.past, stroke: drawn.stroke }, name).toEqual({ past: 0, stroke: 0 })
    }
  })
})

test.describe('a seat kicked from the keyboard (#621)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

  test('is reached by Tab, shows the ring, and hands the focus to the next seat when it goes', async ({ page, host }) => {
    await eightAtTheTable(page, host)
    const strip = page.locator('.byd-editor-table-link')
    const ada = strip.locator('[data-host-seat]').getByRole('button', { name: 'Sparka Ada', exact: true })
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

    // The × asks first (#679, beställarens beslut C), and the question opens on «Avbryt»: the
    // reflex that answers without reading keeps the player at the table.
    await page.keyboard.press('Enter')
    const ask = page.getByRole('alertdialog', { name: 'Sparka Ada?' })
    await expect(ask).toBeVisible()
    await expect(ask.getByRole('button', { name: 'Avbryt' })).toBeFocused()
    await expect(ada).toHaveCount(1)
    // One Tab back is the kick that also changes the code, two is the kick alone.
    await page.keyboard.press('Shift+Tab')
    await expect(ask.getByRole('button', { name: 'Sparka och byt kod' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(ask.getByRole('button', { name: 'Sparka Ada' })).toBeFocused()
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
    const ada = strip.locator('[data-host-seat]').getByRole('button', { name: 'Sparka Ada', exact: true })
    // Ada's chip first: the seat arrives on the line after the page, and a Tab pressed before it
    // stood went past where it was about to be (a flake under load).
    await expect(ada).toBeVisible()
    await strip.getByRole('button', { name: 'Ny kod' }).focus()
    await page.keyboard.press('Tab')
    await expect(ada).toBeFocused()
    await page.keyboard.press('Enter')
    await strip.getByRole('alertdialog', { name: 'Sparka Ada?' }).getByRole('button', { name: 'Sparka Ada' }).click()
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
