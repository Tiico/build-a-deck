import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'
import { MemoryAuthStore } from '../src/index.js'
import type { ProjectDoc } from '../src/projects.js'

const doc = (name = 'Skogens herrar'): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

// «Byt namn» from the start page's ⋯ (#909, beställarens beslut C): an ordinary edit through the
// project actor, as the editor's is (#738) — and «Mina spel» reads the name from the live document,
// so the list is right at once and nothing is saved on anybody else's behalf.
describe('a game renamed from «Mina spel» (#909)', () => {
  let run: Running
  const login = async (email: string, on = run): Promise<string> => {
    await fetch(`${on.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const link = /\/auth\/verify\?token=\S+/.exec(on.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const res = await fetch(`${on.http}${link}`, { redirect: 'manual' })
    return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  }
  const send = (method: string, path: string, cookie: string, body?: unknown, on = run) =>
    fetch(`${on.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })
  const listed = async (cookie: string, on = run) => ((await (await send('GET', '/projects', cookie, undefined, on)).json()) as { id: string; name: string; rev: number }[]).find((p) => p.id === 'p1')

  beforeEach(async () => {
    run = await start()
  })
  afterEach(async () => {
    await run.stop()
  })

  it('is an edit in the log: the list says the new name at once, and no version is made of it', async () => {
    const ada = await login('ada@example.com')
    await send('POST', '/projects', ada, { id: 'p1', ...doc() })
    const ws = new WebSocket(`${run.base}/projects/p1/edit?name=Ada`, { headers: { cookie: ada } })
    const seen: { v: string; edits?: { intent: { v: string; name?: string } }[] }[] = []
    ws.on('message', (data) => seen.push(JSON.parse(data.toString()) as (typeof seen)[number]))
    await new Promise((resolve) => ws.once('message', resolve))

    const renamed = await send('PUT', '/projects/p1/name', ada, { name: 'Skogens andar' })
    expect(renamed.status).toBe(200)
    expect(await listed(ada)).toMatchObject({ name: 'Skogens andar', rev: 1 })
    // An editor that has the game open is told, as of any other edit.
    for (let i = 0; i < 100 && !seen.some((m) => m.v === 'edits'); i++) await new Promise((r) => setTimeout(r, 10))
    ws.close()
    expect(seen.find((m) => m.v === 'edits')?.edits?.[0]?.intent).toEqual({ v: 'rename', name: 'Skogens andar' })
    expect((await (await send('GET', '/projects/p1/versions', ada)).json()) as unknown[]).toHaveLength(1)
  })

  // The log is the truth (D3): a process that has started again since has no actor for the game,
  // and the list and a copy read what the log replays to, not the version saved before the rename.
  it('is still the name after the server has started again, in the list and in a copy', async () => {
    await run.stop()
    const auth = new MemoryAuthStore()
    run = await start({ auth })
    const ada = await login('ada@example.com')
    await send('POST', '/projects', ada, { id: 'p1', ...doc() })
    await send('PUT', '/projects/p1/name', ada, { name: 'Skogens andar' })
    const projects = run.projects
    await run.stop()
    run = await start({ auth, projects })

    expect(await listed(ada)).toMatchObject({ name: 'Skogens andar', rev: 1 })
    const copy = (await (await send('POST', '/projects/p1/duplicate', ada)).json()) as { name: string }
    expect(copy.name).toBe('Skogens andar (kopia)')
  })

  it('is the owner’s and the co-editors’ to make, and holds a name to what every door holds it to', async () => {
    const ada = await login('ada@example.com')
    await send('POST', '/projects', ada, { id: 'p1', ...doc() })
    expect((await send('PUT', '/projects/p1/name', ada, { name: '   ' })).status).toBe(400)
    expect((await send('PUT', '/projects/p1/name', ada, { name: 'L'.repeat(65) })).status).toBe(400)
    const invite = async (email: string, role: string): Promise<string> => {
      await send('POST', '/projects/p1/invites', ada, { email, role })
      const token = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
      const cookie = await login(email)
      await send('POST', `/invites/${token}`, cookie)
      return cookie
    }
    const bo = await invite('bo@example.com', 'editor')
    const cy = await invite('cy@example.com', 'tester')
    const di = await invite('di@example.com', 'viewer')
    expect((await send('PUT', '/projects/p1/name', cy, { name: 'Testarens' })).status).toBe(403)
    expect((await send('PUT', '/projects/p1/name', di, { name: 'Tittarens' })).status).toBe(403)
    expect((await send('PUT', '/projects/p1/name', bo, { name: 'Bos namn' })).status).toBe(200)
    expect((await listed(ada))?.name).toBe('Bos namn')
  })
})
