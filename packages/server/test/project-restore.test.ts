import { afterAll, describe, expect, it, vi } from 'vitest'
import { MemoryProjectStore, PostgresLogStore } from '../src/index.js'
import type { ProjectDoc, ProjectStore } from '../src/projects.js'
import { template } from './deck.js'
import { twoSeatSetup } from './fixture.js'
import { PG_TEST_BUDGET } from '../../../test-support/pg-budget.js'

vi.setConfig({ testTimeout: PG_TEST_BUDGET })

// A game brought back from an export (G5, #528): a new project with the history it had — every
// version at its own revision, with the date it was saved and the name it was given — so the
// history panel reads as it did, and saving again goes on from the last revision.

const url = process.env['DATABASE_URL']
const schema = `test_restore_${process.pid}_${Date.now()}`
const opened: PostgresLogStore[] = []
afterAll(async () => {
  for (const store of opened) await store.close()
})

const stores: [string, () => Promise<ProjectStore>][] = [
  ['memory', async () => new MemoryProjectStore()],
  ...(url
    ? ([
        [
          'postgres',
          async () => {
            const store = PostgresLogStore.connect(url, { schema })
            opened.push(store)
            await store.migrate()
            return store.projects()
          },
        ],
      ] as [string, () => Promise<ProjectStore>][])
    : []),
]

const doc = (name: string): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'a', fields: { title: name } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

describe.each(stores)('restoring a project with its history (%s, #528)', (_, open) => {
  it('keeps every version at its revision, date and name, and goes on from the last', async () => {
    const projects = await open()
    const id = `p-restore-${Date.now()}`
    const rec = await projects.restore(
      id,
      [
        { rev: 1, at: '2026-01-02T03:04:05.000Z', label: 'Första utkastet', doc: doc('Ett') },
        { rev: 2, at: '2026-02-03T04:05:06.000Z', doc: doc('Två') },
      ],
      'ada',
    )
    expect(rec).toMatchObject({ id, rev: 2, name: 'Två', owner: 'ada' })
    expect(await projects.load(id)).toMatchObject({ rev: 2, name: 'Två', owner: 'ada' })
    expect(await projects.versions(id)).toEqual([
      { rev: 2, at: '2026-02-03T04:05:06.000Z' },
      { rev: 1, at: '2026-01-02T03:04:05.000Z', label: 'Första utkastet' },
    ])
    expect((await projects.at(id, 1))?.name).toBe('Ett')
    expect(await projects.roleOf(id, 'ada')).toBe('owner')
    // The history goes on from where it was.
    expect(await projects.replace(id, 2, doc('Tre'))).toMatchObject({ rev: 3, name: 'Tre' })
  })

  it('refuses a history that is not one save after another, and an id that is taken', async () => {
    const projects = await open()
    const id = `p-restore-bad-${Date.now()}`
    await expect(projects.restore(id, [], 'ada')).rejects.toThrow(/history/)
    await expect(projects.restore(id, [{ rev: 2, at: '2026-01-01T00:00:00.000Z', doc: doc('Ett') }], 'ada')).rejects.toThrow(/history/)
    await projects.create(id, doc('Ett'), 'ada')
    await expect(projects.restore(id, [{ rev: 1, at: '2026-01-01T00:00:00.000Z', doc: doc('Ett') }], 'ada')).rejects.toThrow()
    expect((await projects.load(id))?.name).toBe('Ett')
  })
})
