// @vitest-environment jsdom
// The two panels that hang from the editor's header close the way an application's panels close
// (UX-granskning 2026-09-16, fynd 8 — issue #133).
//
// Neither did. The history opened from the revision and the share sheet opened from the faces, and
// the only way to shut either was to press the same button a second time — so a designer who
// opened the history over the layer list had to go and find the revision in the header to get her
// work back. Escape did nothing, a press in the work did nothing, and both could stand open at
// once, over the work and over each other.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
  await run.projects.create(run.projectId, projectDoc())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
})
afterEach(async () => {
  await run.stop()
})

const history_ = () => document.querySelector('.byd-history')
const share = () => document.querySelector('.byd-share')

describe('a panel that hangs from the header', () => {
  it('closes on Escape and gives the focus back to the button it came from', async () => {
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    const rev = screen.getByRole('button', { name: /^rev / })

    fireEvent.click(rev)
    expect(history_()).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(history_()).toBeNull())
    expect(document.activeElement).toBe(rev)
  })

  it('closes when the pointer goes down anywhere outside it', async () => {
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')

    fireEvent.click(screen.getByRole('button', { name: /^rev / }))
    expect(history_()).toBeTruthy()
    // A press inside the panel leaves it open — a panel that closed under its own controls would
    // be a panel with no controls.
    fireEvent.pointerDown(history_()!)
    expect(history_()).toBeTruthy()
    // A press in the work closes it.
    fireEvent.pointerDown(document.querySelector('.byd-editor > main')!)
    await waitFor(() => expect(history_()).toBeNull())
  })

  it('closes the share sheet the same two ways', async () => {
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    const here = screen.getByRole('button', { name: /vilka som har spelet/i })

    fireEvent.click(here)
    expect(share()).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(share()).toBeNull())
    expect(document.activeElement).toBe(here)

    fireEvent.click(here)
    expect(share()).toBeTruthy()
    fireEvent.pointerDown(document.querySelector('.byd-editor > main')!)
    await waitFor(() => expect(share()).toBeNull())
  })
})
