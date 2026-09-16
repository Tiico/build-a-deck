// @vitest-environment jsdom
// The two panels the editor's header opens over the work: the project's history behind the
// revision (B4), and who has the game behind the faces (D3).
//
// Neither is modal — the work under them is what they are about, and it stays readable and
// reachable — but a panel that stands over the work still has to be closable the way any panel in
// any application is (UX-KONTROLLER: "komplett mus-, touch- och tangentbordsinteraktion"). The
// WAI-ARIA practice for a non-modal panel is the whole of it: Escape closes it and hands the focus
// back to the button that opened it, and a click back in the work closes it too. A panel that only
// answers the button that opened it is a panel a designer has to go looking for a way out of.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
  await run.projects.create(run.projectId, projectDoc())
})
afterEach(async () => {
  await run.stop()
})

async function openEditor(): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
}

describe('the history over the editor’s work (B4)', () => {
  it('closes on Escape and hands the focus back to the revision', async () => {
    const user = userEvent.setup()
    await openEditor()
    const rev = screen.getByRole('button', { name: /rev 1/ })
    await user.click(rev)
    await screen.findByRole('dialog', { name: 'Historik' })

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Historik' })).toBeNull())
    expect(document.activeElement).toBe(rev)
  })

  it('closes when the designer clicks back into the work', async () => {
    const user = userEvent.setup()
    await openEditor()
    await user.click(screen.getByRole('button', { name: /rev 1/ }))
    await screen.findByRole('dialog', { name: 'Historik' })

    await user.click(screen.getByRole('tabpanel', { name: 'Kortvägg' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Historik' })).toBeNull())
  })

  it('stays open while the designer works inside it', async () => {
    const user = userEvent.setup()
    await openEditor()
    await user.click(screen.getByRole('button', { name: /rev 1/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })

    await user.click(await within(panel).findByRole('button', { name: /Version 1/ }))
    expect(screen.getByRole('dialog', { name: 'Historik' })).toBeTruthy()
  })
})

describe('who has the game, over the editor’s work (D3)', () => {
  it('closes on Escape and hands the focus back to the faces in the header', async () => {
    const user = userEvent.setup()
    await openEditor()
    const here = screen.getByRole('button', { name: 'Vilka som har spelet' })
    await user.click(here)
    await screen.findByRole('dialog', { name: 'Vilka som har spelet' })

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Vilka som har spelet' })).toBeNull())
    expect(document.activeElement).toBe(here)
  })

  it('closes when the designer clicks back into the work', async () => {
    const user = userEvent.setup()
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Vilka som har spelet' }))
    await screen.findByRole('dialog', { name: 'Vilka som har spelet' })

    await user.click(screen.getByRole('tabpanel', { name: 'Kortvägg' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Vilka som har spelet' })).toBeNull())
  })
})

// Two panels over each other cover the work and each other — on the template tab the history
// lands over the layer list and the group strip — so the header opens one at a time.
describe('the two panels together', () => {
  it('closes the one that was standing when the other opens', async () => {
    const user = userEvent.setup()
    await openEditor()
    await user.click(screen.getByRole('button', { name: /rev 1/ }))
    await screen.findByRole('dialog', { name: 'Historik' })

    await user.click(screen.getByRole('button', { name: 'Vilka som har spelet' }))
    await screen.findByRole('dialog', { name: 'Vilka som har spelet' })
    expect(screen.queryByRole('dialog', { name: 'Historik' })).toBeNull()

    await user.click(screen.getByRole('button', { name: /rev 1/ }))
    await screen.findByRole('dialog', { name: 'Historik' })
    expect(screen.queryByRole('dialog', { name: 'Vilka som har spelet' })).toBeNull()
  })
})
