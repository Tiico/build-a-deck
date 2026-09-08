// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function openSymbols(): Promise<void> {
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Symboler' }))
}
const tile = (name: string) => screen.getByRole('button', { name: `Ta in ${name}` })

describe('the symbol library in the editor (E4)', () => {
  it('searches the library, narrows to a category, and says what a symbol is licensed under', async () => {
    await run.projects.create('p1', projectDoc())
    await openSymbols()
    expect(tile('sköld')).toBeTruthy()
    expect(tile('sköld').textContent).toContain('CC0-1.0')

    fireEvent.change(screen.getByLabelText('Sök symbol'), { target: { value: 'försvar' } })
    expect(screen.getAllByRole('button', { name: /^Ta in / })).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Sök symbol'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Platshållare' }))
    expect(screen.queryByRole('button', { name: 'Ta in sköld' })).toBeNull()
    expect(screen.getByRole('button', { name: /Ta in ram-tunn/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Sök symbol'), { target: { value: 'ingenting alls' } })
    expect(screen.getByText(/Inget med det namnet/)).toBeTruthy()
  })

  it('takes a symbol into the game, shows it in the set with what to write, renames and removes it, and saves the licence with the project', async () => {
    await run.projects.create('p1', projectDoc())
    await openSymbols()
    expect(screen.getByText(/Inga symboler ännu/)).toBeTruthy()

    fireEvent.click(tile('sköld'))
    const set = await screen.findByRole('list', { name: 'Symboler i spelet' })
    await waitFor(() => expect(within(set).getByText('{sköld}')).toBeTruthy())
    expect(within(set).getByText(/CC0-1\.0/)).toBeTruthy()

    const rename = within(set).getByLabelText('Namn för sköld')
    fireEvent.change(rename, { target: { value: 'försvar' } })
    fireEvent.blur(rename)
    await waitFor(() => expect(within(set).getByText('{försvar}')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(2))
    const stored = await run.projects.load('p1')
    expect(stored?.icons['försvar']).toMatch(/^asset:[0-9a-f]{64}$/)
    expect(stored?.credits?.['försvar']).toMatchObject({ licence: 'CC0-1.0', source: 'skold' })

    fireEvent.click(within(set).getByRole('button', { name: 'Ta bort försvar' }))
    await waitFor(() => expect(screen.getByText(/Inga symboler ännu/)).toBeTruthy())
  })

  it('draws a symbol on the cards it is written into, and says which cards use it', async () => {
    const doc = projectDoc()
    doc.rows[0]!.fields['body'] = 'Flygande. {sköld}'
    await run.projects.create('p1', doc)
    await openSymbols()
    // Before the symbol is taken in, the card says the name is unknown rather than nothing (L2).
    expect(document.querySelector('[data-card-ref="dragon"] .byd-icon-missing')).toBeTruthy()

    fireEvent.click(tile('sköld'))
    await waitFor(() => expect(document.querySelector('[data-card-ref="dragon"] img.byd-icon')).toBeTruthy())
    const set = await screen.findByRole('list', { name: 'Symboler i spelet' })
    expect(within(set).getByText('1 kort')).toBeTruthy()
  })
})
