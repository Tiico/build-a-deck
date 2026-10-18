import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AiProviderError, anthropicAdapter, openaiAdapter, type AiFailure, type AiProviderAdapter, type AiRequest } from '../src/ai-providers.js'
import { fakeAiProvider, type FakeAiProvider } from '../../../test-support/fake-ai-provider.js'
import { listenInBand } from './fixture.js'

// The streamed answer (#1001, PRD module 2): a request in — the instructions, the game, the
// conversation, the model — and a stream of events out, text as it comes and then the end; or one
// of the closed set of words for why the provider said no. Against the fake that speaks each
// provider's own server-sent events, and never the real ones.
let fake: FakeAiProvider
let server: Server
let base = ''
beforeAll(async () => {
  fake = fakeAiProvider()
  server = createServer(fake.listener)
  base = `http://127.0.0.1:${await listenInBand(server)}`
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const request = (question: string, model = 'the-model'): AiRequest => ({
  model,
  instructions: 'You are the AI help.',
  context: "# Game: Sal's Saloon\nThe rest of the game.",
  messages: [
    { role: 'user', text: 'Hur många kort?' },
    { role: 'assistant', text: 'Sjuttiosju.' },
    { role: 'user', text: question },
  ],
  maxTokens: 1024,
})

type Ran = { texts: string[]; done: boolean; failure: AiFailure | null }
async function run(adapter: AiProviderAdapter, key: string, question: string, signal?: AbortSignal, onText?: (text: string) => void): Promise<Ran> {
  const ran: Ran = { texts: [], done: false, failure: null }
  try {
    for await (const event of adapter.complete(key, request(question), signal)) {
      if (event.type === 'text') {
        ran.texts.push(event.text)
        onText?.(event.text)
      }
      if (event.type === 'done') ran.done = true
    }
  } catch (err) {
    if (!(err instanceof AiProviderError)) throw err
    ran.failure = err.kind
  }
  return ran
}

const until = async (check: () => boolean, ms = 3000): Promise<void> => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('waited in vain')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

for (const [name, make, key] of [
  ['Anthropic', (idleMs = 2000) => anthropicAdapter({ baseUrl: `${base}/anthropic`, timeoutMs: 2000, idleMs }), 'sk-ant-good'],
  ['OpenAI', (idleMs = 2000) => openaiAdapter({ baseUrl: `${base}/openai`, timeoutMs: 2000, idleMs }), 'sk-proj-good'],
] as const) {
  describe(`${name}, streamed`, () => {
    it('streams the answer in pieces as they come, and then says it is done', async () => {
      const ran = await run(make(), key, 'Vad heter spelet?')
      expect(ran.failure).toBeNull()
      expect(ran.done).toBe(true)
      expect(ran.texts.length).toBeGreaterThan(1)
      expect(ran.texts.join('')).toBe("Du frågade: «Vad heter spelet?». Spelet heter Sal's Saloon.")
    })

    it('says why the provider said no, in one of the six words', async () => {
      const adapter = make()
      const said = async (k: string, q = 'Hej?') => (await run(adapter, k, q)).failure
      expect(await said(`${key}-bad`)).toBe('invalid-key')
      expect(await said(`${key}-broke`)).toBe('no-credit')
      expect(await said(`${key}-busy`)).toBe('rate-limit')
      expect(await said(`${key}-swamped`)).toBe('overloaded')
      expect(await said(`${key}-hangup`)).toBe('network')
      expect(await said(key, 'Skriv något elakt [refuse]')).toBe('refused')
      expect((await run(make(), key, 'Hej', undefined)).failure).toBeNull()
    })

    it('keeps what came before a failure in the middle of the answer, and says the failure', async () => {
      const ran = await run(make(), key, 'Berätta [fail]')
      expect(ran.texts.join('')).not.toBe('')
      expect(ran.done).toBe(false)
      expect(ran.failure).toBe('overloaded')
    })

    it('calls a line that goes quiet a line that failed', async () => {
      const ran = await run(make(200), key, 'Tyst [silent]')
      expect(ran.failure).toBe('network')
    })

    it('lets go of the provider when it is told to stop, and ends without an error', async () => {
      const stop = new AbortController()
      const opened = fake.streams.length
      const ran = await run(make(), key, 'Långt svar [slow]', stop.signal, () => stop.abort())
      expect(ran.texts.length).toBeGreaterThanOrEqual(1)
      expect(ran.failure).toBeNull()
      expect(ran.done).toBe(false)
      await until(() => fake.streams.length > opened && fake.streams.at(-1)!.closed)
      expect(fake.streams.at(-1)!.finished).toBe(false)
    })

    it('never carries the key in what it throws', async () => {
      try {
        for await (const _ of make().complete(`${key}-bad-0123456789`, request('Hej'))) void _
      } catch (err) {
        expect(String(err)).not.toContain('0123456789')
        expect(JSON.stringify(err)).not.toContain('0123456789')
      }
    })
  })
}

describe('what each provider is sent', () => {
  it('Anthropic: the Messages API with the key in its header, the game as a cached system block, and the conversation', async () => {
    await run(anthropicAdapter({ baseUrl: `${base}/anthropic` }), 'sk-ant-good', 'Vad heter spelet?')
    const call = fake.calls.at(-1)!
    expect(call).toMatchObject({ provider: 'anthropic', path: '/v1/messages', key: 'sk-ant-good', version: '2023-06-01' })
    expect(call.body).toEqual({
      model: 'the-model',
      max_tokens: 1024,
      stream: true,
      system: [
        { type: 'text', text: 'You are the AI help.' },
        { type: 'text', text: "# Game: Sal's Saloon\nThe rest of the game.", cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        { role: 'user', content: 'Hur många kort?' },
        { role: 'assistant', content: 'Sjuttiosju.' },
        { role: 'user', content: 'Vad heter spelet?' },
      ],
    })
  })

  it('OpenAI: the Responses API with the key as a bearer, the game in the instructions, and nothing stored', async () => {
    await run(openaiAdapter({ baseUrl: `${base}/openai` }), 'sk-proj-good', 'Vad heter spelet?')
    const call = fake.calls.at(-1)!
    expect(call).toMatchObject({ provider: 'openai', path: '/v1/responses', key: 'sk-proj-good' })
    expect(call.body).toEqual({
      model: 'the-model',
      max_output_tokens: 1024,
      stream: true,
      store: false,
      instructions: "You are the AI help.\n\n# Game: Sal's Saloon\nThe rest of the game.",
      input: [
        { role: 'user', content: 'Hur många kort?' },
        { role: 'assistant', content: 'Sjuttiosju.' },
        { role: 'user', content: 'Vad heter spelet?' },
      ],
    })
  })
})

// A structured answer (#1002): the request carries the proposal's schema, and the model chooses —
// prose, or a proposal whose parts stream one at a time, each the moment it is whole. Anthropic
// answers a proposal as a strict tool's input, OpenAI as strict JSON whose prose is inside it.
const SCHEMA = { type: 'object', properties: { cards: { type: 'array', items: { type: 'object' } } }, required: ['cards'], additionalProperties: false }
const proposing = (question: string): AiRequest => ({
  ...request(question),
  context: "# Game: Sal's Saloon\n\n## Fields\n- id: the card’s key\n- antal: number — copies\n- title: text\n- kostnad: number\n- bild: image\n",
  proposal: { name: 'propose', description: 'Propose changes to the game.', schema: SCHEMA },
})
type Streamed = { texts: string[]; parts: { key: string; value: unknown; finishedYet: boolean }[]; done: boolean; broken: boolean; failure: AiFailure | null }
async function stream(adapter: AiProviderAdapter, key: string, question: string): Promise<Streamed> {
  const out: Streamed = { texts: [], parts: [], done: false, broken: false, failure: null }
  try {
    for await (const event of adapter.complete(key, proposing(question))) {
      if (event.type === 'text') out.texts.push(event.text)
      if (event.type === 'part') out.parts.push({ key: event.key, value: event.value, finishedYet: fake.streams.at(-1)!.finished })
      if (event.type === 'done') {
        out.done = true
        out.broken = event.broken === true
      }
    }
  } catch (err) {
    if (!(err instanceof AiProviderError)) throw err
    out.failure = err.kind
  }
  return out
}

for (const [name, make, key] of [
  ['Anthropic', () => anthropicAdapter({ baseUrl: `${base}/anthropic`, timeoutMs: 2000, idleMs: 2000 }), 'sk-ant-good'],
  ['OpenAI', () => openaiAdapter({ baseUrl: `${base}/openai`, timeoutMs: 2000, idleMs: 2000 }), 'sk-proj-good'],
] as const) {
  describe(`${name}, a structured answer`, () => {
    it('streams a proposal part by part, each card while the rest is still coming', async () => {
      const got = await stream(make(), key, 'Tre billiga kort [kort:3]')
      expect(got.failure).toBeNull()
      expect(got.done).toBe(true)
      expect(got.broken).toBe(false)
      expect(got.texts.join('')).toBe('Här är 3 kort.')
      expect(got.parts.map((p) => p.key)).toEqual(['cards', 'cards', 'cards'])
      expect(got.parts[0]!.value).toEqual({
        fields: [
          { field: 'title', value: 'Förslag 1' },
          { field: 'kostnad', value: 1 },
          { field: 'antal', value: 1 },
        ],
      })
      // The first card was handed on before the provider had finished the answer.
      expect(got.parts[0]!.finishedYet).toBe(false)
    })

    it('still answers in prose when the model proposes nothing', async () => {
      const got = await stream(make(), key, 'Vad heter spelet?')
      expect(got.parts).toEqual([])
      expect(got.done).toBe(true)
      expect(got.texts.join('')).toBe("Du frågade: «Vad heter spelet?». Spelet heter Sal's Saloon.")
      expect(got.texts.length).toBeGreaterThan(1)
    })

    it('says a proposal that was cut off before it was whole is broken, and keeps the parts that came', async () => {
      const got = await stream(make(), key, 'Tio kort [kort:3] [kapat]')
      expect(got.done).toBe(true)
      expect(got.broken).toBe(true)
      expect(got.parts.length).toBeLessThan(3)
    })
  })
}

describe('what each provider is sent for a structured answer', () => {
  it('Anthropic: the schema as a strict tool whose input streams as it is written, and the model left to choose', async () => {
    await stream(anthropicAdapter({ baseUrl: `${base}/anthropic` }), 'sk-ant-good', 'Hej')
    const body = fake.calls.at(-1)!.body as Record<string, unknown>
    expect(body['tools']).toEqual([{ name: 'propose', description: 'Propose changes to the game.', input_schema: SCHEMA, strict: true, eager_input_streaming: true }])
    expect(body['tool_choice']).toEqual({ type: 'auto' })
  })

  it('OpenAI: strict JSON with the prose beside the proposal, and null for no proposal', async () => {
    await stream(openaiAdapter({ baseUrl: `${base}/openai` }), 'sk-proj-good', 'Hej')
    const body = fake.calls.at(-1)!.body as { text: { format: Record<string, unknown> } }
    expect(body.text.format).toEqual({
      type: 'json_schema',
      name: 'propose',
      description: 'Propose changes to the game.',
      strict: true,
      schema: {
        type: 'object',
        properties: { message: { type: 'string', description: expect.any(String) as string }, proposal: { anyOf: [SCHEMA, { type: 'null' }] } },
        required: ['message', 'proposal'],
        additionalProperties: false,
      },
    })
  })
})
