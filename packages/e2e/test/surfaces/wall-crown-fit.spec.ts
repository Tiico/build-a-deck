import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'

// The wall's crown at the desk's narrow end (#477 fynd 12). The search field was the one thing in
// the row that could give, and at 1024 it gave down to 58 px: «Sök i». Below 1280 the boxes say
// only what is chosen in them (beslut 2026-09-27, variant B) — their full names stay their
// accessible names — and the field keeps room to be written in.
for (const locale of ['sv-SE', 'en-GB']) {
  for (const width of [1024, 1280]) {
    test.describe(`the wall's crown at ${width} in ${locale}`, () => {
      test.use({ viewport: { width, height: 800 }, locale })

      test('leaves the search field room to be written in, on one row', async ({ page }) => {
        await logIn(page.request)
        const project = await makeProject(page.request, { name: 'Kronan', players: 4, cards: 12 })
        // Grouped, as a real deck is: the crown then carries the grouping's own value and the
        // jump column's fold, which is the row the field was squeezed out of.
        const doc = (await (await page.request.get(`/projects/${project.id}`)).json()) as { template: { faces: Record<string, { variantBy?: string }> }; rows: { fields: Record<string, unknown> }[] }
        doc.template.faces['front']!.variantBy = 'kategori'
        doc.rows.forEach((row, i) => (row.fields['kategori'] = ['Varelse', 'Förtrollning', 'Artefakt'][i % 3]))
        expect((await page.request.put(`/projects/${project.id}`, { data: doc })).ok()).toBe(true)
        await page.goto(project.editorUrl)
        const search = page.locator('.byd-crown-search')
        await expect(search).toBeVisible()
        const measured = await page.evaluate(() => {
          const crown = document.querySelector('.byd-wall-view .byd-crown') as HTMLElement
          const field = document.querySelector('.byd-crown-search') as HTMLElement
          const boxes = [...crown.querySelectorAll<HTMLElement>('.byd-crown-box, .byd-crown-fold')]
          return {
            field: Math.round(field.getBoundingClientRect().width),
            over: crown.scrollWidth - crown.clientWidth,
            unnamed: boxes.filter((b) => !(b.getAttribute('aria-label') ?? b.textContent ?? '').trim()).length,
          }
        })
        expect(measured.field, 'the search field is wide enough to read what is written in it').toBeGreaterThanOrEqual(180)
        expect(measured.over, 'the crown stays one row without scrolling sideways').toBeLessThanOrEqual(0)
        expect(measured.unnamed).toBe(0)
      })
    })
  }
}
