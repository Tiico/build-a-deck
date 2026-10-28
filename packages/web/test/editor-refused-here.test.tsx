// @vitest-environment jsdom
// An edit the editor's own client refuses, before anything is sent (#1454). The first change of a
// thin box's side put a face into the document that `ProjectBox.parse` refused (#1448): the field
// went back without a word and the only trace was a ZodError in the console that nobody caught.
// The control read as dead. A refusal here is said the way the actor's refusal is (#993), in the
// same notice and the same words, and nothing is left thrown.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ZodError } from 'zod'
import { applyEdit } from '@byd/server/doc'
import { EditorPage } from '../src/editor/EditorPage.js'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

const REFUSED = 'En ändring gick inte att göra och har tagits bort. Försök igen, eller gör ändringen på ett annat sätt.'

// The edit the document refuses the way it refused the thin box's face: `ProjectBox.parse` throws
// the schema's own error, with the schema's own words in it. #1448 mended the face, so no control
// asks for such an edit any more; this one is the box's width locked at a length no box has.
const REFUSING = { v: 'lockBox', side: 'width', mm: -5 } as const
const ASKED = 'Vägrad'

let run: Running
// Whatever is thrown and not caught while the page runs: an error the browser reports, and a
// promise nobody waits for.
let uncaught: unknown[]
const heard = (event: ErrorEvent | PromiseRejectionEvent) => uncaught.push('error' in event ? event.error : event.reason)
beforeEach(async () => {
  run = await startServer()
  uncaught = []
  window.addEventListener('error', heard)
  window.addEventListener('unhandledrejection', heard)
})
afterEach(async () => {
  vi.restoreAllMocks()
  window.removeEventListener('error', heard)
  window.removeEventListener('unhandledrejection', heard)
  await run.stop()
})

describe('an edit the editor refuses before sending it (#1454)', () => {
  it('is said in the notice the actor’s refusal is said in, in the designer’s words, and nothing is left thrown', async () => {
    // The refusal is the schema's, as it was on the thin box.
    expect(() => applyEdit(projectDoc(), REFUSING)).toThrow(ZodError)
    // A cell written with one word asks for that edit instead, through the client's own door.
    const setCell = ProjectClient.prototype.setCell
    vi.spyOn(ProjectClient.prototype, 'setCell').mockImplementation(function (this: ProjectClient, ...args: Parameters<typeof setCell>) {
      if (args[2] === ASKED) return this.edit(REFUSING)
      return setCell.apply(this, args)
    })
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(
      <StatusLive>
        <EditorPage />
      </StatusLive>,
    )
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    const cell = screen.getByLabelText('dragon title') as HTMLInputElement
    // Until the actor has said this reader may edit, the cell is read-only and a change is nothing.
    await waitFor(() => expect(cell.readOnly).toBe(false))

    fireEvent.focus(cell)
    fireEvent.change(cell, { target: { value: ASKED } })

    const said = await screen.findByText(REFUSED)
    expect(said.closest('[role="alert"]')).not.toBeNull()
    // The schema's words are a developer's, and never the designer's to read.
    expect(document.body.textContent).not.toMatch(/Too small|too_small|ZodError|expected number/i)
    // The cell holds what the game holds, and nothing was charged for the refusal.
    await waitFor(() => expect((screen.getByLabelText('dragon title') as HTMLInputElement).value).toBe('Drake'))
    expect(screen.getByRole('button', { name: 'Spara' }).getAttribute('aria-disabled')).toBe('true')
    // A beat for anything thrown on the way to be reported.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(uncaught).toEqual([])
  })
})
