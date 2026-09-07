import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryLogStore, PostgresLogStore, type GuestRecord, type LogStore } from '../src/index.js'
import { twoSeatSetup } from './fixture.js'

const guest = (tokenHash: string, seat: string | null): GuestRecord => ({
  tokenHash,
  kind: seat === null ? 'observer' : 'seat',
  seat,
  name: tokenHash,
  issuedAt: '2026-09-07T12:00:00.000Z',
})

describe('guest seat reservation', () => {
  it('lets exactly one concurrent guest reserve a live seat', async () => {
    const store = new MemoryLogStore()
    await store.createSession({ id: 'table', version: 'v1', setup: twoSeatSetup() })

    const reserved = await Promise.all([
      store.issueGuest('table', guest('alice', 'A')),
      store.issueGuest('table', guest('bob', 'A')),
    ])

    expect(reserved.sort()).toEqual([false, true])
  })

  it('does not limit observer admissions', async () => {
    const store = new MemoryLogStore()
    await store.createSession({ id: 'table', version: 'v1', setup: twoSeatSetup() })

    expect(await Promise.all([
      store.issueGuest('table', guest('alice', null)),
      store.issueGuest('table', guest('bob', null)),
    ])).toEqual([true, true])
  })

  it('lets a new guest reserve a seat after its old admission is revoked', async () => {
    const store = new MemoryLogStore()
    await store.createSession({ id: 'table', version: 'v1', setup: twoSeatSetup() })
    await store.issueGuest('table', guest('alice', 'A'))

    await store.revokeGuests('table', 'A', '2026-09-07T12:01:00.000Z')

    expect(await store.issueGuest('table', guest('bob', 'A'))).toBe(true)
  })
})

const url = process.env['DATABASE_URL']
const schema = `test_guest_reservation_${process.pid}_${Date.now()}`

describe.skipIf(!url)('Postgres guest seat reservation', () => {
  let store: PostgresLogStore

  beforeAll(async () => {
    store = PostgresLogStore.connect(url!, { schema })
    await store.migrate()
    await store.createSession({ id: 'table', version: 'v1', setup: twoSeatSetup() })
  })

  afterAll(async () => {
    await store.dropSchema()
    await store.close()
  })

  it('lets exactly one concurrent guest reserve a live seat', async () => {
    const admissions: LogStore = store
    const reserved = await Promise.all([
      admissions.issueGuest('table', guest('alice', 'A')),
      admissions.issueGuest('table', guest('bob', 'A')),
    ])

    expect(reserved.sort()).toEqual([false, true])
  })
})
