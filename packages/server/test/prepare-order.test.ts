import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'

// En ny version går före den gamla versionens rest i renderkön (#1549). Sedan #1546 väntar starten
// bara på det som syns, och resten av leken ritas medan spelet pågår; när designern trycker
// «Uppdatera bordet» delade den nya versionens sidor kön med det som var kvar av den gamla, som
// slutar visas i samma ögonblick som bordet byter. Den gamla versionens kvarvarande sidor går nu
// efter den nya, utom de som ett annat bord fortfarande väntar på.
let run: Running
let cookie = ''
beforeEach(async () => {
  run = await start()
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
  const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
})
afterEach(async () => {
  await run.stop()
})
const json = (method: string, path: string, body?: unknown) =>
  fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })

const ROWS = [
  { id: 'dragon', fields: { title: 'Drake' } },
  { id: 'knight', fields: { title: 'Riddare' } },
  { id: 'wizard', fields: { title: 'Trollkarl' } },
]
function project(rows = ROWS) {
  const { zones, seats, floor } = twoSeatSetup()
  return { name: 'Skogens herrar', template, rows, icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

async function startOf(id: string): Promise<string> {
  return ((await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string }).id
}

// A new version where every card's front is new.
async function renamed(id: string): Promise<void> {
  const rec = (await (await json('GET', `/projects/${id}`)).json()) as { rev: number }
  const rows = ROWS.map((r) => ({ ...r, fields: { title: `${r.fields.title} II` } }))
  expect((await json('PUT', `/projects/${id}`, { ...project(rows), rev: rec.rev })).status).toBe(200)
}

async function claimed(): Promise<string[]> {
  const out: string[] = []
  for (let job = await run.renders.claim(0); job; job = await run.renders.claim(0)) out.push(job.hash)
  return out
}

describe('en ny version går före den gamla versionens rest (#1549)', () => {
  it('ritar den nya versionens framsidor före de gamla som inget bord längre väntar på', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const table = await startOf(id)
    const old = Object.values((await run.host.get(table))!.faceHashes()).map((f) => f['front'] ?? '')
    await renamed(id)
    expect((await json('POST', `/sessions/${table}/prepare`, {})).status).toBe(200)
    const order = await claimed()
    const fresh = order.filter((h) => !old.includes(h))
    const lastNew = Math.max(...order.map((h, i) => (old.includes(h) ? -1 : i)))
    const firstOld = Math.min(...order.map((h, i) => (old.includes(h) ? i : Infinity)))
    expect(fresh.length).toBeGreaterThanOrEqual(3)
    expect(lastNew).toBeLessThan(firstOld)
  })

  it('låter en gammal sida som ett annat bord väntar på behålla sin plats', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const table = await startOf(id)
    // A second table of the same version, which will not be updated.
    await startOf(id)
    const old = Object.values((await run.host.get(table))!.faceHashes()).map((f) => f['front'] ?? '')
    await renamed(id)
    expect((await json('POST', `/sessions/${table}/prepare`, {})).status).toBe(200)
    const order = await claimed()
    const lastNew = Math.max(...order.map((h, i) => (old.includes(h) ? -1 : i)))
    const firstOld = Math.min(...order.map((h, i) => (old.includes(h) ? i : Infinity)))
    // The other table still draws them in its own turn, so the old fronts are not all put last.
    expect(firstOld).toBeLessThan(lastNew)
  })
})
