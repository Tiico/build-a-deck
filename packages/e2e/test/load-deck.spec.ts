import { expect, test } from '@playwright/test'
import { STANDARD_TYPES, TypeRegistry } from '@byd/engine'
import { deckFromProject, ProjectDoc, queueFaces, TEXTURE_DPI } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { loadGame, picture } from '../load/deck.js'

// The deck the memory load test plays with (#1012). Its weight is the point: what a container
// holds is a deck's pictures, typefaces and rows as data URLs, so a picture that is not the size it
// says, or not a picture Chromium can draw, would make the measurement a measurement of nothing.

test('a picture of the load deck is a PNG of the asked weight that a browser draws at its size', async ({ page }) => {
  const bytes = picture(7, { width: 900, height: 675, bytes: 250_000 })
  expect(bytes.length).toBeGreaterThan(240_000)
  expect(bytes.length).toBeLessThan(275_000)
  const drawn = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    return { w: img.naturalWidth, h: img.naturalHeight }
  }, Buffer.from(bytes).toString('base64'))
  expect(drawn).toEqual({ w: 900, h: 675 })
})

test('no two pictures of the load deck are the same file', () => {
  // The server keeps one copy of identical bytes, so a deck of identical pictures weighs one.
  const a = Buffer.from(picture(1, { width: 300, height: 200, bytes: 20_000 }))
  const b = Buffer.from(picture(2, { width: 300, height: 200, bytes: 20_000 }))
  expect(a.equals(b)).toBe(false)
})

const hash = (n: number) => n.toString(16).padStart(64, '0')
const assets = { pictures: Array.from({ length: 308 }, (_, i) => hash(i + 1)), back: hash(999), fonts: { title: hash(1001), body: hash(1002) } }

test('the load game is a project for eight seats with 308 cards, each drawn from its own picture in two typefaces', () => {
  const doc = ProjectDoc.parse(loadGame({ name: 'Last 1', generation: 1, cards: 308, assets }))
  expect(doc.setup.seats).toHaveLength(8)
  expect(doc.rows).toHaveLength(308)
  expect(new Set(doc.rows.map((r) => r.fields['art'])).size).toBe(308)
  expect(Object.values(doc.fonts ?? {}).map((f) => f.asset)).toEqual([`asset:${hash(1001)}`, `asset:${hash(1002)}`])
})

test('a load game with fewer pictures than cards deals the pictures out in turn, as a deck that shares its art does', () => {
  const shared = { ...assets, pictures: assets.pictures.slice(0, 77) }
  const doc = ProjectDoc.parse(loadGame({ name: 'Last 1', generation: 1, cards: 308, assets: shared }))
  expect(doc.rows).toHaveLength(308)
  const uses = new Map<unknown, number>()
  for (const row of doc.rows) uses.set(row.fields['art'], (uses.get(row.fields['art']) ?? 0) + 1)
  expect([...uses.values()]).toEqual(Array.from({ length: 77 }, () => 4))
})

test('a new generation of the load game redraws the front of every card, which is the full re-render a saved version sends to a table', async () => {
  const fronts = async (generation: number) => {
    const doc = ProjectDoc.parse(loadGame({ name: 'Last 1', generation, cards: 308, assets }))
    const { faces } = await queueFaces(deckFromProject(doc), setupFromProject(doc), new TypeRegistry(STANDARD_TYPES), TEXTURE_DPI, 0, async () => undefined)
    return Object.values(faces).map((f) => f['front'])
  }
  const before = await fronts(1)
  const after = await fronts(2)
  expect(before).toHaveLength(308)
  expect(after.filter((h, i) => h !== before[i])).toHaveLength(308)
})
