import type { Page } from '@playwright/test'
import { SMALL_TV, TV } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// The room's code is read as a code (#675, #937): set in a fixed-width face, on the television's
// `/KOD` line and on table mode's plate alike.
//
// What is asked is the face Chromium actually drew the code in, not the stack the stylesheet
// declared, because the declaration was right and the drawing was not: `ui-monospace, monospace`
// is SF Mono in Safari, but Chrome on a Mac knows no `ui-monospace` and its `monospace` is
// Courier, a typewriter face that reads as a mistake beside the interface around it. No family is
// pinned, since the face differs between this Mac (Menlo) and CI's Linux (DejaVu Sans Mono or
// Liberation Mono); what is held is that the face is not one of the generic fallbacks, Courier and
// Times, and that it is fixed-width — an `i` as wide as a `W` in the face that was drawn.

/** The faces Chromium drew a node's text in, by the platform's own name for them. */
async function drawnIn(page: Page, selector: string): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
  await cdp.detach()
  return fonts.map((f) => f.familyName)
}

/** Whether a face advances an `i` and a `W` alike, drawn in that face alone. */
async function fixedWidth(page: Page, family: string): Promise<boolean> {
  return page.evaluate((family) => {
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.font = `40px "${family}"`
    return Math.abs(ctx.measureText('iiiiii').width - ctx.measureText('WWWWWW').width) < 0.5
  }, family)
}

for (const [where, device, url, selector] of [
  ['the television', TV, (t: { tvUrl: string }) => t.tvUrl, '.byd-tv-join strong'],
  ['table mode', SMALL_TV, (t: { tableUrl: string }) => t.tableUrl, '.byd-table-plate [data-address] b'],
] as const) {
  test(`the code on ${where} is drawn in a fixed-width face, not a fallback`, async ({ table, open }) => {
    const { page } = await open(device, `${url(table)}&lang=sv`)
    await expect(page.locator(selector)).toHaveText(table.code)
    await page.evaluate(() => document.fonts.ready)
    const faces = await drawnIn(page, selector)
    console.log(`${where}: ${faces.join(', ')}`)
    expect(faces, 'the code is drawn in one face').toHaveLength(1)
    const [face] = faces as [string]
    expect(face, 'not a generic fallback').not.toMatch(/courier|times/i)
    expect(await fixedWidth(page, face), `${face} is fixed-width`).toBe(true)
  })
}
