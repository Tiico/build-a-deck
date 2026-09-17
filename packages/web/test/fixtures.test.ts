import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ANSWERS_WITHIN, startServer, twoSeatSetup } from './fixture.js'
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

// A fixture that says when it answers (#149).
//
// A surface built against the fixture used to learn that the server was up by finding a word on
// the screen — `Skogens herrar`, the name in the fixture's own project. That is content, not a
// statement about the server, and the difference is what made `editor-viewport.test.tsx` fall at
// random under a full run: the editor opens a project with one `fetch` and no second attempt, so
// a request that does not come back leaves the disconnected screen standing for good, and the
// word is then waited for by a `waitFor` whose four seconds cannot help. The fixture knows the
// answer to the question actually being asked, and this is it saying so.
describe('the fixture saying when it answers (#149)', () => {
  it('says it from its own address and not from anything drawn on a screen', async () => {
    const run = await startServer()
    try {
      // No project, no name, nothing rendered anywhere: the fact is about the server alone.
      await expect(run.answering()).resolves.toBeUndefined()
    } finally {
      await run.stop()
    }
  })

  it('fells the run on a server that never comes, and names the address it waited on', async () => {
    const run = await startServer()
    await run.stop()
    const began = Date.now()
    await expect(run.answering()).rejects.toThrow(new URL(run.http).port)
    // Promptly: inside its own patience, and that patience inside the budget the suite has, so a
    // server that never comes is a red test and never a run that sits there.
    expect(Date.now() - began).toBeLessThan(ANSWERS_WITHIN + 2_000)
    expect(ANSWERS_WITHIN).toBeLessThan(JSDOM_TEST_BUDGET)
  })
})

// The pattern the decision on #149 is about, held in place.
//
// It is a pattern and not a line: `editor-viewport.test.tsx` builds a surface at a time, each of them
// by standing the editor up against the fixture, and every one of them used to take a word drawn
// on the screen as its proof that the server was there. One of them was mended and the other four
// would have gone on falling, so what is asked here is of all of them at once — including the one
// #184 added, which is the sixth this note was written waiting for.
//
// Only that file. The same wait is on the fixture and is every file's to use, and thirty other
// suites still learn that the server is up the old way; converting them is its own change and its
// own risk, and none of them has been seen to fall. What must not happen is a new surface in the
// file the decision was written about going back to waiting for a word.
describe('the surfaces `editor-viewport.test.tsx` builds (#149)', () => {
  const lines = readFileSync(join(import.meta.dirname, 'editor-viewport.test.tsx'), 'utf8').split('\n')
  const built = lines.flatMap((line, i) => (/render\(<EditorPage \/>\)/.test(line) ? [i] : []))

  it('is read at all, so this guard cannot pass by matching nothing', () => {
    // Counted, because a guard that has stopped recognising the thing it guards and a file that is
    // wholly in order say the same thing from the outside.
    //
    // Six since #184, when the written rulebook joined the sweeps and became the sixth surface the
    // note above was waiting for; seven since #193 put the card table's own file pickers on one of
    // their own. Each new one asks the fixture the way the rest do, which is the whole point of
    // counting them here rather than trusting that the pattern spread by itself.
    expect(built.length).toBe(7)
  })

  it('asks the fixture whether the server answers before it waits for anything on a screen', () => {
    const unasked = built.filter((at) => !lines.slice(Math.max(0, at - 6), at).some((line) => /await run\.answering\(/.test(line)))
    expect(unasked.map((at) => `editor-viewport.test.tsx:${at + 1}`)).toEqual([])
  })

  // The Bord tab waits on something standing behind the server and not on the server itself: the
  // `Spela härifrån` link is drawn from a free seat, and a free seat is known only to the table's
  // own snapshot, which arrives over the row's own socket. Asking `/health` says the server is
  // there; it says nothing about whether the actor behind that table is. Both fell — the server
  // once, the table once — so both are asked.
  it('asks the table’s own door where a surface waits on the table’s answer', () => {
    const at = lines.findIndex((line) => /findByRole\('link', \{ name: \/Spela härifrån\//.test(line))
    expect(at).toBeGreaterThan(0)
    expect(lines.slice(0, at).filter((line) => /await run\.answering\(`\/sessions\//.test(line)).length).toBe(1)
  })
})
