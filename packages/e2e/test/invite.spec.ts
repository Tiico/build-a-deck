import { logIn, mailTo, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Sharing a game (D3, #475): the owner invites an address, the server mails a link, and whoever
// follows it lands in the editor of that game. The link is on the product's own origin, where it
// once answered with the API's raw `{"error":"not found"}` — which no test that mounted the page
// on a port of its own could ever see.
test.use({ viewport: DESK.viewport })

test('the link in the invitation mail opens the game in the editor', async ({ browser, baseURL, page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Delad skog' })

  const guest = `e2e-${crypto.randomUUID()}@example.com`
  const invited = await page.request.post(`/projects/${encodeURIComponent(project.id)}/invites`, { data: { email: guest, role: 'editor' } })
  expect(invited.status()).toBe(201)
  const link = /\S+\/invites\/[A-Za-z0-9_-]+/.exec((await mailTo(guest)).text)?.[0]
  expect(link, 'the mail carries the invitation link').toBeTruthy()

  // Somebody else, in a browser of their own, signed in as the address the mail went to.
  const context = await browser.newContext({ viewport: DESK.viewport, ...(baseURL ? { baseURL } : {}) })
  try {
    const theirs = await context.newPage()
    await logIn(theirs.request, guest)
    await theirs.goto(link!)
    await expect(theirs).toHaveURL(new RegExp(`/editor\\?project=${project.id}`))
    await expect(theirs.getByText('Delad skog').first()).toBeVisible()
  } finally {
    await context.close()
  }
})
