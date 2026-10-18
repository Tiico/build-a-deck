import { STANDARD_TYPES, TypeRegistry } from '@byd/engine'
import type { EnqueueResult, RenderRequest, RenderStore } from '@byd/render/queue'
import { deckFromProject, MemoryLogStore, TableActor } from '../../src/index.js'
import { setupFromProject } from '../../src/doc.js'
import { openingSetup } from '../../src/recipe.js'
import { template } from '../deck.js'

// Run by `heavy-table.test.ts` in a Node of its own with a small heap (#1012): a table of `CARDS`
// cards set in an uploaded typeface of `FONT_MB`, loaded the way the box loads one. Every card's
// page carries the typeface as a data URL (DRIFT §4), so the pages together weigh far more than
// the heap — which is fine as long as they are never all held at once.
const CARDS = Number(process.env['HEAVY_CARDS'] ?? 200)
const FONT_MB = Number(process.env['HEAVY_FONT_MB'] ?? 2)

const front = template.faces['front']!
const doc = {
  name: 'Tungt',
  template: { ...template, faces: { ...template.faces, front: { ...front, base: front.base.map((el) => (el.kind === 'text' ? { ...el, font: { ...el.font, family: 'Rubrik' } } : el)) } } },
  rows: Array.from({ length: CARDS }, (_, i) => ({ id: `kort-${i + 1}`, fields: { title: `Kort ${i + 1}`, antal: 1 } })),
  icons: {},
  setup: openingSetup({ players: 2, counters: [] }),
}
const deck = { ...deckFromProject(doc), fonts: { Rubrik: { stack: '"Rubrik", serif', src: `data:font/ttf;base64,${'A'.repeat(FONT_MB * 2 ** 20)}` } } }

const store = new MemoryLogStore()
await store.createSession({ id: 'tungt', version: 'rev-1', setup: setupFromProject(doc), deck })

// The queue keeps what it is handed in Postgres on the box; here it keeps the hashes only, so
// what is measured is what the app itself holds.
let queued = 0
const renders = { enqueue: async (_job: RenderRequest): Promise<EnqueueResult> => (queued++, 'queued') } as unknown as RenderStore
const actor = await TableActor.load('tungt', new TypeRegistry(STANDARD_TYPES), store, undefined, renders)
console.log(JSON.stringify({ loaded: actor !== null, queued, textures: actor?.textureHashes().length }))
