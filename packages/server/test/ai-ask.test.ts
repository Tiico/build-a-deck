import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AiKeyVault, MemoryAiKeyStore } from '../src/ai-keys.js'
import { providersFromEnv } from '../src/ai-providers.js'
import { MemoryAuthStore } from '../src/auth.js'
import { MemoryProjectStore } from '../src/projects.js'
import type { ProjectDoc } from '../src/projects.js'
import type { AiCaps } from '../src/ai-ask.js'
import { fakeAiProvider, type FakeAiProvider } from '../../../test-support/fake-ai-provider.js'
import { template } from './deck.js'
import { listenInBand, start, twoSeatSetup, type Running } from './fixture.js'

// The editor's question, through the server (#1001, PRD module 6): the account's cookie, a role
// that may edit the game, the asker's own key, the game read from the server's own copy, and the
// answer streamed back as it comes. Hanging up hangs up on the provider; there is a ceiling on how
// many answers run at once, and on how long one may take; and the log says who, which provider, how
// long and how it went — never the key, the game, the question or the answer.
const ADA_KEY = 'sk-ant-api03-ada-NotARealKey-0123456789abcdefAAAA'
const BO_KEY = 'sk-proj-bo-NotARealKey-0123456789abcdefBBBB'
const GAME = 'Hemliga herrar'

let fake: FakeAiProvider
let provider: Server
let providerUrl = ''
beforeAll(async () => {
  fake = fakeAiProvider()
  provider = createServer(fake.listener)
  providerUrl = `http://127.0.0.1:${await listenInBand(provider)}`
})
afterAll(async () => {
  provider.closeAllConnections()
  await new Promise<void>((resolve) => provider.close(() => resolve()))
})

let run: Running | null = null
afterEach(async () => {
  vi.restoreAllMocks()
  await run?.stop()
  run = null
})

const doc = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name: GAME, template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

type World = { run: Running; vault: AiKeyVault; auth: MemoryAuthStore; projects: MemoryProjectStore; ada: string; bo: string }
async function world(caps?: Partial<AiCaps>): Promise<World> {
  const vault = new AiKeyVault(new MemoryAiKeyStore(), randomBytes(32))
  const providers = providersFromEnv({ AI_ANTHROPIC_URL: `${providerUrl}/anthropic`, AI_OPENAI_URL: `${providerUrl}/openai` })
  const auth = new MemoryAuthStore()
  const projects = new MemoryProjectStore()
  run = await start({ auth, projects, ai: { vault, providers, ...(caps ? { caps } : {}) } })
  const ada = await login(run, 'ada@example.com')
  const bo = await login(run, 'bo@example.com')
  const adaId = (await auth.ensureAccount('ada@example.com')).id
  await projects.create('p1', doc(), adaId)
  return { run, vault, auth, projects, ada, bo }
}

async function login(r: Running, email: string): Promise<string> {
  await fetch(`${r.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  const link = /\/auth\/verify\?token=\S+/.exec(r.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  return ((await fetch(`${r.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

const idOf = async (w: World, email: string) => (await w.auth.ensureAccount(email)).id

type Event = { t: 'text'; text: string } | { t: 'done' } | { t: 'failed'; kind: string }
type Asked = { status: number; events: Event[]; text: string; json: Record<string, unknown> | null }

function post(w: World, cookie: string, body: unknown, signal?: AbortSignal, project = 'p1'): Promise<Response> {
  return fetch(`${w.run.http}/projects/${project}/ai/ask`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body), ...(signal ? { signal } : {}) })
}

async function read(res: Response, onEvent?: (e: Event) => void): Promise<Asked> {
  if (!(res.headers.get('content-type') ?? '').startsWith('text/event-stream')) {
    const text = await res.text()
    return { status: res.status, events: [], text: '', json: text ? (JSON.parse(text) as Record<string, unknown>) : null }
  }
  const events: Event[] = []
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>
    try {
      chunk = await reader.read()
    } catch {
      break
    }
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const data = frame.split('\n').find((l) => l.startsWith('data: '))
      if (!data) continue
      const event = JSON.parse(data.slice(6)) as Event
      events.push(event)
      onEvent?.(event)
    }
  }
  return { status: res.status, events, text: events.flatMap((e) => (e.t === 'text' ? [e.text] : [])).join(''), json: null }
}

const ask = async (w: World, cookie: string, question: string, extra: Record<string, unknown> = {}) => read(await post(w, cookie, { question, turns: [], lang: 'sv', ...extra }))

const until = async (check: () => boolean, ms = 3000): Promise<void> => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('waited in vain')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('a question about the game', () => {
  it('is answered as a stream, with the game read from the server’s own copy and the owner’s own key', async () => {
    const w = await world()
    await w.vault.save(await idOf(w, 'ada@example.com'), 'anthropic', ADA_KEY)
    const asked = await ask(w, w.ada, 'Vad heter spelet?')
    expect(asked.status).toBe(200)
    expect(asked.events.filter((e) => e.t === 'text').length).toBeGreaterThan(1)
    expect(asked.events.at(-1)).toEqual({ t: 'done' })
    expect(asked.text).toBe(`Du frågade: «Vad heter spelet?». Spelet heter ${GAME}.`)
    const call = fake.calls.at(-1)!
    expect(call).toMatchObject({ provider: 'anthropic', path: '/v1/messages', key: ADA_KEY })
    const body = call.body as { model: string; system: { text: string }[]; messages: unknown[] }
    expect(body.model).toBe('claude-sonnet-5-5')
    expect(body.system[1]!.text).toContain(`# Game: ${GAME}`)
    expect(body.system[1]!.text).toContain('"title":"Drake"')
    expect(body.messages).toEqual([{ role: 'user', content: 'Vad heter spelet?' }])
  })

  it('reads the game as it stands in the editor, an edit not yet saved included', async () => {
    const w = await world()
    await w.vault.save(await idOf(w, 'ada@example.com'), 'anthropic', ADA_KEY)
    // The live document is the one an editor is looking at: a rename is an edit in the log first.
    const renamed = await fetch(`${w.run.http}/projects/p1/name`, { method: 'PUT', headers: { cookie: w.ada, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Nytt namn' }) })
    expect(renamed.status).toBe(200)
    expect((await fetch(`${w.run.http}/projects/p1`, { headers: { cookie: w.ada } }).then((r) => r.json()) as { name: string }).name).toBe(GAME)
    await ask(w, w.ada, 'Vad heter spelet?')
    expect(((fake.calls.at(-1)!.body as { system: { text: string }[] }).system[1]!.text)).toContain('# Game: Nytt namn')
  })

  it('carries the conversation so far, and the model and language the asker chose', async () => {
    const w = await world()
    await w.vault.save(await idOf(w, 'ada@example.com'), 'anthropic', ADA_KEY, 'claude-opus-5-5')
    const turns = [
      { role: 'user', text: 'Hur många kort?' },
      { role: 'assistant', text: 'Ett.' },
    ]
    expect((await ask(w, w.ada, 'Och vilket?', { turns, lang: 'en' })).events.at(-1)).toEqual({ t: 'done' })
    const body = fake.calls.at(-1)!.body as { model: string; system: { text: string }[]; messages: unknown[] }
    expect(body.model).toBe('claude-opus-5-5')
    expect(body.messages).toEqual([
      { role: 'user', content: 'Hur många kort?' },
      { role: 'assistant', content: 'Ett.' },
      { role: 'user', content: 'Och vilket?' },
    ])
    expect(body.system[0]!.text).toMatch(/language the designer writes in/)
    expect(body.system[0]!.text).toMatch(/uses the tool in English/)
  })

  it('takes nothing from the client but the question, the conversation and the language', async () => {
    const w = await world()
    await w.vault.save(await idOf(w, 'ada@example.com'), 'anthropic', ADA_KEY)
    const calls = fake.calls.length
    expect((await ask(w, w.ada, 'Hej', { context: 'Ett annat spel' })).status).toBe(400)
    expect((await ask(w, w.ada, '')).status).toBe(400)
    expect((await ask(w, w.ada, 'x'.repeat(4001))).status).toBe(400)
    expect((await ask(w, w.ada, 'Hej', { turns: [{ role: 'assistant', text: 'Först?' }] })).status).toBe(400)
    expect((await ask(w, w.ada, 'Hej', { turns: [{ role: 'user', text: 'Hej' }] })).status).toBe(400)
    // A body far past anything a conversation can be is not kept.
    expect((await read(await post(w, w.ada, { question: 'Hej', turns: [], padding: 'x'.repeat(2_000_000) }))).status).toBe(413)
    expect(fake.calls.length).toBe(calls)
  })
})

describe('who may ask', () => {
  it('lets a co-editor ask with her own key, never the owner’s', async () => {
    const w = await world()
    await w.vault.save(await idOf(w, 'ada@example.com'), 'anthropic', ADA_KEY)
    await w.projects.share('p1', await idOf(w, 'bo@example.com'), 'editor')
    // Without a key of her own she is told so, though the owner has one.
    expect(await ask(w, w.bo, 'Hej')).toMatchObject({ status: 409, json: { error: 'no-key' } })
    await w.vault.save(await idOf(w, 'bo@example.com'), 'openai', BO_KEY)
    const asked = await ask(w, w.bo, 'Hej')
    expect(asked.events.at(-1)).toEqual({ t: 'done' })
    expect(fake.calls.at(-1)).toMatchObject({ provider: 'openai', path: '/v1/responses', key: BO_KEY })
  })

  it('turns away whoever is not logged in, a stranger, a viewer and a tester, before a provider is asked', async () => {
    const w = await world()
    for (const email of ['ada@example.com', 'bo@example.com']) await w.vault.save(await idOf(w, email), 'anthropic', ADA_KEY)
    const calls = fake.calls.length
    expect((await ask(w, '', 'Hej')).status).toBe(401)
    expect((await ask(w, w.bo, 'Hej')).status).toBe(403)
    for (const role of ['viewer', 'tester'] as const) {
      await w.projects.share('p1', await idOf(w, 'bo@example.com'), role)
      expect((await ask(w, w.bo, 'Hej')).status).toBe(403)
    }
    expect((await read(await post(w, w.ada, { question: 'Hej', turns: [] }, undefined, 'nope'))).status).toBe(404)
    expect(fake.calls.length).toBe(calls)
  })
})

describe('what the provider said', () => {
  it.each([
    ['sk-ant-bad-0000000000000000', 'Hej', 'invalid-key'],
    ['sk-ant-broke-00000000000000', 'Hej', 'no-credit'],
    ['sk-ant-busy-000000000000000', 'Hej', 'rate-limit'],
    ['sk-ant-swamped-000000000000', 'Hej', 'overloaded'],
    ['sk-ant-hangup-0000000000000', 'Hej', 'network'],
    ['sk-ant-good-000000000000000', 'Elakt [refuse]', 'refused'],
    ['sk-ant-good-000000000000000', 'Halvvägs [fail]', 'overloaded'],
  ])('with %s and «%s» is said in its own word: %s', async (key, question, kind) => {
    const w = await world()
    await w.vault.save(await idOf(w, 'ada@example.com'), 'anthropic', key)
    const asked = await ask(w, w.ada, question)
    expect(asked.status).toBe(200)
    expect(asked.events.at(-1)).toEqual({ t: 'failed', kind })
  })
})

describe('an answer that is no longer wanted', () => {
  it('is hung up on at the provider when the asker hangs up', async () => {
    const w = await world()
    await w.vault.save(await idOf(w, 'ada@example.com'), 'anthropic', ADA_KEY)
    const stop = new AbortController()
    const opened = fake.streams.length
    await read(await post(w, w.ada, { question: 'Långt [slow]', turns: [] }, stop.signal), () => stop.abort())
    await until(() => fake.streams.length > opened && fake.streams.at(-1)!.closed)
    expect(fake.streams.at(-1)!.finished).toBe(false)
  })

  it('is stopped at the ceiling of how long one may take, and the asker is told', async () => {
    const w = await world({ timeoutMs: 300 })
    await w.vault.save(await idOf(w, 'ada@example.com'), 'anthropic', ADA_KEY)
    const asked = await ask(w, w.ada, 'Långt [slow]')
    expect(asked.events.at(-1)).toEqual({ t: 'failed', kind: 'timeout' })
    await until(() => fake.streams.at(-1)!.closed)
  })
})

describe('the ceilings', () => {
  it('lets an account have so many answers running at once, and the server so many in all', async () => {
    const w = await world({ perAccount: 1, total: 2 })
    const cilla = await login(w.run, 'cilla@example.com')
    for (const email of ['ada@example.com', 'bo@example.com', 'cilla@example.com']) await w.vault.save(await idOf(w, email), 'anthropic', ADA_KEY)
    for (const email of ['bo@example.com', 'cilla@example.com']) await w.projects.share('p1', await idOf(w, email), 'editor')
    const stops = [new AbortController(), new AbortController()]
    const first = await post(w, w.ada, { question: 'Långt [slow]', turns: [] }, stops[0]!.signal)
    expect(first.status).toBe(200)
    // The same account again: one at a time.
    expect(await ask(w, w.ada, 'Hej')).toMatchObject({ status: 429, json: { error: 'busy' } })
    const second = await post(w, w.bo, { question: 'Långt [slow]', turns: [] }, stops[1]!.signal)
    expect(second.status).toBe(200)
    // A third account finds the server full.
    expect(await ask(w, cilla, 'Hej')).toMatchObject({ status: 429, json: { error: 'busy' } })
    // An answer that ends gives its place back.
    stops[0]!.abort()
    await read(first).catch(() => undefined)
    await until(() => fake.streams.filter((s) => s.closed).length >= 1)
    let again: Asked | null = null
    for (let i = 0; i < 50 && again?.status !== 200; i++) {
      again = await ask(w, cilla, 'Hej')
      if (again.status !== 200) await new Promise((resolve) => setTimeout(resolve, 20))
    }
    expect(again!.events.at(-1)).toEqual({ t: 'done' })
    stops[1]!.abort()
    await read(second).catch(() => undefined)
  })
})

describe('the log', () => {
  it('says who asked, which provider, how long it took and how it went — and never the key, the game, the question or the answer', async () => {
    const w = await world()
    const ada = await idOf(w, 'ada@example.com')
    await w.vault.save(ada, 'anthropic', ADA_KEY)
    const printed: string[] = []
    const keep = (...args: unknown[]) => void printed.push(args.map(String).join(' '))
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, method).mockImplementation(keep)
    const write = (chunk: unknown) => (printed.push(String(chunk)), true)
    vi.spyOn(process.stdout, 'write').mockImplementation(write as never)
    vi.spyOn(process.stderr, 'write').mockImplementation(write as never)

    const asked = await ask(w, w.ada, 'HEMLIG-FRÅGA om draken?')
    expect(asked.text).toContain('HEMLIG-FRÅGA')
    const stop = new AbortController()
    await read(await post(w, w.ada, { question: 'Långt [slow]', turns: [] }, stop.signal), () => stop.abort())
    await until(() => printed.filter((l) => l.includes('"msg":"ai"')).length >= 2)
    vi.restoreAllMocks()

    const lines = printed.filter((l) => l.includes('"msg":"ai"')).map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(lines.map((l) => ({ ...l, ms: typeof l['ms'] }))).toEqual([
      { msg: 'ai', account: ada, provider: 'anthropic', ms: 'number', outcome: 'ok' },
      { msg: 'ai', account: ada, provider: 'anthropic', ms: 'number', outcome: 'cancelled' },
    ])
    const all = printed.join('\n')
    for (const secret of [ADA_KEY, ADA_KEY.slice(0, 20), 'HEMLIG-FRÅGA', GAME, 'Drake', 'Du frågade', 'Långt']) expect(all).not.toContain(secret)
  })
})
