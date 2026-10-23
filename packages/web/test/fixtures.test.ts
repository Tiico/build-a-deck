import { readFileSync, readdirSync } from 'node:fs'
import { connect, type Socket } from 'node:net'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ANSWERS_WITHIN, deafServer, startServer, twoSeatSetup } from './fixture.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

// This file stands servers up now, so it is in the class the measured budget is for.

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

// The fixture's server never hangs up a connection on its own (#848).
//
// Node closes a keep-alive connection that has been idle for five seconds, and the client in the
// same process keeps that connection in its pool to send the next request on. On a box at load
// 40–270 a worker is descheduled for longer than that, and when it wakes the server's timer and
// the client's next request meet on the same socket: the request goes out on a connection the
// server has just closed, and comes back «fetch failed», UND_ERR_SOCKET. That was «Typsnittet
// Cinzel kunde inte laddas upp … fetch failed» in `button-language` — an upload to this very
// server, not a font fetched from the net. The client is the one that decides when its connection
// is done; the server's end is closed when the fixture stops, and only then.
describe('the connection a test talks to its server over (#848)', () => {
  it('is still there after an idle longer than a stalled worker sleeps, and answers on it', async () => {
    const run = await startServer()
    const port = Number(new URL(run.http).port)
    const socket: Socket = connect(port, '127.0.0.1')
    try {
      let heard = ''
      let hungUp = false
      socket.setEncoding('utf8')
      socket.on('data', (chunk: string) => (heard += chunk))
      socket.on('end', () => (hungUp = true))
      socket.on('close', () => (hungUp = true))
      const ask = async () => {
        heard = ''
        socket.write(`GET /health HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: keep-alive\r\n\r\n`)
        // The whole answer: its body is sent in chunks, and the last chunk is the empty one.
        await vi.waitFor(() => expect(heard).toMatch(/"ok":true[\s\S]*\r\n0\r\n\r\n$/), { timeout: 4_000 })
      }
      await ask()
      // Past Node's own five seconds, with a margin for its timer to have come round.
      await new Promise((resolve) => setTimeout(resolve, 6_000))
      expect(hungUp).toBe(false)
      await ask()
      expect(heard).toMatch(/^HTTP\/1\.1 200/)
    } finally {
      socket.destroy()
      await run.stop()
    }
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
    // their own; åtta sedan #710 lade Bord-fliken med en hög och en yta valda till. Each new one
    // asks the fixture the way the rest do, which is the whole point of counting them here rather
    // than trusting that the pattern spread by itself.
    expect(built.length).toBe(8)
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

// The deaf server, and the one thing it is able to say about itself (#265, #275).
//
// It is a fixture like the others and lived in two test files as two copies, which had already
// drifted apart once. What it is for is a service that takes the call and then says nothing; what
// `stayedDeaf` is for is the difference between that and a service that hung up, because a test
// written about a line that hangs would otherwise quietly be running about a line that broke.
//
// So the predicate is asked both ways here. Any test that reads it while nothing has gone wrong is
// reading an empty list and would say `true` about a predicate that had stopped working at all.
const dial = (url: string): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const line = connect(Number(new URL(url).port), '127.0.0.1')
    line.once('error', reject)
    line.once('connect', () => resolve(line))
  })

const until = async (predicate: () => boolean, ms = 4_000): Promise<boolean> => {
  const deadline = Date.now() + ms
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
  return predicate()
}

describe('the deaf server the status tests dial (#275)', () => {
  it('says so when a call ended before the test put the phone down', async () => {
    const deaf = await deafServer()
    const line = await dial(deaf.url)
    expect(deaf.stayedDeaf()).toBe(true)
    // A call the fixture took and then lost is the leak the predicate exists to catch. It does not
    // matter which end let go: what it reports is that a call ended while the test still believed
    // it was hanging, and that is the reading a test about a hanging line has to be able to trust.
    line.destroy()
    expect(await until(() => !deaf.stayedDeaf())).toBe(true)
    await deaf.stop()
  })

  // What a test on a clock it drives waits for before it moves the clock (#1229): a caller that has
  // spoken, which a call the kernel connected and the caller has not yet seen come up has not.
  it('says it has heard a call once the caller has spoken, and not before', async () => {
    const deaf = await deafServer()
    const line = await dial(deaf.url)
    let heard = false
    void deaf.heard().then(() => (heard = true))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(heard).toBe(false)
    line.write('GET / HTTP/1.1\r\n\r\n')
    await deaf.heard()
    expect(deaf.stayedDeaf()).toBe(true)
    await deaf.stop()
    line.destroy()
  })

  // The teardown is not a hang-up either — `stop()` destroys the calls it is holding and that is
  // the test putting the phone down, not the fixture letting go. It is left unasked here on
  // purpose: the only way to know the server has taken a call is to end it and watch the predicate
  // turn, so a test that wanted to read `true` about a call the server was holding would have to
  // destroy the very call it was reading about. Every caller reads the predicate before it stops
  // the server, which is the order this is written for.
})
