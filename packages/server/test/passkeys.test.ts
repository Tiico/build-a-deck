import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SoftPasskey } from '../../../test-support/soft-passkey.js'
import { start, type Running } from './fixture.js'

// Passkeys (#1180, DRIFT §11): whoever logged in with the link may save a passkey in the browser,
// and logs in with it the next time without a mail. The mail stays the way in and the way back.
// Every ceremony here is real WebAuthn bytes from a software keychain, checked by the library.
let run: Running
beforeEach(async () => {
  run = await start()
})
afterEach(async () => {
  await run.stop()
})

// The fixture's public origin is the page the browser stands on, and so the passkey's site.
const ORIGIN = 'http://test.local'

const call = async (method: string, path: string, body?: unknown, cookie?: string): Promise<{ status: number; json: any; cookie: string }> => {
  const res = await fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '' }
}

async function login(email = 'ada@example.com'): Promise<string> {
  await call('POST', '/auth/login', { email })
  const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  return ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

async function save(keychain: SoftPasskey, cookie: string): Promise<{ status: number; json: any }> {
  const options = await call('POST', '/auth/passkeys/register/options', {}, cookie)
  expect(options.status).toBe(200)
  return call('POST', '/auth/passkeys/register', { response: keychain.create(options.json) }, cookie)
}

async function passkeyLogin(keychain: SoftPasskey): Promise<{ status: number; json: any; cookie: string }> {
  const options = await call('POST', '/auth/passkeys/login/options', {})
  expect(options.status).toBe(200)
  return call('POST', '/auth/passkeys/login', { response: keychain.get(options.json) })
}

describe('a passkey saved after the link logs in without a mail', () => {
  it('logs the account in from a browser that has no session, and no mail is sent', async () => {
    const keychain = new SoftPasskey(ORIGIN)
    expect((await save(keychain, await login())).status).toBe(200)
    const mails = run.mail.sent.length

    const res = await passkeyLogin(keychain)

    expect(res.status).toBe(200)
    expect(res.cookie).toMatch(/^byd_session=.+/)
    expect((await call('GET', '/auth/me', undefined, res.cookie)).json).toEqual({ email: 'ada@example.com' })
    expect(run.mail.sent.length).toBe(mails)
  })
})

describe('the passkeys on the profile', () => {
  const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

  it('lists the account’s own, by keychain and the browser it was saved from, and when it was last used', async () => {
    const cookie = await login()
    const keychain = new SoftPasskey(ORIGIN)
    const options = await call('POST', '/auth/passkeys/register/options', {}, cookie)
    const saved = await fetch(`${run.http}/auth/passkeys/register`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, 'user-agent': SAFARI }, body: JSON.stringify({ response: keychain.create(options.json) }) })
    expect(saved.status).toBe(200)
    await save(new SoftPasskey(ORIGIN), await login('bo@example.com'))

    const before = await call('GET', '/auth/passkeys', undefined, cookie)
    expect(before.status).toBe(200)
    expect(before.json).toEqual({ passkeys: [{ id: expect.any(String), keychain: 'icloud', device: 'Safari · macOS', createdAt: expect.any(String), lastUsedAt: null }] })
    expect(JSON.stringify(before.json)).not.toMatch(/publicKey|counter/)

    await passkeyLogin(keychain)
    expect((await call('GET', '/auth/passkeys', undefined, cookie)).json.passkeys[0].lastUsedAt).toEqual(expect.any(String))
  })

  it('takes one away, which then logs nobody in; and nobody else may take it', async () => {
    const keychain = new SoftPasskey(ORIGIN)
    const cookie = await login()
    const { id } = (await save(keychain, cookie)).json
    const other = await login('bo@example.com')

    expect((await call('DELETE', `/auth/passkeys/${id}`, undefined, other)).status).toBe(404)
    expect((await call('DELETE', `/auth/passkeys/${id}`, undefined, cookie)).status).toBe(200)
    expect((await call('GET', '/auth/passkeys', undefined, cookie)).json).toEqual({ passkeys: [] })

    const res = await passkeyLogin(keychain)
    expect(res.status).toBe(401)
    expect(res.cookie).toBe('')
  })

  it('is the account’s: nobody logged out may list, save or remove one', async () => {
    for (const [method, path] of [['GET', '/auth/passkeys'], ['POST', '/auth/passkeys/register/options'], ['POST', '/auth/passkeys/register'], ['DELETE', '/auth/passkeys/x']] as const) {
      expect({ method, path, status: (await call(method, path, method === 'POST' ? {} : undefined)).status }).toEqual({ method, path, status: 401 })
    }
  })
})

describe('what a passkey login refuses', () => {
  it('spends its challenge: the same signed answer twice logs in once', async () => {
    const keychain = new SoftPasskey(ORIGIN)
    await save(keychain, await login())
    const options = await call('POST', '/auth/passkeys/login/options', {})
    const signed = keychain.get(options.json)
    expect((await call('POST', '/auth/passkeys/login', { response: signed })).status).toBe(200)
    const again = await call('POST', '/auth/passkeys/login', { response: signed })
    expect(again.status).toBe(401)
    expect(again.cookie).toBe('')
  })

  it('takes no passkey made for another site, at saving or at login', async () => {
    const cookie = await login()
    const elsewhere = new SoftPasskey(ORIGIN)
    const options = await call('POST', '/auth/passkeys/register/options', {}, cookie)
    expect((await call('POST', '/auth/passkeys/register', { response: elsewhere.create(options.json, { origin: 'http://evil.test' }) }, cookie)).status).toBe(400)

    const keychain = new SoftPasskey(ORIGIN)
    await save(keychain, cookie)
    const login2 = await call('POST', '/auth/passkeys/login/options', {})
    expect((await call('POST', '/auth/passkeys/login', { response: keychain.get(login2.json, { origin: 'http://evil.test' }) })).status).toBe(401)
  })

  it('never names a passkey or an account before the login, and treats every unknown passkey alike', async () => {
    const options = await call('POST', '/auth/passkeys/login/options', {})
    expect(options.json.allowCredentials ?? []).toEqual([])
    expect(options.json.rpId).toBe('test.local')

    const stranger = new SoftPasskey(ORIGIN)
    stranger.create({ challenge: 'AAAA', rp: { id: 'test.local' }, user: { id: 'eA' } })
    const res = await call('POST', '/auth/passkeys/login', { response: stranger.get(options.json) })
    expect(res.status).toBe(401)
    expect(res.json).toEqual({ error: 'that passkey is not known here; log in with the link' })
  })

  it('logs nobody in from a page on another site, which could otherwise log a visitor into someone else’s account', async () => {
    const keychain = new SoftPasskey(ORIGIN)
    await save(keychain, await login())
    const options = await call('POST', '/auth/passkeys/login/options', {})
    const res = await fetch(`${run.http}/auth/passkeys/login`, { method: 'POST', headers: { 'content-type': 'text/plain', origin: 'http://evil.test' }, body: JSON.stringify({ response: keychain.get(options.json) }) })
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('makes a second passkey for the same keychain impossible to save twice', async () => {
    const cookie = await login()
    const options = await call('POST', '/auth/passkeys/register/options', {}, cookie)
    expect(options.json.authenticatorSelection).toMatchObject({ residentKey: 'required' })
    const keychain = new SoftPasskey(ORIGIN)
    const { id } = (await save(keychain, cookie)).json
    const next = await call('POST', '/auth/passkeys/register/options', {}, cookie)
    expect(next.json.excludeCredentials).toEqual([expect.objectContaining({ id })])
  })
})
