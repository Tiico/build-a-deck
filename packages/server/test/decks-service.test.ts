import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TILE_HEX } from '@byd/engine'
import { registerRoom, start, type Running } from './fixture.js'
import { template } from './deck.js'
import { openingSetup } from '../src/recipe.js'

// Ett spel med en kortlek och en bricklek, över tjänsten (#1484): bordet startas ur projektet med
// brickornas texturer, brickans bild går genom tillgångarna som kortets (#1028), exporten och
// importen bär båda lekarna (G5), och Fysisk kontroll läser varje lek (E5).
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const HEX = { id: TILE_HEX.id, version: TILE_HEX.version }

function game(picture: string, sizePt = 9) {
  const opening = openingSetup({ players: 2, counters: [] })
  return {
    name: 'Landskapet',
    template,
    rows: [{ id: 'dragon', fields: { title: 'Drake' } }],
    icons: {},
    setup: { ...opening, zones: [...opening.zones, { id: 'bag', kind: 'pile', name: 'Påsen', visibility: 'none', geometry: { x: 300, y: 0, w: 0, h: 0, rot: 0 } }] },
    decks: [
      {
        id: 'landskap',
        name: 'Landskap',
        type: HEX,
        template: {
          faces: {
            front: {
              base: [
                { kind: 'image', id: 'bild', x: 0, y: 0, w: 52, h: 60, bind: { field: 'bild' } },
                { kind: 'text', id: 'namn', x: 6, y: 24, w: 40, h: 8, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt }, color: '#111' },
              ],
              variants: {},
            },
            back: { base: [{ kind: 'shape', id: 'bg', x: -3, y: -3, w: 58, h: 66, shape: 'rect', fill: '#264' }], variants: {} },
          },
        },
        rows: [
          { id: 'skog', fields: { title: 'Skog', bild: `asset:${picture}`, antal: 2 } },
          { id: 'sjo', fields: { title: 'Sjö', bild: `asset:${'0'.repeat(64)}` } },
        ],
        columns: ['title', 'bild', 'antal'],
        zone: 'bag',
      },
    ],
  }
}

describe('ett spel med två lekar över tjänsten (#1484)', () => {
  let run: Running
  let cookie = ''
  const as = (method: string, path: string, body?: unknown) => fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })
  let picture = ''
  beforeEach(async () => {
    run = await start()
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    picture = ((await (await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: PNG })).json()) as { hash: string }).hash
  })
  afterEach(async () => {
    await run.stop()
  })

  it('lägger brickleken i sin hög med sina texturer, och brickans bild går genom tillgångarna', async () => {
    expect((await as('POST', '/projects', { id: 'p1', ...game(picture) })).status).toBe(201)
    const made = (await (await as('POST', '/projects/p1/sessions')).json()) as { id: string; code: string; hostKey: string }
    registerRoom(made.id, made)
    const eva = await run.connect(made.id, null, { role: 'observer', name: 'Eva' })
    await eva.synced(0)
    const tiles = eva.view!.components.filter((c) => c.type.id === HEX.id)
    expect(tiles.map((c) => `${c.zone} ${c.cardRef} ${c.title}`)).toEqual(['bag landskap:skog Skog', 'bag landskap:skog Skog', 'bag landskap:sjo Sjö'])
    for (const t of tiles) for (const texture of Object.values(t.faces ?? {})) expect(await run.renders.status(texture)).toBeTruthy()
    const { version } = (await run.store.loadSession(made.id))!
    const dealt = await run.store.deckOf(made.id, version)
    expect(dealt?.rows['landskap:skog']?.['bild']).toBe(`asset:${picture}`)
    // A picture the store does not have is an empty frame, as on a card (#1028).
    expect(dealt?.rows['landskap:sjo']?.['bild']).toBe('')
  }, 60_000)

  it('bär båda lekarna ut i exporten och tillbaka in med importen', async () => {
    await as('POST', '/projects', { id: 'p1', ...game(picture) })
    await as('POST', '/projects/p1/export')
    await run.renderAll()
    const zip = new Uint8Array(await (await as('GET', '/projects/p1/export')).arrayBuffer())
    const res = await fetch(`${run.http}/projects/import`, { method: 'POST', headers: { 'content-type': 'application/zip', cookie }, body: Buffer.from(zip) })
    expect(res.status).toBe(201)
    const { id } = (await res.json()) as { id: string }
    const back = await run.projects.load(id)
    const was = await run.projects.load('p1')
    expect(back?.decks).toEqual(was?.decks)
    expect(back?.rows).toEqual(was?.rows)
  }, 90_000)

  it('stoppar en order på ett fel i brickleken som på ett kort (E5)', async () => {
    await as('POST', '/projects', { id: 'p1', ...game(picture, 3) })
    const res = await as('POST', '/projects/p1/print')
    expect(res.status).toBe(422)
    const { errors } = (await res.json()) as { errors: { code: string; cardRef: string }[] }
    expect(errors.filter((e) => e.code === 'text-too-small').map((e) => e.cardRef).sort()).toEqual(['landskap:sjo', 'landskap:skog'])
  }, 60_000)
})
