import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// Ett klick mitt i ett stycke under Regler öppnar det med markören där klicket landade (#972), som
// i en vanlig textredigerare — inte i början av fältet.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

test('ett klick på ett ord mitt i ett stycke ställer markören vid ordet (#972)', async ({ page }) => {
  await logIn(page.request)
  const text = 'Den som senast var på en saloon börjar, och turen går medsols.'
  const doc = gameDoc({ name: 'Skogens herrar', players: 2 }) as ReturnType<typeof gameDoc> & { rules?: unknown }
  doc.rules = { title: 'Skogens herrar', blocks: [{ kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' }, { kind: 'text', id: 't1', text }] }
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await page.getByRole('tab', { name: 'Regler' }).click()
  const book = page.locator('[data-rulebook]')
  const para = book.getByText(text)
  await expect(para).toBeVisible()

  // The middle of the word «saloon», found on the page as the browser lays it out.
  const at = await para.evaluate((el, word) => {
    const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.includes(word))!
    const range = document.createRange()
    const i = node.textContent!.indexOf(word)
    range.setStart(node, i + 2)
    range.setEnd(node, i + 3)
    const r = range.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, 'saloon')
  await page.mouse.click(at.x, at.y)
  const field = book.getByRole('textbox', { name: /^Text/ })
  await expect(field).toBeFocused()
  const caret = await field.evaluate((el: HTMLTextAreaElement) => el.selectionStart)
  const word = text.indexOf('saloon')
  expect(caret).toBeGreaterThanOrEqual(word)
  expect(caret).toBeLessThanOrEqual(word + 'saloon'.length)
})
