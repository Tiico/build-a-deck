import type { Page } from '@playwright/test'
import { join } from '../../support/api.js'
import { PHONE, SMALL_TV, TV, type Device } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// Observatörens spalt läses utan att något ligger över något annat (#745, C8, K27).
//
// I vila — innan något kort pekats på — krympte INSPEKTION till noll höjd medan dess tomma kort
// «peka på ett kort» fortfarande ritades, så PLATSER-rubriken stod under INSPEKTION-rubriken och
// platshållaren låg över första platsens rad. Och när en plats lista fälldes ut stod de andra två
// i bredd så smalt att «4 kort på hand» bröts på två rader och klipptes av rutans underkant.
//
// Måttet är geometriskt och aldrig i absoluta pixlar: texten sätts i vilket typsnitt maskinen har,
// och CI:s Linux sätter den bredare än en Mac. Det som kontrolleras är att inga två textrutor i
// spalten skär varandra, att ingen text klipps av en förfader som döljer det som sticker ut, och
// att varje rad i en plats ruta står på en rad.

type Box = { text: string; left: number; top: number; right: number; bottom: number }
type Reading = { boxes: Box[]; clipped: { text: string; by: string }[]; wrapped: string[] }

const read = (page: Page): Promise<Reading> =>
  page.evaluate(() => {
    const aside = document.querySelector('[data-tv] > aside')
    if (!aside) throw new Error('observatören har ingen spalt')
    const boxes: Box[] = []
    const clipped: { text: string; by: string }[] = []
    const walker = document.createTreeWalker(aside, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim()
      if (!text) continue
      const el = node.parentElement
      if (!el || el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden') continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue
        boxes.push({ text, left: r.left, top: r.top, right: r.right, bottom: r.bottom })
        // Klippt: en förfader som inte visar det som sticker ut, och raden når utanför den.
        for (let up: Element | null = el; up && up !== document.body; up = up.parentElement) {
          const s = getComputedStyle(up)
          if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
          // En förfader som rullar klipper inte, den visar resten när man rullar dit.
          if (s.overflowY === 'auto' || s.overflowY === 'scroll') break
          const c = up.getBoundingClientRect()
          if (r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5 || r.left < c.left - 0.5 || r.right > c.right + 0.5) {
            // En ellips är text som säger att den är kortad, och inget fel.
            if (s.textOverflow !== 'ellipsis') clipped.push({ text, by: up.className || up.tagName })
          }
          break
        }
      }
    }
    // Varje uppgift i en plats ruta — namnet, antalet — på en rad: en textnod med två radrutor
    // är en uppgift som brutits. Ytornas sammanfattning får brytas; den nämner ett korts namn,
    // som kan vara hur långt som helst.
    const wrapped: string[] = []
    for (const span of aside.querySelectorAll<HTMLElement>('.byd-tv-seats > ul:first-of-type > li > .byd-tv-place span')) {
      const range = document.createRange()
      range.selectNodeContents(span)
      const lines = new Set([...range.getClientRects()].filter((r) => r.width >= 1).map((r) => Math.round(r.top)))
      if (lines.size > 1) wrapped.push(span.textContent ?? '')
    }
    return { boxes, clipped, wrapped }
  })

/** Varje par textrutor som skär varandra med mer än en halv pixel åt båda hållen. */
function overlaps(boxes: Box[]): string[] {
  const out: string[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!
      const b = boxes[j]!
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (w > 0.5 && h > 0.5) out.push(`«${a.text}» × «${b.text}»`)
    }
  }
  return out
}

for (const device of [SMALL_TV, TV] as Device[]) {
  const at = `${device.viewport.width} × ${device.viewport.height}`
  test.describe(`observatörens spalt vid ${at} (#745)`, () => {
    test.use({ viewport: device.viewport })

    test('ingen text ligger över annan text, i vila och med en lista utfälld', async ({ tableOf, host, request, open }) => {
      // Fyra platser och tre ytor, som speltestet: dragningshögen och två kort på golvet.
      const table = await tableOf({ players: 4, counters: [], cards: 24, copies: 1 })
      const dealer = await host(table)
      const seen = (await dealer.view()) as unknown as { floor: string }
      await dealer.send([
        { v: 'seat.claim', seat: 'A', name: 'Ada' } as never,
        { v: 'seat.claim', seat: 'B', name: 'Bo' } as never,
        { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B', 'hand:C', 'hand:D'], each: 4 } as never,
        { v: 'split', pile: 'draw', at: 1, to: seen.floor, x: -120, y: 0 } as never,
        { v: 'split', pile: 'draw', at: 1, to: seen.floor, x: 120, y: 0 } as never,
      ])
      const eva = await join(request, table, { name: 'Eva' })
      const { page } = await open(device, `${eva.observeUrl}&lang=sv`)

      const seats = page.locator('.byd-tv-seats > ul').first().locator('> li')
      await expect(seats).toHaveCount(4)
      await expect(page.locator('.byd-tv-inspect [data-empty]')).toBeVisible()

      const rest = await read(page)
      // Inte tomt: en överlappsmätning på noll rutor är grön för evigt.
      expect(rest.boxes.map((b) => b.text)).toEqual(expect.arrayContaining(['Inspektion', 'Platser', 'peka på ett kort', 'Ada']))
      expect({ at, rest: overlaps(rest.boxes), clipped: rest.clipped, wrapped: rest.wrapped }).toEqual({ at, rest: [], clipped: [], wrapped: [] })

      await seats.first().getByRole('button').first().click()
      await expect(seats.first().getByRole('button').first()).toHaveAttribute('aria-expanded', 'true')
      const opened = await read(page)
      expect(opened.boxes.length).toBeGreaterThan(rest.boxes.length)
      expect({ at, opened: overlaps(opened.boxes), clipped: opened.clipped, wrapped: opened.wrapped }).toEqual({ at, opened: [], clipped: [], wrapped: [] })
    })
  })
}

// Radernas namn för en skärmläsare (#745, engelska-08): namnet och antalet är två rader för ögat
// men stod utan skiljetecken för örat — «Draw pilepile, 3 cards» — eftersom de är två block intill
// varandra och inget tecken mellan dem.
test('observatörens rader har namn med skiljetecken mellan delarna (#745)', async ({ tableOf, host, request, open }) => {
  const table = await tableOf({ players: 2, counters: [], cards: 12, copies: 1 })
  const dealer = await host(table)
  await dealer.send([{ v: 'seat.claim', seat: 'A', name: 'Ada' } as never, { v: 'draw', from: 'draw', to: 'hand:A', count: 3 } as never])
  const eva = await join(request, table, { name: 'Eva' })
  const { page } = await open(PHONE, `${eva.observeUrl}&lang=sv`)
  await page.locator('.byd-observer-more').tap()
  const seats = page.locator('.byd-tv-seats')
  await expect(seats.getByRole('button', { name: /^Ada, 3 kort på hand(,|$)/ })).toBeVisible()
  await expect(seats.getByRole('button', { name: /^Draghög, hög, 9 kort, överst \S/ })).toBeVisible()
})
