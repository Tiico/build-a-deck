import { describe, expect, it } from 'vitest'
import { TUCKBOX } from '@byd/engine'
import { applyEdit, type EditIntent } from '../src/edits.js'
import { boxOf } from '../src/box.js'
import { openingSetup } from '../src/recipe.js'
import { changeOf, revertOf } from '../src/undo.js'
import { MemoryProjectStore } from '../src/index.js'
import { ProjectActor } from '../src/project-actor.js'
import { ProjectDoc } from '../src/projects.js'

// Spelets låda, steg 1 (#1412): dokumentet bär lådan — låsen, luften och ytornas mallar — och
// ändringen går genom samma redigeringslogg som allt annat (D3). Ett spel som aldrig rört lådan har
// ingen post, och dess låda är en tuckbox som följer leken.
const game = (antal = 108): ProjectDoc => ({
  name: 'Skogens råd',
  template: { faces: { front: { base: [], variants: {} }, back: { base: [], variants: {} } } },
  rows: [
    { id: 'kort-1', fields: { title: 'Ek', antal: antal - 8 } },
    { id: 'kort-2', fields: { title: 'Björk', antal: 8 } },
  ],
  icons: {},
  setup: openingSetup({ players: 2, counters: [] }),
})
const after = (doc: ProjectDoc, ...edits: EditIntent[]) => edits.reduce(applyEdit, doc)

describe('lådan ur dokumentet (#1412)', () => {
  it('är en tuckbox som följer leken när spelet aldrig rört den, och 108 kort ger 65 × 90 × 34,5 mm', () => {
    const doc = game()
    expect(doc).not.toHaveProperty('box')
    expect(boxOf(doc)).toMatchObject({ size: { width: 65, height: 90, depth: 34.5 }, holds: 108, over: 0, short: null })
    expect(boxOf(doc).type).toEqual(TUCKBOX)
  })

  it('räknar korten som bordet delar dem, med antal', () => {
    expect(boxOf(game(120)).size.depth).toBe(38)
  })

  it('läser ett dokument skrivet före lådan som det alltid lästs', () => {
    expect(ProjectDoc.parse(game())).not.toHaveProperty('box')
  })
})

describe('ett lås per mått (#1412)', () => {
  it('låser ett mått på värdet redigeringen bär, och låter det stå när leken växer', () => {
    const locked = after(game(), { v: 'lockBox', side: 'depth', mm: 34.5 })
    expect(locked.box).toEqual({ type: { id: 'box.tuck', version: 1 }, locked: { depth: 34.5 } })
    const grown = after(locked, { v: 'setCell', cardRef: 'kort-2', field: 'antal', value: 20 })
    expect(boxOf(grown)).toMatchObject({ size: { width: 65, height: 90, depth: 34.5 }, follows: { depth: 38 }, holds: 108, over: 12, short: 'depth' })
  })

  it('låter ett olåst mått följa leken', () => {
    const locked = after(game(), { v: 'lockBox', side: 'width', mm: 65 })
    const grown = after(locked, { v: 'setCell', cardRef: 'kort-2', field: 'antal', value: 20 })
    expect(boxOf(grown).size).toEqual({ width: 65, height: 90, depth: 38 })
  })

  it('följer leken igen när låset tas bort, och lämnar då inget kvar i dokumentet', () => {
    const doc = after(game(), { v: 'lockBox', side: 'depth', mm: 34.5 }, { v: 'lockBox', side: 'depth', mm: null })
    expect(doc).not.toHaveProperty('box')
  })

  it('vägrar ett mått som inte är ett mått, och en sida lådan inte har', () => {
    expect(() => applyEdit(game(), { v: 'lockBox', side: 'depth', mm: 0 })).toThrow()
    expect(() => applyEdit(game(), { v: 'lockBox', side: 'depth', mm: Number.NaN })).toThrow()
    expect(() => applyEdit(game(), { v: 'lockBox', side: 'diagonal' as never, mm: 30 })).toThrow(/diagonal/)
  })
})

describe('luften (#1412)', () => {
  it('går att ändra runt kortet och i djupet, och måtten följer den', () => {
    const doc = after(game(), { v: 'setBoxClearance', side: 'around', mm: 2 }, { v: 'setBoxClearance', side: 'depth', mm: 3 })
    expect(doc.box).toEqual({ type: { id: 'box.tuck', version: 1 }, clearance: { around: 2, depth: 3 } })
    expect(boxOf(doc).size).toEqual({ width: 67, height: 92, depth: 35.5 })
  })

  it('går tillbaka till typens luft med null', () => {
    const doc = after(game(), { v: 'setBoxClearance', side: 'around', mm: 2 }, { v: 'setBoxClearance', side: 'around', mm: null })
    expect(doc).not.toHaveProperty('box')
    expect(boxOf(doc).clearance).toEqual({ around: 1, depth: 2 })
  })

  it('vägrar negativ luft, och luft som inte är en kortficka utan en annan låda', () => {
    expect(() => applyEdit(game(), { v: 'setBoxClearance', side: 'around', mm: -1 })).toThrow()
    expect(() => applyEdit(game(), { v: 'setBoxClearance', side: 'depth', mm: 11 })).toThrow()
  })

  it('kan göra en låst bredd för smal för kortet', () => {
    const doc = after(game(), { v: 'lockBox', side: 'width', mm: 65 }, { v: 'setBoxClearance', side: 'around', mm: 2 })
    expect(boxOf(doc)).toMatchObject({ short: 'width', holds: 0, over: 108 })
  })
})

describe('lådan i loggen (#1412, D3, B4)', () => {
  it('tas tillbaka ett steg i taget, ett lås utan att röra luften', () => {
    const before = after(game(), { v: 'setBoxClearance', side: 'around', mm: 2 })
    const locked = applyEdit(before, { v: 'lockBox', side: 'depth', mm: 34.5 })
    // Bo ändrar luften i djupet medan Ada låser, och Adas steg tillbaka lämnar hans luft.
    const now = applyEdit(locked, { v: 'setBoxClearance', side: 'depth', mm: 3 })
    const step = revertOf(changeOf(before, locked), now)
    if (!step.ok || !step.edit) throw new Error(`refused: ${JSON.stringify(step)}`)
    expect(applyEdit(now, step.edit).box).toEqual({ type: { id: 'box.tuck', version: 1 }, clearance: { around: 2, depth: 3 } })
  })

  it('spelas upp identiskt ur loggen när aktören byggs om', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', game(), 'ada')
    const first = (await ProjectActor.load('p1', store))!
    await first.edit({ v: 'lockBox', side: 'depth', mm: 34.5 }, 'ada')
    await first.edit({ v: 'setBoxClearance', side: 'around', mm: 1.5 }, 'ada')
    await first.edit({ v: 'setCell', cardRef: 'kort-2', field: 'antal', value: 20 }, 'ada')
    const again = (await ProjectActor.load('p1', store))!
    expect(again.doc).toEqual(first.doc)
    expect(boxOf(again.doc)).toMatchObject({ size: { width: 66, height: 91, depth: 34.5 }, over: 12 })
  })

  it('sparas som en version och läses tillbaka med samma schema', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', game(), 'ada')
    const actor = (await ProjectActor.load('p1', store))!
    await actor.edit({ v: 'lockBox', side: 'height', mm: 92 }, 'ada')
    await actor.save()
    const saved = await store.load('p1')
    expect(saved?.box).toEqual({ type: { id: 'box.tuck', version: 1 }, locked: { height: 92 } })
    expect(() => ProjectDoc.parse(saved)).not.toThrow()
  })
})
