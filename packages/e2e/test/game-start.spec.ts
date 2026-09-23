import type { ProjectDoc } from '@byd/server'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { tableOf as tableFromSetup } from '../support/api.js'
import { TV } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// Spelstarten, i den byggda produkten (K24, #451, #452).
//
// De billigare grindarna säger redan att kompilatorn gör rätt intents och att brickan ritas när
// den ska. Det bara en riktig stack kan vara fel om är resten av vägen: att kuvertet når servern,
// att motorn blandar och delar ut på riktigt, att bordet ritar om sig — och att frågan före ett
// omtryck ställs av det byggda gränssnittet och inte bara av en komponent i jsdom.
//
// Två platser och en liten lek, för att frågan här är starten och inte tätheten.
function gameThatShuffles(): ProjectDoc {
  const doc = gameDoc({ players: 2, counters: [], cards: 8 })
  return {
    ...doc,
    setup: {
      ...doc.setup,
      zones: doc.setup.zones.map((z) =>
        z.id === doc.setup.deckZone
          ? {
              ...z,
              actions: [
                {
                  id: 'start',
                  label: 'Ge alla en starthand',
                  when: 'both' as const,
                  steps: [
                    { v: 'shuffle' as const },
                    { v: 'deal' as const, each: { of: 'number' as const, n: 2 }, to: { at: 'hands' as const }, face: 'keep' as const },
                  ],
                },
              ],
            }
          : z,
      ),
    },
  }
}

test.describe('spelstarten vid ett riktigt bord', () => {
  test('blandar leken och delar ut händerna när brickan trycks, och frågar innan den körs om', async ({ request, open, player }) => {
    const doc = gameThatShuffles()
    const table = await tableFromSetup(request, setupFromProject(doc), deckFromProject(doc))

    // Någon måste sitta: «dela ut till varje hand» har ingenstans att dela ut vid ett tomt bord,
    // och det är hela skälet att starten är ett kommando och inte något som sker vid födseln.
    await player(table, { name: 'Ada', seat: 'A' })
    await player(table, { name: 'Bo', seat: 'B' })

    // `&lang=sv`, som resten av sviten gör det: språket följer annars webbläsarens, och
    // Playwrights är engelska. Meningarna som läses här är designerns språk och inte verktygets
    // (A4), så det ska stå vilket språk de läses i.
    const screen = await open(TV, `${table.tvUrl}&lang=sv`)
    const tile = screen.page.locator('[data-table-start]')
    await expect(tile).toBeVisible()
    await expect(tile).toHaveText(/Starta spelet/)

    // Hur många kort en zon säger att den har: filten skriver antalet i `data-count`, på högar
    // och på händer alike, så det är samma läsning för båda.
    const count = (zone: string) => screen.page.locator(`[data-zone="${zone}"]`).first().getAttribute('data-count')

    // Före: ingen har fått något, och hela leken ligger kvar.
    expect(await count(doc.setup.deckZone)).toBe('8')
    expect(await count('hand:A')).toBe('0')

    await tile.click()

    // Efter: fyra kort har lämnat draghögen, två till varje hand. Att korten *blandades* är
    // motorns grind; det här är att kuvertet kom fram och gjorde det det sade.
    await expect.poll(() => count(doc.setup.deckZone)).toBe('4')
    expect(await count('hand:A')).toBe('2')
    expect(await count('hand:B')).toBe('2')

    // Nu har något hänt vid bordet, så ett andra tryck frågar först.
    await tile.click()
    const fraga = screen.page.getByRole('alertdialog')
    await expect(fraga).toBeVisible()
    await expect(fraga).toHaveText(/Korten som ligger ute går tillbaka/)

    // Avbryt lämnar bordet orört.
    await fraga.getByRole('button', { name: 'Avbryt' }).click()
    await expect(fraga).toBeHidden()
    expect(await count(doc.setup.deckZone)).toBe('4')

    // Och «Ja, starta om» kör hela starten igen. Händerna ligger kvar där de ligger — starten
    // säger «dela ut», inte «ta tillbaka» — så draghögen töms på fyra kort till.
    await tile.click()
    await screen.page.getByRole('alertdialog').getByRole('button', { name: 'Ja, starta om' }).click()
    await expect.poll(() => count(doc.setup.deckZone)).toBe('0')
    expect(await count('hand:A')).toBe('4')
  })
})

// Receptets egen blandning (#453). Provet ovanför skriver sin egen åtgärd på draghögen; det här
// är bordet som ett nytt spel verkligen föds med, orört — receptets dokument rakt igenom.
//
// Före #453 fanns här ingen bricka alls: ingen hög bar en startåtgärd, så filten ritade ingen.
test.describe('bordet ett nytt spel föds med', () => {
  test('bär receptets blandning på brickan, och blandar leken när den trycks', async ({ request, open, player }) => {
    // Orört: ingen zon har rörts efter att receptet lade bordet.
    const doc = gameDoc({ players: 2, counters: [], cards: 8 })
    const table = await tableFromSetup(request, setupFromProject(doc), deckFromProject(doc))
    await player(table, { name: 'Ada', seat: 'A' })

    const screen = await open(TV, `${table.tvUrl}&lang=sv`)
    const tile = screen.page.locator('[data-table-start]')
    await expect(tile).toBeVisible()

    await tile.click()

    // Att ordningen faktiskt ändras är motorns grind. Det här är att blandningen kom hela vägen
    // fram: bordets egen händelselista säger att draghögen blandades, med designerns eget namn
    // på högen (A4), och inga kort har lämnat den.
    const feed = screen.page.locator('ol[aria-labelledby="tv-feed"] li')
    await expect(feed.first()).toHaveText(/blandade Draghög/)
    expect(await screen.page.locator(`[data-zone="${doc.setup.deckZone}"]`).first().getAttribute('data-count')).toBe('8')
  })
})
