import type { Browser, Page } from '@playwright/test'
import { expect, test } from '../../support/test.js'
import { alsoHere } from '../../support/editors.js'
import { logIn, mailTo, makeProject } from '../../support/api.js'
import { answerStart } from '../../support/start.js'

// The others hang from the header's lower edge, 9 px into whatever strip stands under it, and are
// drawn over it (L63, #1250). Two of those strips carry something a designer must be able to read
// or press at their right-hand end: the notice band its ×, and the reading band the sentence a
// shortcut is answered with (#1073, #489). The stack must never lie over either, nor over the
// words of the band (#1321). Measured in the built app with the bands really up, three others in
// so the stack is as wide as it gets, at the desk's three widths in the face CI draws with.
const WIDE = ".byd-editor, .byd-editor * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }"

// Whatever of `what` the stack's box lies over: boxes for controls, and the boxes of the lines of
// text for words, so the air around a sentence is not counted against it.
const under = (page: Page, what: string) =>
  page.evaluate((what) => {
    const stack = document.querySelector('.byd-editor-here-others')!.getBoundingClientRect()
    const over = (b: DOMRect) => b.width > 0 && b.left < stack.right && b.right > stack.left && b.top < stack.bottom && b.bottom > stack.top
    const hit: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>(what)) {
      if (el.matches('button, a[href]')) {
        if (over(el.getBoundingClientRect())) hit.push(el.getAttribute('aria-label') ?? el.textContent ?? '')
        continue
      }
      const range = document.createRange()
      range.selectNodeContents(el)
      if ([...range.getClientRects()].some(over)) hit.push(el.textContent ?? '')
    }
    return { hit, stack: { left: stack.left, right: stack.right, top: stack.top, bottom: stack.bottom } }
  }, what)

async function viewer(browser: Browser, baseURL: string | undefined, page: Page, projectId: string, width: number): Promise<{ theirs: Page; close(): Promise<void> }> {
  const guest = `e2e-${crypto.randomUUID()}@example.com`
  expect((await page.request.post(`/projects/${encodeURIComponent(projectId)}/invites`, { data: { email: guest, role: 'viewer' } })).status()).toBe(201)
  const link = /\S+\/invites\/[A-Za-z0-9_-]+/.exec((await mailTo(guest)).text)![0]
  const context = await browser.newContext({ viewport: { width, height: 800 }, locale: 'sv-SE', ...(baseURL ? { baseURL } : {}) })
  const theirs = await context.newPage()
  await logIn(theirs.request, guest)
  await theirs.goto(link)
  await expect(theirs).toHaveURL(new RegExp(`/editor\\?project=${projectId}`))
  return { theirs, close: () => context.close() }
}

for (const width of [1024, 1280, 1440]) {
  test.describe(`the people on the header's edge at ${width}`, () => {
    test.use({ viewport: { width, height: 800 }, locale: 'sv-SE' })

    test('lie over none of the reading band, its sentence included (#1321)', async ({ browser, baseURL, page }) => {
      await logIn(page.request)
      const project = await makeProject(page.request, { name: 'Delad skog', cards: 6 })
      const others = await alsoHere(browser, baseURL, page.request, project.id, 3)
      const reader = await viewer(browser, baseURL, page, project.id, width)
      try {
        const theirs = reader.theirs
        await theirs.addStyleTag({ content: WIDE })
        await expect(theirs.getByRole('note', { name: 'Läsläge' })).toBeVisible()
        await expect(theirs.locator('[data-here]')).toHaveAccessibleName('Dela: vilka som har spelet, 4 online')
        await expect(theirs.locator('.byd-editor-here-others i')).toHaveCount(3)
        // A shortcut with nothing to do is answered at the band's right-hand end.
        await theirs.locator('.byd-editor-name').click()
        await theirs.keyboard.press('ControlOrMeta+s')
        await expect(theirs.locator('.byd-editor-reading-said')).toHaveText('Läsläge: inget att spara.')
        const { hit, stack } = await under(theirs, '.byd-editor-readonly b, .byd-editor-readonly small, .byd-editor-readonly > div, .byd-editor-reading-said')
        expect(hit, JSON.stringify(stack)).toEqual([])
        // And it does hang into the band: the measurement is of the stack where the decision put it.
        const band = await theirs.locator('.byd-editor-readonly').boundingBox()
        expect(stack.bottom).toBeGreaterThan(band!.y)
      } finally {
        await reader.close()
        await others.close()
      }
    })

    test('lie over none of the notice band, its × included (#1321)', async ({ browser, baseURL, page }) => {
      await logIn(page.request)
      const project = await makeProject(page.request, { name: 'Delad skog', cards: 6 })
      const others = await alsoHere(browser, baseURL, page.request, project.id, 3)
      try {
        await page.goto(project.editorUrl)
        await page.addStyleTag({ content: WIDE })
        await expect(page.locator('[data-here]')).toHaveAccessibleName('Dela: vilka som har spelet, 4 online')
        await expect(page.locator('.byd-editor-here-others i')).toHaveCount(3)
        // A real notice: the table's request falls, and the editor says so in the band.
        await page.route('**/projects/*/sessions', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, body: 'nej' }) : r.continue()))
        await page.locator('.byd-editor > header .byd-editor-primary:not(.byd-editor-caret)').click()
        await answerStart(page)
        const band = page.locator('.byd-editor > header + .byd-editor-notice-band')
        await expect(band.locator('.byd-editor-notice')).toBeVisible()
        const { hit, stack } = await under(page, '.byd-editor-notice-band .byd-editor-notice, .byd-editor-notice-close')
        expect(hit, JSON.stringify(stack)).toEqual([])
        expect(stack.bottom).toBeGreaterThan((await band.boundingBox())!.y)
      } finally {
        await others.close()
      }
    })
  })
}
