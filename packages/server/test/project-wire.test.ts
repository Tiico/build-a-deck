import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { MemoryProjectStore } from '../src/index.js'
import { template } from './deck.js'
import type { EditorMessage } from '../src/project-actor.js'
import type { EditIntent } from '../src/edits.js'

let run: Running
let cookie = ''
async function logIn(email: string): Promise<string> {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}
beforeEach(async () => {
  run = await start()
  cookie = await logIn('ada@example.com')
})

// Bo, a person of his own (#1151): logged in as himself and let in to the game by Ada's invitation.
async function coEditor(id: string): Promise<string> {
  await fetch(`${run.http}/projects/${id}/invites`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ email: 'bo@example.com', role: 'editor' }) })
  const token = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
  const bo = await logIn('bo@example.com')
  await fetch(`${run.http}/invites/${token}`, { method: 'POST', headers: { cookie: bo } })
  return bo
}
afterEach(async () => {
  await run.stop()
})

function project() {
  const { zones, seats, floor } = twoSeatSetup()
  return { name: 'Skogens herrar', template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 2 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

// An editor on the wire: connects, keeps what it is told, and can send an edit.
class Editing {
  readonly seen: EditorMessage[] = []
  private constructor(private readonly ws: WebSocket) {}
  static async open(base: string, id: string, name: string, withCookie = cookie): Promise<Editing> {
    const ws = new WebSocket(`${base}/projects/${id}/edit?name=${encodeURIComponent(name)}`, { headers: withCookie ? { cookie: withCookie } : {} })
    const editor = new Editing(ws)
    ws.on('message', (data) => editor.seen.push(JSON.parse(data.toString()) as EditorMessage))
    await new Promise<void>((resolve, reject) => {
      // A connection that is refused is opened and then closed with a reason, as a table's is.
      // So the door gives one of two answers and both of them arrive on this socket: the project,
      // which `subscribe` sends the moment an editor is let in, or the close. Wait for whichever
      // comes. A clock here would not measure the door; it would measure the machine.
      ws.on('message', () => resolve())
      ws.on('error', reject)
      ws.on('close', (code) => reject(new Error(`closed ${code}`)))
    })
    return editor
  }
  send(intent: EditIntent): void {
    this.ws.send(JSON.stringify({ t: 'edit', intent }))
  }
  save(): void {
    this.ws.send(JSON.stringify({ t: 'save' }))
  }
  raw(frame: unknown): void {
    this.ws.send(JSON.stringify(frame))
  }
  async until<T extends EditorMessage['v']>(v: T, ok: (m: Extract<EditorMessage, { v: T }>) => boolean = () => true): Promise<Extract<EditorMessage, { v: T }>> {
    for (let i = 0; i < 100; i++) {
      const found = [...this.seen].reverse().find((m): m is Extract<EditorMessage, { v: T }> => m.v === v && ok(m as Extract<EditorMessage, { v: T }>))
      if (found) return found
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`no ${v} within a second: ${JSON.stringify(this.seen)}`)
  }
  close(): void {
    this.ws.close()
  }
}

describe('two people editing the same project (D3)', () => {
  it('hands each of them the document, and every edit reaches the other at once', async () => {
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id: 'p1', ...project() }) })
    const ada = await Editing.open(run.base, 'p1', 'Ada')
    const first = await ada.until('project')
    expect(first.doc.name).toBe('Skogens herrar')
    expect(first.rev).toBe(1)

    const bo = await Editing.open(run.base, 'p1', 'Bo', await coEditor('p1'))
    await bo.until('project')
    // Both know who is here, by the server's word for each account (#1254): the address, as neither
    // has given a name, and never the name a page sent for itself.
    expect((await ada.until('here', (m) => m.here.length === 2)).here.map((p) => p.name)).toEqual(['ada@example.com', 'bo@example.com'])

    ada.send({ v: 'setCell', cardRef: 'dragon', field: 'title', value: 'Drakhona' })
    const told = await bo.until('edits')
    expect(told.edits[0]?.intent).toEqual({ v: 'setCell', cardRef: 'dragon', field: 'title', value: 'Drakhona' })
    expect(told.edits[0]?.seq).toBe(1)

    // Saving makes the version, and both are told which one.
    bo.save()
    expect((await ada.until('saved')).rev).toBe(2)
    expect((await run.projects.load('p1'))?.rows[0]?.fields['title']).toBe('Drakhona')

    ada.close()
    await new Promise((r) => setTimeout(r, 50))
    expect((await bo.until('here', (m) => m.here.length === 1)).here.map((p) => p.name)).toEqual(['bo@example.com'])
    bo.close()
  })

  it('says why when an edit makes no sense, and the others are told nothing', async () => {
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id: 'p1', ...project() }) })
    const ada = await Editing.open(run.base, 'p1', 'Ada')
    await ada.until('project')
    ada.send({ v: 'setCell', cardRef: 'ingen', field: 'title', value: 'x' })
    expect((await ada.until('refused')).why).toMatch(/ingen/)
    expect(ada.seen.some((m) => m.v === 'edits')).toBe(false)
    ada.close()
  })

  // A refusal says which of the editor's requests it answers (#991). An editor has an edit and a
  // save on the line at once, and a refused edit taken for the answer to the save called a version
  // that was made a version that was not — and left its «saved» to nobody, or to the next save.
  it('says whether a refusal answers an edit or a save', async () => {
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id: 'p1', ...project() }) })
    const ada = await Editing.open(run.base, 'p1', 'Ada')
    await ada.until('project')
    ada.send({ v: 'setCell', cardRef: 'ingen', field: 'title', value: 'x' })
    expect(await ada.until('refused')).toEqual({ v: 'refused', why: 'no row ingen', to: 'edit' })

    // The store moves on behind the actor's back, so the actor's next version is a conflict.
    await run.projects.replace('p1', 1, { ...project(), name: 'Skrivet förbi aktören' })
    ada.save()
    expect(await ada.until('refused', (m) => m.why === 'conflict')).toEqual({ v: 'refused', why: 'conflict', to: 'save' })

    // A request the door cannot read is no request in particular, and the refusal names none.
    ada.raw({ t: 'nonsense' })
    expect(await ada.until('refused', (m) => m.why !== 'conflict' && m.why !== 'no row ingen')).not.toHaveProperty('to')
    ada.close()
  })

  // An editor can have several edits on the line, and the one the actor refuses has to come off the
  // editor again and the others stay (#993). Each edit carries the number its editor gave it, and
  // whatever answers the edit — the echo or the refusal — carries the same number back.
  it('answers each edit under the number its editor gave it', async () => {
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id: 'p1', ...project() }) })
    const ada = await Editing.open(run.base, 'p1', 'Ada')
    await ada.until('project')
    ada.raw({ t: 'edit', intent: { v: 'setCell', cardRef: 'dragon', field: 'title', value: 'Drakhona' }, ask: 7 })
    ada.raw({ t: 'edit', intent: { v: 'setCell', cardRef: 'ingen', field: 'title', value: 'x' }, ask: 8 })
    ada.raw({ t: 'edit', intent: { v: 'setCell', cardRef: 'dragon', field: 'body', value: 'Eld.' }, ask: 9 })
    expect((await ada.until('edits', (m) => m.edits[0]?.seq === 1)).edits[0]?.ask).toBe(7)
    expect(await ada.until('refused')).toEqual({ v: 'refused', why: 'no row ingen', to: 'edit', ask: 8 })
    expect((await ada.until('edits', (m) => m.edits[0]?.seq === 2)).edits[0]?.ask).toBe(9)
    // The number is the line's and not the log's: what is written down is the edit and who made it.
    expect((await run.projects.readEdits('p1', 0)).map((e) => 'ask' in e)).toEqual([false, false])

    // A page loaded before the number sends none, and is answered without one, as it always was.
    ada.send({ v: 'setCell', cardRef: 'dragon', field: 'title', value: 'Drake' })
    expect((await ada.until('edits', (m) => m.edits[0]?.seq === 3)).edits[0]).not.toHaveProperty('ask')
    ada.send({ v: 'setCell', cardRef: 'ingen', field: 'title', value: 'y' })
    expect(await ada.until('refused', (m) => m.ask === undefined)).toEqual({ v: 'refused', why: 'no row ingen', to: 'edit' })
    ada.close()
  })

  it('lets nobody but the owner in', async () => {
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id: 'p1', ...project() }) })
    await expect(Editing.open(run.base, 'p1', 'Ingen', '')).rejects.toThrow(/closed/)
    await expect(Editing.open(run.base, 'nope', 'Ada')).rejects.toThrow(/closed/)
  })

  // Whether a game exists is its owner's to know (G1, #754). Nobody logged in is told to log in,
  // the same way, whether the id names a game or nothing at all; only someone logged in learns
  // that there is no such game.
  it('tells nobody logged in to log in, whether or not the game exists', async () => {
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id: 'p1', ...project() }) })
    await expect(Editing.open(run.base, 'p1', 'Ingen', '')).rejects.toThrow('closed 4401')
    await expect(Editing.open(run.base, 'finns-inte', 'Ingen', '')).rejects.toThrow('closed 4401')
    await expect(Editing.open(run.base, 'finns-inte', 'Ada')).rejects.toThrow('closed 4004')
  })
})

// A store answers in its own time: a database is a network away, and even a memory store is not
// instant on a loaded machine. The socket is open from the moment the upgrade finishes, so the
// editor at the other end can send its first edit while the door is still asking the store who
// is knocking and which project this is.
//
// Such a frame used to be dropped on the floor without a word. `ws.on('message')` was attached
// after those questions were answered, and a WebSocket with no listener does not keep what it
// receives — it emits it to nobody. The designer's edit was simply gone, and a `save` sent in
// the same window was gone with it: the version made a moment later was a version without the
// work in it, and the editor had been told the save succeeded (#109).
class SlowProjects extends MemoryProjectStore {
  // Long enough to be a real turn of the event loop rather than a microtask, which is what a
  // store on the other side of a socket always is.
  override async load(id: string): Promise<Awaited<ReturnType<MemoryProjectStore['load']>>> {
    await new Promise((r) => setTimeout(r, 20))
    return super.load(id)
  }
}

describe('an edit sent the moment the socket opens (D3)', () => {
  it('waits for the door to finish opening instead of being dropped', async () => {
    await run.stop()
    run = await start({ projects: new SlowProjects() })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    cookie = ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id: 'p1', ...project() }) })

    // Not `Editing.open`, which waits for the door's own answer first. This is the editor that
    // does not wait: it writes as soon as the line is up, which is what a browser does when the
    // designer was already typing.
    const seen: EditorMessage[] = []
    const ws = new WebSocket(`${run.base}/projects/p1/edit?name=Ada`, { headers: { cookie } })
    ws.on('message', (data) => seen.push(JSON.parse(data.toString()) as EditorMessage))
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({ t: 'edit', intent: { v: 'setCell', cardRef: 'dragon', field: 'title', value: 'Drakhona' } }))
        ws.send(JSON.stringify({ t: 'save' }))
        resolve()
      })
      ws.on('error', reject)
    })

    const until = async <T extends EditorMessage['v']>(v: T): Promise<Extract<EditorMessage, { v: T }>> => {
      for (let i = 0; i < 100; i++) {
        const found = seen.find((m): m is Extract<EditorMessage, { v: T }> => m.v === v)
        if (found) return found
        await new Promise((r) => setTimeout(r, 10))
      }
      throw new Error(`no ${v} within a second: ${JSON.stringify(seen)}`)
    }
    // The edit landed, in the order it was sent: the echo says so, and the version made by the
    // save that followed it has the edit in it.
    expect((await until('edits')).edits[0]?.intent).toEqual({ v: 'setCell', cardRef: 'dragon', field: 'title', value: 'Drakhona' })
    expect((await until('saved')).rev).toBe(2)
    expect((await run.projects.load('p1'))?.rows[0]?.fields['title']).toBe('Drakhona')
    ws.close()
  })
})

// One writer per document (D3, #768). A `PUT /projects/:id` used to write the store past the
// actor: the actor went on holding — and handing every editor — the document and rev it had
// before, so one screen said «rev 1 · Sparat» while the table ran rev 16, and the editor's own
// save was refused as a conflict that no reload could clear, since the actor is only rebuilt
// once it is forgotten.
describe('a whole document written over HTTP while the project is open (#768)', () => {
  const create = () => fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id: 'p1', ...project() }) })
  const put = (doc: object, rev: number) =>
    fetch(`${run.http}/projects/p1`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ ...doc, rev }) })

  it('goes through the actor: the open editor is told, the next one is handed it, and saving goes on from it', async () => {
    await create()
    const ada = await Editing.open(run.base, 'p1', 'Ada')
    await ada.until('project')

    const res = await put({ ...project(), name: 'Bergens herrar' }, 1)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { rev: number }).rev).toBe(2)

    // The editor that has it open sees the new document and the version it became.
    await ada.until('edits', (m) => m.edits.some((e) => e.intent.v === 'restore'))
    expect((await ada.until('saved')).rev).toBe(2)

    // An editor that opens now is handed what was written, at the rev it was written as.
    const bo = await Editing.open(run.base, 'p1', 'Bo')
    const handed = await bo.until('project')
    expect(handed.rev).toBe(2)
    expect(handed.doc.name).toBe('Bergens herrar')

    // And a save from the editor is not a conflict.
    bo.send({ v: 'setCell', cardRef: 'dragon', field: 'title', value: 'Drakhona' })
    bo.save()
    expect((await bo.until('saved', (m) => m.rev === 3)).rev).toBe(3)
    const stored = await run.projects.load('p1')
    expect(stored?.name).toBe('Bergens herrar')
    expect(stored?.rows[0]?.fields['title']).toBe('Drakhona')
    ada.close()
    bo.close()
  })

  it('is refused as a conflict when it was written against a rev the project has left', async () => {
    await create()
    expect((await put({ ...project(), name: 'Andra' }, 1)).status).toBe(200)
    expect((await put({ ...project(), name: 'Tredje' }, 1)).status).toBe(409)
    expect((await run.projects.load('p1'))?.name).toBe('Andra')
  })
})
