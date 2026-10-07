import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ROUTE_WORDS, codeOfAddress } from '@byd/protocol'
import { TableHost, createServer, MemoryLogStore, MemoryProjectStore } from '../src/index.js'
import { CODE_ALPHABET, newCode } from '../src/rooms.js'
import { listenInBand, registry, twoSeatSetup } from './fixture.js'
import { template } from './deck.js'

// The code is the address (#675, beslut C 2026-10-06). The television says `värd/KOD`; the phone
// that opens it gets the app, which asks `GET /rooms/:kod` exactly as `/join?code=` always has and
// lands in the seat picker. What these hold is the server's half of that: the address is a page
// and never a second door, a code is never one of the app's own words, and the one answer a code
// that names nothing gets is the same whether it never existed or has gone out.

let stop: (() => Promise<void>) | null = null
afterEach(async () => {
  await stop?.()
  stop = null
})

const INDEX = '<!doctype html><title>byd</title>'

async function serve(now: () => Date) {
  const dir = await mkdtemp(join(tmpdir(), 'byd-code-address-'))
  await mkdir(join(dir, 'assets'))
  await writeFile(join(dir, 'index.html'), INDEX)
  const store = new MemoryLogStore()
  // Every question the store is asked about a code, counted: the page must ask none of them.
  let lookups = 0
  const byCode = store.sessionByCode.bind(store)
  store.sessionByCode = (code) => {
    lookups++
    return byCode(code)
  }
  const projects = new MemoryProjectStore()
  const host = new TableHost(registry, store)
  const server = createServer({ host, store, registry, projects, staticDir: dir, now })
  const port = await listenInBand(server)
  stop = () => new Promise((resolve) => server.close(() => resolve()))
  return { http: `http://127.0.0.1:${port}`, lookups: () => lookups, projects }
}

const room = async (http: string) => {
  const res = await fetch(`${http}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 'v1', setup: twoSeatSetup() }) })
  return (await res.json()) as { id: string; code: string }
}

// A browser opening an address: it asks for a page.
const open = (http: string, path: string) => fetch(`${http}${path}`, { headers: { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } })

describe('the address `/KOD` (#675)', () => {
  it('is the app for a known code, an unknown one and an expired one alike, and never asks the store', async () => {
    let now = new Date('2026-10-06T18:00:00Z')
    const run = await serve(() => now)
    const { code } = await room(run.http)
    const asked = run.lookups()
    const known = await open(run.http, `/${code}`)
    expect(known.status).toBe(200)
    expect(known.headers.get('content-type')).toMatch(/text\/html/)
    const page = await known.text()
    expect(page).toBe(INDEX)
    // A phone's keyboard may start the address in lower case.
    expect(await (await open(run.http, `/${code.toLowerCase()}`)).text()).toBe(INDEX)
    const unknown = await open(run.http, '/ZZZZZZ')
    now = new Date(now.getTime() + 3 * 3600_000 + 1)
    const expired = await open(run.http, `/${code}`)
    // Byte for byte the same answer: the address says nothing about whether a code ever was.
    for (const res of [unknown, expired]) {
      expect(res.status).toBe(known.status)
      expect(res.headers.get('content-type')).toBe(known.headers.get('content-type'))
      expect(await res.text()).toBe(page)
    }
    // And it is no second door around the rate limit DRIFT §9 puts on the code's lookup: the
    // address never asks after a code, so the only way to learn one is still `GET /rooms/:kod`.
    expect(run.lookups()).toBe(asked)
  })

  it('says the same thing of a code that never was and of one that has gone out', async () => {
    let now = new Date('2026-10-06T18:00:00Z')
    const run = await serve(() => now)
    const { code } = await room(run.http)
    const unknown = await fetch(`${run.http}/rooms/ZZZZZZ`)
    now = new Date(now.getTime() + 3 * 3600_000 + 1)
    const expired = await fetch(`${run.http}/rooms/${code}`)
    expect(unknown.status).toBe(404)
    expect(expired.status).toBe(unknown.status)
    expect(await expired.text()).toBe(await unknown.text())
  })

  it("names the game a code leads into, and nothing the session's own read would not", async () => {
    const run = await serve(() => new Date('2026-10-06T18:00:00Z'))
    const { zones, seats, floor } = twoSeatSetup()
    await run.projects.create('p1', { name: "Sal's Saloon", template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } })
    const started = (await (await fetch(`${run.http}/projects/p1/sessions`, { method: 'POST' })).json()) as { id: string; code: string }
    const found = await fetch(`${run.http}/rooms/${started.code}`)
    expect(found.status).toBe(200)
    // The game's name, which the join card says (#675); never the project it was started from.
    expect(await found.json()).toEqual({ session: started.id, name: "Sal's Saloon" })
    const read = (await (await fetch(`${run.http}/sessions/${started.id}`)).json()) as { name?: string }
    expect(read.name).toBe("Sal's Saloon")
    // A table started without a game has no name to say.
    const bare = await room(run.http)
    expect(await (await fetch(`${run.http}/rooms/${bare.code}`)).json()).toEqual({ session: bare.id })
  })
})

describe('a code is never one of the app’s own words (#675)', () => {
  it('skips a draw that spells a route word, in whatever case the word is', () => {
    // GUESTS, then ASSETS, then a code: the first two are the server's and the app's own addresses.
    const spell = (word: string) => [...word].map((c) => CODE_ALPHABET.indexOf(c))
    const draws = [...spell('GUESTS'), ...spell('ASSETS'), ...spell('K7MQ2X')]
    expect(draws.every((i) => i >= 0)).toBe(true)
    let at = 0
    expect(newCode(() => draws[at++]!)).toBe('K7MQ2X')
    expect(at).toBe(18)
  })

  it('knows every word the server answers at the top of a path', async () => {
    // Read off the server's own source, so a route added tomorrow is a word here tomorrow.
    const src = join(import.meta.dirname, '..', 'src')
    const words = new Set<string>()
    for (const file of await readdir(src)) {
      if (!file.endsWith('.ts')) continue
      const text = await readFile(join(src, file), 'utf8')
      for (const [, word] of text.matchAll(/\/\^\\\/([a-z]+)/g)) words.add(word!)
      for (const [, word] of text.matchAll(/pathname(?:\s*===\s*|\.startsWith\()'\/([a-z]+)/g)) words.add(word!)
      for (const [, word] of text.matchAll(/API_PREFIXES = \[([^\]]+)\]/g)) for (const [, w] of word!.matchAll(/'\/([a-z]+)'/g)) words.add(w!)
    }
    expect(words.size, 'the scan found the routes it reads').toBeGreaterThan(8)
    expect([...words].filter((w) => !ROUTE_WORDS.includes(w)), 'server routes that are not route words').toEqual([])
  })

  it('reads no route word as a room’s address, and every other code as one', () => {
    for (const word of ROUTE_WORDS) {
      expect(codeOfAddress(`/${word}`)).toBeNull()
      expect(codeOfAddress(`/${word.toUpperCase()}`)).toBeNull()
    }
    expect(codeOfAddress('/K7MQ2X')).toBe('K7MQ2X')
    expect(codeOfAddress('/k7mq2x')).toBe('K7MQ2X')
    // Not a code: a confusable character, the wrong length, or a path that goes on.
    for (const path of ['/K7MQ2O', '/K7MQ2', '/K7MQ2XX', '/K7MQ2X/x', '/', '/join']) expect(codeOfAddress(path)).toBeNull()
  })
})
