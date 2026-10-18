import type { IncomingMessage, ServerResponse } from 'node:http'

// Anthropic and OpenAI as the suites meet them (#999, #1001): never the real ones. One listener speaks
// both formats, Anthropic's under `/anthropic` and OpenAI's under `/openai`, so a server pointed at
// `<fake>/anthropic` and `<fake>/openai` talks to it exactly as it talks to `api.anthropic.com` and
// `api.openai.com` — the model list, and the streamed answer in each provider's own server-sent events.
//
// What the provider answers is decided by the key, so a test says what happens in the key it pastes:
// a key with `bad` in it is refused, `broke` has no credit left, `busy` is rate limited, `swamped`
// finds the provider overloaded and `hangup` never gets an answer at all. Every other key is good.
//
// What a streamed answer does is decided by the question, the last thing the designer said, since a
// key has to be good to be saved at all: `[refuse]` is declined by the model, `[fail]` breaks off
// half-way with the provider overloaded, `[overloaded]` is turned away before a word, `[slow]` keeps
// talking a word at a time until the caller hangs up, and `[silent]` opens the stream and says
// nothing. Anything else is answered with what was asked and the game's name, read off the first
// line of the context the server sent, which is how a test sees that the game travelled.
//
// A request that lets the model propose (#1002) — a tool on Anthropic's, a JSON schema on OpenAI's —
// is answered with a proposal when the question asks for one: `[kort:3]` proposes three new cards,
// each filling every column the context lists with a value of its kind (never a picture), and streamed
// a card at a time; `[sakta]` leaves 400 ms between two cards, so a person can watch them arrive;
// `[oanvändbart]` proposes two, the second writing a column the game does not have; and `[kapat]`
// stops half-way through the proposal, as an answer that ran out of tokens does. Without one of
// those the answer is prose, as a model that chooses to answer in words gives it.
//
// The listener binds nothing itself: each package takes its ports out of its own band
// (`listen-zero.ts`), so the caller makes the server and listens where its rules say.

type Provider = 'anthropic' | 'openai'
export type FakeAiCall = { provider: Provider; path: string; key: string | null; version: string | null; body?: unknown }
// A streamed answer as the fake saw it: whether it got to the end, and whether the caller hung up.
export type FakeAiStream = { provider: Provider; question: string; finished: boolean; closed: boolean }
export type FakeAiProvider = {
  listener(req: IncomingMessage, res: ServerResponse): void
  // Every call it took, with the key it was made with — so a test can see the key travelled to the
  // provider and nowhere else.
  calls: FakeAiCall[]
  // How many models Anthropic hands out per page, to make the client walk the pages.
  anthropicPage: number
  // Every streamed answer it began, in order.
  streams: FakeAiStream[]
  // How long it waits between two pieces of an answer, in milliseconds.
  pace: number
}

export const FAKE_ANTHROPIC_MODELS = [
  { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-09-01T00:00:00Z' },
  { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-08-01T00:00:00Z' },
  { id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5', created_at: '2025-10-01T00:00:00Z' },
]
export const FAKE_OPENAI_MODELS = [
  { id: 'gpt-5', created: 1_754_000_000 },
  { id: 'text-embedding-3-large', created: 1_705_000_000 },
  { id: 'gpt-5-mini', created: 1_754_000_001 },
  { id: 'whisper-1', created: 1_677_000_000 },
  { id: 'gpt-4o-realtime-preview', created: 1_727_000_000 },
  { id: 'dall-e-3', created: 1_698_000_000 },
  { id: 'tts-1', created: 1_681_000_000 },
  { id: 'gpt-4.1', created: 1_744_000_000 },
]

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export function fakeAiProvider(): FakeAiProvider {
  const fake: FakeAiProvider = {
    calls: [],
    anthropicPage: 1000,
    streams: [],
    pace: 15,
    listener(req, res) {
      const url = new URL(req.url ?? '/', 'http://fake')
      const provider = url.pathname.startsWith('/anthropic/') ? 'anthropic' : url.pathname.startsWith('/openai/') ? 'openai' : null
      const path = provider ? url.pathname.slice(provider.length + 1) : url.pathname
      const streamed = provider === 'anthropic' ? '/v1/messages' : '/v1/responses'
      if (!provider || !((req.method === 'GET' && path === '/v1/models') || (req.method === 'POST' && path === streamed))) return send(res, 404, { error: { type: 'not_found_error', message: 'Not found' } })
      if (req.method === 'POST') return void readJson(req).then((body) => answer(fake, provider, path, req, res, body))
      const key = keyOf(provider, req)
      fake.calls.push({ provider, path, key, version: (req.headers['anthropic-version'] as string | undefined) ?? null })
      if (refused(provider, key, req, res)) return
      if (provider === 'openai') return send(res, 200, { object: 'list', data: FAKE_OPENAI_MODELS.map((m) => ({ ...m, object: 'model', owned_by: 'openai' })) })
      const after = url.searchParams.get('after_id')
      const from = after ? FAKE_ANTHROPIC_MODELS.findIndex((m) => m.id === after) + 1 : 0
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), fake.anthropicPage)
      const page = FAKE_ANTHROPIC_MODELS.slice(from, from + limit).map((m) => ({ ...m, type: 'model' }))
      send(res, 200, { data: page, has_more: from + limit < FAKE_ANTHROPIC_MODELS.length, first_id: page[0]?.id ?? null, last_id: page.at(-1)?.id ?? null })
    },
  }
  return fake
}

const keyOf = (provider: Provider, req: IncomingMessage): string | null =>
  provider === 'anthropic' ? ((req.headers['x-api-key'] as string | undefined) ?? null) : (/^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? null)

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve(null)
      }
    })
  })
}

// What the key says about the call, in the provider's own words; true when the call was answered.
function refused(provider: Provider, key: string | null, req: IncomingMessage, res: ServerResponse): boolean {
  if (provider === 'anthropic' && !req.headers['anthropic-version']) {
    send(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'anthropic-version: header is required' } })
    return true
  }
  const said = key ?? ''
  if (said.includes('hangup')) {
    req.socket.destroy()
    return true
  }
  if (!key || said.includes('bad')) {
    if (provider === 'anthropic') send(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })
    else send(res, 401, { error: { message: 'Incorrect API key provided.', type: 'invalid_request_error', code: 'invalid_api_key' } })
    return true
  }
  if (said.includes('broke')) {
    if (provider === 'anthropic') send(res, 402, { type: 'error', error: { type: 'billing_error', message: 'Your credit balance is too low.' } })
    else send(res, 429, { error: { message: 'You exceeded your current quota.', type: 'insufficient_quota', code: 'insufficient_quota' } })
    return true
  }
  if (said.includes('busy')) {
    if (provider === 'anthropic') send(res, 429, { type: 'error', error: { type: 'rate_limit_error', message: 'Number of requests has exceeded your rate limit.' } })
    else send(res, 429, { error: { message: 'Rate limit reached.', type: 'requests', code: 'rate_limit_exceeded' } })
    return true
  }
  if (said.includes('swamped')) {
    overloaded(provider, res)
    return true
  }
  return false
}

const overloaded = (provider: Provider, res: ServerResponse) =>
  provider === 'anthropic'
    ? send(res, 529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })
    : send(res, 503, { error: { message: 'The engine is currently overloaded.', type: 'server_error', code: null } })

type Said = { role?: unknown; content?: unknown }
// The last thing the designer said, and the game's name off the first line of the context.
function questionOf(provider: Provider, body: unknown): { question: string; game: string } {
  const b = (body ?? {}) as { messages?: Said[]; input?: Said[]; system?: { text?: unknown }[]; instructions?: unknown }
  const turns = (provider === 'anthropic' ? b.messages : b.input) ?? []
  const last = turns.at(-1)?.content
  const system = provider === 'anthropic' ? (b.system ?? []).map((s) => String(s.text ?? '')).join('\n') : String(b.instructions ?? '')
  return { question: typeof last === 'string' ? last : '', game: /^# Game: (.+)$/m.exec(system)?.[1] ?? '?' }
}

const event = (res: ServerResponse, name: string, data: unknown) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)

// A streamed answer in the provider's own events: Anthropic's Messages API, OpenAI's Responses API.
async function answer(fake: FakeAiProvider, provider: Provider, path: string, req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
  const key = keyOf(provider, req)
  fake.calls.push({ provider, path, key, version: (req.headers['anthropic-version'] as string | undefined) ?? null, body })
  if (refused(provider, key, req, res)) return
  const { question, game } = questionOf(provider, body)
  if (question.includes('[overloaded]')) return overloaded(provider, res)
  const stream: FakeAiStream = { provider, question, finished: false, closed: false }
  fake.streams.push(stream)
  res.on('close', () => {
    stream.closed = true
  })
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const open = () => !stream.closed && !res.destroyed
  if (question.includes('[silent]')) return
  const anthropic = provider === 'anthropic'
  if (anthropic) {
    event(res, 'message_start', { type: 'message_start', message: { id: 'msg_fake', type: 'message', role: 'assistant', content: [], model: 'fake', stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } })
    event(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
    event(res, 'ping', { type: 'ping' })
  } else {
    event(res, 'response.created', { type: 'response.created', sequence_number: 0, response: { id: 'resp_fake', status: 'in_progress' } })
  }
  const say = (text: string) =>
    anthropic
      ? event(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
      : event(res, 'response.output_text.delta', { type: 'response.output_text.delta', item_id: 'msg_fake', output_index: 0, content_index: 0, delta: text })
  const end = (reason: 'end_turn' | 'refusal') => {
    if (anthropic) {
      event(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
      event(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: reason, stop_sequence: null }, usage: { output_tokens: 9 } })
      event(res, 'message_stop', { type: 'message_stop' })
    } else {
      if (reason === 'refusal') {
        event(res, 'response.refusal.delta', { type: 'response.refusal.delta', delta: 'I can’t help with that.' })
        event(res, 'response.refusal.done', { type: 'response.refusal.done', refusal: 'I can’t help with that.' })
      }
      event(res, 'response.completed', { type: 'response.completed', response: { id: 'resp_fake', status: 'completed' } })
    }
    stream.finished = true
    res.end()
  }
  if (question.includes('[refuse]')) return end('refusal')
  if (question.includes('[slow]')) {
    // A word at a time until the caller hangs up — or a minute, which no test waits for.
    for (let i = 0; i < 600 && open(); i++) {
      say(i === 0 ? 'Ett' : ' ord')
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (open()) end('end_turn')
    return
  }
  const proposing = anthropic ? Array.isArray((body as { tools?: unknown } | null)?.tools) : (body as { text?: { format?: { type?: unknown } } } | null)?.text?.format?.type === 'json_schema'
  const asked = /\[kort:(\d+)\]/.exec(question)
  const unusable = question.includes('[oanvändbart]')
  if (proposing && (asked || unusable)) {
    const cards = cardsFor(contextOf(provider, body), unusable ? 2 : Number(asked?.[1] ?? 1))
    if (unusable) cards[1]?.fields.push({ field: 'trolldom', value: 'Okänd' })
    return propose(res, stream, anthropic, cards, { gap: question.includes('[sakta]') ? 400 : fake.pace, cut: question.includes('[kapat]') })
  }
  const words = `Du frågade: «${question}». Spelet heter ${game}.`.split(/(?= )/)
  // OpenAI answers inside its JSON when it may propose: the prose is the message, and there is no
  // proposal. The JSON goes out a few characters at a time, as the real one does.
  if (proposing && !anthropic) {
    const json = JSON.stringify({ message: words.join(''), proposal: null })
    for (let at = 0; at < json.length; at += 6) {
      if (!open()) return
      say(json.slice(at, at + 6))
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    return end('end_turn')
  }
  const half = Math.ceil(words.length / 2)
  for (const [i, word] of words.entries()) {
    if (!open()) return
    if (question.includes('[fail]') && i === half) {
      if (anthropic) event(res, 'error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })
      else event(res, 'response.failed', { type: 'response.failed', response: { id: 'resp_fake', status: 'failed', error: { code: 'server_error', message: 'The server had an error.' } } })
      return void res.end()
    }
    say(word)
    await new Promise((resolve) => setTimeout(resolve, fake.pace))
  }
  if (open()) end('end_turn')
}

type FakeCard = { fields: { field: string; value: string | number | boolean }[] }

function contextOf(provider: Provider, body: unknown): string {
  const b = (body ?? {}) as { system?: { text?: unknown }[]; instructions?: unknown }
  return provider === 'anthropic' ? (b.system ?? []).map((s) => String(s.text ?? '')).join('\n') : String(b.instructions ?? '')
}

// Cards that fill every column the context lists, each value of the column's kind; a picture is the
// designer's, and the deck's key and count are the tool's and the card's own.
function cardsFor(context: string, n: number): FakeCard[] {
  const section = /## Fields\n([\s\S]*?)(?:\n\n|$)/.exec(context)?.[1] ?? ''
  const columns = section
    .split('\n')
    .map((line) => /^- ([^:]+): (\S+)/.exec(line))
    .flatMap((m) => (m && m[1] !== 'id' && m[1] !== 'antal' && m[2] !== 'image' ? [{ name: m[1] ?? '', kind: m[2] ?? '' }] : []))
  return Array.from({ length: n }, (_, i) => ({
    fields: [
      ...columns.map(({ name, kind }) => ({ field: name, value: name === 'title' ? `Förslag ${i + 1}` : kind === 'number' ? i + 1 : kind === 'yes/no' ? true : `Text ${i + 1}.` })),
      { field: 'antal', value: 1 },
    ],
  }))
}

// A proposal in the provider's own events: on Anthropic a sentence and then the tool's input as JSON
// deltas, on OpenAI one JSON answer with the sentence inside it. Each card's JSON goes out in three
// pieces, and the gap falls between two cards, so a card is whole a while before the next one is.
async function propose(res: ServerResponse, stream: FakeAiStream, anthropic: boolean, cards: FakeCard[], how: { gap: number; cut: boolean }): Promise<void> {
  const open = () => !stream.closed && !res.destroyed
  const sentence = `Här är ${cards.length} kort.`
  const pieces: string[] = []
  const cardJson = cards.map((card) => JSON.stringify(card))
  const pause = () => new Promise((resolve) => setTimeout(resolve, how.gap))
  if (anthropic) {
    event(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: sentence } })
    event(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
    event(res, 'content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_fake', name: 'propose', input: {} } })
    pieces.push('{"cards":[')
  } else {
    pieces.push(`{"message":${JSON.stringify(sentence)},"proposal":{"cards":[`)
  }
  const send = (text: string) =>
    anthropic
      ? event(res, 'content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: text } })
      : event(res, 'response.output_text.delta', { type: 'response.output_text.delta', item_id: 'msg_fake', output_index: 0, content_index: 0, delta: text })
  for (const piece of pieces) send(piece)
  for (const [i, json] of cardJson.entries()) {
    if (!open()) return
    if (how.cut && i === 1) {
      send(json.slice(0, Math.floor(json.length / 2)))
      if (anthropic) {
        event(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'max_tokens', stop_sequence: null }, usage: { output_tokens: 9 } })
        event(res, 'message_stop', { type: 'message_stop' })
      } else event(res, 'response.incomplete', { type: 'response.incomplete', response: { id: 'resp_fake', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } })
      stream.finished = true
      return void res.end()
    }
    const third = Math.ceil(json.length / 3)
    const text = (i === 0 ? '' : ',') + json
    for (let at = 0; at < text.length; at += third) {
      send(text.slice(at, at + third))
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    await pause()
  }
  if (!open()) return
  send(anthropic ? ']}' : ']}}')
  if (anthropic) {
    event(res, 'content_block_stop', { type: 'content_block_stop', index: 1 })
    event(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 9 } })
    event(res, 'message_stop', { type: 'message_stop' })
  } else event(res, 'response.completed', { type: 'response.completed', response: { id: 'resp_fake', status: 'completed' } })
  stream.finished = true
  res.end()
}
