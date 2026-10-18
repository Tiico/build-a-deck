import { describe, expect, it } from 'vitest'
import { fetchExport } from '../scripts/corpus.js'

// Which tables the corpus script takes off a running server (#540, #1011). The corpus is public,
// so it takes the tables of a game the logged-in account owns — and, since the beställare's
// decision of 2026-10-18, a table whose export says its owner said yes in her invitation, which
// the server says only to the operator the box names. A test leader of somebody else's game can
// read that game's exports too (#524), and those stay out.
//
// The server is the other side of an HTTP boundary here, so it is played by a table of answers;
// what it actually answers is held by `packages/server/test/corpus-reader.test.ts`.

const BASE = 'https://deck.example'
const SOURCE = `${BASE}/sessions/s1/export`
const EXPORT = { id: 's1', version: 'rev-1', setup: { seats: [], zones: [], components: [] }, log: [] }

function server(answers: Record<string, { status?: number; body: unknown }>) {
  const asked: { url: string; cookie: string | null }[] = []
  const get = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    asked.push({ url, cookie: new Headers(init?.headers).get('cookie') })
    const answer = answers[url]
    if (!answer) return new Response('{}', { status: 404 })
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 })
  }) as typeof fetch
  return { get, asked }
}

describe('fetching an export for the corpus (#540, #1011)', () => {
  it('takes a table of a game the account owns, with the account’s cookie', async () => {
    const { get, asked } = server({
      [`${BASE}/sessions/s1`]: { body: { project: 'p1' } },
      [`${BASE}/projects`]: { body: [{ id: 'p1', role: 'owner' }] },
      [SOURCE]: { body: EXPORT },
    })
    expect(await fetchExport(SOURCE, 'byd_session=ada', get)).toMatchObject({ version: 'rev-1', log: [] })
    expect(asked.every((a) => a.cookie === 'byd_session=ada')).toBe(true)
  })

  it('takes a table in somebody else’s game when the export says its owner said yes', async () => {
    const { get } = server({
      [`${BASE}/sessions/s1`]: { body: { project: 'p1' } },
      [`${BASE}/projects`]: { body: [] },
      [SOURCE]: { body: { ...EXPORT, consented: true } },
    })
    expect(await fetchExport(SOURCE, 'byd_session=op', get)).toMatchObject({ version: 'rev-1' })
  })

  it('leaves out a table a test leader may read but whose owner never said yes', async () => {
    const { get } = server({
      [`${BASE}/sessions/s1`]: { body: { project: 'p1' } },
      [`${BASE}/projects`]: { body: [{ id: 'p1', role: 'tester' }] },
      [SOURCE]: { body: EXPORT },
    })
    await expect(fetchExport(SOURCE, 'byd_session=bo', get)).rejects.toThrow(/owns|said yes/)
  })

  it('says what the server refused', async () => {
    const { get } = server({
      [`${BASE}/sessions/s1`]: { body: { project: 'p1' } },
      [`${BASE}/projects`]: { body: [] },
      [SOURCE]: { status: 403, body: { error: 'not yours to read' } },
    })
    await expect(fetchExport(SOURCE, 'byd_session=op', get)).rejects.toThrow(/403/)
  })
})
