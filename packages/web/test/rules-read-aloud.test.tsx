// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

const bookAtTheTable = async (blocks: RuleDoc['blocks']): Promise<HTMLElement> => {
  await run.projects.create(run.projectId, { ...projectDoc(), rules: { title: 'Skogens herrar', blocks } })
  const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
  const { id } = (await res.json()) as { id: string }
  render(<RuleDrawer http={run.http} sessionId={id} placement="table" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Regler' }))
  const panel = await screen.findByRole('dialog', { name: 'Regler' })
  await within(panel).findByRole('heading', { name: 'Skogens herrar' })
  return panel
}

// The line is asked for by the block it belongs to and never by its words: the words are the very
// thing under test, and a query that reads them would be reading the shape it is meant to ignore.
const lineOf = (panel: HTMLElement, id: string, tag = 'p'): Element => panel.querySelector(`[data-block="${id}"] ${tag}`)!

describe('the book read out at the table (#286)', () => {
  it('keeps the space between a paragraph’s own words and the name it points at', async () => {
    const panel = await bookAtTheTable([{ kind: 'text', id: 't1', text: 'Spelet slutar när [[zon:draw]] är tom.' }])
    readAloud(lineOf(panel, 't1'))
    expect(screen.getByRole('note', { name: 'Spelet slutar när Draghög är tom.' })).toBeTruthy()
  })
})
