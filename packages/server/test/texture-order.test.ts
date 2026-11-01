import { describe, expect, it } from 'vitest'
import { counterIds, initialState, replay, seededRng } from '@byd/engine'
import { MemoryRenderStore } from '@byd/render/queue'
import { MemoryLogStore, TableActor } from '../src/index.js'
import { CARDS, registry, twoSeatSetup } from './fixture.js'
import { deck } from './deck.js'

// Ett bords texturer efter beslut A i #1546 (beställaren 2026-11-01): starten väntar bara på det som
// syns när spelet startar, och resten av leken ritas i den ordning den dras. Efter en blandning ritas
// alltså högens kort i sin nya ordning, översta först.
const deps = () => ({ rng: seededRng(1), ids: counterIds('r'), now: () => '2026-11-01T00:00:00.000Z' })

async function table() {
  const store = new MemoryLogStore()
  const renders = new MemoryRenderStore()
  await store.createSession({ id: 's', version: 'v1', setup: twoSeatSetup(), deck })
  const actor = (await TableActor.load('s', registry, store, deps(), renders))!
  return { store, renders, actor }
}

describe('ett bords texturer i den ordning de syns och dras (#1546)', () => {
  it('låter starten vänta bara på det som syns: draghögens baksida, och inte de nedvända korten', async () => {
    const { actor } = await table()
    const faces = actor.faceHashes()
    expect(actor.textureHashes()).toEqual([faces['dragon']?.['back']])
  })

  it('ritar högens kort i dess nya ordning efter en blandning, översta först', async () => {
    const { store, renders, actor } = await table()
    const r = await actor.submit({ id: 'e1', seat: null, intents: [{ v: 'shuffle', pile: 'draw' }] })
    expect(r.ok).toBe(true)
    const state = replay(initialState('v1', twoSeatSetup(), registry), registry, await store.read('s'))
    const pile = state.zones['draw']!.order.map((id) => state.components[id]!.cardRef)
    expect(pile).not.toEqual(CARDS)
    const faces = actor.faceHashes()
    const fronts = pile.map((ref) => faces[ref]?.['front'] ?? '')
    const claimed: string[] = []
    for (let job = await renders.claim(0); job; job = await renders.claim(0)) claimed.push(job.hash)
    expect(claimed.filter((h) => fronts.includes(h))).toEqual(fronts)
  })
})
