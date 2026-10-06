import type { Page } from '@playwright/test'
import type { ProjectDoc } from '@byd/server'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { tableOf as tableFromSetup, tableWithRules } from '../support/api.js'
import { TV } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// The television's chrome that only stands once something is opened (#684): the shortcuts behind
// the felt's «?», the box behind the way in's «?», the camera's corner, the question before a
// restart and the screen an ended table shows. K26's floor of 24 px is for all text on the TV
// (#560 P-25), and `tv-text-floor.spec.ts` reads the screen at rest; this reads it opened.

// Every word drawn inside `root` that is under the floor. A card's own face is not chrome (K26).
async function underFloor(page: Page, root: string): Promise<string[]> {
  return page.evaluate((root) => {
    const out: string[] = []
    for (const scope of document.querySelectorAll(root)) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim()
        const el = n.parentElement
        if (!text || !el || el.closest('.byd-card, [data-texture], .byd-hand-card, [data-inspect]')) continue
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue
        const px = parseFloat(cs.fontSize)
        if (px < 24) out.push(`${text.slice(0, 30)} (${px} px)`)
      }
    }
    return out
  }, root)
}

// Every button inside `root` drawn smaller than a fingertip's 44 px.
async function underTarget(page: Page, root: string): Promise<string[]> {
  return page.evaluate((root) =>
    [...document.querySelectorAll<HTMLElement>(`${root} button`)].flatMap((b) => {
      const r = b.getBoundingClientRect()
      return r.width >= 44 && r.height >= 44 ? [] : [`${b.getAttribute('aria-label') ?? b.textContent?.trim()} ${Math.round(r.width)} × ${Math.round(r.height)}`]
    }),
  root)
}

test.describe('the television chrome that opens (#684)', () => {
  test('lays out the shortcuts with each key and its sentence on one line, at the floor', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4 })
    const { page } = await open(TV, `${table.tvUrl}&lang=sv`)
    await expect(page.locator('.byd-pile').first()).toBeVisible()
    await page.locator('.byd-shortcut-open').click()
    const panel = page.locator('[data-shortcut-panel]')
    await expect(panel).toBeVisible()

    expect(await underFloor(page, '[data-shortcut-panel]')).toEqual([])
    // Each sentence stands beside its key and has the rest of the row: never a column a word wide.
    const rows = await panel.evaluate((p) => {
      const content = p.querySelector('dl')!.getBoundingClientRect()
      return [...p.querySelectorAll('dd')].map((dd) => {
        const d = dd.getBoundingClientRect()
        const t = dd.previousElementSibling!.getBoundingClientRect()
        return { what: dd.textContent, beside: d.top < t.bottom && t.top < d.bottom, share: d.width / content.width }
      })
    })
    expect(rows.length).toBeGreaterThan(3)
    for (const row of rows) {
      expect(row, row.what ?? '').toMatchObject({ beside: true })
      expect(row.share, row.what ?? '').toBeGreaterThan(0.45)
    }
    // Nothing is cut by the panel's own edges, and the panel is on the screen.
    const fits = await panel.evaluate((p) => ({ wide: p.scrollWidth <= p.clientWidth, tall: p.scrollHeight <= p.clientHeight, box: p.getBoundingClientRect().toJSON() as DOMRect }))
    expect(fits.wide).toBe(true)
    expect(fits.tall).toBe(true)
    expect(fits.box.top).toBeGreaterThanOrEqual(0)
    expect(fits.box.bottom).toBeLessThanOrEqual(TV.viewport.height)
  })

  // The suite runs no renderer, so every card is still queued: the table the room sees before the
  // renderer has caught up (#765, beslut B).
  test('says the cards still being drawn at the floor, and the start waits for them', async ({ request, open, player }) => {
    const doc = gameThatStarts()
    const table = await tableFromSetup(request, setupFromProject(doc), deckFromProject(doc))
    await player(table, { name: 'Ada', seat: 'A' })
    const { page } = await open(TV, `${table.tvUrl}&lang=sv`)
    const line = page.locator('.byd-tv-render')
    await expect(line).toHaveText(/^Korten ritas0 av \d+$/)
    expect(await underFloor(page, '.byd-tv-render')).toEqual([])
    await expect(page.locator('[data-table-start]')).toBeDisabled()
    await expect(page.locator('[data-table-start]')).toHaveText(/^Starta speletkorten ritas · 0\/\d+$/)
  })

  test('opens the way in’s help at the floor', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4 })
    const { page } = await open(TV, `${table.tvUrl}&lang=sv`)
    await page.locator('.byd-tv-join .byd-help-ask').click()
    const box = page.locator('.byd-help-box')
    await expect(box).toBeVisible()
    expect(await underFloor(page, '.byd-help-box')).toEqual([])
    expect(await underTarget(page, '.byd-help-box')).toEqual([])
    // On the screen, and nothing cut sideways.
    const at = await box.evaluate((b) => ({ wide: b.scrollWidth <= b.clientWidth, ...b.getBoundingClientRect().toJSON() }) as { wide: boolean; left: number; right: number; top: number; bottom: number })
    expect(at.wide).toBe(true)
    expect(at.left).toBeGreaterThanOrEqual(0)
    expect(at.right).toBeLessThanOrEqual(TV.viewport.width)
    expect(at.bottom).toBeLessThanOrEqual(TV.viewport.height)
  })

  test('says the two «?» apart in what they show, and not only to a screen reader', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4 })
    const { page } = await open(TV, `${table.tvUrl}&lang=sv`)
    const keys = page.locator('.byd-shortcut-open')
    const join = page.locator('.byd-tv-join .byd-help-ask')
    await expect(keys).toBeVisible()
    await expect(join).toBeVisible()
    const drawn = async (l: typeof keys) => (await l.innerText()).replace(/\s+/g, ' ').trim()
    expect(await drawn(keys)).not.toBe(await drawn(join))
    expect(await underFloor(page, '.byd-shortcut-help')).toEqual([])
    expect(await underTarget(page, '.byd-shortcut-help')).toEqual([])
  })

  test('draws the camera’s corner at the floor', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4 })
    const { page } = await open(TV, `${table.tvUrl}&lang=sv`)
    await expect(page.locator('.byd-pile').first()).toBeVisible()
    // The corner stands only while the view is the viewer's own (#325): one step in makes it so.
    await page.keyboard.press('+')
    await expect(page.locator('.byd-camera-controls')).toBeVisible()
    expect(await underFloor(page, '.byd-camera-controls')).toEqual([])
    expect(await underTarget(page, '.byd-camera-controls')).toEqual([])
    // Folded, the way home is as large.
    await page.locator('.byd-camera-fold').click()
    await expect(page.locator('.byd-camera-controls[data-folded]')).toBeVisible()
    expect(await underFloor(page, '.byd-camera-controls')).toEqual([])
    expect(await underTarget(page, '.byd-camera-controls')).toEqual([])
  })

  test('asks before a restart in the size of the tile it is about', async ({ request, open, player }) => {
    const doc = gameThatStarts()
    const table = await tableFromSetup(request, setupFromProject(doc), deckFromProject(doc))
    await player(table, { name: 'Ada', seat: 'A' })
    await player(table, { name: 'Bo', seat: 'B' })
    const { page } = await open(TV, `${table.tvUrl}&lang=sv`, { facesReady: true })
    const tile = page.locator('[data-table-start]')
    await tile.click()
    await expect(tile).toHaveText('Starta om')
    await tile.click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    expect(await underFloor(page, '.byd-table-start-ask')).toEqual([])
    expect(await underTarget(page, '.byd-table-start-ask')).toEqual([])
  })

  test('names the rulebook in the header at the floor', async ({ request, open }) => {
    const table = await tableWithRules(request, { players: 2 })
    const { page } = await open(TV, `${table.tvUrl}&lang=sv`)
    // Waited for by its name: the button is drawn while the book is asked for, and stays when the
    // table answers that it has one.
    await expect(page.getByRole('button', { name: 'Regler', exact: true })).toBeVisible()
    await expect(page.locator('[data-tv] .byd-tv-head h1')).toBeVisible()
    expect(await underFloor(page, '.byd-tv-head')).toEqual([])
  })

  test('ends at the floor', async ({ tableOf, open, host }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4 })
    const { page } = await open(TV, `${table.tvUrl}&lang=sv`)
    await expect(page.locator('.byd-pile').first()).toBeVisible()
    const hosting = await host(table)
    await hosting.send([{ v: 'session.end' } as never])
    await expect(page.locator('[data-ended]')).toBeVisible()
    expect(await underFloor(page, '[data-ended]')).toEqual([])
  })
})

// A game whose draw pile carries a start action, so the table has a tile to restart (K25).
function gameThatStarts(): ProjectDoc {
  const doc = gameDoc({ players: 2, counters: [], cards: 8 })
  return {
    ...doc,
    setup: {
      ...doc.setup,
      zones: doc.setup.zones.map((z) =>
        z.id === doc.setup.deckZone
          ? { ...z, actions: [{ id: 'start', label: 'Ge alla en starthand', when: 'both' as const, steps: [{ v: 'deal' as const, each: { of: 'number' as const, n: 1 }, to: { at: 'hands' as const }, face: 'keep' as const }] }] }
          : z,
      ),
    },
  }
}
