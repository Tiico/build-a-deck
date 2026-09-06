// Seeds the corpus with scripted sessions so the gate exists before the first real log.
// Real logs, exported from a running server, replace these over time.
import { join } from 'node:path'
import { CARD, Harness, SEATS, registry, twoSeatSetup } from '../test/fixture.js'
import { record, write } from './corpus.js'

const dir = join(import.meta.dirname, '../../../corpus')
const first = (ids: readonly string[]): string => {
  const id = ids[0]
  if (id === undefined) throw new Error('expected at least one id')
  return id
}

function full(): Harness {
  const h = new Harness(42)
  h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
  h.do(null, { v: 'seat.claim', seat: 'B', name: 'Bo' })
  h.do(null, { v: 'shuffle', pile: 'draw' })
  h.do(null, { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 3 })
  h.do('A', { v: 'move', component: h.top('hand:A'), to: 'table', x: 100, y: 40, rot: 90 })
  h.do('A', { v: 'flip', component: h.top('table'), face: 'front' })
  h.do('B', { v: 'peek', components: [h.top('hand:B')] })
  h.do('B', { v: 'showTo', components: [h.top('hand:B')], seats: ['A'] })
  h.do('B', { v: 'move', component: h.top('hand:B'), to: 'table', x: -100, y: 0 })
  h.do(null, { v: 'stack', component: first(h.zone('table')), onto: first(h.zone('table').slice(1)) })
  h.do(null, { v: 'movePile', pile: first(h.piles()), to: 'table', x: 0, y: 200 })
  h.batch('A', { v: 'draw', from: first(h.piles()), to: 'hand:A', count: 1 }, { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
  h.do('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
  h.do('B', { v: 'undo.self' })
  h.do('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
  h.do('A', { v: 'flag', note: 'Draken är för stark' })
  h.do(null, { v: 'split', pile: 'draw', at: 1, x: -50, y: -50 })
  h.do(null, { v: 'split', pile: 'draw', at: 1, to: 'discard' })
  h.do('A', { v: 'stack', component: h.top('hand:A'), onto: h.top('discard') })
  const p = h.do('A', { v: 'rewind.propose', toSeq: 6 })
  h.do('B', { v: 'rewind.confirm', proposal: p.batch })
  h.do('A', { v: 'seat.release', seat: 'A' })
  h.do(null, { v: 'setup.reset' })
  h.do(null, { v: 'shuffle', pile: 'draw' })
  h.do(null, { v: 'session.end' })
  return h
}

function versionChange(): Harness {
  const h = new Harness(7)
  h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
  h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
  const spec = (cardRef: string) => ({ type: CARD, cardRef, zone: 'draw', face: 'back' })
  const next = ['dragon', 'dragon', 'wizard', 'phoenix', 'priest', 'archer', 'golem', 'witch', 'bard', 'ogre'].map(spec)
  h.do(null, { v: 'version.change', to: 'v2', components: next })
  h.do('A', { v: 'draw', from: 'draw', to: 'table', count: 1 })
  h.do(null, { v: 'flag', observer: 'Eva', note: 'nu' })
  return h
}

for (const [name, h] of [
  ['scripted-full-round', full()],
  ['scripted-version-change', versionChange()],
] as const) {
  const file = write(record(name, 'v1', h.initial.setup, h.log, registry), dir)
  console.log(JSON.stringify({ msg: 'seeded', file, lines: h.log.length, viewers: SEATS.length + 1 }))
}
void twoSeatSetup
