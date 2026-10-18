import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AiProviderError, anthropicAdapter, openaiAdapter, providersFromEnv, type AiFailure } from '../src/ai-providers.js'
import { fakeAiProvider, type FakeAiProvider } from '../../../test-support/fake-ai-provider.js'
import { listenInBand } from './fixture.js'

// The two providers behind one face (#999, PRD module 2): ask a key for its models, and say in a
// closed set of words why the provider said no. Only ever against the fake — never the real ones.
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

const failureOf = async (attempt: Promise<unknown>): Promise<AiFailure | 'none'> => {
  try {
    await attempt
    return 'none'
  } catch (err) {
    if (err instanceof AiProviderError) return err.kind
    throw err
  }
}

describe('Anthropic', () => {
  it('lists the models a key may use, with their names, and asks the way the Messages API wants', async () => {
    const anthropic = anthropicAdapter({ baseUrl: `${base}/anthropic` })
    const models = await anthropic.models('sk-ant-good-key')
    expect(models).toEqual([
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
      { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ])
    expect(fake.calls.at(-1)).toMatchObject({ provider: 'anthropic', key: 'sk-ant-good-key', version: '2023-06-01' })
    expect(anthropic.defaultModel).toBe('claude-sonnet-5-5')
  })

  it('walks every page of the list', async () => {
    fake.anthropicPage = 1
    try {
      const models = await anthropicAdapter({ baseUrl: `${base}/anthropic` }).models('sk-ant-good-key')
      expect(models.map((m) => m.id)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'])
    } finally {
      fake.anthropicPage = 1000
    }
  })

  it('says why in one of five words, and never with the key in the message', async () => {
    const anthropic = anthropicAdapter({ baseUrl: `${base}/anthropic`, timeoutMs: 2000 })
    expect(await failureOf(anthropic.models('sk-ant-bad'))).toBe('invalid-key')
    expect(await failureOf(anthropic.models('sk-ant-broke'))).toBe('no-credit')
    expect(await failureOf(anthropic.models('sk-ant-busy'))).toBe('rate-limit')
    expect(await failureOf(anthropic.models('sk-ant-swamped'))).toBe('overloaded')
    expect(await failureOf(anthropic.models('sk-ant-hangup'))).toBe('network')
    expect(await failureOf(anthropicAdapter({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 2000 }).models('sk-ant-good'))).toBe('network')
    try {
      await anthropic.models('sk-ant-bad-0123456789')
    } catch (err) {
      expect(String(err)).not.toContain('sk-ant-bad-0123456789')
      expect(JSON.stringify(err)).not.toContain('sk-ant-bad-0123456789')
    }
  })
})

describe('OpenAI', () => {
  it('lists the models that answer in words, newest first, and leaves out the rest', async () => {
    const openai = openaiAdapter({ baseUrl: `${base}/openai` })
    const models = await openai.models('sk-proj-good-key')
    expect(models).toEqual([
      { id: 'gpt-5-mini', name: 'gpt-5-mini' },
      { id: 'gpt-5', name: 'gpt-5' },
      { id: 'gpt-4.1', name: 'gpt-4.1' },
    ])
    expect(fake.calls.at(-1)).toMatchObject({ provider: 'openai', key: 'sk-proj-good-key' })
    expect(openai.defaultModel).toBe('gpt-5')
  })

  it('says why in the same five words', async () => {
    const openai = openaiAdapter({ baseUrl: `${base}/openai`, timeoutMs: 2000 })
    expect(await failureOf(openai.models('sk-bad'))).toBe('invalid-key')
    expect(await failureOf(openai.models('sk-broke'))).toBe('no-credit')
    expect(await failureOf(openai.models('sk-busy'))).toBe('rate-limit')
    expect(await failureOf(openai.models('sk-swamped'))).toBe('overloaded')
    expect(await failureOf(openai.models('sk-hangup'))).toBe('network')
  })
})

describe('the environment', () => {
  it('reaches the real providers unless it is told where else to go', () => {
    expect(providersFromEnv({}).anthropic.baseUrl).toBe('https://api.anthropic.com')
    expect(providersFromEnv({}).openai.baseUrl).toBe('https://api.openai.com')
    const local = providersFromEnv({ AI_ANTHROPIC_URL: `${base}/anthropic/`, AI_OPENAI_URL: `${base}/openai` })
    expect(local.anthropic.baseUrl).toBe(`${base}/anthropic`)
    expect(local.openai.baseUrl).toBe(`${base}/openai`)
  })
})
