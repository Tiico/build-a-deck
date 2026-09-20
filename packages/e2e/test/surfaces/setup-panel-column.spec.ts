import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { ProjectDoc } from '@byd/server'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// Var zonens handlingspanel bor (#330, L29).
//
// Panelen låg som ett halvgenomskinligt ark över filtens nederkant med `max-height: 45%`, alltså
// över just det bord den handlade om. Beställaren valde **C · Bytet** (2026-09-20): panelen tar
// tredje kolumnens plats, och spelararket och listan över bord som körs viker undan så länge en
// zon är vald. Filten är orörd.
//
// Det som mäts här är lådor och inte bildpunkter i text: att filtens rektangel är densamma med
// och utan vald zon, och att panelens rektangel inte skär den. Båda är sanna i vilket typsnitt
// som helst, vilket är hela skälet att de går att mäta på en Linux-CI och på en Mac.
//
// Vad som *ryms* i panelen mäts inte och kan inte mätas här: hur mycket av innehållet som syns
// beror på hur meningarna radbryter, och det beror på maskinens typsnitt. Beslutet säger dessutom
// uttryckligen att rullningen inuti panelen står kvar vid 1280 — ingen variant visade allt där —
// så ett prov som krävde att allt syntes hade krävt något ingen valde.
const SKARMAR = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
] as const

/** Draghögen i sitt värsta fall: fem åtgärder och elva steg, som prototypen mätte på. */
function draghogenSomVarst(): ProjectDoc {
  const doc = gameDoc({ name: 'Skogens herrar', players: 4 })
  return {
    ...doc,
    setup: {
      ...doc.setup,
      zones: doc.setup.zones.map((zone) =>
        zone.id === 'draw'
          ? {
              ...zone,
              actions: [
                {
                  id: 'a1',
                  label: 'Dela ut starthanden',
                  steps: [
                    { v: 'shuffle' },
                    { v: 'deal', each: { of: 'number', n: 7 }, to: { at: 'hands' }, face: 'keep' },
                    { v: 'split', count: { of: 'number', n: 1 }, to: { at: 'zone', zone: 'table' }, face: 'front' },
                  ],
                },
                {
                  id: 'a2',
                  label: 'Lägg upp marknaden',
                  steps: [
                    { v: 'split', count: { of: 'number', n: 5 }, to: { at: 'zone', zone: 'table' }, face: 'front' },
                    { v: 'shuffle' },
                  ],
                },
                {
                  id: 'a3',
                  label: 'Plocka fram målen',
                  steps: [
                    { v: 'take', which: [{ field: 'title', is: ['Björn 1'] }], to: { at: 'beside' }, face: 'back' },
                    { v: 'shuffle' },
                    { v: 'split', count: { of: 'number', n: 3 }, to: { at: 'beside' }, face: 'back' },
                  ],
                },
                { id: 'a4', label: 'Töm högen', steps: [{ v: 'movePile', to: { at: 'zone', zone: 'discard' } }] },
                { id: 'a5', label: 'Blanda om', steps: [{ v: 'movePile', to: { at: 'beside' } }, { v: 'shuffle' }] },
              ],
            }
          : zone,
      ),
    },
  }
}

type Lada = { x: number; y: number; w: number; h: number }

// Lådan ytan ritas i, eller `null` när den inte ritas alls. Att vika undan är att inte rita
// någonting: en yta som står kvar i DOM:en utan en enda ruta är borta för ögat, för tangentbordet
// och för skärmläsaren, och det är den frågan som ställs här — inte om noden finns.
const ladan = (page: Page, valjare: string): Promise<Lada | null> =>
  page.evaluate((v) => {
    const el = document.querySelector<HTMLElement>(v)
    if (!el || el.getClientRects().length === 0) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }, valjare)

/** Vad filten och panelen har för lådor just nu, och om de skär varandra. */
async function laget(page: Page): Promise<{ filt: Lada | null; panel: Lada | null; overlapp: boolean; bredvid: Lada | null }> {
  const [filt, panel, bredvid] = await Promise.all([ladan(page, '.byd-setup-felt'), ladan(page, '.byd-zone-actions'), ladan(page, '.byd-setup-beside')])
  const overlapp =
    filt !== null && panel !== null && panel.x < filt.x + filt.w && filt.x < panel.x + panel.w && panel.y < filt.y + filt.h && filt.y < panel.y + panel.h
  return { filt, panel, overlapp, bredvid }
}

/** Bord-fliken, öppen, med Draghögen i sitt värsta fall. */
async function bordFliken(page: Page): Promise<void> {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, draghogenSomVarst())
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-tables').click()
  await expect(page.locator('[data-setup-editor]')).toBeVisible()
}

for (const skarm of SKARMAR) {
  test.describe(`zonens handlingspanel vid ${skarm.width} × ${skarm.height}`, () => {
    test.use({ viewport: skarm })

    test('tar tredje kolumnens plats och lägger sig aldrig över filten', async ({ page }) => {
      await bordFliken(page)
      const stangt = await laget(page)
      expect(stangt.panel, 'ingen panel står öppen innan en zon valts').toBeNull()
      expect(stangt.bredvid, 'tredje kolumnen står där när ingen zon är vald').not.toBeNull()

      await page.locator('[data-zone-row="draw"] button').first().click()
      await expect(page.locator('[data-zone-actions]')).toBeVisible()
      const oppet = await laget(page)

      expect(oppet.overlapp, 'panelen ligger över filten').toBe(false)
      // Och det är verkligen tredje kolumnens plats den tagit: filten står till vänster om den.
      expect(oppet.panel!.x, 'panelen står inte till höger om filten').toBeGreaterThanOrEqual(oppet.filt!.x + oppet.filt!.w)
      expect(oppet.bredvid, 'spelararket och bordlistan viker undan medan panelen står').toBeNull()
    })

    test('lämnar filten orörd, med och utan vald zon', async ({ page }) => {
      await bordFliken(page)
      const stangt = await laget(page)

      await page.locator('[data-zone-row="draw"] button').first().click()
      await expect(page.locator('[data-zone-actions]')).toBeVisible()
      const oppet = await laget(page)
      expect(oppet.filt).toEqual(stangt.filt)

      // Och tillbaka: krysset avmarkerar zonen, och tredje kolumnen kommer tillbaka med den.
      // Krysset pekas ut genom sin plats i panelens huvud och inte genom sitt namn: stacken kör
      // med webbläsarens eget språk, som här är engelska, och namnet är katalogens (A4).
      await page.locator('.byd-zone-actions > header button').click()
      await expect(page.locator('[data-zone-actions]')).toHaveCount(0)
      const igen = await laget(page)
      expect(igen.filt).toEqual(stangt.filt)
      expect(igen.bredvid).toEqual(stangt.bredvid)
    })

    test('håller hela fliken inne i fönstret medan panelen står', async ({ page }) => {
      await bordFliken(page)
      await page.locator('[data-zone-row="draw"] button').first().click()
      await expect(page.locator('[data-zone-actions]')).toBeVisible()

      const matt = await page.evaluate(() => {
        const doc = document.documentElement
        const main = document.querySelector('main')!
        const panel = document.querySelector<HTMLElement>('.byd-zone-actions')!
        // Vad panelen ritar utanför sin egen högerkant. Frågan ställs på ritade rektanglar och
        // inte på `scrollWidth`: en kolumn med `padding-right` rapporterar sin padding som fyra
        // bildpunkters överskott utan att något alls står utanför den.
        const hoger = panel.getBoundingClientRect().right
        return {
          sida: `${doc.scrollHeight - doc.clientHeight}/${doc.scrollWidth - doc.clientWidth}`,
          arbete: `${main.scrollHeight - main.clientHeight}/${main.scrollWidth - main.clientWidth}`,
          // Panelen får rulla inuti sig själv (det är beslutets ord), men ingenting i den får
          // hamna utanför kolumnen: en ratt eller ett namnfält som gör det är oåtkomligt.
          utanfor: [...panel.querySelectorAll<HTMLElement>('*')].filter((el) => el.getBoundingClientRect().right > hoger + 0.5).map((el) => el.className || el.tagName),
        }
      })
      expect(matt).toEqual({ sida: '0/0', arbete: '0/0', utanfor: [] })
    })
  })
}
