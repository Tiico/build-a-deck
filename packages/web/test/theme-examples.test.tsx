// @vitest-environment jsdom
// Speltema är spelets eget tema, och de färdiga temana är exempel i ett ark bakom «Titta i
// exemplen»: där går de bara att läsa, och en kopia säger först vad den byter ut (L84, #1287).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { watchFontNet, type FontNet } from './font-net.js'

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

const sheet = () => screen.getByRole('region', { name: 'Exempel att utgå ifrån' })
const opener = () => screen.getByRole('button', { name: 'Titta i exemplen' })
async function openExamples(): Promise<void> {
  await openTheme()
  fireEvent.click(opener())
}
// A copy is done once its files have reached the service, and the status line says so.
const copied = (name: string) => screen.findByText(`Spelets tema är nu en kopia av ${name}.`)

describe('Speltema is the game’s own theme (L84, #1287)', () => {
  it('opens on the game’s parts, unfolded, with the game’s first card beside them, and no example to choose', async () => {
    await openTheme()
    for (const name of [/^Typsnitt/, /^Färger och betydelser/, /^Spelets ikoner/]) expect(screen.getByRole('button', { name }).getAttribute('aria-expanded')).toBe('true')
    const card = screen.getByRole('img', { name: 'Spelets första kort' })
    expect(card.textContent).toContain('Drake')
    expect(screen.queryByRole('button', { name: /^Välj temat/ })).toBeNull()
    expect(screen.queryByTestId('theme-departs')).toBeNull()
    expect(net.asked).toEqual([])
  })
})

describe('the examples to start from (L84, #1287)', () => {
  it('stand in a sheet behind «Titta i exemplen», to read and not to choose, and opening it asks Google for nothing', async () => {
    await openExamples()
    expect(opener().getAttribute('aria-expanded')).toBe('true')
    const names = within(sheet()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(names).toEqual(['Skogssaga', 'Ren', 'Retro', 'Krönika'])
    // A tile is no button and has no pressed state: an example is not a theme the game has.
    expect(within(sheet()).queryAllByRole('button', { pressed: false })).toEqual([])
    expect(sheet().querySelector('[aria-pressed]')).toBeNull()
    expect(sheet().textContent).toContain('Cinzel · EB Garamond')
    expect(net.asked).toEqual([])
  })

  it('says what a copy replaces before it is made, and makes it only on the second press', async () => {
    await openExamples()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Kopiera Skogssaga till spelets tema…' }))
    const asked = within(sheet()).getByRole('group', { name: 'Det här byts ut om du kopierar Skogssaga' })
    expect([...asked.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Rubrik sans-serif blir Cinzel',
      'Brödtext sans-serif blir EB Garamond',
      'Ny betydelse kostnad',
      'Ny betydelse vinst',
      'Ny betydelse försvar',
      'Ny betydelse anfall',
      '6 ikoner läggs till: mynt, sköld, svärd, hjärta, kristall, dra',
    ])
    expect(net.asked).toEqual([])
    fireEvent.click(within(asked).getByRole('button', { name: 'Avbryt' }))
    expect(within(sheet()).queryByRole('group', { name: /^Det här byts ut/ })).toBeNull()

    fireEvent.click(within(sheet()).getByRole('button', { name: 'Kopiera Skogssaga till spelets tema…' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Kopiera till spelets tema' }))
    await copied('Skogssaga')
    // The sheet folds away, the hand is back on the button that opened it, and the parts are the copy.
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Exempel att utgå ifrån' })).toBeNull())
    expect(document.activeElement).toBe(opener())
    expect(screen.getByRole('button', { name: /^Typsnitt/ }).closest('section')?.textContent).toContain('Cinzel')
  })

  it('says it when the catalog does not answer a copy, and leaves the game as it was', async () => {
    net.undo()
    const real = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.startsWith('https://fonts.')) return new Response('', { status: 503 })
      return real(input as RequestInfo, init)
    }) as typeof fetch
    try {
      await openExamples()
      fireEvent.click(within(sheet()).getByRole('button', { name: 'Kopiera Retro till spelets tema…' }))
      fireEvent.click(within(sheet()).getByRole('button', { name: 'Kopiera till spelets tema' }))
      expect(await within(sheet()).findByText(/Katalogen svarade inte/)).toBeTruthy()
      expect(screen.getByRole('button', { name: /^Typsnitt/ }).closest('section')?.textContent).not.toContain('Oswald')
    } finally {
      globalThis.fetch = real
    }
  })

  it('folds away on Escape and hands the focus back to «Titta i exemplen»', async () => {
    await openExamples()
    fireEvent.keyDown(within(sheet()).getByRole('button', { name: 'Klar' }), { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Exempel att utgå ifrån' })).toBeNull()
    expect(document.activeElement).toBe(opener())
  })

  // Beställarens val C (2026-10-01): korten i temats typsnitt finns, men bara på tryck. Katalogen
  // nås på designerns handling och inte när arket öppnas (L27, DRIFT §12).
  it('draws each example on the game’s own card in its own typefaces, and only once that is asked for', async () => {
    await openExamples()
    expect(document.querySelectorAll('.byd-theme-tile [data-theme-card]')).toHaveLength(0)
    expect(net.asked).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Visa temana i sina typsnitt' }))
    await waitFor(() => expect(document.querySelectorAll('.byd-theme-tile [data-theme-card]')).toHaveLength(4))
    // One sheet for each of the seven families the four examples are set in. The tool fetches no
    // file itself: the card names the catalog's own address and the page draws from it, and
    // nothing becomes the game's until an example is copied.
    const sheets = net.asked.filter((url) => url.startsWith('https://fonts.googleapis.com/'))
    expect(sheets.map((url) => new URL(url).searchParams.get('family')?.split(':')[0]).sort()).toEqual(['Cinzel', 'EB Garamond', 'Inter', 'Lora', 'Merriweather', 'Oswald', 'Roboto Condensed'])
    expect(net.asked.filter((url) => url.startsWith('https://fonts.gstatic.com/'))).toEqual([])
    const skog = within(sheet()).getByRole('heading', { name: 'Skogssaga' }).closest('.byd-theme-tile') as HTMLElement
    expect(skog.textContent).toContain('Drake')
    expect(skog.querySelector('style')?.textContent).toContain('Cinzel')
    expect(screen.queryByRole('button', { name: 'Visa temana i sina typsnitt' })).toBeNull()
    // And nothing was copied by looking.
    expect(screen.getByRole('button', { name: /^Typsnitt/ }).closest('section')?.textContent).not.toContain('Cinzel')
  })

  it('says it when the catalog does not answer the preview, and the tiles stay as they were', async () => {
    net.undo()
    const real = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.startsWith('https://fonts.')) return new Response('', { status: 503 })
      return real(input as RequestInfo, init)
    }) as typeof fetch
    try {
      await openExamples()
      fireEvent.click(screen.getByRole('button', { name: 'Visa temana i sina typsnitt' }))
      expect(await screen.findByText(/Katalogen svarade inte/)).toBeTruthy()
      expect(document.querySelectorAll('.byd-theme-tile [data-theme-card]')).toHaveLength(0)
      expect(screen.getByRole('button', { name: 'Visa temana i sina typsnitt' })).toBeTruthy()
    } finally {
      globalThis.fetch = real
    }
  })
})
