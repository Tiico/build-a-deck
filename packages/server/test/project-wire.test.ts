import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { start, twoSeatSetup, type Running } from './fixture.js'
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
      // A connection that is refused is opened and then closed with a reason, as a table's is,
      // so an editor is only really open once it has stayed open.
      ws.on('open', () => setTimeout(resolve, 60))
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
