import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'

// The way in, at the widths the audit checks. `/` is the first screen a creator ever sees and the
// last one they come back to, and it was the only route with no measured check of its own — which
// is how a 28 px language picker and a 16 px way out reached it (UX-kontroll 2026-09-10).
//
// Migrated from `packages/web/test/account-viewport.test.tsx`. That version mounted `HomePage`
// into jsdom against an in-process server, lifted the markup out, pasted three stylesheets around
// it and measured the result. This opens the page. The two shapes `/` has are reached the way a
// person reaches them — not logged in, and logged in with a game — so what is measured is the
// route, its own wrapper, and the stylesheet the build emitted, rather than a reconstruction of
// all three.
// Measured in Swedish, said here rather than assumed. The old version got Swedish for free:
// jsdom asks for no language, and a surface mounted with none speaks the catalogue's own (A4). A
// real browser asks for the machine's, so the same test in Chromium was reading an English page —
// and a hit area is a measurement of a word, so which language it is written in is part of the
// fact. This is the language the 2026-09-10 audit was made in.
const LANG = 'sv-SE'

const WIDTHS = [390, 768, 1024] as const
const TARGETS = 'button, a[href], input, select, textarea'

/** Every control the page draws that is smaller than a fingertip, named so a failure says which. */
const tooSmall = (page: Page) =>
  page.$$eval(TARGETS, (els) =>
    els
      .filter((el) => el.checkVisibility())
      .map((el) => {
        // A control inside a label is as big as the label: that is the area a finger lands on.
        const target = el.closest('label') ?? el
        const box = target.getBoundingClientRect()
        return { what: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 24), w: Math.round(box.width), h: Math.round(box.height) }
      })
      .filter(({ w, h }) => w < 44 || h < 44)
      .map(({ what, w, h }) => `${what}: ${w}×${h}`),
  )

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

for (const width of WIDTHS) {
  test.describe(`the way in at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, locale: LANG })

    test('gives every control on the login card a 44 by 44 pixel hit area, and never scrolls sideways', async ({ page }) => {
      await page.goto('/')
      // The card for whoever is not logged in. Waited for by its own field, so the measurement
      // never lands on a page that is still deciding what it is.
      await expect(page.getByLabel('E-post')).toBeVisible()
      expect(await tooSmall(page)).toEqual([])
      expect(await sideways(page)).toBe(0)
    })

    test('does the same once there is an account with a game on it', async ({ page }) => {
      // With a game on it, so the card and its own menu are measured too and not only the empty
      // grid — which is the state the 2026-09-10 audit found the small controls in.
      await logIn(page.request)
      await makeProject(page.request, { name: 'Skogens herrar' })
      await page.goto('/')
      await expect(page.getByText('Skogens herrar')).toBeVisible()
      await expect(page.getByRole('button', { name: /^Fler val/ })).toBeVisible()
      expect(await tooSmall(page)).toEqual([])
      expect(await sideways(page)).toBe(0)
    })
  })
}
