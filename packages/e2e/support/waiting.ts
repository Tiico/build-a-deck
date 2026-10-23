import type { Page } from '@playwright/test'
import { expect } from './test.js'

/**
 * Past the waiting room on /online (L75, #1130), the way a player gets past it: its ×.
 *
 * Until something has happened at the table the room lies over the middle of the felt, piles and
 * all. A journey about the felt itself — a pile's ring, the lens, a drop — that starts on a table
 * nobody has started puts it away first, and the felt's own start tile takes its place (K25).
 */
export async function pastTheWaitingRoom(page: Page): Promise<void> {
  const room = page.locator('[data-waiting-room]')
  await expect(room).toBeVisible()
  await room.getByRole('button', { name: /Göm väntrummet|Hide the waiting room/ }).click()
  await expect(room).toHaveCount(0)
}
