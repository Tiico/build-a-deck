import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryProjectStore, canEdit, canRead, canStartTables, ROLES } from '../src/index.js'
import { template } from './deck.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import type { ProjectDoc } from '../src/projects.js'

const doc = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name: 'Skogens herrar', template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

describe('what each role may do with a project (D3)', () => {
  it('reads from the role alone, so no route has to remember the rules', () => {
    expect(ROLES).toEqual(['owner', 'editor', 'tester', 'viewer'])
    expect(ROLES.filter(canRead)).toEqual(['owner', 'editor', 'tester', 'viewer'])
    expect(ROLES.filter(canEdit)).toEqual(['owner', 'editor'])
    // A test leader runs playtests: tables yes, the deck no.
    expect(ROLES.filter(canStartTables)).toEqual(['owner', 'editor', 'tester'])
  })
})

describe('who a project is shared with (D3)', () => {
  it('keeps the owner apart from the others, and says what role an account has', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc(), 'ada')
    expect(await store.roleOf('p1', 'ada')).toBe('owner')
    expect(await store.roleOf('p1', 'bo')).toBeNull()

    await store.share('p1', 'bo', 'editor')
    await store.share('p1', 'cilla', 'viewer')
    expect(await store.roleOf('p1', 'bo')).toBe('editor')
    expect((await store.members('p1')).map((m) => [m.account, m.role])).toEqual([
      ['ada', 'owner'],
      ['bo', 'editor'],
      ['cilla', 'viewer'],
    ])

    // Sharing again moves the role rather than adding a second one.
    await store.share('p1', 'bo', 'tester')
    expect(await store.roleOf('p1', 'bo')).toBe('tester')
    expect(await store.members('p1')).toHaveLength(3)

    await store.unshare('p1', 'bo')
    expect(await store.roleOf('p1', 'bo')).toBeNull()
    // The owner cannot be shared away.
    await expect(store.unshare('p1', 'ada')).rejects.toThrow(/owner/)

    // A project from before accounts belongs to nobody and is open to anyone, as it always was.
    await store.create('p2', doc())
    expect(await store.roleOf('p2', 'bo')).toBe('owner')
  })

  it('lists a project for everyone it is shared with, not only its owner', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc(), 'ada')
    await store.share('p1', 'bo', 'viewer')
    expect((await store.list('bo')).map((p) => p.id)).toEqual(['p1'])
    expect((await store.list('bo'))[0]).toMatchObject({ role: 'viewer' })
    expect((await store.list('ada'))[0]).toMatchObject({ role: 'owner' })
    expect(await store.list('cilla')).toEqual([])
  })
})

describe('an invitation to a project (D3)', () => {
  let run: Running
  const login = async (email: string): Promise<string> => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
    return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  }
  const send = (method: string, path: string, cookie: string, body?: unknown) =>
    fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })

  beforeEach(async () => {
    run = await start()
  })
  afterEach(async () => {
    await run.stop()
  })

  it('is written in the language the one who invites is reading the tool in (A4)', async () => {
    const ada = await login('ada@example.com')
    await send('POST', '/projects', ada, { id: 'p1', ...doc() })

    await send('POST', '/projects/p1/invites', ada, { email: 'bo@example.com', role: 'editor', lang: 'en' })
    const english = run.mail.sent.at(-1)!
    expect(english.subject).toBe('You are invited to Skogens herrar')
    expect(english.text).toContain('as a co-editor')
    expect(english.text).toContain('/invites/')

    await send('POST', '/projects/p1/invites', ada, { email: 'cee@example.com', role: 'viewer' })
    const swedish = run.mail.sent.at(-1)!
    expect(swedish.subject).toBe('Du är inbjuden till Skogens herrar')
    expect(swedish.text).toContain('som betraktare')
  })

  it('is mailed to an address, and joins the project to whoever follows it', async () => {
    const ada = await login('ada@example.com')
    expect((await send('POST', '/projects', ada, { id: 'p1', ...doc() })).status).toBe(201)

    const invited = await send('POST', '/projects/p1/invites', ada, { email: 'bo@example.com', role: 'editor' })
    expect(invited.status).toBe(201)
    const letter = run.mail.sent.at(-1)!
    expect(letter.to).toBe('bo@example.com')
    expect(letter.text).toContain('Skogens herrar')
    const link = /\/invites\/([A-Za-z0-9_-]+)/.exec(letter.text)?.[1] ?? ''
    expect(link.length).toBeGreaterThan(10)

    // Bo cannot see the project until the invitation is followed.
    const bo = await login('bo@example.com')
    expect((await send('GET', '/projects/p1', bo)).status).toBe(403)
    expect((await send('POST', `/invites/${link}`, bo)).status).toBe(200)
    expect((await send('GET', '/projects/p1', bo)).status).toBe(200)
    expect(((await (await send('GET', '/projects', bo)).json()) as { id: string }[]).map((p) => p.id)).toEqual(['p1'])

    // An invitation is good once.
    expect((await send('POST', `/invites/${link}`, bo)).status).toBe(404)
  })

  it("is the owner's to send, and only to a role that exists", async () => {
    const ada = await login('ada@example.com')
    await send('POST', '/projects', ada, { id: 'p1', ...doc() })
    await send('POST', '/projects/p1/invites', ada, { email: 'bo@example.com', role: 'viewer' })
    // The invitation is read before Bo logs in: logging in mails a letter of its own.
    const link = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    const bo = await login('bo@example.com')
    await send('POST', `/invites/${link}`, bo)

    // A viewer may look and may not invite.
    expect((await send('GET', '/projects/p1', bo)).status).toBe(200)
    expect((await send('POST', '/projects/p1/invites', bo, { email: 'cilla@example.com', role: 'editor' })).status).toBe(403)
    expect((await send('POST', '/projects/p1/invites', ada, { email: 'cilla@example.com', role: 'kung' })).status).toBe(400)
  })

  it('says who a project is shared with, and lets the owner take it back', async () => {
    const ada = await login('ada@example.com')
    await send('POST', '/projects', ada, { id: 'p1', ...doc() })
    await send('POST', '/projects/p1/invites', ada, { email: 'bo@example.com', role: 'editor' })
    const link = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    const bo = await login('bo@example.com')
    await send('POST', `/invites/${link}`, bo)

    const shared = (await (await send('GET', '/projects/p1/members', ada)).json()) as { email: string; role: string }[]
    expect(shared).toEqual([
      { email: 'ada@example.com', role: 'owner' },
      { email: 'bo@example.com', role: 'editor' },
    ])
    expect((await send('DELETE', '/projects/p1/members/bo@example.com', ada)).status).toBe(200)
    expect((await send('GET', '/projects/p1', bo)).status).toBe(403)
  })
})

describe('what a role may do while the project is open (D3)', () => {
  let run: Running
  const login = async (email: string): Promise<string> => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
    return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  }
  const send = (method: string, path: string, cookie: string, body?: unknown) =>
    fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })

  beforeEach(async () => {
    run = await start()
  })
  afterEach(async () => {
    await run.stop()
  })

  // Shares the project with an address in the role given, and answers with that account's cookie.
  const shareWith = async (owner: string, email: string, role: string): Promise<string> => {
    await send('POST', '/projects/p1/invites', owner, { email, role })
    const link = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    const cookie = await login(email)
    await send('POST', `/invites/${link}`, cookie)
    return cookie
  }

  it('lets a test leader start a table and refuses one to a viewer', async () => {
    const ada = await login('ada@example.com')
    await send('POST', '/projects', ada, { id: 'p1', ...doc() })
    const tester = await shareWith(ada, 'bo@example.com', 'tester')
    const viewer = await shareWith(ada, 'cilla@example.com', 'viewer')

    expect((await send('POST', '/projects/p1/sessions', tester, {})).status).toBe(201)
    expect((await send('POST', '/projects/p1/sessions', viewer, {})).status).toBe(403)
    // Neither of them may change the deck; only the owner may share it further.
    expect((await send('PUT', '/projects/p1', tester, { rev: 1, ...doc() })).status).toBe(403)
    expect((await send('DELETE', '/projects/p1', tester)).status).toBe(403)
  })

  it('lets a co-editor onto the wire and keeps a viewer from writing on it', async () => {
    const ada = await login('ada@example.com')
    await send('POST', '/projects', ada, { id: 'p1', ...doc() })
    const editor = await shareWith(ada, 'bo@example.com', 'editor')
    const viewer = await shareWith(ada, 'cilla@example.com', 'viewer')

    const open = async (cookie: string) => {
      const { WebSocket } = await import('ws')
      const ws = new WebSocket(`${run.base}/projects/p1/edit?name=x`, { headers: { cookie } })
      const seen: { v: string; why?: string }[] = []
      ws.on('message', (d) => seen.push(JSON.parse(d.toString()) as { v: string }))
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => setTimeout(resolve, 60))
        ws.on('close', (code) => reject(new Error(`closed ${code}`)))
      })
      return { ws, seen }
    }

    const asEditor = await open(editor)
    asEditor.ws.send(JSON.stringify({ t: 'edit', intent: { v: 'rename', name: 'Av medredigeraren' } }))
    await new Promise((r) => setTimeout(r, 120))
    expect(asEditor.seen.some((m) => m.v === 'edits')).toBe(true)
    asEditor.ws.close()

    // A viewer may watch the project change and may not change it.
    const asViewer = await open(viewer)
    expect(asViewer.seen[0]?.v).toBe('project')
    asViewer.ws.send(JSON.stringify({ t: 'edit', intent: { v: 'rename', name: 'Av betraktaren' } }))
    await new Promise((r) => setTimeout(r, 120))
    expect(asViewer.seen.find((m) => m.v === 'refused')?.why).toMatch(/betraktare|viewer/)
    expect((await run.projects.load('p1'))?.name).toBe('Skogens herrar')
    asViewer.ws.close()
  })
})
