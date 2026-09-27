import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../support/api.js'

// Logged out in another tab while the editor is open (#485, fynd 7). The next connection is let in
// and then turned away, so every attempt "opened" and the editor started its wait over each time:
// 37–46 connections in 8–10 seconds and not a word on the screen. It says it is logged out, keeps
// the work, and offers the way back in — and does not hammer the door.
test('says the editor is logged out, keeps the work, and stops knocking', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar' })
  const sockets: string[] = []
  let first: { close: () => void } | null = null
  await page.routeWebSocket('**/projects/**/edit**', (ws) => {
    sockets.push(ws.url())
    const server = ws.connectToServer()
    if (!first) first = { close: () => ws.close({ code: 1006 }) }
    void server
  })
  await page.goto(project.editorUrl)
  await expect(page.locator('.byd-editor')).toBeVisible()
  await expect.poll(() => sockets.length).toBe(1)

  expect((await page.request.post('/auth/logout')).ok()).toBe(true)
  first!.close()

  await page.waitForTimeout(8000)
  expect(sockets.length, 'reconnects in eight seconds').toBeLessThanOrEqual(6)
  const notice = page.locator('[data-status-notice]')
  await expect(notice).toBeVisible()
  // Logged out is not «someone else's game»: it says what happened and the way back in.
  await expect(notice.getByRole('heading')).toHaveText(/logged out|utloggad/i)
  await expect(notice.getByRole('link', { name: /Logga in|Sign in/ })).toBeVisible()
  // And the work is still on the page behind the message.
  await expect(page.locator('.byd-editor')).toBeVisible()
})
