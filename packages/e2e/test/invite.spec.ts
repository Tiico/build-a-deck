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

// Followed before logging in, the link lands on the login card, and the card says what the reader
// came for (#691): the game she was invited to, by name, and no sales line for a product she has
// not asked about.
test('the link followed logged out names the game on the login card', async ({ browser, baseURL, page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Delad skog' })
  const guest = `e2e-${crypto.randomUUID()}@example.com`
  await page.request.post(`/projects/${encodeURIComponent(project.id)}/invites`, { data: { email: guest, role: 'editor' } })
  const link = /\S+\/invites\/[A-Za-z0-9_-]+/.exec((await mailTo(guest)).text)?.[0]

  const context = await browser.newContext({ viewport: DESK.viewport, ...(baseURL ? { baseURL } : {}) })
  try {
    const theirs = await context.newPage()
    await theirs.goto(link!)
    await expect(theirs).toHaveURL(/\/login\?next=/)
    // A fresh browser of its own reads the card in the language it asks for, English here.
    await expect(theirs.getByText('Log in to open the game you were invited to: Delad skog.')).toBeVisible()
    await expect(theirs.getByText(/Build your own card game/)).toHaveCount(0)
  } finally {
    await context.close()
  }
})
