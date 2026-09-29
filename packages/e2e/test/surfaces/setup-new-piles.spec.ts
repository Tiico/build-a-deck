import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'

// Two new piles side by side (#480 fynd 12, K19). `newPileSpot` found each a free card back, but a
// pile's name is drawn under it in caps, wider than the card, and the second pile's name ran into
// the first's: «HÖGHÖG 1». Measured on the felt the setup draws, in both widths the desk is held to.
for (const width of [1024, 1280]) {
  test.describe(`two new piles on the felt at ${width}`, () => {
    test.use({ viewport: { width, height: 800 }, locale: 'sv-SE' })

    test('draw their names apart', async ({ page }) => {
      await logIn(page.request)
      const project = await makeProject(page.request, { name: 'Högarna', players: 4, cards: 4 })
      await page.goto(project.editorUrl)
      await page.locator('#byd-editor-tab-tables').click()
      const add = page.getByRole('button', { name: '＋ Hög' })
      await add.click()
      await add.click()
      await add.click()
      await expect(page.locator('.byd-setup-felt .byd-pile')).toHaveCount(5)
      const crossings = await page.evaluate(() => {
        // The felt names a pile when it is asked about (#581); lit all at once is the most any
        // pointing can show, and what is clear then is clear for one.
        for (const pile of document.querySelectorAll('.byd-setup-felt .byd-pile')) pile.setAttribute('data-lit', '')
        const names = [...document.querySelectorAll<HTMLElement>('.byd-setup-felt .byd-pile .byd-pile-name')].map((el) => ({ text: el.textContent ?? '', box: el.getBoundingClientRect() }))
        if (names.filter((n) => n.box.width > 0).length !== 5) throw new Error(`not every pile's name is drawn: ${JSON.stringify(names.map((n) => n.text))}`)
        const out: string[] = []
        for (let i = 0; i < names.length; i++)
          for (let j = i + 1; j < names.length; j++) {
            const a = names[i]!.box
            const b = names[j]!.box
            if (Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)) out.push(`${names[i]!.text} × ${names[j]!.text}`)
          }
        return out
      })
      expect(crossings).toEqual([])
    })
  })
}
