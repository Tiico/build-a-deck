import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { MemoryProjectStore } from '../src/index.js'
import { template } from './deck.js'
import type { EditorMessage } from '../src/project-actor.js'
import type { EditIntent } from '../src/edits.js'

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

    const bo = await Editing.open(run.base, 'p1', 'Bo')
    await bo.until('project')
    // Both know who is here.
    expect((await ada.until('here', (m) => m.here.length === 2)).here.map((p) => p.name)).toEqual(['Ada', 'Bo'])

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
    expect((await bo.until('here', (m) => m.here.length === 1)).here.map((p) => p.name)).toEqual(['Bo'])
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

  it('lets nobody but the owner in', async () => {
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id: 'p1', ...project() }) })
    await expect(Editing.open(run.base, 'p1', 'Ingen', '')).rejects.toThrow(/closed/)
    await expect(Editing.open(run.base, 'nope', 'Ada')).rejects.toThrow(/closed/)
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
