import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { startServer, twoSeatSetup } from './fixture.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

// This file stands servers up now, so it is in the class the measured budget is for.
vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// A fixture that carries traces of the test before it does not go red — it goes confusing.
// The suite passes one file at a time and fails in a full run, or the other way round, and
// the test that finally breaks is never the one that did the writing (#49).
describe('the fixtures the editor tests build on (#49)', () => {
  it('gives every caller ground of its own, so what one test writes the next never reads', () => {
    const mine = projectDoc()
    mine.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
    mine.template.faces['front']!.variantBy = 'typ'
    mine.template.faces['front']!.variants['fälla'] = { override: [] }
    mine.template.faces['back']!.base = []
    mine.rows.push({ id: 'troll', fields: { title: 'Troll', body: 'Stor.', antal: 1 } })
    mine.rows[0]!.fields['title'] = 'Drakhona'
    mine.icons['svärd'] = `asset:${'c'.repeat(64)}`
    mine.fonts!['sans-serif']!.stack = 'serif'
    mine.setup.seats.push('C')
    mine.setup.zones[0]!.name = 'Annan hög'

    const theirs = projectDoc()
    expect(theirs.template.faces['front']!.base.map((e) => e.id)).toEqual(['frame', 'title', 'body'])
    expect(theirs.template.faces['front']!.variantBy).toBeUndefined()
    expect(theirs.template.faces['front']!.variants).toEqual({})
    expect(theirs.template.faces['back']!.base.map((e) => e.id)).toEqual(['bg'])
    expect(theirs.rows.map((r) => r.id)).toEqual(['dragon', 'knight', 'wizard'])
    expect(theirs.rows[0]!.fields['title']).toBe('Drake')
    expect(theirs.icons).toEqual({})
    expect(theirs.fonts!['sans-serif']!.stack).toBe('sans-serif')
    expect(theirs.setup.seats).toEqual(['A', 'B'])
    expect(theirs.setup.zones[0]!.name).toBe('Draghög')
  })

  it('makes the setup fresh too, down to the type each component is of', () => {
    const mine = twoSeatSetup()
    mine.components[0]!.type.version = 2
    mine.zones[0]!.name = 'Annan hög'
    // Not even within the one setup: ten cards of a type is ten cards, not ten views of one
    // object that the first of them can rewrite for the rest.
    expect(mine.components[1]!.type.version).toBe(1)

    const theirs = twoSeatSetup()
    expect(theirs.components.map((c) => c.type.version)).toEqual(theirs.components.map(() => 1))
    expect(theirs.zones[0]!.name).toBe('Draghög')
  })
})

// A fixture does not listen where a recent one listened (#109).
//
// A project id is the caller's word and not a unique one: nearly every file here asks for
// `run.projects.create(run.projectId, …)`, so two fixtures hold two different projects under one name.
// That is harmless until they share a port. A client that outlived its own server knocks on the
// recycled port, asks for `p1`, is let in because that server has a `p1` too, and lays its own
// edits on a project it was never opened on. It has been seen twice: a font losing the licence
// just set on it, and a table started at `rev-2` when both of a pair should have read `rev-1`.
//
// The distance between two fixtures on one port is therefore a safety margin, and this is what
// holds it. At eight it was reachable by any file with nine tests in it — `project-client` has
// twenty-five. This asks for more servers than the old slice held and reads the ports back.
//
// It is a margin and not a proof: two projects answering to one name is the real fault, and it is
// a rename across twenty-six files. Written down in the issue rather than done here.
describe('the ground a fixture stands on (#109)', () => {
  it('never lets two of them hand out one project id, however alike the names asked for', async () => {
    const first = await startServer()
    const mine = await first.projects.create(first.projectId, projectDoc())
    await first.stop()

    const second = await startServer()
    const theirs = await second.projects.create(second.projectId, projectDoc())
    await second.stop()

    // The names are what a stray client asks by, so it is the names that must differ — and the
    // record has to answer to the one it was made under, or a test cannot read back what it wrote.
    expect(mine.id).not.toEqual(theirs.id)
    expect({ mine: mine.id, theirs: theirs.id }).toEqual({ mine: first.projectId, theirs: second.projectId })
  })

  it('leaves no test addressing a project by a name of its own', () => {
    // The whole of the fix is that a project id comes from the fixture. A file that writes one out
    // by hand has put the collision back, and it is cheaper to say so here than to find it in a
    // full run six weeks from now.
    const dir = import.meta.dirname
    const offenders = readdirSync(dir)
      .filter((name) => /\.tsx?$/.test(name) && name !== 'fixture.ts' && name !== 'fixtures.test.ts')
      .map((name) => ({ name, lines: readFileSync(join(dir, name), 'utf8').split('\n') }))
      .flatMap(({ name, lines }) =>
        lines
          .map((line, i) => ({ line, at: `${name}:${i + 1}` }))
          // A project is addressed in five places, and only these: the store, the editor's URL,
          // an HTTP path, the body that makes one, and the card the home page draws for it. Anywhere else `p1` belongs to something
          // else entirely — a peer, a rewind proposal, a column's remembered width, a server that
          // is a string and not a fixture — and those are left alone on purpose.
          .filter(({ line }) =>
            /\.projects\.\w+\('p\d'/.test(line) ||
            (/project=p\d\b/.test(line) && /\w+\.http\b/.test(line)) ||
            /\$\{\w+\.http\}\/projects\/p\d\b/.test(line) ||
            /JSON\.stringify\(\{ id: 'p\d'/.test(line) ||
            /http: \w+\.http[^)]*id: 'p\d'/.test(line) ||
            /data-project="p\d"/.test(line),
          )
          .map(({ at }) => at),
      )
    expect(offenders).toEqual([])
  })

  it('gives a worker more ports in a row than any one file asks for servers', async () => {
    const running = []
    try {
      for (let i = 0; i < 9; i++) running.push(await startServer())
      const ports = running.map((r) => new URL(r.http).port)
      expect({ asked: ports.length, distinct: new Set(ports).size }).toEqual({ asked: 9, distinct: 9 })
    } finally {
      for (const run of running) await run.stop()
    }
  })
})
