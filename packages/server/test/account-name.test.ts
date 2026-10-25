import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NAME_MAX, nameOf, suggestedName } from '../src/account-name.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'

// The account's own name (#1254, beställarens beslut 2026-10-24, variant C): what the others call
// the designer. It is suggested out of the address, set or passed by once at the first login,
// changed in Profil, and said to nobody as the address.

describe('the name the address suggests (#1198, #1254)', () => {
  it('is the first word before the @ that reads as one, with a capital', () => {
    expect(suggestedName('nicklas.ockelberg@example.com')).toBe('Nicklas')
    expect(suggestedName('ockelberg@gmail.com')).toBe('Ockelberg')
    expect(suggestedName('ada-3@example.com')).toBe('Ada')
    expect(suggestedName('e2e-owner+1198@example.com')).toBe('Owner')
    expect(suggestedName('åsa_lind@example.se')).toBe('Åsa')
  })

  it('suggests nothing for an address with no such word', () => {
    expect(suggestedName('x1@example.com')).toBeNull()
    expect(suggestedName('12345@example.com')).toBeNull()
    expect(suggestedName('a.b@example.com')).toBeNull()
  })

  it('never carries anything of the address but the word', () => {
    for (const email of ['nicklas.ockelberg@example.com', 'ada-3@example.com', 'ockelberg@gmail.com']) expect(suggestedName(email)).not.toMatch(/[@.\-+_\d]|example|gmail/i)
  })
})

describe('a name as the account keeps it (#1254)', () => {
  it('is trimmed, and nothing but space is no name', () => {
    expect(nameOf('  Nicklas O.  ')).toEqual({ ok: true, name: 'Nicklas O.' })
    expect(nameOf('   ')).toEqual({ ok: true, name: null })
    expect(nameOf('')).toEqual({ ok: true, name: null })
    expect(nameOf(null)).toEqual({ ok: true, name: null })
  })

  it('is at most forty characters, counted as a reader counts them', () => {
    expect(NAME_MAX).toBe(40)
    expect(nameOf('M'.repeat(40))).toEqual({ ok: true, name: 'M'.repeat(40) })
    expect(nameOf('M'.repeat(41))).toEqual({ ok: false })
    // An emoji is one character to the reader and two to JavaScript; Postgres counts it as one too.
    expect(nameOf('🎲'.repeat(40))).toEqual({ ok: true, name: '🎲'.repeat(40) })
  })

  it('is text and nothing else', () => {
    expect(nameOf(42)).toEqual({ ok: false })
    expect(nameOf({ name: 'Ada' })).toEqual({ ok: false })
    // A line break would split every sentence the name stands in.
    expect(nameOf('Ada\nLovelace')).toEqual({ ok: false })
  })
})

describe('the name over the wire (#1254)', () => {
  let run: Running
  beforeEach(async () => {
    run = await start()
  })
  afterEach(async () => {
    await run.stop()
  })
  const call = (method: string, path: string, body?: unknown, cookie?: string) =>
    fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' })
  // The link, followed: where it lands, and the session it makes.
  async function follow(email: string, next = '/editor?project=p1'): Promise<{ location: string | null; cookie: string }> {
    expect((await call('POST', '/auth/login', { email, next })).status).toBe(200)
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.findLast((m) => m.to === email)?.text ?? '')?.[0] ?? ''
    const res = await call('GET', link)
    expect(res.status).toBe(302)
    return { location: res.headers.get('location'), cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '' }
  }

  it('lands the first login on the welcome step, with where it was going beside it', async () => {
    const { location, cookie } = await follow('nicklas.ockelberg@example.com')
    expect(location).toBe(`/login?step=name&next=${encodeURIComponent('/editor?project=p1')}`)
    expect(await (await call('GET', '/auth/me', undefined, cookie)).json()).toEqual({ email: 'nicklas.ockelberg@example.com', name: null, asked: false })
  })

  it('keeps the name it is given, and asks no more once it has been answered', async () => {
    const { cookie } = await follow('nicklas.ockelberg@example.com')
    const saved = await call('PUT', '/me/name', { name: '  Nicklas Ockelberg ' }, cookie)
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ name: 'Nicklas Ockelberg' })
    expect(await (await call('GET', '/auth/me', undefined, cookie)).json()).toEqual({ email: 'nicklas.ockelberg@example.com', name: 'Nicklas Ockelberg', asked: true })
    // The next link goes where it was going.
    expect((await follow('nicklas.ockelberg@example.com')).location).toBe('/editor?project=p1')
  })

  it('passes by with no name, and the question does not come back (Hoppa över)', async () => {
    const { cookie } = await follow('info@lekverkstan.se')
    expect((await call('PUT', '/me/name', { name: null }, cookie)).status).toBe(200)
    expect(await (await call('GET', '/auth/me', undefined, cookie)).json()).toEqual({ email: 'info@lekverkstan.se', name: null, asked: true })
    expect((await follow('info@lekverkstan.se')).location).toBe('/editor?project=p1')
  })

  it('refuses a name over forty characters and keeps the one it had', async () => {
    const { cookie } = await follow('ada@example.com')
    await call('PUT', '/me/name', { name: 'Ada' }, cookie)
    const refused = await call('PUT', '/me/name', { name: 'M'.repeat(41) }, cookie)
    expect(refused.status).toBe(400)
    expect(await (await call('GET', '/auth/me', undefined, cookie)).json()).toMatchObject({ name: 'Ada' })
  })

  it('is the account\'s own: nobody logged in sets none', async () => {
    expect((await call('PUT', '/me/name', { name: 'Ada' })).status).toBe(401)
  })

  it('sends the development login on to the welcome step too, by the page that asks', async () => {
    await run.stop()
    run = await start({ authBypass: true })
    const res = await call('POST', '/auth/login', { email: 'ada@example.com', next: '/new' })
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    // The page goes on by itself after this answer, so the answer is where it reads that the account
    // has not been asked.
    expect(await (await call('GET', '/auth/me', undefined, cookie)).json()).toEqual({ email: 'ada@example.com', name: null, asked: false })
  })
})

// Where the others read it (#1254): Dela's list, the invitation, and who is in the editor. The
// address stays where it was — Dela shows it, as it always has — and a name nobody gave is no name.
describe('the name where the others read it (#1254)', () => {
  let run: Running
  beforeEach(async () => {
    run = await start()
  })
  afterEach(async () => {
    await run.stop()
  })
  const send = (method: string, path: string, cookie: string, body?: unknown) =>
    fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const login = async (email: string, name?: string): Promise<string> => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const cookie = ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    if (name !== undefined) await send('PUT', '/me/name', cookie, { name })
    return cookie
  }
  const game = () => {
    const { zones, seats, floor } = twoSeatSetup()
    return { id: 'p1', name: 'Skogens råd', template, rows: [{ id: 'a', fields: { title: 'A' } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
  }
  async function shared(): Promise<{ ada: string; bo: string }> {
    const ada = await login('nicklas.ockelberg@example.com', 'Nicklas Ockelberg')
    await send('POST', '/projects', ada, game())
    await send('POST', '/projects/p1/invites', ada, { email: 'bo@example.com', role: 'editor' })
    const token = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    const bo = await login('bo@example.com')
    await send('POST', `/invites/${token}`, bo)
    return { ada, bo }
  }

  it('lists each member by the name they gave, beside the address Dela already shows', async () => {
    const { ada } = await shared()
    expect(await (await send('GET', '/projects/p1/members', ada)).json()).toEqual([
      { email: 'nicklas.ockelberg@example.com', name: 'Nicklas Ockelberg', role: 'owner' },
      { email: 'bo@example.com', role: 'editor' },
    ])
  })

  it('mails the invitation from the name, with the address in brackets', async () => {
    await shared()
    const letter = run.mail.sent.find((m) => m.to === 'bo@example.com' && m.subject.includes('Skogens råd'))!
    expect(letter.subject).toBe('Nicklas Ockelberg bjuder in dig till Skogens råd')
    expect(letter.text).toContain('Nicklas Ockelberg (nicklas.ockelberg@example.com) vill dela spelet Skogens råd')
  })

  it('says who is in the editor by the server’s word for them, never the one the page sent', async () => {
    const { ada, bo } = await shared()
    const { WebSocket } = await import('ws')
    type Here = { id: string; name: string; email?: string; role?: string }
    const open = async (cookie: string) => {
      // The page's own word for itself is what a page from before the name sent; it is not believed.
      const socket = new WebSocket(`${run.base}/projects/p1/edit?name=${encodeURIComponent('vem som helst')}`, { headers: { cookie } })
      const seen: { v: string; here?: Here[]; you?: Here }[] = []
      socket.on('message', (d) => seen.push(JSON.parse(d.toString()) as { v: string }))
      await new Promise<void>((resolve, reject) => {
        socket.on('open', () => resolve())
        socket.on('close', (code) => reject(new Error(`closed ${code}`)))
      })
      for (let waited = 0; waited < 2000 && !seen.some((m) => m.v === 'project'); waited += 10) await new Promise((r) => setTimeout(r, 10))
      return { socket, seen }
    }
    const nicklas = await open(ada)
    expect(nicklas.seen.find((m) => m.v === 'project')?.you).toMatchObject({ name: 'Nicklas Ockelberg', email: 'nicklas.ockelberg@example.com', role: 'owner' })
    const kim = await open(bo)
    // Bo has given no name: the others see the address, as the header always showed it.
    const here = kim.seen.find((m) => m.v === 'project')?.here ?? []
    expect(here.map((p) => [p.name, p.email])).toEqual([
      ['Nicklas Ockelberg', 'nicklas.ockelberg@example.com'],
      ['bo@example.com', 'bo@example.com'],
    ])
    nicklas.socket.close()
    kim.socket.close()
  })
})
