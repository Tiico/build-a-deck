import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import type { AiProvider } from './ai-keys.js'

// The providers behind one face (#999, PRD module 2). Today a key is asked for its models, which is
// also how a key is proved when it is saved: the list costs the designer nothing, needs a key the
// provider accepts, and is what the profile's model picker shows. The streaming `complete` the
// editor's panel needs (#1001) joins this type beside `models`; nothing here is in its way.
//
// Raw HTTP and no SDK, as the mail and the object store already are (DRIFT §4, §11): two calls per
// provider do not earn a dependency each, and the suites point the base URL at a local fake.
//
// Why a provider said no is one of a closed set of words, so the page can say it in the reader's
// language (A4) and the log never needs the provider's own sentence. Nothing thrown from here ever
// carries the key.

export const AI_FAILURES = ['invalid-key', 'no-credit', 'rate-limit', 'overloaded', 'network'] as const
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
}
export type AiProviders = Record<AiProvider, AiProviderAdapter>

type AdapterOptions = { baseUrl?: string; timeoutMs?: number }

// The standard models (#940, «Kontrakt och avgränsningar»). A designer who never picks one gets
// whatever these say on the day the key is used, so moving them on moves everyone who chose
// «standard» and nobody who chose a model.
export const DEFAULT_MODELS: Record<AiProvider, string> = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-5' }
const TIMEOUT_MS = 10_000
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

type AnthropicPage = { data?: { id?: unknown; display_name?: unknown }[]; has_more?: unknown; last_id?: unknown }

export function anthropicAdapter(opts: AdapterOptions = {}): AiProviderAdapter {
  const baseUrl = trimmed(opts.baseUrl ?? 'https://api.anthropic.com')
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
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
  }
}

// OpenAI's list is every model the key can reach — embeddings, speech, images. Only the ones that
// answer in words are a choice for the editor's panel.
const SPEAKS = /^(gpt-|o\d|chatgpt-)/
const DOES_NOT = /(embedding|audio|realtime|tts|transcribe|whisper|dall-e|image|moderation|search|instruct)/

export function openaiAdapter(opts: AdapterOptions = {}): AiProviderAdapter {
  const baseUrl = trimmed(opts.baseUrl ?? 'https://api.openai.com')
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
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
