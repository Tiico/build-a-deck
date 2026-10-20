import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'
import type { ProjectDoc } from '../src/projects.js'

const doc = (name = 'Skogens herrar'): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

// «Dubblera» in a game's ⋯ (#738): a second game, the duplicating account's own, made of the first
// as it stands — and taken by those who may take the game with them, as an export is (G5).
describe('a game duplicated (#738)', () => {
  let run: Running
  const login = async (email: string): Promise<string> => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
    return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  }
  const send = (method: string, path: string, cookie: string, body?: unknown) =>
    fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })
  const invite = async (owner: string, email: string, role: string): Promise<string> => {
    await send('POST', '/projects/p1/invites', owner, { email, role })
    const token = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    const cookie = await login(email)
    await send('POST', `/invites/${token}`, cookie)
    return cookie
  }

  beforeEach(async () => {
    run = await start()
  })
  afterEach(async () => {
    await run.stop()
  })

  it('is a new game of the same cards, named as a copy in the reader’s language and never twice the same', async () => {
    const ada = await login('ada@example.com')
    await send('POST', '/projects', ada, { id: 'p1', ...doc() })

    const made = await send('POST', '/projects/p1/duplicate', ada)
    expect(made.status).toBe(201)
    const { id } = (await made.json()) as { id: string }
    expect(id).not.toBe('p1')
    const copy = (await (await send('GET', `/projects/${id}`, ada)).json()) as ProjectDoc & { rev: number }
    expect(copy).toMatchObject({ name: 'Skogens herrar (kopia)', rev: 1, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }] })

    const again = (await (await send('POST', '/projects/p1/duplicate', ada)).json()) as { id: string; name: string }
    expect(again.name).toBe('Skogens herrar (kopia 2)')
    const english = (await (await send('POST', '/projects/p1/duplicate?lang=en', ada)).json()) as { id: string; name: string }
    expect(english.name).toBe('Skogens herrar (copy)')
    const names = ((await (await send('GET', '/projects', ada)).json()) as { name: string }[]).map((p) => p.name).sort()
    expect(names).toEqual(['Skogens herrar', 'Skogens herrar (copy)', 'Skogens herrar (kopia 2)', 'Skogens herrar (kopia)'])
  })

  it('stays inside the length a game’s name may have', async () => {
    const ada = await login('ada@example.com')
    const long = 'L'.repeat(64)
    await send('POST', '/projects', ada, { id: 'p1', ...doc(long) })
    const made = (await (await send('POST', '/projects/p1/duplicate', ada)).json()) as { name: string }
    expect(made.name.length).toBeLessThanOrEqual(64)
    expect(made.name.endsWith(' (kopia)')).toBe(true)
  })

  it('copies what stands in the editor, saved or not', async () => {
    const ada = await login('ada@example.com')
    await send('POST', '/projects', ada, { id: 'p1', ...doc() })
    const ws = new WebSocket(`${run.base}/projects/p1/edit?name=Ada`, { headers: { cookie: ada } })
    const seen: { v: string }[] = []
    ws.on('message', (data) => seen.push(JSON.parse(data.toString()) as { v: string }))
    await new Promise((resolve) => ws.once('message', resolve))
    ws.send(JSON.stringify({ t: 'edit', intent: { v: 'setCell', cardRef: 'dragon', field: 'title', value: 'Lindorm' } }))
    for (let i = 0; i < 100 && !seen.some((m) => m.v === 'edits'); i++) await new Promise((r) => setTimeout(r, 10))
    ws.close()

    const { id } = (await (await send('POST', '/projects/p1/duplicate', ada)).json()) as { id: string }
    const copy = (await (await send('GET', `/projects/${id}`, ada)).json()) as ProjectDoc
    expect(copy.rows[0]?.fields.title).toBe('Lindorm')
  })

  it('is the owner’s and the co-editors’, and the copy is theirs; one who may only look or test is refused', async () => {
    const ada = await login('ada@example.com')
    await send('POST', '/projects', ada, { id: 'p1', ...doc() })
    const bo = await invite(ada, 'bo@example.com', 'editor')
    const made = await send('POST', '/projects/p1/duplicate', bo)
    expect(made.status).toBe(201)
    const { id } = (await made.json()) as { id: string }
    expect(((await (await send('GET', '/projects', bo)).json()) as { id: string; role: string }[]).find((p) => p.id === id)?.role).toBe('owner')
    // Ada shared her game with Bo, not his copy with her.
    expect((await send('GET', `/projects/${id}`, ada)).status).toBe(403)

    const cee = await invite(ada, 'cee@example.com', 'viewer')
    expect((await send('POST', '/projects/p1/duplicate', cee)).status).toBe(403)
    const dag = await invite(ada, 'dag@example.com', 'tester')
    expect((await send('POST', '/projects/p1/duplicate', dag)).status).toBe(403)
    expect((await send('POST', '/projects/nope/duplicate', ada)).status).toBe(404)
  })
})
