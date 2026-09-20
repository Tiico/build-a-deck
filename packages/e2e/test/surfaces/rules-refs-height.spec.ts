import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { standing } from '../../support/surface.js'

// Referenslistan visar allt den ritar (#288).
//
// `[[`-listan i regelboken skär sitt urval vid åtta träffar (#215), men rutan hade ett tak på
// 230 px och varje mål i editorn är 44 px högt: fem rader syntes av åtta. Ingen rad var onåbar —
// den markerade rullas in i vyn (#235) — men poängen med en lista som smalnar är att man ser
// urvalet, och tre av åtta fanns bara om pilarna råkade nå dem.
//
// Mätt här och inte i websviten därför att frågan är «vad lade motorn ut», och därför att taket
// ska gälla i det ark appen faktiskt skeppar. Editorns ark är en egen bit som hämtas när `/editor`
// öppnas (#186), så det väntas på med en token bara det arket deklarerar.
//
// Ingen siffra pinnas. Taket är ett tal i arket och radhöjden en annan, och ett prov som upprepade
// dem hade bara skrivit av dem: det som mäts är förhållandet — allt som ritas får plats i det som
// syns — vilket håller lika bra på CI:s Linux som på en Mac.

// Editorn deklarerar sina egna tokens på `.byd-editor`; den här är en av dem.
const EDITOR = { on: '.byd-editor', token: '--byd-editor-primary-mark' }

// Åtta träffar, som `[[` som mest visar. Raderna är PickLists egna: ett namn och vad det är.
const rows = Array.from({ length: 8 }, (_, i) => `<button type="button" role="option" aria-selected="${i === 0}"><span>Zon nummer ${i + 1}</span><small>zon</small></button>`).join('')

// Två rutor av samma slag: en med rummet den vill ha, en som fått veta att rummet är slut. Den
// andra är #229:s egen kant av saken — `--byd-place-room` sätts av `usePlacement` när rutan öppnas,
// och den ska vinna över takets egen siffra även efter att taket höjts.
const MARKUP = `
<div class="byd-editor">
  <div class="byd-rules-edit">
    <div class="byd-rules-field">
      <textarea rows="4" aria-label="Avsnittets text"></textarea>
      <div id="free" class="byd-pick-list byd-rules-refs" role="listbox" aria-label="Referenser">${rows}</div>
    </div>
    <div class="byd-rules-field">
      <textarea rows="4" aria-label="Ett avsnitt vid bokens fot"></textarea>
      <div id="cramped" class="byd-pick-list byd-rules-refs" role="listbox" aria-label="Referenser" style="--byd-place-room: 120px">${rows}</div>
    </div>
  </div>
</div>`

const measured = (page: Page) =>
  page.evaluate(() => {
    const of = (id: string) => {
      const box = document.getElementById(id)
      if (!box) throw new Error(`det finns ingen #${id} att mäta`)
      const drawn = [...box.querySelectorAll('button')]
      // Rutans synliga botten är dess padding-box: `clientTop` hoppar över kantlinjen och
      // `clientHeight` är vad som ryms innan den skrollar.
      const floor = box.getBoundingClientRect().top + box.clientTop + box.clientHeight
      return {
        drawn: drawn.length,
        // En rad som slutar under rutans botten står utanför den och syns inte. Halvpixeln är
        // avrundningen och inte en marginal.
        below: drawn.filter((row) => row.getBoundingClientRect().bottom > floor + 0.5).length,
        holds: box.scrollHeight,
        shows: box.clientHeight,
      }
    }
    return { free: of('free'), cramped: of('cramped') }
  })

test.use({ viewport: { width: 1200, height: 900 } })

test.describe('referenslistan i regelboken (#288)', () => {
  test('visar alla åtta rader den ritar, där det finns plats', async ({ page }) => {
    await standing(page, MARKUP, { at: '/editor', needs: EDITOR })
    const { free } = await measured(page)
    expect(free.drawn).toBe(8)
    // Hela rapporten: åtta ritade rader ska vara åtta synliga rader.
    expect(free.below).toBe(0)
    expect(free.shows).toBeGreaterThanOrEqual(free.holds)
  })

  test('låter rummet styra ändå, där det inte finns plats (#229)', async ({ page }) => {
    await standing(page, MARKUP, { at: '/editor', needs: EDITOR })
    const { free, cramped } = await measured(page)
    // Rummet är mindre än taket, alltså är det rummet som gäller — och då skrollar listan, precis
    // som den gjorde innan taket höjdes.
    expect(cramped.shows).toBeLessThan(free.shows)
    expect(cramped.shows).toBeLessThan(cramped.holds)
  })
})
