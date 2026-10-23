import type { Page } from '@playwright/test'

// «Starta bord» asks how you sit before the table starts (L77, #1130). A journey about what comes
// after the start answers it the way a room around one screen does — today's behaviour — and the
// table's screen it opens in a tab of its own is closed again, since the journey is not about it.
export async function answerStart(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /^(Starta ett bord|Start a table)$/ })
  await dialog.getByRole('radio', { name: /^(Runt en skärm|Around one screen)$/ }).check()
  const opened = page.context().waitForEvent('page', { timeout: 10_000 }).catch(() => null)
  await dialog.getByRole('button', { name: /^(Starta|Start)$/ }).click()
  const tab = await opened
  await tab?.close()
}
