import { get as httpGet, request as httpRequest, type IncomingMessage } from 'node:http'
import { get as httpsGet, request as httpsRequest } from 'node:https'
import type { AiProvider } from './ai-keys.js'
import { JsonParts } from './json-parts.js'

// The providers behind one face (#999, #1001, PRD module 2). A key is asked for its models, which is
// also how a key is proved when it is saved: the list costs the designer nothing, needs a key the
// provider accepts, and is what the profile's model picker shows. And a key is asked to answer
// (`complete`): the editor's panel sends the instructions, the game and the conversation, and gets
// the answer back a piece at a time as the provider's server-sent events bring it.
//
// Raw HTTP and no SDK, as the mail and the object store already are (DRIFT §4, §11): two calls per
// provider do not earn a dependency each, and the suites point the base URL at a local fake.
//
// Why a provider said no is one of a closed set of words, so the page can say it in the reader's
// language (A4) and the log never needs the provider's own sentence. Nothing thrown from here ever
// carries the key.

// `refused` is the model declining to answer (#1001), which only an answer can be; a model list never
// is.
export const AI_FAILURES = ['invalid-key', 'no-credit', 'rate-limit', 'overloaded', 'refused', 'network'] as const
export type AiFailure = (typeof AI_FAILURES)[number]

export class AiProviderError extends Error {
  constructor(
    readonly kind: AiFailure,
    readonly status: number | null = null,
  ) {
    super(`provider said no: ${kind}${status === null ? '' : ` (${status})`}`)
    this.name = 'AiProviderError'
  }
}

export type AiModel = { id: string; name: string }

export type AiProviderAdapter = {
  readonly provider: AiProvider
  readonly baseUrl: string
  // The model used when the designer has not chosen one (PRD: the latest general model).
  readonly defaultModel: string
  models(key: string): Promise<AiModel[]>
  // The answer, as events while it comes. Throws an `AiProviderError` when the provider says no —
  // before the first word or in the middle — and simply ends, without `done`, when `signal` stops
  // it: a designer who cancelled has not seen anything fail.
  complete(key: string, request: AiRequest, signal?: AbortSignal): AsyncIterable<AiEvent>
}
export type AiProviders = Record<AiProvider, AiProviderAdapter>

// One request for an answer. `instructions` say what the model is, `context` is the game — the
// large part, and the same bytes for as long as the game is (`ai-context.ts`), so it is handed to
// the provider where its prompt cache can keep it. The conversation alternates and ends with the
// designer's question.
//
// A structured answer (#1002): `proposal` is the schema of what the model may propose, and the model
// chooses between prose and a proposal. A proposal comes as `part` events, each a part of it the
// moment that part is whole — an element of one of its lists, or any other property of it whole —
// so a card is shown when it is written and not when the answer ends. A proposal that stopped before
// it was whole ends the answer with `done` marked `broken`: the parts that came are not a proposal.
export type AiMessage = { role: 'user' | 'assistant'; text: string }
export type AiProposalSchema = { name: string; description: string; schema: Record<string, unknown> }
export type AiRequest = { model: string; instructions: string; context: string; messages: readonly AiMessage[]; maxTokens: number; proposal?: AiProposalSchema }
export type AiEvent = { type: 'text'; text: string } | { type: 'part'; key: string; value: unknown } | { type: 'done'; broken?: true }

type AdapterOptions = { baseUrl?: string; timeoutMs?: number; idleMs?: number }

// The standard models (#940, «Kontrakt och avgränsningar»). A designer who never picks one gets
// whatever these say on the day the key is used, so moving them on moves everyone who chose
// «standard» and nobody who chose a model.
export const DEFAULT_MODELS: Record<AiProvider, string> = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-5' }
const TIMEOUT_MS = 10_000
// How long a streamed answer may go without a byte before the line is taken for dead. Both
// providers speak at least every few seconds once they have begun — Anthropic pings while it thinks
// — and a large game can take a while to be read before the first word.
const IDLE_MS = 60_000
const ANTHROPIC_VERSION = '2023-06-01'

const trimmed = (url: string): string => url.replace(/\/+$/, '')

// What the provider's answer means, whichever provider it is. Anthropic says billing with 402 (and
// used to with a 400 about the credit balance); OpenAI says it with a 429 whose code is
// `insufficient_quota`, which must not be read as a rate limit — waiting will not fill the account.
function failureOf(status: number, body: unknown): AiFailure {
  const error = (body as { error?: { type?: unknown; code?: unknown; message?: unknown } } | null)?.error
  const said = `${String(error?.type ?? '')} ${String(error?.code ?? '')} ${String(error?.message ?? '')}`
  if (status === 401 || status === 403) return 'invalid-key'
  if (status === 402 || /insufficient_quota|billing|credit balance/i.test(said)) return 'no-credit'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'overloaded'
  // Any other answer is not one the client can use, which to the designer is the line failing.
  return 'network'
}

// A GET through Node's own client rather than `fetch`, so the timeout is a socket's and does not
// depend on whichever `AbortSignal` the process's globals hold — under jsdom they are jsdom's, and
// `fetch` refuses them, which made every call look like a line that failed.
function getJson(url: string, headers: Record<string, string>, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const send = target.protocol === 'https:' ? httpsGet : httpGet
    const req = send(target, { headers: { accept: 'application/json', ...headers }, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('error', () => reject(new AiProviderError('network')))
      res.on('end', () => {
        const status = res.statusCode ?? 0
        let body: unknown = null
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          body = null
        }
        if (status < 200 || status >= 300) return reject(new AiProviderError(failureOf(status, body), status))
        if (body === null || typeof body !== 'object') return reject(new AiProviderError('network', status))
        resolve(body)
      })
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => reject(new AiProviderError('network')))
  })
}

// Why an answer broke off once it had begun: the provider says it in an event of its own and no
// longer in a status, so the same words are read off the error's type or code.
function streamedFailure(error: unknown): AiFailure {
  const e = (error ?? {}) as { type?: unknown; code?: unknown }
  const said = `${String(e.type ?? '')} ${String(e.code ?? '')}`
  if (/authentication|permission|invalid_api_key/i.test(said)) return 'invalid-key'
  if (/billing|insufficient_quota/i.test(said)) return 'no-credit'
  if (/rate_limit/i.test(said)) return 'rate-limit'
  if (/overloaded|server_error|api_error/i.test(said)) return 'overloaded'
  return 'network'
}

type Sse = { event: string; data: unknown }

// A POST whose answer is server-sent events, read as they arrive (#1001). Node's own client, for the
// reason `getJson` gives, and because its socket can be told how long it may stay quiet: a stream
// that stops talking is a line that failed, however long the whole answer is allowed to take.
//
// A stop from `signal` hangs up on the provider at once — which is what stops the designer paying
// for an answer she no longer wants — and ends the events without an error.
async function* postEvents(url: string, headers: Record<string, string>, body: unknown, idleMs: number, signal?: AbortSignal): AsyncGenerator<Sse> {
  const queue: (Sse | AiProviderError | 'end')[] = []
  let wake: (() => void) | null = null
  const push = (item: Sse | AiProviderError | 'end') => {
    queue.push(item)
    wake?.()
    wake = null
  }
  let stopped = false
  const target = new URL(url)
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest
  const payload = JSON.stringify(body)
  const req = send(target, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream', 'content-length': String(Buffer.byteLength(payload)), ...headers } }, (res: IncomingMessage) => {
    const status = res.statusCode ?? 0
    if (status < 200 || status >= 300) {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        let said: unknown = null
        try {
          said = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          said = null
        }
        push(new AiProviderError(failureOf(status, said), status))
      })
      return
    }
    res.setEncoding('utf8')
    let buffer = ''
    res.on('data', (chunk: string) => {
      buffer += chunk
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        let name = 'message'
        const data: string[] = []
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) name = line.slice(6).trim()
          else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
        }
        if (data.length === 0) continue
        try {
          push({ event: name, data: JSON.parse(data.join('\n')) })
        } catch {
          // A line that is not JSON is not one either provider sends; it says nothing.
        }
      }
    })
    res.on('end', () => push('end'))
    res.on('close', () => {
      if (!res.complete && !stopped) push(new AiProviderError('network'))
    })
  })
  req.setTimeout(idleMs, () => req.destroy())
  req.on('error', () => push(stopped ? 'end' : new AiProviderError('network')))
  const stop = () => {
    stopped = true
    req.destroy()
    push('end')
  }
  if (signal?.aborted) stop()
  else signal?.addEventListener('abort', stop, { once: true })
  req.end(payload)
  try {
    for (;;) {
      if (queue.length === 0) await new Promise<void>((resolve) => (wake = resolve))
      const next = queue.shift()
      if (stopped || next === undefined || next === 'end') return
      if (next instanceof AiProviderError) throw next
      yield next
    }
  } finally {
    signal?.removeEventListener('abort', stop)
    // Whoever reads the events may stop reading them; the provider is let go of then too.
    req.destroy()
  }
}

type AnthropicPage ={ data?: { id?: unknown; display_name?: unknown }[]; has_more?: unknown; last_id?: unknown }

export function anthropicAdapter(opts: AdapterOptions = {}): AiProviderAdapter {
  const baseUrl = trimmed(opts.baseUrl ?? 'https://api.anthropic.com')
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
  const idleMs = opts.idleMs ?? IDLE_MS
  return {
    provider: 'anthropic',
    baseUrl,
    defaultModel: DEFAULT_MODELS.anthropic,
    async models(key) {
      const out: AiModel[] = []
      let after: string | null = null
      // A handful of pages at most: the list is a few dozen models, and a server that keeps saying
      // there is more is not one to follow for ever.
      for (let page = 0; page < 10; page++) {
        const query = new URLSearchParams({ limit: '1000', ...(after ? { after_id: after } : {}) })
        const body = (await getJson(`${baseUrl}/v1/models?${query.toString()}`, { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION }, timeoutMs)) as AnthropicPage
        for (const m of body.data ?? []) if (typeof m.id === 'string') out.push({ id: m.id, name: typeof m.display_name === 'string' ? m.display_name : m.id })
        if (body.has_more !== true || typeof body.last_id !== 'string') break
        after = body.last_id
      }
      return out
    },
    // The Messages API, streamed. The game is a system block of its own marked for the prompt
    // cache, after the instructions, so a conversation about an unchanged game is read once.
    async *complete(key, request, signal) {
      const body = {
        model: request.model,
        max_tokens: request.maxTokens,
        stream: true,
        system: [
          { type: 'text', text: request.instructions },
          { type: 'text', text: request.context, cache_control: { type: 'ephemeral' } },
        ],
        messages: request.messages.map((m) => ({ role: m.role, content: m.text })),
        // A proposal is the input of a tool the model may call or leave (`auto`; these models refuse a
        // forced one), streamed as it is written rather than held back until each parameter is whole,
        // which is what lets a card show the moment its brace closes. Not strict (#1088): Anthropic
        // compiles a strict schema only below 16 properties of a union type, and the proposal has
        // ninety — a strict tool turned every question away with a 400. The input is not checked on
        // the way either while it streams, and the editor reads every part with the zod schema.
        ...(request.proposal
          ? {
              tools: [{ name: request.proposal.name, description: request.proposal.description, input_schema: request.proposal.schema, eager_input_streaming: true }],
              tool_choice: { type: 'auto' },
            }
          : {}),
      }
      let done = false
      let broken = false
      // The tool's input being read, by the index of its block.
      let reading: { index: unknown; parts: JsonParts } | null = null
      for await (const { data } of postEvents(`${baseUrl}/v1/messages`, { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION }, body, idleMs, signal)) {
        const said = data as { type?: unknown; index?: unknown; content_block?: { type?: unknown }; delta?: { type?: unknown; text?: unknown; partial_json?: unknown; stop_reason?: unknown }; error?: unknown }
        if (said.type === 'content_block_start' && said.content_block?.type === 'tool_use') reading = { index: said.index, parts: new JsonParts({ partsAt: [] }) }
        else if (said.type === 'content_block_delta' && said.delta?.type === 'text_delta' && typeof said.delta.text === 'string' && said.delta.text !== '') yield { type: 'text', text: said.delta.text }
        else if (said.type === 'content_block_delta' && said.delta?.type === 'input_json_delta' && reading && said.index === reading.index && typeof said.delta.partial_json === 'string') {
          for (const event of reading.parts.push(said.delta.partial_json)) if (event.type === 'part') yield event
        } else if (said.type === 'content_block_stop' && reading && said.index === reading.index) {
          if (!reading.parts.end().complete) broken = true
          reading = null
        } else if (said.type === 'message_delta' && said.delta?.stop_reason === 'refusal') throw new AiProviderError('refused')
        else if (said.type === 'message_delta' && said.delta?.stop_reason === 'max_tokens' && reading) broken = true
        else if (said.type === 'message_stop') done = true
        else if (said.type === 'error') throw new AiProviderError(streamedFailure(said.error))
      }
      if (signal?.aborted) return
      if (!done) throw new AiProviderError('network')
      // A tool whose block never closed was cut off as surely as one whose input did not parse.
      yield broken || reading ? { type: 'done', broken: true } : { type: 'done' }
    },
  }
}

// OpenAI's list is every model the key can reach — embeddings, speech, images. Only the ones that
// answer in words are a choice for the editor's panel.
const SPEAKS = /^(gpt-|o\d|chatgpt-)/
const DOES_NOT = /(embedding|audio|realtime|tts|transcribe|whisper|dall-e|image|moderation|search|instruct)/

export function openaiAdapter(opts: AdapterOptions = {}): AiProviderAdapter {
  const baseUrl = trimmed(opts.baseUrl ?? 'https://api.openai.com')
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
  const idleMs = opts.idleMs ?? IDLE_MS
  return {
    provider: 'openai',
    baseUrl,
    defaultModel: DEFAULT_MODELS.openai,
    async models(key) {
      const body = (await getJson(`${baseUrl}/v1/models`, { authorization: `Bearer ${key}` }, timeoutMs)) as { data?: { id?: unknown; created?: unknown }[] }
      return (body.data ?? [])
        .flatMap((m) => (typeof m.id === 'string' && SPEAKS.test(m.id) && !DOES_NOT.test(m.id) ? [{ id: m.id, created: typeof m.created === 'number' ? m.created : 0 }] : []))
        .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id))
        .map(({ id }) => ({ id, name: id }))
    },
    // The Responses API, streamed, and nothing kept at OpenAI (`store: false`): the conversation is
    // the editor's to hold. Its prompt cache keys on the prefix, so the game follows the
    // instructions in one block that stays the same for as long as the game does.
    async *complete(key, request, signal) {
      const body = {
        model: request.model,
        max_output_tokens: request.maxTokens,
        stream: true,
        store: false,
        instructions: `${request.instructions}\n\n${request.context}`,
        input: request.messages.map((m) => ({ role: m.role, content: m.text })),
        // A proposal is the answer itself as strict JSON: the prose beside it in `message`, so that
        // the model can still answer in words, and the proposal or null.
        ...(request.proposal ? { text: { format: { type: 'json_schema', name: request.proposal.name, description: request.proposal.description, strict: true, schema: envelope(request.proposal.schema) } } } : {}),
      }
      let done = false
      const parts = request.proposal ? new JsonParts({ textAt: ['message'], partsAt: ['proposal'] }) : null
      for await (const { data } of postEvents(`${baseUrl}/v1/responses`, { authorization: `Bearer ${key}` }, body, idleMs, signal)) {
        const said = data as { type?: unknown; delta?: unknown; code?: unknown; response?: { error?: unknown; incomplete_details?: { reason?: unknown } } }
        if (said.type === 'response.output_text.delta' && typeof said.delta === 'string' && said.delta !== '') {
          if (parts) yield* parts.push(said.delta)
          else yield { type: 'text', text: said.delta }
        } else if (said.type === 'response.refusal.delta' || said.type === 'response.refusal.done') throw new AiProviderError('refused')
        else if (said.type === 'response.completed') done = true
        else if (said.type === 'response.incomplete') {
          // Cut short by its own filter is a refusal; cut short by the length is an answer that ends.
          if (said.response?.incomplete_details?.reason === 'content_filter') throw new AiProviderError('refused')
          done = true
        } else if (said.type === 'response.failed') throw new AiProviderError(streamedFailure(said.response?.error))
        else if (said.type === 'error') throw new AiProviderError(streamedFailure(said))
      }
      if (signal?.aborted) return
      if (!done) throw new AiProviderError('network')
      // Cut short by its length, the JSON is not whole, and neither is what it proposed.
      yield parts && !parts.end().complete ? { type: 'done', broken: true } : { type: 'done' }
    },
  }
}

// What OpenAI is held to when a proposal may be the answer: the prose and the proposal side by side.
function envelope(proposal: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'The answer in words, written as the instructions say. With a proposal, a sentence or two about it.' },
      proposal: { anyOf: [proposal, { type: 'null' }] },
    },
    required: ['message', 'proposal'],
    additionalProperties: false,
  }
}

// The real providers, unless the environment says where else to go: `AI_ANTHROPIC_URL` and
// `AI_OPENAI_URL` point a test stack at its fake, and are never set on the box.
export function providersFromEnv(env: Record<string, string | undefined>): AiProviders {
  return {
    anthropic: anthropicAdapter(env['AI_ANTHROPIC_URL'] ? { baseUrl: env['AI_ANTHROPIC_URL'] } : {}),
    openai: openaiAdapter(env['AI_OPENAI_URL'] ? { baseUrl: env['AI_OPENAI_URL'] } : {}),
  }
}
