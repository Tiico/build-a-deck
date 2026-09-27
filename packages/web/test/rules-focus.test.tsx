// @vitest-environment jsdom
// Where the hand is after the Regler tab has done what it was asked (#481, fynd 12; L12). Each of
// these controls goes away with the press that used it — the ways in once there is a book, the
// report once it is answered — and the focus went with them, to <body>, so the next Tab started
// from the top of the page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function openRules(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await run.projects.create(run.projectId, projectDoc())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await user.click(screen.getByRole('tab', { name: 'Regler' }))
}
const inBook = () => document.activeElement?.closest('[data-rulebook] [data-block]') ?? null
const FILE = '# Skogens herrar\n\n## En tur\n\nDra ett kort.'

describe('the focus after a press in the Regler tab', () => {
  it.each(['Börja skriva reglerna', 'Börja från en mall'])('lands in the book after «%s»', async (way) => {
    const user = userEvent.setup()
    await openRules(user)
    await user.click(screen.getByRole('button', { name: way }))
    await waitFor(() => expect(inBook()).not.toBeNull())
  })

  it('lands in the book after «Gör boken»', async () => {
    const user = userEvent.setup()
    await openRules(user)
    fireEvent.change(screen.getByLabelText('Importera från fil'), { target: { files: [new File([FILE], 'regler.md', { type: 'text/markdown' })] } })
    await user.click(await screen.findByRole('button', { name: 'Gör boken' }))
    await waitFor(() => expect(inBook()).not.toBeNull())
  })

  it.each(['Avbryt', 'Escape'])('goes back to the import after the report is left with %s', async (how) => {
    const user = userEvent.setup()
    await openRules(user)
    fireEvent.change(screen.getByLabelText('Importera från fil'), { target: { files: [new File([FILE], 'regler.md', { type: 'text/markdown' })] } })
    const report = await screen.findByRole('region', { name: 'Vad importen gör med filen' })
    if (how === 'Escape') fireEvent.keyDown(report, { key: 'Escape' })
    else await user.click(screen.getByRole('button', { name: 'Avbryt' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Importera från fil')))
  })
})
