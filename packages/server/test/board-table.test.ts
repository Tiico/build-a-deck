import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BOARDS } from '@byd/engine'
import { registerRoom, start, type Running } from './fixture.js'
import { template } from './deck.js'
import { openingSetup } from '../src/recipe.js'

// Ett bord med ett bräde, över tjänsten (#1479): spelet startas, brädet ligger på filten där setupen
// lade det, och dess yta är en textur ur den enda renderaren (E2) vars hash står i varje vy och som
// renderkön har fått, så att filten kan hämta den per hash (DRIFT §6).
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const square = BOARDS.find((b) => b.id === 'board.square457')!

function game(picture: string) {
  return {
    name: 'Brädspel',
    template,
    rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 2 } }],
    icons: {},
    setup: {
      ...openingSetup({ players: 2, counters: [] }),
      boards: [
        {
          id: 'main',
          type: { id: square.id, version: square.version },
          zone: 'table',
          at: { x: 600, y: 400 },
          faces: { front: { base: [{ kind: 'image', id: 'art', x: -3, y: -3, w: 463, h: 463, bind: { literal: `asset:${picture}` } }], variants: {} } },
        },
      ],
    },
  }
}

describe('ett bord med ett bräde (#1479)', () => {
  let run: Running
  let cookie = ''
  beforeEach(async () => {
    run = await start()
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  })
  afterEach(async () => {
    await run.stop()
  })

  async function startTable(id: string, picture: string) {
    expect((await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id, ...game(picture) }) })).status).toBe(201)
    const made = (await (await fetch(`${run.http}/projects/${id}/sessions`, { method: 'POST', headers: { cookie } })).json()) as { id: string; code: string; hostKey: string }
    registerRoom(made.id, made)
    return made
  }

  it('lägger brädet på filten och säger dess textur i varje vy, och renderkön har jobbet', async () => {
    const { hash } = (await (await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: PNG })).json()) as { hash: string }
    const made = await startTable('p1', hash)
    const table = await run.connectTable(made.id, made.hostKey)
    const ada = await run.connect(made.id, 'A')
    await Promise.all([table.synced(0), ada.synced(0)])
    const seen = [table, ada].map((c) => c.view!.components.find((x) => x.type.id === square.id)!)
    for (const board of seen) expect(board).toMatchObject({ zone: 'table', cardRef: 'main', x: 600 - 457 / 2, y: 400 - 457 / 2 })
    const texture = seen[0]!.faces?.['front']
    expect(texture).toMatch(/^[0-9a-f]{64}$/)
    expect(seen[1]!.faces).toEqual({ front: texture })
    expect(await run.renders.status(texture!)).toBeTruthy()
    // Brädets bild går genom tillgångarna som kortets (#1028): sidan namnger den med hash.
    const { version } = (await run.store.loadSession(made.id))!
    expect((await run.store.deckOf(made.id, version))?.boards?.['main']?.faces['front']?.base[0]).toMatchObject({ bind: { literal: `asset:${hash}` } })
  })

  // TV:ns start väntar tills varje textur är ritad (#765), och brädets JPEG är den tyngsta ett bord har.
  // Starten räknade bara kortens, så TV:n kunde säga klart före brädet (#1539, 574 mot 576 i #1533).
  it('räknar brädets textur i bordets framsteg, lika många som «Uppdatera bordet» räknar', async () => {
    const { hash } = (await (await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: PNG })).json()) as { hash: string }
    const made = await startTable('p3', hash)
    const table = await run.connectTable(made.id, made.hostKey)
    await table.synced(0)
    const started = (await (await fetch(`${run.http}/sessions/${made.id}/textures`)).json()) as { total: number }
    const prepared = (await (await fetch(`${run.http}/sessions/${made.id}/prepare`, { method: 'POST', headers: { cookie } })).json()) as { total: number }
    // The card's front and back, and the board's front.
    expect(prepared.total).toBe(3)
    expect(started.total).toBe(prepared.total)
  })

  it('lämnar en bild som lagret inte har som en tom ram på brädet', async () => {
    const made = await startTable('p2', '0'.repeat(64))
    const { version } = (await run.store.loadSession(made.id))!
    expect((await run.store.deckOf(made.id, version))?.boards?.['main']?.faces['front']?.base[0]).toMatchObject({ bind: { literal: '' } })
  })
})
