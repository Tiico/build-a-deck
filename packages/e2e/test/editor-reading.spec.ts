import type { Browser, BrowserContext, Page } from '@playwright/test'
import { logIn, mailTo, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The editor for a role that may not change the game (#489; beställarens beslut C efter prototyp
// 35 — ett läsband). Before, a tester could drag, type and upload in every tab, the head said
// «Osparat», and the actor refused every save. Now a band says once, on every tab, that this is
// read-only and why; nothing that would edit is drawn; and a shortcut with nothing to do says so.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

async function asRole(page: Page, browser: Browser, baseURL: string | undefined, role: 'tester' | 'viewer'): Promise<{ theirs: Page; context: BrowserContext; editorUrl: string }> {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Delad skog', cards: 6 })
  const guest = `e2e-${crypto.randomUUID()}@example.com`
  expect((await page.request.post(`/projects/${encodeURIComponent(project.id)}/invites`, { data: { email: guest, role } })).status()).toBe(201)
  const link = /\S+\/invites\/[A-Za-z0-9_-]+/.exec((await mailTo(guest)).text)![0]
  const context = await browser.newContext({ viewport: DESK.viewport, locale: 'sv-SE', ...(baseURL ? { baseURL } : {}) })
  const theirs = await context.newPage()
  await logIn(theirs.request, guest)
  await theirs.goto(link)
  await expect(theirs).toHaveURL(new RegExp(`/editor\\?project=${project.id}`))
  return { theirs, context, editorUrl: project.editorUrl }
}

// What would change the game on each tab, from the catalogue of the tab's controls (#489). None
// of it is drawn for a role that may not change the game; the reading controls beside it are.
const EDITS: Record<string, readonly string[]> = {
  wall: ['.byd-wall-measure-drop'],
  template: ['.byd-canvas-tools', '.byd-backs', '.byd-drag-handle', '.byd-fonts-upload', '.byd-fonts-catalog', '.byd-newfield'],
  table: ['.byd-data-add', '.byd-data-tick', 'td.byd-data-remove button', 'th.byd-data-remove button', '.byd-data-icon', '.byd-data-bulk'],
  symbols: ['.byd-symbols-tile', '.byd-symbols-add', '.byd-symbols-set li[data-icon] > button', '.byd-symbols-colours li[data-role] > button:last-child'],
  media: ['.byd-media-add', '.byd-media-remove'],
  rules: ['.byd-rules-ways:not(.byd-rules-tools)', '.byd-rules-tools label', '.byd-rules-add', '.byd-rules-own', '.byd-rules-block > div[role="button"]'],
  tables: ['.byd-setup-tools', '.byd-setup-x', '.byd-setup-corner', '.byd-zone-action-new'],
}
// What must stay alive for a reader, so the page is not simply empty.
const READS: Record<string, string> = {
  wall: '.byd-crown-search',
  template: '[role="tabpanel"]:not([hidden]) [data-step], [role="tabpanel"]:not([hidden]) .byd-canvas-grid-toggle',
  table: '.byd-data-filter input',
  symbols: '.byd-symbols-main',
  media: '.byd-media-grid',
  rules: '.byd-rulebook',
  tables: '.byd-setup-name',
}
// And what an empty tab says to a reader: what the game has, never how to add to it.
const SAYS: Partial<Record<string, string>> = { symbols: 'Spelet har inga symboler.', media: 'Spelet har inga bilder.' }
const TABS = Object.keys(EDITS) as (keyof typeof EDITS)[]

for (const role of ['tester', 'viewer'] as const) {
  test(`reads the game as a ${role}: one band on every tab, nothing that edits, and a shortcut that says why`, async ({ page, browser, baseURL }) => {
    const { theirs, context } = await asRole(page, browser, baseURL, role)
    try {
      const band = theirs.getByRole('note', { name: 'Läsläge' })
      await expect(band).toBeVisible()
      await expect(band).toContainText('Be ägaren om rätt att ändra')
      // No save to press, and a save pressed anyway is answered in the band.
      await expect(theirs.getByRole('button', { name: /^Spara$/ })).toHaveCount(0)
      await theirs.keyboard.press('ControlOrMeta+s')
      await expect(band.getByRole('status')).toHaveText('Läsläge: inget att spara.')

      for (const tab of TABS) {
        await theirs.locator(`#byd-editor-tab-${tab}`).click()
        const panel = theirs.locator('[role="tabpanel"]:not([hidden])')
        await expect(panel).toHaveAttribute('aria-describedby', 'byd-editor-reading')
        // Nothing that would change the document is drawn in it, and what reads is.
        const drawn = await panel.evaluate((root, selectors) => selectors.filter((sel) => [...root.querySelectorAll<HTMLElement>(sel)].some((el) => el.checkVisibility())), [...EDITS[tab]!])
        expect(drawn, `edit controls drawn on ${tab}`).toEqual([])
        await expect(theirs.locator(READS[tab]!).first(), `a reading control on ${tab}`).toBeVisible()
        if (SAYS[tab]) await expect(panel).toContainText(SAYS[tab])
      }
      // And whatever was pressed, the head never says «Osparat».
      await expect(theirs.getByText('Osparat')).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
}
