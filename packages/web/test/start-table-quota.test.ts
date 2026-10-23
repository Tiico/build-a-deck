import { afterEach, describe, expect, it, vi } from 'vitest'
import { startTable } from '../src/account/api.js'
import { QuotaReached } from '../src/account/quota.js'

// A table refused at a ceiling (#1196, #1192): the server answers 402 with the ceiling's numbers,
// and the client hands them on as what they are — never as a fault of the network, and never as a
// status. How a surface says it is #1198; what reaches it is the measure, the numbers and whose
// ceiling it is.
const refused = { error: 'quota', quota: { measure: 'openTables', limit: 1, used: 1, bearer: 'owner' } }
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('starting a table from the home page at a ceiling (#1196)', () => {
  it('rejects with the ceiling the server met, said in the reader’s words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(402, refused)))
    const err = await startTable('http://api', 'p1').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(QuotaReached)
    expect((err as QuotaReached).quota).toEqual(refused.quota)
    expect((err as Error).message).not.toMatch(/402|quota|network|nätverk/i)
  })

  it('reads a 402 that is not the contract as the failure it is', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(402, { error: 'payment' })))
    const err = await startTable('http://api', 'p1').catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(QuotaReached)
    expect(err).toBeInstanceOf(Error)
  })
})
