import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TILE_COIN } from '@byd/engine'
import { registerRoom, start, type Running } from './fixture.js'
import { template } from './deck.js'
import { markerRef } from '../src/material.js'
import { openingSetup } from '../src/recipe.js'

// Ett bord med markörer, över tjänsten (#1483): spelet startas ur ett projekt, trettio mynt ligger i
// Banken, och deras två sidor är texturer ur den enda renderaren (E2) som renderkön har fått, en
// gång för alla trettio. Myntets bild går genom tillgångarna som kortets (#1028).
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const COIN = { id: TILE_COIN.id, version: TILE_COIN.version }

function game(picture: string) {
  const opening = openingSetup({ players: 2, counters: [] })
  return {
    name: 'Myntspel',
    template,
    rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 2 } }],
    icons: {},
    setup: {
      ...opening,
      zones: [...opening.zones, { id: 'bank', kind: 'pile', name: 'Banken', visibility: 'all', geometry: { x: 300, y: 0, w: 0, h: 0, rot: 0 } }],
      markers: [
        {
          id: 'mynt',
          name: 'Mynt',
          type: COIN,
          count: 30,
          zone: 'bank',
          faces: { front: { base: [{ kind: 'image', id: 'art', x: -3, y: -3, w: 31, h: 31, bind: { literal: `asset:${picture}` } }], variants: {} } },
        },
      ],
    },
  }
}

describe('ett bord med markörer (#1483)', () => {
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

  it('lägger trettio mynt i Banken med samma två texturer i varje vy, och renderkön har dem', async () => {
    const { hash } = (await (await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: PNG })).json()) as { hash: string }
    expect((await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id: 'p1', ...game(hash) }) })).status).toBe(201)
    const made = (await (await fetch(`${run.http}/projects/p1/sessions`, { method: 'POST', headers: { cookie } })).json()) as { id: string; code: string; hostKey: string }
    registerRoom(made.id, made)
    const table = await run.connectTable(made.id, made.hostKey)
    const ada = await run.connect(made.id, 'A')
    await Promise.all([table.synced(0), ada.synced(0)])
    for (const view of [table.view!, ada.view!]) {
      const coins = view.components.filter((c) => c.type.id === COIN.id)
      expect(coins).toHaveLength(30)
      const first = coins[0]!
      expect(first).toMatchObject({ zone: 'bank', cardRef: markerRef('mynt'), title: 'Mynt' })
      expect(Object.keys(first.faces ?? {}).sort()).toEqual(['back', 'front'])
      for (const c of coins) expect(c.faces).toEqual(first.faces)
      for (const texture of Object.values(first.faces ?? {})) expect(await run.renders.status(texture)).toBeTruthy()
    }
    const { version } = (await run.store.loadSession(made.id))!
    expect((await run.store.deckOf(made.id, version))?.templates?.[markerRef('mynt')]?.faces['front']?.base[0]).toMatchObject({ bind: { literal: `asset:${hash}` } })
  }, 60_000)
})
