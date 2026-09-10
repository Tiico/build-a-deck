import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { projectDoc } from './project-doc.js'
import { LIBRARY } from '../src/editor/symbols.js'
import { startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

describe('ProjectClient', () => {
  it('loads a project, edits rows and template locally, saves with its revision, and surfaces a stale save as a conflict', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
    expect(client.doc.name).toBe('Skogens herrar')
    expect(client.rev).toBe(1)
    expect(client.dirty).toBe(false)

    client.setCell('dragon', 'title', 'Drakhona')
    client.patchElement('front', 'title', { font: { family: 'sans-serif', sizePt: 16, weight: 700 } })
    expect(client.dirty).toBe(true)
    expect(client.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')

    expect(await client.save()).toEqual({ ok: true, rev: 2 })
    expect(client.dirty).toBe(false)
    const stored = await run.projects.load('p1')
    expect(stored?.rev).toBe(2)
    expect(stored?.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ font: { sizePt: 16 } })

    // Someone else saved in the meantime.
    await run.projects.replace('p1', 2, { ...projectDoc(), name: 'Ändrad av annan' })
    client.setCell('knight', 'antal', '3')
    expect(await client.save()).toEqual({ ok: false, reason: 'conflict' })
    expect(client.dirty).toBe(true)
  })

  // Ctrl+Z is not the version history (B4). The history is a whole saving, named and comparable;
  // this is the step the designer just took. It travels as a `restore` edit, which is already how
  // taking a document back is said, so no new verb enters the vocabulary (#35).
  it('takes the last edit back, puts it forward again, and says what each step was', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
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
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
    const session = await client.startTable()
    expect(session.id).toMatch(/[0-9a-f-]{36}/)
    expect(session.version).toBe('rev-1')
    expect((await run.store.loadSession(session.id))?.setup.components).toHaveLength(4)
  })
})

describe('refreshing a running table (C7, L5)', () => {
  it('saves unsaved edits, then pushes the current rev to the table as version.change', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
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
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
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
    expect((await run.projects.load('p1'))?.template.faces['front']?.base.map((e) => e.id)).toEqual(['shape-1', 'body', 'frame'])
  })

  it('refuses an element whose id is already on the face, and a face that does not exist', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
    expect(() => client.addElement('front', { ...added, id: 'title' })).toThrow(/title/)
    expect(() => client.addElement('sida', added)).toThrow(/sida/)
    expect(client.dirty).toBe(false)
  })

  // An edit that was refused never happened, so it costs neither a version nor a Ctrl+Z (#41,
  // B4). A patch to an id the face does not have used to hand back the same document without
  // saying anything: the designer saw nothing move and had spent a step back on it anyway.
  it('refuses a patch to an element the face does not have, and charges no step back for it', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })

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
})

describe('the tables a project has (#19)', () => {
  it('lists them newest first, with the version each runs and whether it has ended', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
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
    const created = await run.projects.create('p1', projectDoc())
    return ProjectClient.open({ http: run.http, id: created.id })
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
    const stored = await run.projects.load('p1')
    expect(stored?.template.faces['front']?.variantBy).toBe('typ')
    expect(stored?.template.faces['front']?.variants['fälla']?.override).toMatchObject([{ id: 'title', color: '#e74c3c' }])
  })
})

// "Unsaved" has to mean the document differs from the one the server holds, not that something
// was typed (#8): a guard that fires over a deck nobody changed is worse than no guard at all.
describe('what counts as unsaved (#8)', () => {
  it('stays saved when an edit writes the value that was already there, and goes back to saved when an edit is taken back by hand', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })

    client.setCell('dragon', 'title', 'Drake')
    expect(client.dirty).toBe(false)

    client.setCell('dragon', 'title', 'Drakhona')
    expect(client.dirty).toBe(true)

    client.setCell('dragon', 'title', 'Drake')
    expect(client.dirty).toBe(false)
  })

  it('says nothing changed when a template edit lands on the values the element already had', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })

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
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
    expect(client.recipe).toEqual({ players: 2, mine: false, discard: true, market: false, counters: [] })

    client.setRecipe({ ...client.recipe, players: 3, market: true, counters: [{ name: 'Poäng', start: 0 }] })
    expect(client.doc.setup.seats).toEqual(['A', 'B', 'C'])
    expect(client.doc.setup.zones.find((z) => z.id === 'market')?.kind).toBe('area')
    expect(client.doc.setup.zones.find((z) => z.id === 'counters:C')?.owner).toBe('C')
    expect(client.recipe.players).toBe(3)

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
    // The floor and the deck zone cannot go.
    expect(() => client.removeZone('table')).toThrow()
    expect(() => client.removeZone('draw')).toThrow()

    expect(await client.save()).toEqual({ ok: true, rev: 2 })
    const stored = await run.projects.load('p1')
    expect(stored?.setup.seats).toEqual(['A', 'B', 'C'])
    expect(stored?.setup.zones.find((z) => z.id === altar)?.name).toBe('Altaret')
    expect(stored?.setup.counters).toEqual([{ name: 'Poäng', start: 0 }])
  })
})

describe('images (E1)', () => {
  it('uploads an image once and gets its hash back, the same hash for the same bytes', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'drake.png', { type: 'image/png' })
    const hash = await client.uploadAsset(file)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await client.uploadAsset(file)).toBe(hash)
    const served = await fetch(`${run.http}/assets/${hash}`)
    expect(served.status).toBe(200)
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]))
    await expect(client.uploadAsset(new File(['x'], 'x.txt', { type: 'text/plain' }))).rejects.toThrow(/bara bilder/)
  })
})

describe('symbols (E4)', () => {
  it('takes a symbol into the project: the bytes become an asset, the set gets the name, and the licence is kept beside it', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
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
    const stored = await run.projects.load('p1')
    expect(stored?.icons['sköld']).toBe(client.doc.icons['sköld'])
    expect(stored?.credits).toEqual({ 'sköld': { licence: 'CC0-1.0', by: 'build-your-deck', source: 'skold' } })
  })
})

describe('the type the game is set in (B3)', () => {
  it('takes a font file into the project, names the family from the file, and keeps the licence the designer states', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
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
    const stored = await run.projects.load('p1')
    expect(stored?.fonts?.['Rubrikserif']?.licence?.by).toBe('Typverket')

    client.removeFont(family)
    expect(client.doc.fonts?.[family]).toBeUndefined()
  })
})

describe('the history (B4)', () => {
  it('lists the versions, opens an older one, names it, and brings it back as a new version', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
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
