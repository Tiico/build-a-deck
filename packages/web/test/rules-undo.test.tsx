// @vitest-environment jsdom
// Ctrl+Z in a field of the rulebook (#481, fynd 7; L14). The field is controlled, so the browser's
// own step back took one character at a time — and a whole sentence was twenty presses. It now
// answers the way a cell of the table does since #479: a word at a time back to what the field
// held when it was entered, and then on to the editor's history.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import type { RuleDoc } from '@byd/server'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

const rules: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
    { kind: 'text', id: 't1', text: 'Dra ett kort.' },
  ],
}

describe('a step back in a field of the rulebook', () => {
  it('goes back a word at a time, then to what the field held when it was entered', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, { ...projectDoc(), rules })
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    await user.click(screen.getByRole('tab', { name: 'Regler' }))
    const book = document.querySelector('[data-rulebook]') as HTMLElement
    await user.click(within(book).getByText('Dra ett kort.'))
    const field = (await within(book).findByLabelText('Text under Så spelar ni')) as HTMLTextAreaElement
    await user.clear(field)
    await user.type(field, 'Lägg två kort')

    await user.keyboard('{Control>}z{/Control}')
    await waitFor(() => expect(field.value).toBe('Lägg två '))
    await user.keyboard('{Control>}z{/Control}')
    await waitFor(() => expect(field.value).toBe('Lägg '))
    await user.keyboard('{Control>}z{/Control}')
    await waitFor(() => expect(field.value).toBe('Dra ett kort.'))
  })
})
