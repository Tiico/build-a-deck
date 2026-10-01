// @vitest-environment jsdom
// Speltema in Symbolers ställe (L57, #630): the game's typefaces, its meanings and its icons, each
// folded behind a head that carries its value when closed, as L25's panel sections do.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import type { ProjectDoc } from '@byd/server'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  localStorage.clear()
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

function mount(): ReturnType<typeof render> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  return render(
    <StatusLive>
      <EditorPage />
    </StatusLive>,
  )
}

async function openTheme(): Promise<void> {
  mount()
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Speltema' }))
}

// A head is a disclosure button inside its heading: the name, and while closed, the value.
const head = (name: RegExp) => screen.getByRole('button', { name })

const themed = (): ProjectDoc => ({
  ...projectDoc(),
  icons: { guld: 'asset:aaa', sköld: 'asset:bbb' },
  palette: { kostnad: '#8f2d20', vinst: '#2f6136' },
})

describe('the Speltema tab (L57)', () => {
  it('stands where Symboler stood, and no tab is called Symboler any more', async () => {
    await run.projects.create(run.projectId, projectDoc())
    mount()
    await screen.findByText('Skogens herrar')
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toContain('Speltema')
    expect(tabs).not.toContain('Symboler')
    expect(tabs.indexOf('Speltema')).toBe(tabs.indexOf('Tabell') + 1)
  })

  it('folds typefaces, meanings and icons, each closed head carrying its value', async () => {
    await run.projects.create(run.projectId, themed())
    await openTheme()
    const fonts = head(/^Typsnitt/)
    const colours = head(/^Färger och betydelser/)
    const icons = head(/^Spelets ikoner/)
    for (const h of [fonts, colours, icons]) {
      expect(h.getAttribute('aria-expanded')).toBe('false')
      expect(h.closest('h2')).not.toBeNull()
    }
    expect(fonts.textContent).toContain('sans-serif · system-ui')
    expect(colours.textContent).toContain('kostnad · vinst')
    expect(icons.textContent).toContain('2 st')
    // Nothing of what is folded is drawn while it is folded.
    expect(screen.queryByRole('list', { name: 'Symboler i spelet' })).toBeNull()
  })

  it('opens a section on a press, keeps it open on the next visit, and drops the value from its head', async () => {
    await run.projects.create(run.projectId, themed())
    await openTheme()
    fireEvent.click(head(/^Spelets ikoner/))
    expect(head(/^Spelets ikoner/).getAttribute('aria-expanded')).toBe('true')
    expect(head(/^Spelets ikoner/).textContent).not.toContain('2 st')
    const set = await screen.findByRole('list', { name: 'Symboler i spelet' })
    expect(within(set).getByText('{guld}')).toBeTruthy()

    // Back to the tab later: the section the designer opened is still open.
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Speltema' }))
    expect(head(/^Spelets ikoner/).getAttribute('aria-expanded')).toBe('true')
    expect(head(/^Typsnitt/).getAttribute('aria-expanded')).toBe('false')
  })

  it('says a section is empty in its head rather than showing a blank value', async () => {
    await run.projects.create(run.projectId, { ...projectDoc(), fonts: {} })
    await openTheme()
    expect(head(/^Typsnitt/).textContent).toContain('inga egna')
    expect(head(/^Färger och betydelser/).textContent).toContain('inga än')
    expect(head(/^Spelets ikoner/).textContent).toContain('inga än')
  })
})

describe('the library, opened from Spelets ikoner (L57, E4)', () => {
  it('opens beside the sections, takes a symbol into the set, and closes back onto its button', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openTheme()
    fireEvent.click(head(/^Spelets ikoner/))
    // Not drawn until it is asked for.
    expect(screen.queryByRole('searchbox', { name: 'Sök symbol' })).toBeNull()
    const opener = screen.getByRole('button', { name: /Ur biblioteket/ })
    fireEvent.click(opener)
    const library = await screen.findByRole('region', { name: 'Symbolbibliotek' })
    await waitFor(() => expect(document.activeElement).toBe(within(library).getByRole('searchbox', { name: 'Sök symbol' })))
    fireEvent.click(within(library).getByRole('button', { name: 'Ta in sköld' }))
    const set = await screen.findByRole('list', { name: 'Symboler i spelet' })
    await waitFor(() => expect(within(set).getByText('{sköld}')).toBeTruthy())
    expect(within(set).getByText(/CC0-1\.0/)).toBeTruthy()

    fireEvent.click(within(library).getByRole('button', { name: 'Klar' }))
    expect(screen.queryByRole('region', { name: 'Symbolbibliotek' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Ur biblioteket/ }))
  })

  it('closes on Escape too, and hands the focus back the same way', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openTheme()
    fireEvent.click(head(/^Spelets ikoner/))
    fireEvent.click(screen.getByRole('button', { name: /Ur biblioteket/ }))
    const library = await screen.findByRole('region', { name: 'Symbolbibliotek' })
    fireEvent.keyDown(within(library).getByRole('searchbox', { name: 'Sök symbol' }), { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Symbolbibliotek' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Ur biblioteket/ }))
  })
})

describe('the game’s typefaces live in Speltema, and Mall says so (L57)', () => {
  it('keeps the shelf — upload, catalog and licence — under Typsnitt', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openTheme()
    fireEvent.click(head(/^Typsnitt/))
    const shelf = screen.getByRole('list', { name: 'Typsnitt i spelet' })
    expect(within(shelf).getByText('sans-serif')).toBeTruthy()
    expect(screen.getByLabelText('Licens för sans-serif')).toBeTruthy()
    expect(screen.getByText('Ladda upp typsnitt')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sök i Google Fonts …' }))
    expect(await screen.findByRole('dialog', { name: 'Sök i Google Fonts' })).toBeTruthy()
  })

  it('takes the shelf out of Mall’s panel, and Mall points to where it went', async () => {
    await run.projects.create(run.projectId, projectDoc())
    mount()
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
    await waitFor(() => expect(document.querySelector('.byd-canvas-props')).not.toBeNull())
    expect(screen.queryByRole('list', { name: 'Typsnitt i spelet' })).toBeNull()
    expect(screen.queryByText('Ladda upp typsnitt')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Spelets typsnitt finns i Speltema/ }))
    expect(screen.getByRole('tab', { name: 'Speltema' }).getAttribute('aria-selected')).toBe('true')
    // And lands on them: the section is open.
    expect(head(/^Typsnitt/).getAttribute('aria-expanded')).toBe('true')
  })
})
