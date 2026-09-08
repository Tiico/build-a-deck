import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { start, type Running } from './fixture.js'
import { template } from './deck.js'
import { twoSeatSetup } from './fixture.js'

// Accounts for creators (G1, DRIFT §11): a magic link by mail, a session cookie, no passwords.
// Guests never log in: tables, phones and observers are reached by room code alone.
let run: Running
beforeEach(async () => {
  run = await start()
})
afterEach(async () => {
  await run.stop()
})

const post = (path: string, body: unknown, cookie?: string) =>
  fetch(`${run.http}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body), redirect: 'manual' })
const get = (path: string, cookie?: string) => fetch(`${run.http}${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' })

async function login(email: string): Promise<string> {
  expect((await post('/auth/login', { email, next: '/editor?project=p1' })).status).toBe(200)
  const mail = run.mail.sent.findLast((m) => m.to === email)
  if (!mail) throw new Error('no mail')
  const link = /https?:\/\/\S+\/auth\/verify\?token=[A-Za-z0-9_-]+\S*/.exec(mail.text)?.[0]
  if (!link) throw new Error(`no link in ${mail.text}`)
  const res = await get(new URL(link).pathname + new URL(link).search)
  expect(res.status).toBe(302)
  expect(res.headers.get('location')).toBe('/editor?project=p1')
  const cookie = res.headers.get('set-cookie') ?? ''
  expect(cookie).toMatch(/byd_session=[^;]+; .*HttpOnly/)
  return cookie.split(';')[0] ?? ''
}

function project() {
  const { zones, seats, floor } = twoSeatSetup()
  return { name: 'Mitt spel', template, rows: [{ id: 'a', fields: { title: 'A' } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

describe('logging in with a magic link', () => {
  it('logs in immediately without mailing when the explicit test bypass is enabled', async () => {
    await run.stop()
    run = await start({ authBypass: true })

    const res = await post('/auth/login', { email: 'ada@example.com', next: '/new' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, loggedIn: true })
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/byd_session=[^;]+; .*HttpOnly/)
    expect(await (await get('/auth/me', cookie)).json()).toEqual({ email: 'ada@example.com' })
    expect(run.mail.sent).toHaveLength(0)
  })

  it('mails a link, which sets a session cookie once; /auth/me then knows who you are, and logout forgets', async () => {
    const cookie = await login('ada@example.com')
    expect(await (await get('/auth/me', cookie)).json()).toEqual({ email: 'ada@example.com' })
    expect((await get('/auth/me')).status).toBe(401)
    // The same link a second time is refused.
    const mail = run.mail.sent.at(-1)
    const link = /\/auth\/verify\?token=\S+/.exec(mail?.text ?? '')?.[0] ?? ''
    expect((await get(link)).status).toBe(400)
    expect((await post('/auth/logout', {}, cookie)).status).toBe(200)
    expect((await get('/auth/me', cookie)).status).toBe(401)
  })

  it('lands the browser on the web app after the link when that is another origin (development)', async () => {
    await run.stop()
    run = await start({ appOrigin: 'http://localhost:5173' })
    await post('/auth/login', { email: 'ada@example.com', next: '/new' })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const res = await get(link)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost:5173/new')
  })

  it('never says whether an address exists, and does not mail the same address more than five times an hour', async () => {
    for (let i = 0; i < 5; i++) expect((await post('/auth/login', { email: 'bo@example.com' })).status).toBe(200)
    expect((await post('/auth/login', { email: 'bo@example.com' })).status).toBe(429)
    expect(run.mail.sent.filter((m) => m.to === 'bo@example.com')).toHaveLength(5)
    expect((await post('/auth/login', { email: 'not an address' })).status).toBe(400)
  })
})

describe('projects belong to accounts (G1)', () => {
  it('creating needs a login and records the owner; only the owner reads, writes, lists and starts tables', async () => {
    expect((await post('/projects', { id: 'p1', ...project() })).status).toBe(401)
    const ada = await login('ada@example.com')
    expect((await post('/projects', { id: 'p1', ...project() }, ada)).status).toBe(201)
    // The listing also says what has been played (G1): no tables yet, so nothing has.
    expect(await (await get('/projects', ada)).json()).toEqual([{ id: 'p1', name: 'Mitt spel', rev: 1, tables: 0, lastPlayed: null }])
    const bo = await login('bo@example.com')
    expect((await get('/projects/p1', bo)).status).toBe(403)
    expect((await get('/projects/p1')).status).toBe(401)
    expect((await fetch(`${run.http}/projects/p1`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: bo }, body: JSON.stringify({ ...project(), rev: 1 }) })).status).toBe(403)
    expect((await post('/projects/p1/sessions', {}, bo)).status).toBe(403)
    expect((await post('/projects/p1/sessions', {}, ada)).status).toBe(201)
    expect(await (await get('/projects', bo)).json()).toEqual([])
    // A project without an owner (from before accounts) stays open, as the seed makes them.
    await run.projects.create('legacy', project())
    expect((await get('/projects/legacy')).status).toBe(200)
  })
})
