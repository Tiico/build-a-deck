import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryLogStore, PostgresLogStore, type GuestRecord, type LogStore } from '../src/index.js'
import { twoSeatSetup } from './fixture.js'

const guest = (
  tokenHash: string,
  seat: string | null,
  issuedAt = '2026-09-07T12:00:00.000Z',
  expiresAt = '2026-09-07T12:00:30.000Z',
): GuestRecord => ({
  tokenHash,
  kind: seat === null ? 'observer' : 'seat',
  seat,
  name: tokenHash,
  issuedAt,
  expiresAt,
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

  it('expires an abandoned reservation before giving its seat to a new guest', async () => {
    const store = new MemoryLogStore()
    await store.createSession({ id: 'table', version: 'v1', setup: twoSeatSetup() })
    await store.issueGuest('table', guest('alice', 'A'))

    expect(await store.issueGuest(
      'table',
      guest('bob', 'A', '2026-09-07T12:00:31.000Z', '2026-09-07T12:01:01.000Z'),
    )).toBe(true)
    expect(await store.guestByToken('table', 'alice')).toMatchObject({
      revokedAt: '2026-09-07T12:00:31.000Z',
    })
  })

  it('activates a pending token by extending its expiry', async () => {
    const store = new MemoryLogStore()
    await store.createSession({ id: 'table', version: 'v1', setup: twoSeatSetup() })
    await store.issueGuest('table', guest('alice', 'A'))

    expect(await store.activateGuest(
      'table',
      'alice',
      '2026-09-07T12:00:10.000Z',
      '2026-09-08T12:00:10.000Z',
    )).toMatchObject({ tokenHash: 'alice', seat: 'A', expiresAt: '2026-09-08T12:00:10.000Z' })
  })

  it('rejects activation when the pending token has expired', async () => {
    const store = new MemoryLogStore()
    await store.createSession({ id: 'table', version: 'v1', setup: twoSeatSetup() })
    await store.issueGuest('table', guest('alice', 'A'))

    expect(await store.activateGuest(
      'table',
      'alice',
      '2026-09-07T12:00:30.000Z',
      '2026-09-08T12:00:30.000Z',
    )).toBeNull()
  })

  it('rejects activation when the token has been revoked', async () => {
    const store = new MemoryLogStore()
    await store.createSession({ id: 'table', version: 'v1', setup: twoSeatSetup() })
    await store.issueGuest('table', guest('alice', 'A'))
    await store.revokeGuests('table', 'A', '2026-09-07T12:00:10.000Z')

    expect(await store.activateGuest(
      'table',
      'alice',
      '2026-09-07T12:00:11.000Z',
      '2026-09-08T12:00:11.000Z',
    )).toBeNull()
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

  it('expires an abandoned reservation atomically before reusing its seat', async () => {
    await store.createSession({ id: 'expiry', version: 'v1', setup: twoSeatSetup() })
    await store.issueGuest('expiry', guest('carol', 'A'))

    expect(await store.issueGuest(
      'expiry',
      guest('dave', 'A', '2026-09-07T12:00:31.000Z', '2026-09-07T12:01:01.000Z'),
    )).toBe(true)
    expect(await store.guestByToken('expiry', 'carol')).toMatchObject({
      revokedAt: '2026-09-07T12:00:31.000Z',
    })
  })

  it('extends a valid token and rejects it once expired or revoked', async () => {
    await store.createSession({ id: 'activation', version: 'v1', setup: twoSeatSetup() })
    await store.issueGuest('activation', guest('erin', 'A'))

    expect(await store.activateGuest(
      'activation',
      'erin',
      '2026-09-07T12:00:10.000Z',
      '2026-09-08T12:00:10.000Z',
    )).toMatchObject({ expiresAt: '2026-09-08T12:00:10.000Z' })
    expect(await store.activateGuest(
      'activation',
      'erin',
      '2026-09-08T12:00:10.000Z',
      '2026-09-09T12:00:10.000Z',
    )).toBeNull()

    await store.createSession({ id: 'revocation', version: 'v1', setup: twoSeatSetup() })
    await store.issueGuest('revocation', guest('frank', 'A'))
    await store.revokeGuests('revocation', 'A', '2026-09-07T12:00:10.000Z')
    expect(await store.activateGuest(
      'revocation',
      'frank',
      '2026-09-07T12:00:11.000Z',
      '2026-09-08T12:00:11.000Z',
    )).toBeNull()
  })

  it('does not limit observer admissions', async () => {
    await store.createSession({ id: 'observers', version: 'v1', setup: twoSeatSetup() })

    expect(await Promise.all([
      store.issueGuest('observers', guest('grace', null)),
      store.issueGuest('observers', guest('heidi', null)),
    ])).toEqual([true, true])
  })
})
