// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { RuleDrawer } from '../src/rules/RuleDrawer.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import type { RuleDoc } from '@byd/server'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// What the book says when it is read out, line by line, on every surface that draws it (#286).
//
// Nothing read the book's paragraphs this way before, and that is the whole point of the suite: a
// heading is queried by name all the time, a paragraph never is, so plain text could carry an
// element of its own for as long as the book has existed without anything falling over. The
// element ran the words together in the computed name — `Om Draghög` came back as `OmDraghög` —
// because the name of an element is trimmed before it is joined to what stands beside it, and the
// space lived inside the element rather than between them.
//
// Every surface is asked the same questions in the same loop, because the drawer at the table and
// the book in the editor are two components with two copies of the same inline reading. Two
// suites would let them stop agreeing quietly; one loop cannot.

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// A paragraph has no role that takes its name from what it holds, so no query in the testing
// library reads one directly — which is exactly why nothing ever did. What does read a paragraph
// by name is a reference to it: `aria-labelledby` pointing here, the same way a dialog takes its
// name from its heading. That runs the whole computation in `dom-accessibility-api` over the
// paragraph's children, which is the reading a screen reader is given and the one thing that
// noticed the wrapper. The hook puts a paragraph in front of that question instead of guessing at
// the shape of the DOM: what is pinned is the reading, not the markup that produces it.
const ASKED = 'byd-read-aloud'
function readAloud(el: Element): void {
  const doc = el.ownerDocument
  for (const old of doc.querySelectorAll('[data-read-aloud]')) old.remove()
  el.id = ASKED
  const probe = doc.createElement('div')
  probe.setAttribute('role', 'note')
  probe.setAttribute('aria-labelledby', ASKED)
  probe.setAttribute('data-read-aloud', 'true')
  doc.body.append(probe)
}

// The line is asked for by the block it belongs to and never by its words: the words are the very
// thing under test, and a query that read them would be reading the shape it is meant to ignore.
const lineOf = (where: HTMLElement, id: string): Element => where.querySelector(`[data-block="${id}"] p`)!

const asBook = (blocks: RuleDoc['blocks']) => ({ ...projectDoc(), rules: { title: 'Skogens herrar', blocks } })

// The drawer, wherever it hangs. The table and the phone are one component under two placements,
// and the loop asks both so that a placement can never quietly grow a reading of its own.
const inTheDrawer =
  (placement: 'table' | 'phone') =>
  async (blocks: RuleDoc['blocks']): Promise<HTMLElement> => {
    await run.projects.create(run.projectId, asBook(blocks))
    const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
    const { id } = (await res.json()) as { id: string }
    render(<RuleDrawer http={run.http} sessionId={id} placement={placement} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Regler' }))
    const panel = await screen.findByRole('dialog', { name: 'Regler' })
    await within(panel).findByRole('heading', { name: 'Skogens herrar' })
    return panel
  }

const inTheEditor = async (blocks: RuleDoc['blocks']): Promise<HTMLElement> => {
  await run.projects.create(run.projectId, asBook(blocks))
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
  const book = document.querySelector('[data-rulebook]') as HTMLElement
  await within(book).findByRole('heading', { name: 'Skogens herrar' })
  return book
}

const surfaces = [
  ['at the table', inTheDrawer('table')],
  ['on the phone', inTheDrawer('phone')],
  ['in the editor', inTheEditor],
] as const

describe.each(surfaces)('the book read out %s (#286)', (_where, open) => {
  it('keeps the space between a paragraph’s own words and the name it points at', async () => {
    const where = await open([{ kind: 'text', id: 't1', text: 'Spelet slutar när [[zon:draw]] är tom.' }])
    readAloud(lineOf(where, 't1'))
    expect(screen.getByRole('note', { name: 'Spelet slutar när Draghög är tom.' })).toBeTruthy()
  })

  // The other three things a line can hold. Emphasis and a symbol are elements the book needs —
  // they say something the letters do not — so the reading has to come out whole around them, and
  // not only around the plain words between two of them.
  it('reads emphasis and a symbol as words in the sentence and not as words run together', async () => {
    const where = await open([{ kind: 'text', id: 't1', text: 'Dra **två** kort ur [[zon:draw]] och lägg *ett* i {hjärta}.' }])
    readAloud(lineOf(where, 't1'))
    expect(screen.getByRole('note', { name: 'Dra två kort ur Draghög och lägg ett i hjärta.' })).toBeTruthy()
  })

  // The heading from #272, which is where the wrapper was found. It is the one line of the book
  // that has always been read by name, so it holds on its own — with no hook at all.
  it('still reads a heading by the name it has, which is what found this in the first place', async () => {
    const where = await open([{ kind: 'heading', id: 'h1', level: 1, text: 'Om [[zon:draw]]' }])
    expect(within(where).getByRole('heading', { name: 'Om Draghög' })).toBeTruthy()
  })
})
