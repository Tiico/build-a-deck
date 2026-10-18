import type { IncomingMessage, ServerResponse } from 'node:http'

// Anthropic and OpenAI as the suites meet them (#999): never the real ones. One listener speaks both
// formats, Anthropic's under `/anthropic` and OpenAI's under `/openai`, so a server pointed at
// `<fake>/anthropic` and `<fake>/openai` talks to it exactly as it talks to `api.anthropic.com` and
// `api.openai.com`.
//
// What the provider answers is decided by the key, so a test says what happens in the key it pastes:
// a key with `bad` in it is refused, `broke` has no credit left, `busy` is rate limited, `swamped`
// finds the provider overloaded and `hangup` never gets an answer at all. Every other key is good.
//
// The listener binds nothing itself: each package takes its ports out of its own band
// (`listen-zero.ts`), so the caller makes the server and listens where its rules say.

export type FakeAiCall = { provider: 'anthropic' | 'openai'; path: string; key: string | null; version: string | null }
export type FakeAiProvider = {
  listener(req: IncomingMessage, res: ServerResponse): void
  // Every call it took, with the key it was made with — so a test can see the key travelled to the
  // provider and nowhere else.
  calls: FakeAiCall[]
  // How many models Anthropic hands out per page, to make the client walk the pages.
  anthropicPage: number
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
    listener(req, res) {
      const url = new URL(req.url ?? '/', 'http://fake')
      const provider = url.pathname.startsWith('/anthropic/') ? 'anthropic' : url.pathname.startsWith('/openai/') ? 'openai' : null
      const path = provider ? url.pathname.slice(provider.length + 1) : url.pathname
      if (!provider || req.method !== 'GET' || path !== '/v1/models') return send(res, 404, { error: { type: 'not_found_error', message: 'Not found' } })
      const key = provider === 'anthropic' ? (req.headers['x-api-key'] as string | undefined) ?? null : (/^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? null)
      fake.calls.push({ provider, path, key, version: (req.headers['anthropic-version'] as string | undefined) ?? null })
      if (provider === 'anthropic' && !req.headers['anthropic-version']) return send(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'anthropic-version: header is required' } })
      const said = key ?? ''
      if (said.includes('hangup')) return void req.socket.destroy()
      if (!key || said.includes('bad')) {
        return provider === 'anthropic'
          ? send(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })
          : send(res, 401, { error: { message: 'Incorrect API key provided.', type: 'invalid_request_error', code: 'invalid_api_key' } })
      }
      if (said.includes('broke')) {
        return provider === 'anthropic'
          ? send(res, 402, { type: 'error', error: { type: 'billing_error', message: 'Your credit balance is too low.' } })
          : send(res, 429, { error: { message: 'You exceeded your current quota.', type: 'insufficient_quota', code: 'insufficient_quota' } })
      }
      if (said.includes('busy')) {
        return provider === 'anthropic'
          ? send(res, 429, { type: 'error', error: { type: 'rate_limit_error', message: 'Number of requests has exceeded your rate limit.' } })
          : send(res, 429, { error: { message: 'Rate limit reached.', type: 'requests', code: 'rate_limit_exceeded' } })
      }
      if (said.includes('swamped')) {
        return provider === 'anthropic'
          ? send(res, 529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })
          : send(res, 503, { error: { message: 'The engine is currently overloaded.', type: 'server_error', code: null } })
      }
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
