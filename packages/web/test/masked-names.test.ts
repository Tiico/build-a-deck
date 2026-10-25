import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { REDACTED } from '@byd/protocol'
import { TableClient } from '../src/client.js'
import { translate } from '../src/i18n/index.js'
import { maskedWords } from '../src/masked.js'
import { asObserver, asSeat, asTable, createSession, startServer, type Running } from './fixture.js'

// A masked name is said, not drawn (#1281, G6). An erasure leaves U+E000 where a name or a person's
// words stood (#1279), which a screen draws as a box or as nothing; every screen at a table reads
// its names through the table client, so the client says the placeholder in the reader's language
// and no surface can forget to. Proved with a guest who erases herself through the server's own door
// while two others are at the table, and with a screen that connects afterwards.

let run: Running
let clients: TableClient[] = []
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  for (const c of clients) c.close()
  clients = []
  await run.stop()
})

const NAME = 'Adelina Raderas'
const NOTE = 'Adelinas anteckning'
const sv = maskedWords((key, params) => translate('sv', key, params))
const en = maskedWords((key, params) => translate('en', key, params))

async function connect(opts: Parameters<typeof TableClient.connect>[0]): Promise<TableClient> {
  const c = TableClient.connect(opts)
  clients.push(c)
  await c.ready()
  return c
}
async function waitUntil(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}
// Everything a client holds of the table, as one text to search.
const held = (c: TableClient) => JSON.stringify([c.view, c.activity, c.observers, c.admitted])

describe('a masked name, said in the reader’s language (#1281)', () => {
  it('reaches the others and a later screen as «Utan namn» and never as the placeholder', async () => {
    const id = await createSession(run)
    const seat = await asSeat(run, id, 'A', NAME)
    const ada = await connect({ ...seat, masked: sv })
    await ada.send({ v: 'seat.claim', seat: 'A', name: NAME })
    await ada.send({ v: 'note.add', text: NOTE })
    const bo = await connect({ ...(await asSeat(run, id, 'B', 'Bo')), masked: sv })
    const tv = await connect({ ...(await asTable(run, id)), masked: en })
    await waitUntil(() => held(bo).includes(NOTE) && held(tv).includes(NAME))

    const res = await fetch(`${run.http}/sessions/${id}/erase`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: seat.token }) })
    expect(res.status).toBe(200)

    await waitUntil(() => bo.view?.seats.find((s) => s.id === 'A')?.name === 'Utan namn')
    await waitUntil(() => tv.view?.seats.find((s) => s.id === 'A')?.name === 'No name')
    expect(bo.view?.notes.map((n) => n.text)).toEqual(['Anteckningen är borttagen.'])
    // Her own phone is told too, and still holds the seat.
    await waitUntil(() => ada.view?.seats.find((s) => s.id === 'A')?.name === 'Utan namn')
    // The view each of them holds. The lines an open screen was already told stay in that browser
    // until it is reloaded (G6, #1279), so they are the later screen's to prove.
    for (const c of [ada, bo, tv]) {
      expect(JSON.stringify(c.view)).not.toContain(REDACTED)
      expect(JSON.stringify(c.view)).not.toContain(NOTE)
      expect(JSON.stringify(c.view)).not.toContain(NAME)
    }

    // A screen that connects now is told the masked log, and says it.
    const late = await connect({ ...(await asObserver(run, id, 'Cilla')), masked: sv })
    await waitUntil(() => late.activity.length >= 2)
    const claim = late.activity.find((l) => l.intent.v === 'seat.claim')
    expect(claim?.intent).toMatchObject({ name: 'Utan namn' })
    expect(late.activity.find((l) => l.intent.v === 'note.add')?.intent).toMatchObject({ text: 'Anteckningen är borttagen.' })
    expect(held(late)).not.toContain(REDACTED)
    expect(held(late)).not.toContain(NAME)
  })

  it('says a masked observer in the roster', async () => {
    const id = await createSession(run)
    const watch = await asObserver(run, id, 'Cilla Tittar')
    const cilla = await connect({ ...watch, masked: sv })
    const tv = await connect({ ...(await asTable(run, id)), masked: sv })
    await waitUntil(() => tv.observers.length === 1)
    expect((await fetch(`${run.http}/sessions/${id}/erase`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: watch.token }) })).status).toBe(200)
    await waitUntil(() => tv.observers[0]?.name === 'Utan namn')
    expect(held(tv)).not.toContain(REDACTED)
    expect(held(cilla)).not.toContain(REDACTED)
  })
})
