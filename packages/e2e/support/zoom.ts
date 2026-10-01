import type { Page } from '@playwright/test'
import { ZOOM_STEP, zoomPercent } from '../../web/src/editor/canvas.js'

// The canvas zoomed to a percentage, through the control a designer has (#619): the pill's
// choices are «Passa in», «100 %», «50 %» and «200 %», and `+` and `−` step from there. The slider
// these tests used to fill is gone, so a zoom is the nearest choice and the steps after it.
const CHOICES = [100, 50, 200] as const
const STEP = zoomPercent(ZOOM_STEP)

export async function zoomTo(page: Page, percent: number): Promise<void> {
  const from = CHOICES.reduce((best, c) => (Math.abs(c - percent) < Math.abs(best - percent) ? c : best))
  await page.getByRole('button', { name: /^Förstoring: / }).click()
  await page.getByRole('menuitemradio', { name: `${from} %` }).click()
  const steps = Math.round((percent - from) / STEP)
  const button = page.getByRole('button', { name: steps > 0 ? 'Förstora mer' : 'Förstora mindre', exact: true })
  for (let i = 0; i < Math.abs(steps); i++) await button.click()
  await page.waitForTimeout(100)
}
