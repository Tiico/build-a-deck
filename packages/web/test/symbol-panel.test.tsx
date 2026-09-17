// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import type { ProjectDoc } from '@byd/server'
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

async function openSymbols(): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Symboler' }))
}
const tile = (name: string) => screen.getByRole('button', { name: `Ta in ${name}` })

describe('the symbol library in the editor (E4)', () => {
  it('searches the library, narrows to a category, and says what a symbol is licensed under', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openSymbols()
    expect(tile('sköld')).toBeTruthy()
    expect(tile('sköld').textContent).toContain('CC0-1.0')

    fireEvent.change(screen.getByLabelText('Sök symbol'), { target: { value: 'försvar' } })
    expect(screen.getAllByRole('button', { name: /^Ta in / })).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Sök symbol'), { target: { value: '' } })
    // Since #128 the categories live in a named box in the panel's crown, which says which one is
    // chosen before it is opened.
    expect(screen.getByRole('button', { name: /^Kategori/ }).textContent).toContain('Alla')
    fireEvent.click(screen.getByRole('button', { name: /^Kategori/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Platshållare' }))
    expect(screen.getByRole('button', { name: /^Kategori/ }).textContent).toContain('Platshållare')
    expect(screen.queryByRole('button', { name: 'Ta in sköld' })).toBeNull()
    expect(screen.getByRole('button', { name: /Ta in ram-tunn/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Sök symbol'), { target: { value: 'ingenting alls' } })
    expect(screen.getByText(/Inget med det namnet/)).toBeTruthy()
  })

  it('takes a symbol into the game, shows it in the set with what to write, renames and removes it, and saves the licence with the project', async () => {
    await run.projects.create(run.projectId, projectDoc())
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
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
    const stored = await run.projects.load(run.projectId)
    expect(stored?.icons['försvar']).toMatch(/^asset:[0-9a-f]{64}$/)
    expect(stored?.credits?.['försvar']).toMatchObject({ licence: 'CC0-1.0', source: 'skold' })

    fireEvent.click(within(set).getByRole('button', { name: 'Ta bort försvar' }))
    await waitFor(() => expect(screen.getByText(/Inga symboler ännu/)).toBeTruthy())
  })

  it('draws a symbol on the cards it is written into, and says which cards use it', async () => {
    const doc = projectDoc()
    doc.rows[0]!.fields['body'] = 'Flygande. {sköld}'
    await run.projects.create(run.projectId, doc)
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    // Before the symbol is taken in, the card says the name is unknown rather than nothing (L2).
    // Read on the card wall and no longer on the symbol tab: since #178 a game with no symbol at
    // all draws no deck there, so this state has no cards on that tab to read it off. The wall
    // draws every card whatever the game has, which is what this half of the test needs.
    fireEvent.click(screen.getByRole('tab', { name: 'Kortvägg' }))
    await waitFor(() => expect(document.querySelector('[data-card-ref="dragon"] .byd-icon-missing')).toBeTruthy())

    fireEvent.click(screen.getByRole('tab', { name: 'Symboler' }))
    fireEvent.click(tile('sköld'))
    await waitFor(() => expect(document.querySelector('[data-card-ref="dragon"] img.byd-icon')).toBeTruthy())
    const set = await screen.findByRole('list', { name: 'Symboler i spelet' })
    expect(within(set).getByText('1 kort')).toBeTruthy()
  })
})

// The deck the symbol tab draws under the library (#178). It used to draw every card in the game,
// always, whatever was asked — a deck of 308 was 10 132 px of compiled cards under a line that
// said "no symbols yet", each one of them through the card renderer. The tab is about symbols and
// where they are said, so the deck it shows is the cards that say the symbol in hand.
//
// The count is what makes this a reading and not an impression: a wall that is merely shorter is
// still a wall nobody asked for.
const withIcons = (): ProjectDoc => {
  const doc = projectDoc()
  return {
    ...doc,
    icons: { guld: 'asset:aaa', sköld: 'asset:bbb' },
    rows: [
      { id: 'dragon', fields: { title: 'Drake', body: 'Kostar {guld}.', antal: 1 } },
      { id: 'knight', fields: { title: 'Riddare', body: 'Bär {sköld} och {guld}.', antal: 1 } },
      { id: 'wizard', fields: { title: 'Trollkarl', body: 'Ingen symbol alls.', antal: 1 } },
    ],
  }
}

const drawn = () => document.querySelectorAll('.byd-symbols-main .byd-wall-card').length
const chip = (name: string | RegExp) => screen.getByRole('button', { name })

describe('the deck the symbol tab draws (#178)', () => {
  it('draws no cards at all when the game has no symbol, and says what to do instead', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openSymbols()
    // The fixture deck has rows and no icons. Every one of them used to be compiled here.
    expect(drawn()).toBe(0)
    expect(screen.getByText(/Inga symboler ännu/)).toBeTruthy()
  })

  it('shows the cards that say the symbol in hand, and says how many say each', async () => {
    await run.projects.create(run.projectId, withIcons())
    await openSymbols()
    // A symbol is the choice the tab opens on, not the whole deck.
    await waitFor(() => expect(chip(/^guld/)).toBeTruthy())
    expect(chip(/^guld/).textContent).toContain('2')
    expect(chip(/^sköld/).textContent).toContain('1')
    expect(drawn()).toBe(2)
    expect(document.querySelector('[data-card-ref="wizard"]')).toBeNull()

    fireEvent.click(chip(/^sköld/))
    await waitFor(() => expect(drawn()).toBe(1))
    expect(document.querySelector('[data-card-ref="knight"]')).toBeTruthy()
  })

  it('keeps the whole deck as a choice of its own, and never as the default', async () => {
    await run.projects.create(run.projectId, withIcons())
    await openSymbols()
    await waitFor(() => expect(chip('Hela leken')).toBeTruthy())
    expect(chip('Hela leken').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(chip('Hela leken'))
    await waitFor(() => expect(drawn()).toBe(3))
  })

  it('says so when nothing says the symbol in hand, and offers the whole deck', async () => {
    const doc = withIcons()
    await run.projects.create(run.projectId, { ...doc, icons: { ...doc.icons, ensam: 'asset:ccc' } })
    await openSymbols()
    fireEvent.click(chip(/^ensam/))
    await waitFor(() => expect(screen.getByText(/Inget kort säger den här än/)).toBeTruthy())
    expect(drawn()).toBe(0)
    // The offer is a way on and not a sentence: pressing it shows the deck.
    fireEvent.click(chip('Hela leken'))
    await waitFor(() => expect(drawn()).toBe(3))
  })
})
