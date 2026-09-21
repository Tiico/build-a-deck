import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { projectDoc } from './project-doc.js'
import { LIBRARY } from '../src/editor/symbols.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { assetTypeDeclaring } from '@byd/protocol'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
// Every client this file opens, shut when its test ends.
//
// A ProjectClient that is left open keeps trying to reconnect for as long as the process lives,
// which is exactly what an editor in a browser should do. The fixture hands out eight ports per
// worker before it comes round to the first one again (see `claim`), so the ninth test binds the
// port the first test's client is still knocking on. It gets in, is handed *that* test's
// project, and lays its own pending edits on top — including `restore`, which is a whole
// document.
//
// That is this file's own earlier tests rewriting a later one's project underneath it. It showed
// as the font test losing the licence it had just set: the document was restored under the
// client, `useFont` no longer recognised the family, and the font was made a second time without
// the licence on it. Roughly one run in three with six copies of this file running at once, and
// never once on an idle machine (#109).
let opened: ProjectClient[] = []
const openClient = async (id: string): Promise<ProjectClient> => {
  const client = await ProjectClient.open({ http: run.http, id })
  opened.push(client)
  return client
}
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  // Before the server goes: a client shut afterwards would only start reconnecting.
  for (const client of opened) client.close()
  opened = []
  await run.stop()
})

describe('ProjectClient', () => {
  it('loads a project, edits rows and template locally, saves with its revision, and surfaces a stale save as a conflict', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    expect(client.doc.name).toBe('Skogens herrar')
    expect(client.rev).toBe(1)
    expect(client.dirty).toBe(false)

    client.setCell('dragon', 'title', 'Drakhona')
    client.patchElement('front', 'title', { font: { family: 'sans-serif', sizePt: 16, weight: 700 } })
    expect(client.dirty).toBe(true)
    expect(client.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')

    expect(await client.save()).toEqual({ ok: true, rev: 2 })
    expect(client.dirty).toBe(false)
    const stored = await run.projects.load(run.projectId)
    expect(stored?.rev).toBe(2)
    expect(stored?.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ font: { sizePt: 16 } })

    // Someone else saved in the meantime.
    await run.projects.replace(run.projectId, 2, { ...projectDoc(), name: 'Ändrad av annan' })
    client.setCell('knight', 'antal', '3')
    expect(await client.save()).toEqual({ ok: false, reason: 'conflict' })
    expect(client.dirty).toBe(true)
  })

  // Ctrl+Z is not the version history (B4). The history is a whole saving, named and comparable;
  // this is the step the designer just took. It travels as a `restore` edit, which is already how
  // taking a document back is said, so no new verb enters the vocabulary (#35).
  it('takes the last edit back, puts it forward again, and says what each step was', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    expect(client.canUndo).toBe(false)
    expect(client.undo()).toBeNull()

    client.setCell('dragon', 'title', 'Drakhona')
    client.rename('Skogens herrar v2')
    expect(client.canUndo).toBe(true)

    expect(client.undo()).toBe('undo.what.name')
    expect(client.doc.name).toBe('Skogens herrar')
    expect(client.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')

    expect(client.undo()).toBe('undo.what.deck')
    expect(client.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drake')
    expect(client.canUndo).toBe(false)

    expect(client.redo()).toBe('undo.what.deck')
    expect(client.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
    expect(client.redo()).toBe('undo.what.name')
    expect(client.doc.name).toBe('Skogens herrar v2')
    expect(client.canRedo).toBe(false)

    // A new edit is a new branch: what was taken back is not waiting to come forward any more.
    client.undo()
    client.setCell('knight', 'antal', '3')
    expect(client.canRedo).toBe(false)
  })

  it('starts a table from the saved project and returns the session id', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const session = await client.startTable()
    expect(session.id).toMatch(/[0-9a-f-]{36}/)
    expect(session.version).toBe('rev-1')
    expect((await run.store.loadSession(session.id))?.setup.components).toHaveLength(4)
  })
})

describe('refreshing a running table (C7, L5)', () => {
  it('saves unsaved edits, then pushes the current rev to the table as version.change', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const session = await client.startTable()
    client.setCell('dragon', 'antal', 5)
    const result = await client.refreshTable(session.id)
    expect(result).toEqual({ version: 'rev-2', seqs: [1] })
    expect(client.dirty).toBe(false)
    const log = await run.store.read(session.id)
    expect(log.map((l) => l.intent.v)).toEqual(['version.change'])
  })
})

describe('editing the template on the canvas (#18)', () => {
  const ids = (client: ProjectClient) => client.doc.template.faces['front']!.base.map((e) => e.id)
  const added = { kind: 'shape', id: 'shape-1', x: 1, y: 1, w: 5, h: 5, shape: 'rect' } as const

  it('adds an element on top, takes one away, and moves one in the stack — all through the one write path', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    expect(ids(client)).toEqual(['frame', 'title', 'body'])

    // A new element is drawn over the ones already there.
    client.addElement('front', added)
    expect(ids(client)).toEqual(['frame', 'title', 'body', 'shape-1'])
    expect(client.dirty).toBe(true)

    // The order in the base list is the drawing order; moving a layer moves it there.
    client.moveElement('front', 'shape-1', 1)
    expect(ids(client)).toEqual(['frame', 'shape-1', 'title', 'body'])
    client.moveElement('front', 'frame', 3)
    expect(ids(client)).toEqual(['shape-1', 'title', 'body', 'frame'])

    client.removeElement('front', 'title')
    expect(ids(client)).toEqual(['shape-1', 'body', 'frame'])

    // The change is the project's, so it saves and reloads like any other.
    expect(await client.save()).toEqual({ ok: true, rev: 2 })
    expect((await run.projects.load(run.projectId))?.template.faces['front']?.base.map((e) => e.id)).toEqual(['shape-1', 'body', 'frame'])
  })

  it('refuses an element whose id is already on the face, and a face that does not exist', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)

    // Something real is edited and saved first, so what follows is measured against a client that
    // has done work rather than against a fresh one, where "nothing was touched" is where it began.
    client.addElement('front', added)
    expect(await client.save()).toEqual({ ok: true, rev: 2 })
    expect(client.dirty).toBe(false)

    expect(() => client.addElement('front', { ...added, id: 'title' })).toThrow(/title/)
    expect(() => client.addElement('sida', added)).toThrow(/sida/)
    expect(client.dirty).toBe(false)

    // And the step back is still the one the designer took, not a refusal that took a turn on the
    // stack: the element she really added is what comes off it.
    expect(client.undo()).toBe('undo.what.template')
    expect(ids(client)).toEqual(['frame', 'title', 'body'])
    expect(client.canUndo).toBe(false)
  })

  // An edit that was refused never happened, so it costs neither a version nor a Ctrl+Z (#41,
  // B4). A patch to an id the face does not have used to hand back the same document without
  // saying anything: the designer saw nothing move and had spent a step back on it anyway.
  it('refuses a patch to an element the face does not have, and charges no step back for it', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)

    expect(() => client.patchElement('front', 'ingen', { x: 9 })).toThrow(/ingen/)
    expect(client.dirty).toBe(false)
    expect(client.canUndo).toBe(false)

    // And the patch the designer actually meant still goes through, and is a step back.
    client.patchElement('front', 'title', { x: 9 })
    expect(client.doc.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ x: 9 })
    expect(client.canUndo).toBe(true)
    expect(client.undo()).toBe('undo.what.template')
    expect(client.doc.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ x: 5 })
    expect(client.canUndo).toBe(false)
  })

  // One thing the designer did, reported many times over (#35): a drag is a patch per frame and a
  // cell is one per keystroke. The token says which of them belong together, and it is made where
  // the gesture begins — so the second grab of the same element is the second step back.
  it('puts every edit of one gesture on a single step back, and a new gesture on its own', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const title = () => client.doc.template.faces['front']?.base.find((e) => e.id === 'title') as { x: number; y: number } | undefined
    const y = () => title()?.y

    client.patchElement('front', 'title', { y: 6 }, undefined, 'grab-1')
    client.patchElement('front', 'title', { y: 7 }, undefined, 'grab-1')
    client.patchElement('front', 'title', { y: 8 }, undefined, 'grab-1')
    expect(y()).toBe(8)

    expect(client.undo()).toBe('undo.what.template')
    expect(y()).toBe(5)
    expect(client.canUndo).toBe(false)
    // And the whole of it comes forward again, not the last frame of it.
    expect(client.redo()).toBe('undo.what.template')
    expect(y()).toBe(8)

    client.patchElement('front', 'title', { y: 12 }, undefined, 'grab-2')
    client.patchElement('front', 'title', { y: 16 }, undefined, 'grab-2')
    expect(client.undo()).toBe('undo.what.template')
    expect(y()).toBe(8)

    // An edit with no token of its own is a whole change, even between two of the same gesture:
    // the property panel wrote it, and the gesture that was open is closed by it.
    client.patchElement('front', 'title', { y: 20 }, undefined, 'grab-3')
    client.patchElement('front', 'title', { x: 9 })
    client.patchElement('front', 'title', { y: 24 }, undefined, 'grab-3')
    expect(client.undo()).toBe('undo.what.template')
    expect(y()).toBe(20)
    expect(client.undo()).toBe('undo.what.template')
    expect(client.doc.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ x: 5, y: 20 })
  })

  // The step back is half of it; the step forward is the other half. A new edit is a new branch,
  // so it throws away what was waiting to come forward — and a refused edit is not a new edit. It
  // must leave the way forward exactly where it was, or a refusal would quietly cost the designer
  // the redo as well as nothing else (#41, B4).
  it('leaves the step forward alone when an edit is refused', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)

    client.patchElement('front', 'title', { x: 9 })
    expect(client.undo()).toBe('undo.what.template')
    expect(client.canRedo).toBe(true)

    expect(() => client.patchElement('front', 'ingen', { x: 9 })).toThrow(/ingen/)
    expect(client.canRedo).toBe(true)

    // And it is the same step forward, not merely a stack with something on it.
    expect(client.redo()).toBe('undo.what.template')
    expect(client.doc.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ x: 9 })
  })
})

describe('the tables a project has (#19)', () => {
  it('lists them newest first, with the version each runs and whether it has ended', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    expect(await client.tables()).toEqual([])

    const older = await client.startTable()
    const newer = await client.startTable()
    expect(await client.tables()).toEqual([
      { id: newer.id, version: 'rev-1', ended: false, lastAt: null },
      { id: older.id, version: 'rev-1', ended: false, lastAt: null },
    ])
  })
})

// A group is a rule on a column (#13): the column is the faces' `variantBy`, the value is the
// variant's key, and what the designer changes with a group open becomes that group's override
// on that face. The base is never touched by it, and no card is ever named.
describe('grouping cards and letting the group rule a face (#13)', () => {
  const front = (client: ProjectClient) => client.doc.template.faces['front']!
  const back = (client: ProjectClient) => client.doc.template.faces['back']!
  const open = async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    return openClient(created.id)
  }

  it('groups the whole deck by one column, on every face, and ungroups it again', async () => {
    const client = await open()
    client.setGroupColumn('typ')
    expect(front(client).variantBy).toBe('typ')
    expect(back(client).variantBy).toBe('typ')
    expect(client.dirty).toBe(true)

    client.setGroupColumn(null)
    expect(front(client).variantBy).toBeUndefined()
    expect(back(client).variantBy).toBeUndefined()
  })

  it('turns an edit made with a group open into that group’s override, leaving the base alone', async () => {
    const client = await open()
    client.setGroupColumn('typ')
    client.patchElement('front', 'title', { x: 9 }, 'fälla')

    expect(front(client).base.find((e) => e.id === 'title')).toMatchObject({ x: 5 })
    expect(front(client).variants['fälla']?.override).toMatchObject([{ id: 'title', x: 9 }])

    // A second edit sharpens the same override rather than making a second one.
    client.patchElement('front', 'title', { y: 12 }, 'fälla')
    expect(front(client).variants['fälla']?.override).toMatchObject([{ id: 'title', x: 9, y: 12 }])
  })

  it('gives the group a back of its own without disturbing the base’s back', async () => {
    const client = await open()
    client.setGroupColumn('typ')
    client.patchElement('back', 'bg', { fill: '#3a1c1c' }, 'fälla')
    expect(back(client).base).toMatchObject([{ id: 'bg', fill: '#2f4068' }])
    expect(back(client).variants['fälla']?.override).toMatchObject([{ id: 'bg', fill: '#3a1c1c' }])
  })

  it('adds an element for the group only, and takes a base element away for the group only', async () => {
    const client = await open()
    client.setGroupColumn('typ')
    const stamp = { kind: 'shape', id: 'stamp', x: 40, y: 70, w: 10, h: 10, shape: 'circle' } as const

    client.addElement('front', stamp, 'fälla')
    expect(front(client).base.map((e) => e.id)).toEqual(['frame', 'title', 'body'])
    expect(front(client).variants['fälla']?.override?.map((e) => e.id)).toEqual(['stamp'])

    client.removeElement('front', 'body', 'fälla')
    expect(front(client).base.map((e) => e.id)).toEqual(['frame', 'title', 'body'])
    expect(front(client).variants['fälla']?.remove).toEqual(['body'])

    // Taking away what the group itself added is not a removal against the base: it just goes.
    client.removeElement('front', 'stamp', 'fälla')
    expect(front(client).variants['fälla']?.override).toEqual([])
    expect(front(client).variants['fälla']?.remove).toEqual(['body'])
  })

  it('lets a layer fall back to the base, which is how a group stops overriding it', async () => {
    const client = await open()
    client.setGroupColumn('typ')
    client.patchElement('front', 'title', { x: 9 }, 'fälla')
    client.removeElement('front', 'body', 'fälla')

    client.resetElement('front', 'title', 'fälla')
    client.resetElement('front', 'body', 'fälla')
    expect(front(client).variants['fälla']?.override).toEqual([])
    expect(front(client).variants['fälla']?.remove).toEqual([])
  })

  it('saves and reloads the group as part of the project, like every other template change', async () => {
    const client = await open()
    client.setGroupColumn('typ')
    client.patchElement('front', 'title', { color: '#e74c3c' }, 'fälla')
    expect(await client.save()).toEqual({ ok: true, rev: 2 })
    const stored = await run.projects.load(run.projectId)
    expect(stored?.template.faces['front']?.variantBy).toBe('typ')
    expect(stored?.template.faces['front']?.variants['fälla']?.override).toMatchObject([{ id: 'title', color: '#e74c3c' }])
  })
})

// "Unsaved" has to mean the document differs from the one the server holds, not that something
// was typed (#8): a guard that fires over a deck nobody changed is worse than no guard at all.
describe('what counts as unsaved (#8)', () => {
  it('stays saved when an edit writes the value that was already there, and goes back to saved when an edit is taken back by hand', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)

    client.setCell('dragon', 'title', 'Drake')
    expect(client.dirty).toBe(false)

    client.setCell('dragon', 'title', 'Drakhona')
    expect(client.dirty).toBe(true)

    client.setCell('dragon', 'title', 'Drake')
    expect(client.dirty).toBe(false)
  })

  it('says nothing changed when a template edit lands on the values the element already had', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)

    client.patchElement('front', 'title', { x: 5, y: 5 })
    expect(client.dirty).toBe(false)
    // It is still an edit the designer made, and it is still a step back: what #41 refuses is an
    // id the face does not have, never a patch that happens to land on the values already there.
    // A guard that read "the document did not change, so refuse" would take this one with it.
    expect(client.canUndo).toBe(true)

    client.patchElement('front', 'title', { x: 6 })
    expect(client.dirty).toBe(true)
  })
})

describe('the setup in the editor (B5, K2)', () => {
  it('turns the recipe, adds and removes free zones, moves and reshapes a zone, and saves it all', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    expect(client.recipe).toEqual({ players: 2, counters: [] })

    client.setRecipe({ ...client.recipe, players: 3, counters: [{ name: 'Poäng', start: 0 }] })
    expect(client.doc.setup.seats).toEqual(['A', 'B', 'C'])
    expect(client.doc.setup.zones.find((z) => z.id === 'hand:C')?.owner).toBe('C')
    expect(client.recipe.players).toBe(3)
    // Räknarna behöver en zon per plats, och den ger designern dem — i en edit (B5).
    client.addSeatZone('counters')
    expect(client.doc.setup.zones.filter((z) => z.id.startsWith('counters:')).map((z) => z.owner)).toEqual(['A', 'B', 'C'])

    const altar = client.addZone('area')
    const bag = client.addZone('pile')
    expect(altar).not.toBe(bag)
    expect(client.doc.setup.zones.find((z) => z.id === altar)).toMatchObject({ kind: 'area', visibility: 'all', geometry: { w: 300, h: 120 } })
    expect(client.doc.setup.zones.find((z) => z.id === bag)).toMatchObject({ kind: 'pile', visibility: 'all', geometry: { w: 0, h: 0 } })

    client.patchZone(altar, { name: 'Altaret', geometry: { x: 10, y: 20, w: 250, h: 100, rot: 0 }, visibility: 'owner', owner: 'B' })
    expect(client.doc.setup.zones.find((z) => z.id === altar)).toMatchObject({ name: 'Altaret', geometry: { x: 10, y: 20, w: 250, h: 100 }, visibility: 'owner', owner: 'B' })
    client.patchZone(altar, { owner: undefined })
    expect(client.doc.setup.zones.find((z) => z.id === altar)?.owner).toBeUndefined()
    client.removeZone(bag)
    expect(client.doc.setup.zones.some((z) => z.id === bag)).toBe(false)
    // Filten, händerna och lekens hög står fast; leken flyttar, och då går draghögen att ta bort.
    expect(() => client.removeZone('table')).toThrow()
    expect(() => client.removeZone('hand:A')).toThrow()
    expect(() => client.removeZone('draw')).toThrow()
    const deck = client.addZone('pile')
    client.setDeck(deck)
    client.removeZone('draw')
    expect(client.doc.setup.deckZone).toBe(deck)
    expect(client.doc.setup.zones.some((z) => z.id === 'draw')).toBe(false)
    expect(client.doc.setup.zones.filter((z) => z.kind === 'hand').every((z) => z.returnTo === deck)).toBe(true)

    expect(await client.save()).toEqual({ ok: true, rev: 2 })
    const stored = await run.projects.load(run.projectId)
    expect(stored?.setup.seats).toEqual(['A', 'B', 'C'])
    expect(stored?.setup.zones.find((z) => z.id === altar)?.name).toBe('Altaret')
    expect(stored?.setup.counters).toEqual([{ name: 'Poäng', start: 0 }])
  })
})

describe('images (E1)', () => {
  it('uploads an image once and gets its hash back, the same hash for the same bytes', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    // A whole PNG signature, because the server reads the file rather than its name (#204).
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
    const file = new File([png], 'drake.png', { type: 'image/png' })
    const hash = await client.uploadAsset(file, 'image')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await client.uploadAsset(file, 'image')).toBe(hash)
    const served = await fetch(`${run.http}/assets/${hash}`)
    expect(served.status).toBe(200)
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(png)
    // The refusal used to read «bara bilder och typsnittsfiler kan laddas upp», which was the one
    // message for two different noes: the upload declared nothing the tool knew, or the bytes were
    // not the kind it declared. The kind is the caller's own word now (#312), so only the second
    // can happen and the message can say which formats were expected instead of blaming the file
    // for being the wrong sort.
    await expect(client.uploadAsset(new File(['x'], 'x.txt', { type: 'text/plain' }), 'image')).rejects.toThrow(/PNG/)
    // And a file that is named like a picture but is not one is refused just as plainly.
    await expect(client.uploadAsset(new File(['<b>hej</b>'], 'drake.png', { type: 'image/png' }), 'image')).rejects.toThrow(/PNG/)
  })
})

describe('symbols (E4)', () => {
  it('takes a symbol into the project: the bytes become an asset, the set gets the name, and the licence is kept beside it', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const skold = LIBRARY.find((s) => s.id === 'skold')!

    const name = await client.useSymbol(skold)
    expect(name).toBe('sköld')
    expect(client.doc.icons['sköld']).toMatch(/^asset:[0-9a-f]{64}$/)
    expect(client.doc.credits?.['sköld']).toEqual({ licence: skold.licence, by: skold.by, source: skold.id })
    // The symbol is served from the project's own assets, not from the library.
    const served = await fetch(`${run.http}/assets/${client.doc.icons['sköld']!.slice('asset:'.length)}`)
    expect(served.headers.get('content-type')).toBe('image/svg+xml')
    expect(await served.text()).toBe(skold.svg)

    // The same symbol again is the same entry, not a second name.
    expect(await client.useSymbol(skold)).toBe('sköld')
    expect(Object.keys(client.doc.icons)).toEqual(['sköld'])
    // A second, different symbol under a name already taken gets a name of its own.
    const svard = LIBRARY.find((s) => s.id === 'svard')!
    expect(await client.useSymbol(svard, 'sköld')).toBe('sköld-2')

    client.renameIcon('sköld-2', 'anfall')
    expect(client.doc.icons['sköld-2']).toBeUndefined()
    expect(client.doc.credits?.['anfall']?.source).toBe('svard')
    client.removeIcon('anfall')
    expect(client.doc.icons['anfall']).toBeUndefined()
    expect(client.doc.credits?.['anfall']).toBeUndefined()

    expect(await client.save()).toEqual({ ok: true, rev: 2 })
    const stored = await run.projects.load(run.projectId)
    expect(stored?.icons['sköld']).toBe(client.doc.icons['sköld'])
    expect(stored?.credits).toEqual({ 'sköld': { licence: 'CC0-1.0', by: 'build-your-deck', source: 'skold' } })
  })
})

// The icon placed from the tool row (#33): the symbol has to be in the game before an element can
// show it, and the designer asked for both with one press. So it is one edit — and the licence
// travels with it exactly as it does when a symbol is taken in from the Symboler tab (E4).
describe('an icon placed on the card (#33, E4)', () => {
  it('takes the symbol in and places the element as one edit, and a second placing is a second element and not a second symbol', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const svard = LIBRARY.find((s) => s.id === 'svard')!

    expect(await client.placeIcon(svard, 'front', null)).toBe('icon-1')
    expect(client.doc.icons['svärd']).toMatch(/^asset:[0-9a-f]{64}$/)
    expect(client.doc.credits?.['svärd']).toEqual({ licence: svard.licence, by: svard.by, source: svard.id })
    // Bound to the name and not to a column: this icon is the card's, not the row's.
    expect(client.doc.template.faces['front']?.base.at(-1)).toMatchObject({ kind: 'icons', id: 'icon-1', bind: { literal: 'svärd' } })

    // One edit, so one step back takes the element and the symbol together (B4).
    expect(client.undo()).toBe('undo.what.template')
    expect(client.doc.icons['svärd']).toBeUndefined()
    expect(client.doc.template.faces['front']?.base.some((e) => e.id === 'icon-1')).toBe(false)
    client.redo()
    expect(client.doc.icons['svärd']).toMatch(/^asset:[0-9a-f]{64}$/)

    // The same symbol again is a second element showing the one entry the game has, not a second
    // entry under a name of its own — the bytes are the same bytes, and so is the licence.
    expect(await client.placeIcon(svard, 'front', null)).toBe('icon-2')
    expect(Object.keys(client.doc.icons)).toEqual(['svärd'])
  })

  // Uploading the bytes takes as long as the network takes, and the face is what the free id is
  // worked out from. Two presses that overlap — or somebody else in the game adding an element
  // while the upload is in flight (D3) — both read the face as it was before either landed, and
  // both mint `icon-1`. The second is refused by the template, and because `edit` applies before
  // it records, the whole placement is thrown away and the designer is told an error instead of
  // being handed the icon she asked for.
  it('gives each of two placements that overlap an element of its own', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const svard = LIBRARY.find((s) => s.id === 'svard')!
    const skold = LIBRARY.find((s) => s.id === 'skold')!

    const [first, second] = await Promise.all([client.placeIcon(svard, 'front', null), client.placeIcon(skold, 'front', null)])

    expect(new Set([first, second])).toEqual(new Set(['icon-1', 'icon-2']))
    const ids = client.doc.template.faces['front']!.base.map((e) => e.id)
    expect(ids).toContain(first)
    expect(ids).toContain(second)
    // Both symbols came into the game with their elements, and each element shows its own.
    expect(Object.keys(client.doc.icons).sort()).toEqual(['sköld', 'svärd'])
    const shows = (id: string) => client.doc.template.faces['front']!.base.find((e) => e.id === id) as { bind: { literal: string } }
    expect(new Set([shows(first).bind.literal, shows(second).bind.literal])).toEqual(new Set(['svärd', 'sköld']))
  })
})

describe('the type the game is set in (B3)', () => {
  it('takes a font file into the project, names the family from the file, and keeps the licence the designer states', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const file = new File([new Uint8Array([119, 79, 70, 50, 0, 1, 0, 0])], 'Rubrikserif.woff2', { type: 'font/woff2' })

    const family = await client.useFont(file)
    expect(family).toBe('Rubrikserif')
    expect(client.doc.fonts?.[family]?.asset).toMatch(/^asset:[0-9a-f]{64}$/)
    // The family is written first and a generic stack behind it, so a card still reads if the
    // file ever fails to load.
    expect(client.doc.fonts?.[family]?.stack).toBe('"Rubrikserif", sans-serif')
    // Nothing about a file says what it is licensed under; only the designer does.
    expect(client.doc.fonts?.[family]?.licence).toBeUndefined()
    client.setFontLicence(family, { licence: 'OFL-1.1', by: 'Typverket', source: 'Rubrikserif.woff2' })
    expect(client.doc.fonts?.[family]?.licence).toEqual({ licence: 'OFL-1.1', by: 'Typverket', source: 'Rubrikserif.woff2' })

    // The same file again is the same family, not a second one beside it.
    expect(await client.useFont(file)).toBe('Rubrikserif')
    expect(Object.keys(client.doc.fonts ?? {})).toEqual(['sans-serif', 'system-ui', 'Rubrikserif'])

    expect(await client.save()).toEqual({ ok: true, rev: 2 })
    const stored = await run.projects.load(run.projectId)
    expect(stored?.fonts?.['Rubrikserif']?.licence?.by).toBe('Typverket')

    client.removeFont(family)
    expect(client.doc.fonts?.[family]).toBeUndefined()
  })

  // What a browser actually hands over. `File.type` for a typeface is very often the empty string
  // and, where it is not, it is a name of the platform's choosing rather than one of ours — so the
  // declaration the upload carried was never the file's own word about itself. The test above
  // states `font/woff2` by hand and therefore never asked the question (#312).
  //
  // The bytes are real for the same reason they are elsewhere here: a Blob that stringified to
  // `[object Blob]` once passed every upload test in this suite, so a test that does not send a
  // file the server can sniff is a test that proves nothing.
  it.each([
    ['a WOFF2 the browser had no name for', new Uint8Array([119, 79, 70, 50, 0, 1, 0, 0]), 'Rubrikserif.woff2'],
    ['a TTF, whose name differs from ours where the browser has one at all', new Uint8Array([0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0]), 'Rubrikgrotesk.ttf'],
  ])('takes %s', async (_what, bytes, name) => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    // Exactly what Chrome, Safari and Firefox hand over for these on macOS: no type at all.
    const file = new File([bytes], name, { type: '' })
    expect(file.type).toBe('')
    const family = await client.useFont(file)
    expect(client.doc.fonts?.[family]?.asset).toMatch(/^asset:[0-9a-f]{64}$/)
  })

  // And the refusal that is left says what was wrong with the file rather than blaming its kind:
  // the declaration is the client's own now, so a 415 can only mean the bytes are not that kind.
  it('says which formats a typeface may be in when the bytes are not one', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const notAFont = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'Rubrik.ttf', { type: '' })
    // Formatnamnen är verktygets ord och är desamma för varje läsare; «eller» är det inte, och
    // kommer därför ur katalogen (A4). En engelsk läsare får samma rad med «or».
    await expect(client.useFont(notAFont)).rejects.toThrow(/WOFF2, WOFF, TTF eller OTF/)
  })
})

describe('the history (B4)', () => {
  it('lists the versions, opens an older one, names it, and brings it back as a new version', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    client.setCell('dragon', 'title', 'Drakhona')
    expect(await client.save()).toEqual({ ok: true, rev: 2 })

    const versions = await client.versions()
    expect(versions.map((v) => v.rev)).toEqual([2, 1])
    expect(versions.every((v) => typeof v.at === 'string')).toBe(true)

    const first = await client.at(1)
    expect(first?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drake')
    expect(await client.at(9)).toBeNull()

    await client.nameVersion(1, 'Första blindtestet')
    expect((await client.versions()).find((v) => v.rev === 1)?.label).toBe('Första blindtestet')
    await client.nameVersion(1, null)
    expect((await client.versions()).find((v) => v.rev === 1)?.label).toBeUndefined()

    // Bringing an old version back is an edit like any other: it becomes the next version.
    await client.restore(1)
    expect(client.dirty).toBe(true)
    expect(client.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drake')
    expect(await client.save()).toEqual({ ok: true, rev: 3 })
    expect((await client.versions()).map((v) => v.rev)).toEqual([3, 2, 1])
    // And the version it came from is untouched.
    expect((await client.at(2))?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
  })
})

// A click in the symbol library used to wait for the network before anything happened (#310).
// An asset is named by the hash of its bytes and by nothing else, so that name is knowable here,
// before the bytes have travelled — and once it is known, the whole click stops needing the
// network to decide anything. Measured on a project of 308 cards and 15 versions, a click cost
// one round trip every time: 4.9 ms on the loopback, 124.5 ms with 120 ms of latency, whether
// the game already had the symbol or not.
describe('a click in the symbol library does not wait for the network (#310, E4)', () => {
  // Every call `fetch` makes while the body runs, and the bodies the calls were given.
  const watching = async <T,>(body: () => Promise<T>): Promise<{ out: T; calls: string[] }> => {
    const real = globalThis.fetch
    const calls: string[] = []
    globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push(`${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`)
      return real(input, init)
    }) as typeof fetch
    try {
      return { out: await body(), calls }
    } finally {
      globalThis.fetch = real
    }
  }

  it('costs nothing at all on the wire once the game already has the symbol', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const svard = LIBRARY.find((s) => s.id === 'svard')!

    const first = await watching(() => client.useSymbol(svard))
    expect(first.out).toBe('svärd')
    expect(first.calls).toEqual(['POST /assets'])

    // The bytes are already there and so is the entry, so the second press asks nobody anything.
    const again = await watching(() => client.useSymbol(svard))
    expect(again.out).toBe('svärd')
    expect(again.calls).toEqual([])

    // And placing it on a card is a template edit and nothing more: the symbol is in the set.
    const placed = await watching(() => client.placeIcon(svard, 'front', null))
    expect(placed.calls).toEqual([])
    expect(client.doc.template.faces['front']?.base.at(-1)).toMatchObject({ id: placed.out, bind: { literal: 'svärd' } })
  })

  it('places a symbol the game has never seen without waiting for its bytes to land', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const skold = LIBRARY.find((s) => s.id === 'skold')!

    // An upload that has not answered yet, and never will until it is let go.
    const real = globalThis.fetch
    let land: () => void = () => undefined
    const landed = new Promise<void>((resolve) => {
      land = resolve
    })
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (new URL(String(input)).pathname === '/assets') await landed
      return real(input, init)
    }) as typeof fetch
    try {
      const placing = client.placeIcon(skold, 'front', null)
      // The symbol is in the game and on the card while the bytes are still in the air.
      await vi.waitFor(() => expect(client.doc.icons['sköld']).toMatch(/^asset:[0-9a-f]{64}$/))
      expect(client.doc.template.faces['front']?.base.some((e) => e.kind === 'icons')).toBe(true)
      land()
      const id = await placing
      // And the ref the document took is the one the service ends up holding: the name of an
      // asset is the hash of its bytes, so what was worked out here is what came back.
      const served = await fetch(`${run.http}/assets/${client.doc.icons['sköld']!.slice('asset:'.length)}`)
      expect(await served.text()).toBe(skold.svg)
      expect(client.doc.template.faces['front']?.base.some((e) => e.id === id)).toBe(true)
    } finally {
      globalThis.fetch = real
    }
  })

  // A symbol that appears and then vanishes without a word is worse than one that is slow. The
  // placement is taken back exactly as a gesture called off is — nothing that happened, no row in
  // the history — and the caller is told, which is what the surface turns into a notice.
  it('leaves the document exactly as it was when the bytes never arrive, and says so', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const skold = LIBRARY.find((s) => s.id === 'skold')!
    const before = client.doc

    const real = globalThis.fetch
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (new URL(String(input)).pathname === '/assets') return new Response('nope', { status: 500 })
      return real(input, init)
    }) as typeof fetch
    try {
      await expect(client.placeIcon(skold, 'front', null)).rejects.toThrow()
    } finally {
      globalThis.fetch = real
    }
    expect(client.doc.icons['sköld']).toBeUndefined()
    expect(client.doc.template.faces['front']?.base.some((e) => e.kind === 'icons')).toBe(false)
    expect(client.doc.template.faces['front']?.base.map((e) => e.id)).toEqual(before.template.faces['front']?.base.map((e) => e.id))
    // Nothing that happened: the way back is not a row in the history either.
    expect(client.canUndo).toBe(false)
  })

  // The whole of this rests on the service naming an asset by the hash of its bytes and by
  // nothing else. A service that answered with some other name would leave the symbol in the
  // document pointing where its bytes are not, which is the same fault as bytes that never
  // arrived and is taken back the same way.
  it('takes the placement back when the bytes arrive under a name that is not their own', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const skold = LIBRARY.find((s) => s.id === 'skold')!

    const real = globalThis.fetch
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (new URL(String(input)).pathname === '/assets') {
        await real(input, init)
        return Response.json({ hash: 'c'.repeat(64) })
      }
      return real(input, init)
    }) as typeof fetch
    try {
      await expect(client.useSymbol(skold)).rejects.toThrow(/annat namn/)
    } finally {
      globalThis.fetch = real
    }
    expect(client.doc.icons['sköld']).toBeUndefined()
    expect(client.canUndo).toBe(false)
  })
})

// A typeface and a picture used to do the opposite of the symbol (#339): upload first, and read
// the document afterwards to see whether the game already had the file. Their names are the hash
// of their bytes too, so the same treatment applies — the entry is in the document before the
// bytes have travelled, a file the game already has never touches the wire, and an upload that
// fails takes the entry back the way a placement is taken back.
describe('a typeface and a picture do not wait for the network either (#339)', () => {
  const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
  const WOFF2 = new Uint8Array([119, 79, 70, 50, 0, 1, 0, 0])
  // Every call `fetch` makes while the body runs, with the bytes of each body: a Blob that
  // stringified to `[object Blob]` once passed every upload test here, so the stub reads what it
  // was given and a test can check that the bytes that left are the file's own.
  const watching = async <T,>(body: () => Promise<T>): Promise<{ out: T; calls: { call: string; type: string | undefined; bytes: Uint8Array }[] }> => {
    const real = globalThis.fetch
    const calls: { call: string; type: string | undefined; bytes: Uint8Array }[] = []
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const sent = init?.body instanceof Blob ? new Uint8Array(await init.body.arrayBuffer()) : new Uint8Array()
      calls.push({ call: `${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`, type: new Headers(init?.headers).get('content-type') ?? undefined, bytes: sent })
      return real(input, init)
    }) as typeof fetch
    try {
      return { out: await body(), calls }
    } finally {
      globalThis.fetch = real
    }
  }

  it('costs nothing on the wire for a picture the game already has', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const file = new File([PNG], 'drake.png', { type: 'image/png' })

    const first = await watching(() => client.addPicture(file))
    expect(first.calls.map((c) => c.call)).toEqual(['POST /assets'])
    expect(first.calls[0]?.bytes).toEqual(PNG)
    expect(client.doc.pictures?.[first.out]).toEqual({ name: 'drake.png' })

    const before = client.doc
    const again = await watching(() => client.addPicture(file))
    expect(again.out).toBe(first.out)
    expect(again.calls).toEqual([])
    // The name rule is the one `addPicture` already had: the same bytes under the same name
    // leave the record as it was.
    expect(client.doc.pictures).toEqual(before.pictures)
  })

  // An upload that has not answered yet, and never will until it is let go.
  const holding = (): { land: () => void; landed: Promise<void> } => {
    let land: () => void = () => undefined
    const landed = new Promise<void>((resolve) => {
      land = resolve
    })
    return { land, landed }
  }

  it('holds a picture the game has never seen before its bytes have landed, and sends them once as a picture', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const file = new File([PNG], 'drake.png', { type: 'image/png' })

    const { land, landed } = holding()
    const real = globalThis.fetch
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (new URL(String(input)).pathname === '/assets') await landed
      return real(input, init)
    }) as typeof fetch
    try {
      const adding = watching(() => client.addPicture(file))
      // The picture is in the game while the bytes are still in the air.
      await vi.waitFor(() => expect(Object.values(client.doc.pictures ?? {})).toEqual([{ name: 'drake.png' }]))
      land()
      const { out: hash, calls } = await adding
      expect(calls.map((c) => c.call)).toEqual(['POST /assets'])
      expect(calls[0]?.type).toBe(assetTypeDeclaring('image'))
      expect(calls[0]?.bytes).toEqual(PNG)
      // And the hash the document took is the one the service ends up holding.
      expect(client.doc.pictures?.[hash]).toEqual({ name: 'drake.png' })
      const served = await fetch(`${run.http}/assets/${hash}`)
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG)
    } finally {
      globalThis.fetch = real
    }
  })

  it('costs nothing on the wire for a typeface the game already has', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const file = new File([WOFF2], 'Rubrikserif.woff2', { type: '' })

    const first = await watching(() => client.useFont(file))
    expect(first.out).toBe('Rubrikserif')
    expect(first.calls.map((c) => c.call)).toEqual(['POST /assets'])
    expect(first.calls[0]?.bytes).toEqual(WOFF2)

    const before = client.doc
    const again = await watching(() => client.useFont(file))
    expect(again.out).toBe('Rubrikserif')
    expect(again.calls).toEqual([])
    expect(client.doc).toBe(before)
  })

  it('holds a typeface the game has never seen before its bytes have landed, and sends them once as a typeface', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const file = new File([WOFF2], 'Rubrikserif.woff2', { type: '' })

    const { land, landed } = holding()
    const real = globalThis.fetch
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (new URL(String(input)).pathname === '/assets') await landed
      return real(input, init)
    }) as typeof fetch
    try {
      const using = watching(() => client.useFont(file))
      await vi.waitFor(() => expect(client.doc.fonts?.['Rubrikserif']?.asset).toMatch(/^asset:[0-9a-f]{64}$/))
      land()
      const { out: family, calls } = await using
      expect(family).toBe('Rubrikserif')
      expect(calls.map((c) => c.call)).toEqual(['POST /assets'])
      expect(calls[0]?.type).toBe(assetTypeDeclaring('font'))
      expect(calls[0]?.bytes).toEqual(WOFF2)
      const served = await fetch(`${run.http}/assets/${client.doc.fonts!['Rubrikserif']!.asset!.slice('asset:'.length)}`)
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(WOFF2)
    } finally {
      globalThis.fetch = real
    }
  })

  // A typeface that appears and then vanishes without a word is worse than one that is slow. The
  // entry is taken back exactly as a placement is (#310): nothing that happened, no row in the
  // history — and the caller is told, in words that name what went and why (L37).
  it.each([
    ['a picture', (client: ProjectClient) => client.addPicture(new File([PNG], 'drake.png', { type: 'image/png' })), /^Bilden drake\.png kunde inte laddas upp och har tagits bort igen: tjänsten svarade 500$/],
    ['a typeface', (client: ProjectClient) => client.useFont(new File([WOFF2], 'Rubrikserif.woff2', { type: '' })), /^Typsnittet Rubrikserif kunde inte laddas upp och har tagits bort igen: tjänsten svarade 500$/],
  ])('leaves the document exactly as it was when the bytes of %s never arrive, and says so', async (_what, take, said) => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    // A step already taken, so that the way back has something on it to be left alone.
    client.setCell('dragon', 'title', 'Drakhona')
    const before = client.doc
    expect(client.canUndo).toBe(true)

    const real = globalThis.fetch
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (new URL(String(input)).pathname === '/assets') return new Response('nope', { status: 500 })
      return real(input, init)
    }) as typeof fetch
    try {
      await expect(take(client)).rejects.toThrow(said)
    } finally {
      globalThis.fetch = real
    }
    expect(client.doc).toEqual(before)
    expect(client.canUndo).toBe(true)
    expect(client.undo()).toBe('undo.what.deck')
    expect(client.canUndo).toBe(false)
  })

  // The service naming an asset by anything but the hash of its bytes would leave the entry
  // pointing where the bytes are not, which is the same fault as bytes that never arrived.
  it.each([
    ['a picture', (client: ProjectClient) => client.addPicture(new File([PNG], 'drake.png', { type: 'image/png' }))],
    ['a typeface', (client: ProjectClient) => client.useFont(new File([WOFF2], 'Rubrikserif.woff2', { type: '' }))],
  ])('takes %s back when its bytes arrive under a name that is not their own', async (_what, take) => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const before = client.doc

    const real = globalThis.fetch
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (new URL(String(input)).pathname === '/assets') {
        await real(input, init)
        return Response.json({ hash: 'c'.repeat(64) })
      }
      return real(input, init)
    }) as typeof fetch
    try {
      await expect(take(client)).rejects.toThrow(/annat namn/)
    } finally {
      globalThis.fetch = real
    }
    expect(client.doc).toEqual(before)
    expect(client.canUndo).toBe(false)
  })
})

// Two gesture-bearing uploads that overlap used to cancel each other's way back (#344). Only the
// gesture that is still open can be called off, and the one that started last has already opened
// its own by the time the first one wants to take itself back — so the first one's `callOff` was
// an empty operation. The document was left holding a reference to bytes that never arrived
// while the surface said it had gone wrong: the document and the notice said different things.
//
// L37: what never arrived is taken out of the document with a plain edit through `applyEdit`,
// and that edit never pushes a step. A correction is not something the designer did, and the
// step it would push is one an undo would walk straight back into — the document with the asset
// still in it, which is the very state the correction existed to leave.
//
// L37 revised (#358): the same removal goes on every document the way back and the way forward
// hold. They keep whole documents and not operations, so leaving them alone left that very state
// one press behind where the correction stood.
describe('an upload that falls away after the designer has gone on (#344, L37, #358)', () => {
  const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
  const WOFF2 = new Uint8Array([119, 79, 70, 50, 0, 1, 0, 0])
  const skold = LIBRARY.find((s) => s.id === 'skold')!
  const typeface = (): File => new File([WOFF2], 'Rubrikserif.woff2', { type: '' })
  const picture = (): File => new File([PNG], 'drake.png', { type: 'image/png' })

  // A slow line: every upload is held until the test answers it, in the order they were sent.
  // `null` lets the real service answer; a `Response` is the answer itself.
  type Held = (answer: Response | null) => void
  const slowLine = (): { held: Held[]; hangUp: () => void } => {
    const real = globalThis.fetch
    const held: Held[] = []
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (new URL(String(input)).pathname !== '/assets' || (init?.method ?? 'GET') !== 'POST') return real(input, init)
      const answer = await new Promise<Response | null>((resolve) => held.push(resolve))
      return answer ?? real(input, init)
    }) as typeof fetch
    return {
      held,
      hangUp: () => {
        globalThis.fetch = real
      },
    }
  }

  // The four ways an asset goes into the document before its bytes have travelled, each with
  // what the document holds afterwards and what the surface is told when it never arrives. The
  // second upload is always of another kind, so the one that survives cannot be mistaken for the
  // one that fell away.
  const ways = [
    {
      what: 'a symbol taken into the game',
      take: (client: ProjectClient) => client.useSymbol(skold),
      holds: (client: ProjectClient) => client.doc.icons['sköld'] !== undefined,
      then: (client: ProjectClient) => client.addPicture(picture()),
      said: 'Symbolen sköld kunde inte laddas upp och har tagits bort igen: tjänsten svarade 500',
    },
    {
      what: 'a symbol placed on a card',
      take: (client: ProjectClient) => client.placeIcon(skold, 'front', null),
      holds: (client: ProjectClient) => client.doc.icons['sköld'] !== undefined || (client.doc.template.faces['front']?.base ?? []).some((e) => e.kind === 'icons'),
      then: (client: ProjectClient) => client.addPicture(picture()),
      said: 'Symbolen sköld kunde inte laddas upp och har tagits bort igen: tjänsten svarade 500',
    },
    {
      what: 'a typeface',
      take: (client: ProjectClient) => client.useFont(typeface()),
      holds: (client: ProjectClient) => client.doc.fonts?.['Rubrikserif'] !== undefined,
      then: (client: ProjectClient) => client.addPicture(picture()),
      said: 'Typsnittet Rubrikserif kunde inte laddas upp och har tagits bort igen: tjänsten svarade 500',
    },
    {
      what: 'a picture',
      take: (client: ProjectClient) => client.addPicture(picture()),
      holds: (client: ProjectClient) => Object.keys(client.doc.pictures ?? {}).length > 0,
      then: (client: ProjectClient) => client.useFont(typeface()),
      said: 'Bilden drake.png kunde inte laddas upp och har tagits bort igen: tjänsten svarade 500',
    },
  ] as const

  it.each(ways.map((way) => [way.what, way] as const))('takes %s back out of the document although a later upload has opened the gesture', async (_what, way) => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    const before = client.doc

    const line = slowLine()
    try {
      const falling = way.take(client)
      await vi.waitFor(() => expect(line.held.length).toBe(1))
      await vi.waitFor(() => expect(way.holds(client)).toBe(true))

      // The designer goes on while those bytes are still in the air, and what she does next
      // opens a gesture of its own — which is the whole of the fault.
      const landing = way.then(client)
      await vi.waitFor(() => expect(line.held.length).toBe(2))

      line.held[0]!(new Response('nope', { status: 500 }))
      await expect(falling).rejects.toThrow()

      // The document says what the notice says: what never arrived is not in it any more.
      expect(way.holds(client)).toBe(false)
      expect(client.doc.template.faces['front']?.base.map((e) => e.id)).toEqual(before.template.faces['front']?.base.map((e) => e.id))

      // And the upload that did arrive is untouched by the other one's failure.
      line.held[1]!(null)
      await landing
    } finally {
      line.hangUp()
    }
  })

  // Inget antal Ctrl+Z når ett dokument som pekar på byte som aldrig kom fram (#358). The
  // correction goes on every snapshot the stack holds, both the way back and the way forward, so
  // the whole history is walked here — every press of the one and then every press of the other.
  it.each(ways.map((way) => [way.what, way] as const))('leaves %s in no step of the history, however many presses are made', async (_what, way) => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    // A step of her own below the upload, so the way back has somewhere to go on to.
    client.setCell('dragon', 'title', 'Drakhona')

    const line = slowLine()
    try {
      const falling = way.take(client)
      await vi.waitFor(() => expect(line.held.length).toBe(1))
      await vi.waitFor(() => expect(way.holds(client)).toBe(true))
      const landing = way.then(client)
      await vi.waitFor(() => expect(line.held.length).toBe(2))
      line.held[0]!(new Response('nope', { status: 500 }))
      await expect(falling).rejects.toThrow()
      line.held[1]!(null)
      await landing
    } finally {
      line.hangUp()
    }

    expect(way.holds(client)).toBe(false)
    let back = 0
    while (client.canUndo) {
      client.undo()
      back += 1
      expect(way.holds(client)).toBe(false)
    }
    // The cell, the upload that fell away, and the one that landed: three steps, and they are
    // still there. What went is the asset inside them.
    expect(back).toBe(3)
    while (client.canRedo) {
      client.redo()
      expect(way.holds(client)).toBe(false)
    }
  })

  // And the way forward that a gesture put aside is the same documents again (#142, #358): a
  // gesture's first patch empties the way forward, and calling the gesture off hands it back
  // whole — including, without this, a document holding what never arrived. So the correction
  // goes on that one as well, and a drag taken back with Escape does not open the hole again.
  it.each(ways.map((way) => [way.what, way] as const))('leaves %s in no step of the way forward a called-off gesture hands back', async (_what, way) => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)

    const line = slowLine()
    try {
      const falling = way.take(client)
      await vi.waitFor(() => expect(line.held.length).toBe(1))
      // Taken back while the bytes are in the air: the document with the asset waits on the way
      // forward. Then she lays a hand on something, which puts that way forward aside.
      expect(client.undo()).not.toBeNull()
      client.setCell('dragon', 'title', 'Drakhona', 'ett-drag')
      expect(client.canRedo).toBe(false)
      line.held[0]!(new Response('nope', { status: 500 }))
      await expect(falling).rejects.toThrow()
    } finally {
      line.hangUp()
    }

    // Escape: the gesture is nothing that happened, and the way forward comes back as it was.
    client.callOff('ett-drag')
    expect(client.canRedo).toBe(true)
    while (client.canRedo) {
      client.redo()
      expect(way.holds(client)).toBe(false)
    }
  })

  // The way forward holds whole documents in exactly the same way (#358), and a press of Ctrl+Z
  // taken while the bytes were still in the air puts one there: the document the designer stepped
  // out of, with the asset in it. The correction goes on those as well, so Ctrl+Y does not bring
  // back what never arrived either.
  it.each(ways.map((way) => [way.what, way] as const))('leaves %s in no step of the way forward, taken back while the bytes were still in the air', async (_what, way) => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)

    const line = slowLine()
    try {
      const falling = way.take(client)
      await vi.waitFor(() => expect(line.held.length).toBe(1))
      const landing = way.then(client)
      await vi.waitFor(() => expect(line.held.length).toBe(2))
      // Ctrl+Z while both uploads are still travelling: the document she steps out of is now
      // waiting on the way forward, and it holds what is about to fall away.
      expect(client.undo()).not.toBeNull()
      expect(client.canRedo).toBe(true)
      line.held[0]!(new Response('nope', { status: 500 }))
      await expect(falling).rejects.toThrow()
      line.held[1]!(null)
      await landing
    } finally {
      line.hangUp()
    }

    expect(client.canRedo).toBe(true)
    while (client.canRedo) {
      client.redo()
      expect(way.holds(client)).toBe(false)
    }
  })

  // Eftersom rättelsen är tyst i historiken måste den vara desto tydligare där handlingen
  // gjordes: dokumentet ändrades bakom formgivaren, och ett besked som inte säger vilket av det
  // hon gjort som togs tillbaka lämnar henne med en lek hon inte känner igen (L37). Namnet bärs
  // hela vägen från `storeAsset` ut till ytan, som visar `message` och ingenting annat.
  it.each(ways.map((way) => [way.what, way] as const))('names %s that was taken out again, rather than saying an upload failed', async (_what, way) => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)

    const real = globalThis.fetch
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (new URL(String(input)).pathname === '/assets') return new Response('nope', { status: 500 })
      return real(input, init)
    }) as typeof fetch
    try {
      await expect(way.take(client)).rejects.toThrow(way.said)
    } finally {
      globalThis.fetch = real
    }
  })

  // A correction is not a doing, so it lays no step: the way back holds exactly what the designer
  // did and nothing else. Were it on the stack, one press of Ctrl+Z after it would put the asset
  // that never arrived straight back into the document (L37).
  it('lays no step of its own, so nothing on the way back puts the symbol in again', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    client.setCell('dragon', 'title', 'Drakhona')
    const before = client.doc

    const line = slowLine()
    try {
      const placing = client.placeIcon(skold, 'front', null)
      await vi.waitFor(() => expect(line.held.length).toBe(1))
      const using = client.useFont(typeface())
      await vi.waitFor(() => expect(line.held.length).toBe(2))
      line.held[0]!(new Response('nope', { status: 500 }))
      await expect(placing).rejects.toThrow()
      line.held[1]!(null)
      await using
    } finally {
      line.hangUp()
    }

    // Three steps, and they are the three the designer took: the typeface, the placement, the
    // cell. The taking-back of the placement is not among them.
    const steps: (string | null)[] = []
    while (client.canUndo) steps.push(client.undo())
    expect(steps).toEqual(['undo.what.font', 'undo.what.template', 'undo.what.deck'])
    expect(client.doc).toEqual(projectDoc())
    expect(before.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
  })

  // The open gesture's case is unchanged by the rebasing (B4, L37): a placement taken back before
  // the designer went on is nothing that happened. The gesture is called off, its step goes with
  // it, and there is no snapshot of it anywhere to rebase in the first place.
  it.each(ways.map((way) => [way.what, way] as const))('takes %s back as nothing that happened while its own gesture is still the open one', async (_what, way) => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    // One step of her own, so that a step wrongly left behind by the correction would show.
    client.setCell('dragon', 'title', 'Drakhona')
    const before = client.doc

    const real = globalThis.fetch
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (new URL(String(input)).pathname === '/assets') return new Response('nope', { status: 500 })
      return real(input, init)
    }) as typeof fetch
    try {
      await expect(way.take(client)).rejects.toThrow(way.said)
    } finally {
      globalThis.fetch = real
    }

    expect(client.doc).toEqual(before)
    expect(way.holds(client)).toBe(false)
    const back: (string | null)[] = []
    while (client.canUndo) {
      back.push(client.undo())
      expect(way.holds(client)).toBe(false)
    }
    expect(back).toEqual(['undo.what.deck'])
  })

  // A correction may not rewrite what the history says the designer did (#358). It lays the
  // removal on every step's document and touches nothing else: the steps are hers, in her order,
  // under the names of what she did, and the flags say what they would have said had the bytes
  // arrived.
  it('leaves the designer’s own steps standing, named as she made them, on both sides of the correction', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    client.setCell('dragon', 'title', 'Drakhona')

    const line = slowLine()
    try {
      const placing = client.placeIcon(skold, 'front', null)
      await vi.waitFor(() => expect(line.held.length).toBe(1))
      const using = client.useFont(typeface())
      await vi.waitFor(() => expect(line.held.length).toBe(2))
      line.held[0]!(new Response('nope', { status: 500 }))
      await expect(placing).rejects.toThrow()
      line.held[1]!(null)
      await using
    } finally {
      line.hangUp()
    }

    expect(client.canUndo).toBe(true)
    expect(client.canRedo).toBe(false)
    const back: (string | null)[] = []
    while (client.canUndo) back.push(client.undo())
    expect(back).toEqual(['undo.what.font', 'undo.what.template', 'undo.what.deck'])
    expect(client.canRedo).toBe(true)
    const forward: (string | null)[] = []
    while (client.canRedo) forward.push(client.redo())
    expect(forward).toEqual(['undo.what.deck', 'undo.what.template', 'undo.what.font'])
    expect(client.canUndo).toBe(true)
  })

  // The rebasing L37 first chose away and now chooses (#358). `past` holds whole documents and not
  // operations, so the snapshot taken when the next gesture opened used to carry the asset that
  // never arrived, and one press of Ctrl+Z after a correction landed in it. The correction is laid
  // on every snapshot as well, so the way back never passes through that document again.
  it('cannot be undone back into the snapshot that was taken while the symbol was in the document', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)

    const line = slowLine()
    try {
      const placing = client.placeIcon(skold, 'front', null)
      await vi.waitFor(() => expect(line.held.length).toBe(1))
      const using = client.useFont(typeface())
      await vi.waitFor(() => expect(line.held.length).toBe(2))
      line.held[0]!(new Response('nope', { status: 500 }))
      await expect(placing).rejects.toThrow()
      line.held[1]!(null)
      await using
    } finally {
      line.hangUp()
    }

    expect(client.doc.icons['sköld']).toBeUndefined()
    expect(client.undo()).toBe('undo.what.font')
    expect(client.doc.icons['sköld']).toBeUndefined()
    expect(client.undo()).toBe('undo.what.template')
    expect(client.doc.icons['sköld']).toBeUndefined()
  })
})

// The crop's status may not say the actor has a window it has not confirmed (#297, L33). The
// client already holds every edit until its echo lands; this is that fact, said per picture, and
// said aloud when it changes — an echo of one's own used to be swallowed without a word, which
// was right for the document and wrong for a status that waits on it.
describe('a crop on its way to the actor (#297, L33)', () => {
  it('stands in cropsInFlight until the actor echoes it, and the echo notifies', async () => {
    const created = await run.projects.create(run.projectId, projectDoc())
    const client = await openClient(created.id)
    await vi.waitFor(() => expect(client.connected).toBe(true))
    const hash = '1'.repeat(64)
    const heard: string[][] = []
    client.subscribe((c) => heard.push([...c.cropsInFlight]))

    client.setCrop(hash, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 })
    expect(client.cropsInFlight).toEqual([hash])

    await vi.waitFor(() => expect(client.cropsInFlight).toEqual([]))
    expect(heard.at(-1)).toEqual([])
  })
})
