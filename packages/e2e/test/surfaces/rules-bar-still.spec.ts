import type { Page } from '@playwright/test'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { expect, test } from '../../support/test.js'

const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefR054'
const GAME = 'Skogens regler'
const FILE = ['# Skogens regler', '', '# Översikt', '', 'Två till sex spelare.', '', '# En tur', '', 'Dra ett kort.'].join('\n')

const WORDS: Record<string, { tab: string; ask: string; rules: string; hide: string; over: string; report: string; cancel: string; make: string }> = {
  'sv-SE': { tab: 'Regler', ask: 'Fråga om spelet', rules: 'Visa i regelboken', hide: 'Dölj förslaget', over: 'Importera över boken', report: 'Vad importen gör med boken du har', cancel: 'Avbryt', make: 'Gör boken' },
  'en-GB': { tab: 'Rules', ask: 'Ask about the game', rules: 'Show in the rulebook', hide: 'Hide the proposal', over: 'Import over the book', report: 'What the import does to the book you have', cancel: 'Cancel', make: 'Make the book' },
}

// Measurement record for #1054: set SHOTS to a directory to keep a picture of every state.
const shoot = async (page: Page, name: string) => {
  if (process.env['SHOTS']) await page.screenshot({ path: `${process.env['SHOTS']}/${name}.png` })
}

const measure = (page: Page) =>
  page.evaluate(() => {
    const bar = document.querySelector('.byd-rules-bar') as HTMLElement
    const spread = document.querySelector('.byd-rules-spread') as HTMLElement
    return {
      book: Math.round(spread.getBoundingClientRect().top),
      bar: Math.round(bar.getBoundingClientRect().height),
      room: Math.round(bar.clientWidth),
      rows: new Set([...bar.children].map((el) => Math.round(el.getBoundingClientRect().top))).size,
      tools: [...bar.children].map((el) => `${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)} ${Math.round(el.getBoundingClientRect().width)}`),
      band: [...document.querySelectorAll('.byd-rules-ai, .byd-rules-ai > *')].map((el) => `${(el.textContent || '').trim().slice(0, 30)} ${Math.round(el.getBoundingClientRect().width)}`),
      between: [...(document.querySelector('.byd-rules') as HTMLElement).children].filter((el) => el !== bar && el !== spread).map((el) => `${el.className} ${Math.round(el.getBoundingClientRect().height)}`),
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
        test(`in ${face}: the book stands still while a proposal comes and goes, and during an import`, async ({ page }) => {
          await logIn(page.request)
          expect((await page.request.put('/me/ai-key', { data: { provider: 'anthropic', key: KEY } })).status()).toBe(200)
          const doc = { ...gameDoc({ name: GAME, cards: 4 }), rules: { title: GAME, blocks: [{ kind: 'heading' as const, id: 'b1', level: 1 as const, text: 'Översikt' }, { kind: 'text' as const, id: 'b2', text: 'Ett spel om skogen.' }, { kind: 'heading' as const, id: 'b3', level: 1 as const, text: 'En tur' }, { kind: 'text' as const, id: 'b4', text: 'Varje tur drar du ett kort.' }] } }
          const project = await makeProjectOf(page.request, doc)
          await page.goto(project.editorUrl)
          await expect(page.locator('.byd-ai[data-open]')).toBeVisible()
          await page.getByRole('tab', { name: words.tab }).click()
          await expect(page.locator('article.byd-rulebook')).toBeVisible()
          if (face === 'wide') await page.addStyleTag({ content: ".byd-rules-bar *, .byd-rules-ai, .byd-rules-ai *, .byd-rules-report * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }" })
          const seen: Record<string, Awaited<ReturnType<typeof measure>>> = {}
          seen['written'] = await measure(page)
          await shoot(page, `${viewport.width}-${locale}-${face}-written`)
          const ai = page.locator('.byd-ai')
          const ask = ai.getByRole('textbox', { name: words.ask })
          await ask.fill('Skriv om turen [regler-om]')
          await ask.press('Enter')
          await ai.getByRole('button', { name: words.rules }).click()
          await expect(page.locator('.byd-rules-ai[data-proposal]')).toBeVisible()
          seen['proposal'] = await measure(page)
          await shoot(page, `${viewport.width}-${locale}-${face}-proposal`)
          await page.locator('.byd-rules-ai[data-proposal]').getByRole('button', { name: words.hide }).click()
          await expect(page.locator('.byd-rules-ai[data-proposal]')).toHaveCount(0)
          seen['hidden'] = await measure(page)
          await page.getByLabel(words.over).setInputFiles({ name: 'regler.md', mimeType: 'text/markdown', buffer: Buffer.from(FILE) })
          await expect(page.getByRole('region', { name: words.report })).toBeVisible()
          seen['import'] = await measure(page)
          await shoot(page, `${viewport.width}-${locale}-${face}-import`)
          await page.getByRole('region', { name: words.report }).getByRole('button', { name: words.make }).click()
          await expect(page.getByRole('region', { name: words.report })).toHaveCount(0)
          await expect(page.locator('article.byd-rulebook')).toContainText('Dra ett kort.')
          seen['imported'] = await measure(page)
          await shoot(page, `${viewport.width}-${locale}-${face}-imported`)
          // Every state is measured before the verdict, so a red run names all of them at once.
          const said = Object.entries(seen).map(([state, m]) => `${state}: book at ${m.book}, bar ${m.bar} px in ${m.room} (${m.tools.join(', ')}); above the book ${m.between.join(', ')}`)
          expect(Object.fromEntries(Object.entries(seen).map(([state, m]) => [state, m.book])), said.join('\n')).toEqual(Object.fromEntries(Object.keys(seen).map((state) => [state, seen['written']!.book])))
        })
      }
    })
  }
}
