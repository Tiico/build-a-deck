// @vitest-environment jsdom
// Speltema öppnar på ett galleri av färdiga teman, och en rad säger vad spelet avviker med från det
// valda (L57, #632).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { watchFontNet, type FontNet } from './font-net.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
let net: FontNet
beforeEach(async () => {
  localStorage.clear()
  run = await startServer()
  net = watchFontNet()
})
afterEach(async () => {
  net.undo()
  await run.stop()
})

async function openTheme(): Promise<void> {
  await run.projects.create(run.projectId, projectDoc())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(
    <StatusLive>
      <EditorPage />
    </StatusLive>,
  )
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Speltema' }))
}

const gallery = () => screen.getByRole('group', { name: 'Färdiga teman' })
const line = () => screen.getByTestId('theme-departs')
// A theme is chosen once its files have reached the service, and the status line says so.
const chosen = (name: string) => screen.findByText(`Spelet utgår nu från ${name}.`)

describe('the gallery of ready-made themes (L57, #632)', () => {
  it('stands first in Speltema, four themes and none of them chosen, and asks Google for nothing', async () => {
    await openTheme()
    const tiles = within(gallery()).getAllByRole('button')
    expect(tiles.map((b) => b.getAttribute('aria-label'))).toEqual(['Välj temat Skogssaga', 'Välj temat Ren', 'Välj temat Retro', 'Välj temat Krönika'])
    expect(tiles.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    // Each tile says which families it sets the card in, in words.
    expect(tiles[0]?.textContent).toContain('Cinzel · EB Garamond')
    // It stands above the parts a theme is made of.
    const sections = document.querySelector('[data-theme-section]')
    expect(gallery().compareDocumentPosition(sections as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(line().textContent).toBe('Spelet utgår inte från något av temana.')
    // L27, DRIFT §12: the catalog is reached on the designer's handling and not on the tab opening.
    expect(net.asked).toEqual([])
  })

  it('lays a theme over the game on a press, and the line says it is unchanged', async () => {
    await openTheme()
    fireEvent.click(within(gallery()).getByRole('button', { name: 'Välj temat Skogssaga' }))
    expect(await screen.findByText('Väljer Skogssaga…')).toBeTruthy()
    await chosen('Skogssaga')
    expect(line().textContent).toBe('Ditt tema är Skogssaga, oförändrat.')
    expect(within(gallery()).getByRole('button', { name: 'Välj temat Skogssaga' }).getAttribute('aria-pressed')).toBe('true')
    // The parts follow: the typefaces' head carries the theme's families, the colours its meanings.
    expect(screen.getByRole('button', { name: /^Typsnitt/ }).textContent).toContain('Cinzel')
    expect(screen.getByRole('button', { name: /^Färger och betydelser/ }).textContent).toContain('kostnad · vinst · försvar · anfall')
  })

  it('names what departs from the theme on one line, and Återställ takes it back', async () => {
    await openTheme()
    fireEvent.click(within(gallery()).getByRole('button', { name: 'Välj temat Ren' }))
    await chosen('Ren')
    expect(line().textContent).toBe('Ditt tema är Ren, oförändrat.')
    fireEvent.click(screen.getByRole('button', { name: /^Färger och betydelser/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Måla vinst i guld' }))
    await waitFor(() => expect(line().textContent).toBe('Ditt tema är Ren med 1 ändring: vinsts färg. Återställ'))
    fireEvent.click(within(line()).getByRole('button', { name: 'Återställ till Ren' }))
    await waitFor(() => expect(line().textContent).toBe('Ditt tema är Ren, oförändrat.'))
  })

  it('says it when the catalog does not answer, and leaves the game as it was', async () => {
    net.undo()
    const real = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.startsWith('https://fonts.')) return new Response('', { status: 503 })
      return real(input as RequestInfo, init)
    }) as typeof fetch
    try {
      await openTheme()
      fireEvent.click(within(gallery()).getByRole('button', { name: 'Välj temat Retro' }))
      expect(await screen.findByText(/Katalogen svarade inte/)).toBeTruthy()
      expect(line().textContent).toBe('Spelet utgår inte från något av temana.')
    } finally {
      globalThis.fetch = real
    }
  })
})
