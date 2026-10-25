import type { Page } from '@playwright/test'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { expect, test } from '../../support/test.js'

// The rulebook stands still while its tab's row changes (#1054, beställarens val AE 2026-10-20).
// Beside the open AI panel the book jumped 32 px down when a proposal was shown and back up when it
// was hidden: the proposal's line stood as a row of its own under the bar, while the bar dropped
// its switch and tools. And a book made from a file broke the bar onto two rows at 1280 in CI's
// face, because the line saying which file it came out of stood in the row. Now the proposal's line
// stands in the bar, in the tools' place, the file's line stands in the contents column's foot, and
// the bar is one row of one height in every state — so the book's top edge is where it was.
//
// The import's report is not held: it is a band over the book the file would make, read against
// that book rather than over it (#131, prototype 8 variant B), so it pushes the book down by its own
// height, and the book under it is another book than the one the designer was reading.
//
// Measured in the machine's own face, and then in a wide one: Verdana is DejaVu's width and is on
// the Mac; CI's runner has DejaVu itself (#1045).
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefR054'
const GAME = 'Skogens regler'
const FILE = ['# Skogens regler', '', '# Översikt', '', 'Två till sex spelare.', '', '# En tur', '', 'Dra ett kort.'].join('\n')
const WIDE = ".byd-rules-bar *, .byd-rules-toc * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }"

const WORDS: Record<string, { tab: string; ask: string; rules: string; hide: string; book: string; add: string; over: string; report: string; make: string; source: RegExp }> = {
  'sv-SE': { tab: 'Regler', ask: 'Fråga om spelet', rules: 'Visa i regelboken', hide: 'Dölj förslaget', book: 'Boken', add: 'Lägg till', over: 'Ersätt med en fil…', report: 'Vad importen gör med boken du har', make: 'Gör boken', source: /^Boken kom ur regler\.md, / },
  'en-GB': { tab: 'Rules', ask: 'Ask about the game', rules: 'Show in the rulebook', hide: 'Hide the proposal', book: 'The book', add: 'Add', over: 'Replace with a file…', report: 'What the import does to the book you have', make: 'Make the book', source: /^The book came out of regler\.md, / },
}

// Where the book stands, and the row over it: its height, and the rows its children stand in,
// counted by their middles because the row centres children of different heights.
const measure = (page: Page) =>
  page.evaluate(() => {
    const bar = document.querySelector('.byd-rules-bar') as HTMLElement
    const spread = document.querySelector('.byd-rules-spread') as HTMLElement
    const shown = [...bar.children].filter((el) => !el.classList.contains('byd-offscreen') && el.getBoundingClientRect().height > 0)
    return {
      book: Math.round(spread.getBoundingClientRect().top),
      bar: Math.round(bar.getBoundingClientRect().height),
      room: Math.round(bar.clientWidth),
      rows: new Set(shown.map((el) => { const r = el.getBoundingClientRect(); return Math.round((r.top + r.bottom) / 2) })).size,
      tools: shown.map((el) => `${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)} ${Math.round(el.getBoundingClientRect().width)}`),
      over: bar.scrollWidth - bar.clientWidth,
    }
  })

for (const locale of ['sv-SE', 'en-GB']) {
  const words = WORDS[locale]!
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    test.describe(`the rulebook beside the open AI panel at ${viewport.width} × ${viewport.height} in ${locale}`, () => {
      test.use({ viewport, locale })
      for (const face of ['system-ui', 'wide']) {
        test(`in ${face}: the book stands still while a proposal comes and goes and once the book is made from a file, under a bar of one row`, async ({ page }) => {
          await logIn(page.request)
          expect((await page.request.put('/me/ai-key', { data: { provider: 'anthropic', key: KEY } })).status()).toBe(200)
          const doc = {
            ...gameDoc({ name: GAME, cards: 4 }),
            rules: {
              title: GAME,
              blocks: [
                { kind: 'heading' as const, id: 'b1', level: 1 as const, text: 'Översikt' },
                { kind: 'text' as const, id: 'b2', text: 'Ett spel om skogen.' },
                { kind: 'heading' as const, id: 'b3', level: 1 as const, text: 'En tur' },
                { kind: 'text' as const, id: 'b4', text: 'Varje tur drar du ett kort.' },
              ],
            },
          }
          const project = await makeProjectOf(page.request, doc)
          await page.goto(project.editorUrl)
          await expect(page.locator('.byd-ai[data-open]')).toBeVisible()
          await page.getByRole('tab', { name: words.tab }).click()
          await expect(page.locator('article.byd-rulebook')).toBeVisible()
          if (face === 'wide') await page.addStyleTag({ content: WIDE })
          const bar = page.locator('.byd-rules-bar')
          const seen: Record<string, Awaited<ReturnType<typeof measure>>> = {}

          // Written: the switch, the adding and the book's own button stand in the row (#1258).
          await expect(bar.getByRole('group', { name: words.add })).toBeVisible()
          await expect(bar.getByRole('button', { name: words.book })).toBeVisible()
          seen['written'] = await measure(page)

          // A proposal shown in the book: its line stands in the row, in the tools' place.
          const ai = page.locator('.byd-ai')
          const ask = ai.getByRole('textbox', { name: words.ask })
          await ask.fill('Skriv om turen [regler-om]')
          await ask.press('Enter')
          await ai.getByRole('button', { name: words.rules }).click()
          await expect(bar.locator('[data-proposal]')).toBeVisible()
          await expect(page.locator('.byd-rules [role=status][data-proposal]')).toHaveCount(1)
          seen['proposal'] = await measure(page)

          await bar.getByRole('button', { name: words.hide }).click()
          await expect(page.locator('.byd-rules [role=status][data-proposal]')).toHaveCount(0)
          seen['hidden'] = await measure(page)

          // Made from a file: the line saying which file stands in the contents column's foot.
          await bar.getByRole('button', { name: words.book }).click()
          await page.getByLabel(words.over).setInputFiles({ name: 'regler.md', mimeType: 'text/markdown', buffer: Buffer.from(FILE) })
          const report = page.getByRole('region', { name: words.report })
          await report.getByRole('button', { name: words.make }).click()
          await expect(report).toHaveCount(0)
          await expect(page.locator('article.byd-rulebook')).toContainText('Dra ett kort.')
          await expect(page.locator('.byd-rules-toc').getByText(words.source)).toBeVisible()
          await expect(bar.getByText(words.source)).toHaveCount(0)
          seen['from a file'] = await measure(page)

          // Every state is measured before the verdict, so a red run names all of them at once.
          const said = Object.entries(seen).map(([state, m]) => `${state}: book at ${m.book}, bar ${m.bar} px on ${m.rows} rows in ${m.room} (${m.tools.join(', ')})`).join('\n')
          const books = Object.fromEntries(Object.entries(seen).map(([state, m]) => [state, m.book]))
          expect(books, `in ${face}, the book's top edge stays where it was:\n${said}`).toEqual(Object.fromEntries(Object.keys(seen).map((state) => [state, seen['written']!.book])))
          const rows = Object.fromEntries(Object.entries(seen).map(([state, m]) => [state, [m.rows, m.bar, m.over > 0]]))
          expect(rows, `in ${face}, the bar is one row of one height and overflows nothing:\n${said}`).toEqual(Object.fromEntries(Object.keys(seen).map((state) => [state, [1, seen['written']!.bar, false]])))
        })
      }
    })
  }
}
