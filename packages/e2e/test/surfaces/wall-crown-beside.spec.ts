import type { Page } from '@playwright/test'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { expect, test } from '../../support/test.js'

// The wall's crown with something standing beside the wall (#1000, E4's följdkrav). The AI panel
// chosen in #940 takes 380 px from the work, and in the prototype at 1280 that squeezed the search
// field to a stub and cut «Fysisk kontroll» at the panel's edge. The crown answered the *window's*
// width, and a wall narrower than the window got the desk's row at a width the row does not fit.
//
// The first tests below stand the panel in by what it is to the layout — a 380 px column beside the
// open tab panel, inside the editor's `main` — so that the crown is held to it for a designer without
// a key too, and at the desk's narrow end. The last measure the panel itself (#1001). What is
// measured is the real wall in the built app — every control of its crown wholly visible, beside the
// column and not under it, and a search field still wide enough to be written in.
//
// 180 px is the floor the desk already holds the field to (#477 fynd 12, beslut 2026-09-27, and
// L54 under the desk): the placeholder «Sök i alla fält…» and a query of a word or two, read whole.
// It is a relation to the field's own job and not a font's width, so it holds on CI's Linux too.
const PANEL = 380
const FIELD = 180

const TYPES = ['Playcard', 'Location', 'Effect', 'Karaktär', 'Character', 'Shopcard', 'Trap-', 'Trap+']
// Grouped, as a real deck is: the crown then carries the grouping's value, and the jump column
// stands beside the wall with its own fold on it (#1019).
function deck() {
  const doc = gameDoc({ name: "Sal's Saloon", cards: 48 })
  doc.rows = doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, typ: TYPES[i % TYPES.length]! } }))
  doc.template.faces['front']!.variantBy = 'typ'
  return doc
}

// A column beside the open panel, the way a side panel takes its width: `main` lays the two out in
// a row and the panel gives way.
const standBeside = (page: Page, width: number) =>
  page.evaluate((width) => {
    const main = document.querySelector('.byd-editor > main') as HTMLElement
    main.style.display = 'flex'
    for (const panel of main.querySelectorAll<HTMLElement>(':scope > [role=tabpanel]')) {
      panel.style.flex = '1 1 auto'
      panel.style.minWidth = '0'
    }
    const aside = document.createElement('aside')
    aside.setAttribute('data-beside', '')
    aside.style.flex = `0 0 ${width}px`
    main.append(aside)
  }, width)

// Every control of the crown that is not wholly visible: outside the window, cut by an ancestor
// that clips sideways, or under the column beside the wall.
const measure = (page: Page, beside = '[data-beside]') =>
  page.evaluate((beside) => {
    const crown = document.querySelector('.byd-wall-view .byd-crown') as HTMLElement
    const aside = document.querySelector(beside) as HTMLElement
    const wall = document.querySelector('.byd-wall-view') as HTMLElement
    const edge = aside.getBoundingClientRect().left
    const cut: string[] = []
    for (const el of crown.querySelectorAll<HTMLElement>('button, input, select, a[href]')) {
      const r = el.getBoundingClientRect()
      let left = Math.max(r.left, 0)
      let right = Math.min(r.right, innerWidth, edge)
      let top = Math.max(r.top, 0)
      let bottom = Math.min(r.bottom, innerHeight)
      for (let a = el.parentElement; a; a = a.parentElement) {
        const style = getComputedStyle(a)
        const b = a.getBoundingClientRect()
        if (style.overflowX !== 'visible') {
          left = Math.max(left, b.left)
          right = Math.min(right, b.right)
        }
        if (style.overflowY !== 'visible') {
          top = Math.max(top, b.top)
          bottom = Math.min(bottom, b.bottom)
        }
      }
      if (r.width === 0 || right - left < r.width - 1 || bottom - top < r.height - 1) cut.push((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40))
    }
    return {
      beside: Math.round(aside.getBoundingClientRect().width),
      wallRight: Math.round(wall.getBoundingClientRect().right),
      edge: Math.round(edge),
      controls: crown.querySelectorAll('button, input').length,
      cut,
      over: crown.scrollWidth - crown.clientWidth,
      field: Math.round((crown.querySelector('.byd-crown-search') as HTMLElement).getBoundingClientRect().width),
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // The rows the crown stands in: its tools, counted by where each one's top is.
      rows: new Set([...crown.children].map((el) => Math.round(el.getBoundingClientRect().top))).size,
      // The room the row has and what each tool takes of it, said when the row breaks.
      room: Math.round(crown.clientWidth),
      tools: [...crown.children].map((el) => `${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().width)}`),
    }
  }, beside)

for (const locale of ['sv-SE', 'en-GB']) {
  // 1280 and 1440 are the two desks the issue names. 1024 is the desk's narrow end, where the wall
  // beside the panel is 644 px and not even the short boxes fit on one row: there the row has to
  // break, whatever font the machine draws it in.
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    test.describe(`the wall's crown beside a ${PANEL} px panel at ${viewport.width} × ${viewport.height} in ${locale}`, () => {
      test.use({ viewport, locale })

      test('cuts no control and leaves the search field room to be written in', async ({ page }) => {
        await logIn(page.request)
        const project = await makeProjectOf(page.request, deck())
        await page.goto(project.editorUrl)
        await expect(page.locator('.byd-wall-view .byd-wall-fold')).toBeVisible()
        await standBeside(page, PANEL)
        // The crown answers its own width once the wall has given way; wait for the layout to have
        // settled on it rather than reading the frame the column was added in.
        await expect.poll(async () => (await measure(page)).wallRight).toBeLessThanOrEqual(viewport.width - PANEL)
        const measured = await measure(page)
        // Non-vacuity: the column stands where the panel will, at its width, and the crown holds
        // its whole set of tools — the field, four boxes and the stepper's two presses. The fold
        // stands on the column since #1019, not in the crown.
        expect(measured.beside).toBe(PANEL)
        expect(measured.edge).toBe(viewport.width - PANEL)
        expect(measured.controls).toBeGreaterThanOrEqual(7)
        expect(measured.cut, 'every control of the crown is wholly visible, beside the panel and not under it').toEqual([])
        expect(measured.over, 'the crown does not overflow its own box').toBeLessThanOrEqual(0)
        expect(measured.field, 'the search field is wide enough to read what is written in it').toBeGreaterThanOrEqual(FIELD)
        expect(measured.page, 'the page does not scroll sideways').toBeLessThanOrEqual(0)
      })
    })
  }
}

// And beside the panel itself (#1001), now that it is on main: a designer with a key opens the
// editor with the AI panel standing open at the wall's side, and the crown holds whole beside it at
// the two desks the panel was prototyped at — and on one row (#1045): the short boxes fit there, and
// a row that breaks costs the wall 52 px of its height for nothing.
//
// The row is measured in every state it is drawn in. Grouped, the grouping box says the column and
// the jump column stands with its fold on it (#1019). Ungrouped, the column and its fold go and the
// box says that nothing groups the wall:
// a deck whose template names no column, as the one a template proposal starts from (#1005), or a
// grouped deck the designer chose to see whole. A proposal waiting in the panel stands on the wall
// under the crown.
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefC4C4'
const STATES = ['grouped', 'ungrouped', 'ungrouped by choice', 'grouped with a proposal', 'ungrouped with a proposal'] as const
function ungroupedDeck() {
  const doc = deck()
  delete doc.template.faces['front']!.variantBy
  return doc
}
const WORDS: Record<string, { grouping: RegExp; off: string; ask: string; show: string }> = {
  'sv-SE': { grouping: /^Grupperad efter: /, off: 'Ingen gruppering', ask: 'Fråga om spelet', show: 'Visa på väggen' },
  'en-GB': { grouping: /^Grouped by: /, off: 'No grouping', ask: 'Ask about the game', show: 'Show on the wall' },
}
for (const locale of ['sv-SE', 'en-GB']) {
  const words = WORDS[locale]!
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    test.describe(`the wall's crown beside the open AI panel at ${viewport.width} × ${viewport.height} in ${locale}`, () => {
      test.use({ viewport, locale })

      for (const state of STATES) {
        test(`${state}: stands on one row, cuts no control and leaves the search field room to be written in`, async ({ page }) => {
          await logIn(page.request)
          const saved = await page.request.put('/me/ai-key', { data: { provider: 'anthropic', key: KEY } })
          expect(saved.status()).toBe(200)
          const grouped = state.startsWith('grouped')
          const project = await makeProjectOf(page.request, state.startsWith('ungrouped') && state !== 'ungrouped by choice' ? ungroupedDeck() : deck())
          await page.goto(project.editorUrl)
          await expect(page.locator('.byd-ai[data-open]')).toBeVisible()
          await expect(page.locator('.byd-wall-card').first()).toBeVisible()
          const crown = page.locator('.byd-wall-view .byd-crown')
          if (state === 'ungrouped by choice') {
            await crown.getByRole('button', { name: words.grouping }).click()
            await page.locator('.byd-crown-drawer').getByRole('button', { name: words.off }).click()
            await crown.getByRole('button', { name: words.grouping }).click()
          }
          if (state.endsWith('with a proposal')) {
            const ask = page.locator('.byd-ai').getByRole('textbox', { name: words.ask })
            await ask.fill('Three cheap cards [kort:3]')
            await ask.press('Enter')
            await page.locator('.byd-ai').getByRole('button', { name: words.show }).click()
            await expect(page.locator('.byd-wall-card[data-proposed]')).toHaveCount(3)
          }
          // Non-vacuity: the crown is in the state named, by what it carries.
          await expect(page.locator('.byd-wall-view .byd-wall-fold')).toHaveCount(grouped ? 1 : 0)
          await expect(crown.getByRole('button', { name: words.grouping })).toHaveAccessibleName(grouped ? /: typ$/ : new RegExp(`: ${words.off}$`))
          await expect(page.locator('.byd-crown-drawer')).toHaveCount(0)
          await expect.poll(async () => (await measure(page, '.byd-ai')).wallRight).toBeLessThanOrEqual(viewport.width - PANEL)
          // Measured in the machine's own face, and then in a wide one. The Mac's system-ui fitted
          // the grouped row with 25 px to spare where CI's DejaVu broke it by 24 (#1045): a row held
          // only in the narrow face is held on one machine. Verdana is DejaVu's width and is on the
          // Mac; the runner has DejaVu itself.
          for (const face of ['system-ui', 'wide']) {
            if (face === 'wide') await page.addStyleTag({ content: ".byd-wall-crown * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }" })
            const measured = await measure(page, '.byd-ai')
            expect(measured.beside).toBe(PANEL)
            expect(measured.edge).toBe(viewport.width - PANEL)
            expect(measured.controls).toBeGreaterThanOrEqual(7)
            expect(measured.cut, `in ${face}, every control of the crown is wholly visible, beside the panel and not under it`).toEqual([])
            expect(measured.over, `in ${face}, the crown does not overflow its own box`).toBeLessThanOrEqual(0)
            expect(measured.field, `in ${face}, the search field is wide enough to read what is written in it`).toBeGreaterThanOrEqual(FIELD)
            expect(measured.page, `in ${face}, the page does not scroll sideways`).toBeLessThanOrEqual(0)
            expect(measured.rows, `in ${face}, the crown stands on one row in ${measured.room} px: ${measured.tools.join(', ')}`).toBe(1)
          }
        })
      }
    })
  }
}

// And in every eye (#1047). The box says the eye the deck is read with, and where the crown is
// narrow it says only that (#477, variant B) — so the row's width is the eye's word as much as the
// deck's grouping. #1045 measured the row in «Normal syn» only; the reading views (#512) are
// the eye's longest words, «TV:ns visning» and «The phone’s reading view», and a row that
// stands in the first eye and breaks in the TV's is a row the designer sees jump as they choose.
// Measured grouped, where the grouping box says its column, and ungrouped, where it says that
// nothing groups the wall: the two fullest rows #1045 found.
const EYE_WORDS: Record<string, { eyes: string; eyeNames: readonly string[] }> = {
  'sv-SE': {
    eyes: 'Visning',
    eyeNames: ['Normal syn', 'Deuteranopi', 'Protanopi', 'Tritanopi', 'Gråskala', 'Telefonens läsvy', 'Bordets läsvy', 'TV:ns visning'],
  },
  'en-GB': {
    eyes: 'View',
    eyeNames: ['Normal vision', 'Deuteranopia', 'Protanopia', 'Tritanopia', 'Greyscale', 'The phone’s reading view', 'The table’s reading view', 'The TV’s view'],
  },
}
for (const locale of ['sv-SE', 'en-GB']) {
  const words = EYE_WORDS[locale]!
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    test.describe(`the wall's crown in every eye beside the open AI panel at ${viewport.width} × ${viewport.height} in ${locale}`, () => {
      test.use({ viewport, locale })

      for (const state of ['grouped', 'ungrouped'] as const) {
        test(`${state}: stands on one row in every eye, in the machine's face and a wide one`, async ({ page }) => {
          await logIn(page.request)
          const saved = await page.request.put('/me/ai-key', { data: { provider: 'anthropic', key: KEY } })
          expect(saved.status()).toBe(200)
          const project = await makeProjectOf(page.request, state === 'grouped' ? deck() : ungroupedDeck())
          await page.goto(project.editorUrl)
          await expect(page.locator('.byd-ai[data-open]')).toBeVisible()
          await expect(page.locator('.byd-wall-card').first()).toBeVisible()
          const crown = page.locator('.byd-wall-view .byd-crown')
          const box = crown.getByRole('button', { name: new RegExp(`^${words.eyes}: `) })
          // Non-vacuity: the drawer holds every eye the test names, and no other.
          await box.click()
          const drawer = page.locator('.byd-crown-drawer')
          await expect(drawer.getByRole('button')).toHaveText([...words.eyeNames])
          await box.click()
          await expect(drawer).toHaveCount(0)
          const broken: string[] = []
          for (const name of words.eyeNames) {
            await box.click()
            await drawer.getByRole('button', { name, exact: true }).click()
            await box.click()
            await expect(drawer).toHaveCount(0)
            // The box says the eye chosen, whole, as its name — whatever the row shows of it.
            await expect(box).toHaveAccessibleName(`${words.eyes}: ${name}`)
            await expect(box).toHaveAttribute('title', `${words.eyes}: ${name}`)
            await expect(page.locator('.byd-wall-view .byd-wall-fold')).toHaveCount(state === 'grouped' ? 1 : 0)
            await expect.poll(async () => (await measure(page, '.byd-ai')).wallRight).toBeLessThanOrEqual(viewport.width - PANEL)
            for (const face of ['system-ui', 'wide']) {
              const wide = face === 'wide' ? await page.addStyleTag({ content: ".byd-wall-crown * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }" }) : null
              const measured = await measure(page, '.byd-ai')
              expect(measured.beside).toBe(PANEL)
              expect(measured.controls).toBeGreaterThanOrEqual(7)
              const fault = [
                measured.rows !== 1 && `${measured.rows} rows`,
                measured.cut.length > 0 && `cut ${measured.cut.join(', ')}`,
                measured.over > 0 && `overflows ${measured.over} px`,
                measured.field < FIELD && `field ${measured.field} px`,
                measured.page > 0 && 'page scrolls sideways',
              ].filter(Boolean)
              if (fault.length > 0) broken.push(`«${name}» in ${face}: ${fault.join('; ')} — ${measured.room} px: ${measured.tools.join(', ')}`)
              await wide?.evaluate((tag) => (tag as Element).remove())
            }
          }
          // Every eye is measured before the verdict, so a red run names all of them at once.
          expect(broken, 'in every eye the crown stands on one row, cuts nothing and leaves the field 180 px').toEqual([])
        })
      }
    })
  }
}
