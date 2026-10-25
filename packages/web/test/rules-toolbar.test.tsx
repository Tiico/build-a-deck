// @vitest-environment jsdom
// The rules tab's one row of tools (#1258, beställarens val 2026-10-24: variant A, «En ordnad
// verktygsrad», prototype `docs/ux-audits/2026-10-24-regelbokens-knappar/prototyper/index.html`).
//
// The book's controls used to stand in four places — the header, the column, a ＋ in the page's
// margin and the open block's foot — and several of them were named for what they were rather than
// for what they did. What was decided is one row ordered by what its controls do: how the book is
// seen, what is added to it and where, and the book as a file. The column carries the contents and
// nothing else, the open block says what it is and how it goes in one row, and an empty book offers
// its three ways in on the page itself, each with a line on what it gives.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { Language } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import type { RuleDoc } from '@byd/server'

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
    { kind: 'text', id: 't1', text: 'Dra ett kort ur högen.' },
    { kind: 'text', id: 't2', text: 'Lägg det framför dig.' },
  ],
}

async function openRules(book: RuleDoc | null = rules, lang: 'sv' | 'en' = 'sv'): Promise<void> {
  const doc = projectDoc()
  await run.projects.create(run.projectId, book ? { ...doc, rules: book } : doc)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(lang === 'sv' ? <EditorPage /> : <Language lang="en"><EditorPage /></Language>)
  await screen.findAllByText(doc.name)
  fireEvent.click(screen.getByRole('tab', { name: lang === 'sv' ? 'Regler' : 'Rules' }))
}
const bar = () => document.querySelector('.byd-rules-bar') as HTMLElement
const page = () => document.querySelector('[data-rulebook]') as HTMLElement
const ids = () => [...page().querySelectorAll<HTMLElement>('[data-block]')].map((b) => b.dataset.block)
const adding = () => within(bar()).getByRole('group', { name: 'Lägg till' })
const where = () => document.getElementById(adding().getAttribute('aria-describedby') ?? '')?.textContent
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

describe('the row of tools (#1258)', () => {
  it('orders the row by what it does: how the book is seen, what is added, and the book as a file', async () => {
    await openRules()
    await within(page()).findByText('Dra ett kort ur högen.')
    const view = within(bar()).getByRole('group', { name: 'Visa boken' })
    expect(within(view).getAllByRole('button').map((b) => b.textContent)).toEqual(['Skriv', 'Förhandsvisa'])
    expect(within(adding()).getAllByRole('button').map((b) => b.textContent)).toEqual(['＋ Avsnitt', '＋ Text', '＋ Lista'])
    expect(within(adding()).getByLabelText('＋ Bild')).toBeTruthy()
    const book = within(bar()).getByRole('button', { name: 'Boken' })
    // The three stand in that order, the view first and the book last.
    const order = [view, adding(), book].map((el) => [...bar().querySelectorAll('*')].indexOf(el))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('says where an addition lands, and lands it after the block last written in', async () => {
    await openRules()
    await within(page()).findByText('Dra ett kort ur högen.')
    expect(where()).toBe('sist i boken')
    fireEvent.click(within(page()).getByText('Dra ett kort ur högen.'))
    const field = await within(page()).findByRole('textbox')
    fireEvent.keyDown(field, { key: 'Escape' })
    await waitFor(() => expect(within(page()).queryByRole('textbox')).toBeNull())
    expect(where()).toMatch(/^efter /)
    expect(where()).toContain('Så spelar ni')
    fireEvent.click(within(adding()).getByRole('button', { name: '＋ Text' }))
    await waitFor(() => expect(ids()).toHaveLength(4))
    expect(ids()[0]).toBe('h1')
    expect(ids()[1]).toBe('t1')
    expect(ids()[3]).toBe('t2')
    // What was added is open where it landed, ready to be written in.
    expect(page().querySelector(`[data-block="${ids()[2]}"] textarea`)).toBeTruthy()
  })

  it('adds a section as a heading and a paragraph, at the end of a book nobody has written in yet', async () => {
    await openRules()
    await within(page()).findByText('Dra ett kort ur högen.')
    fireEvent.click(within(adding()).getByRole('button', { name: '＋ Avsnitt' }))
    await waitFor(() => expect(ids()).toHaveLength(5))
    expect(ids().slice(0, 3)).toEqual(['h1', 't1', 't2'])
    expect(page().querySelector(`[data-block="${ids()[3]}"] input`)).toBeTruthy()
  })

  it('adds a list with one empty point', async () => {
    await openRules()
    await within(page()).findByText('Dra ett kort ur högen.')
    fireEvent.click(within(adding()).getByRole('button', { name: '＋ Lista' }))
    const point = await within(page()).findByRole('textbox', { name: /^Punkt 1/ })
    expect((point as HTMLInputElement).value).toBe('')
  })

  it('adds a picture from a file, and opens it on its alt text', async () => {
    await openRules()
    await within(page()).findByText('Dra ett kort ur högen.')
    fireEvent.change(within(adding()).getByLabelText('＋ Bild'), { target: { files: [new File([PNG], 'bordet.png', { type: 'image/png' })] } })
    const alt = await within(page()).findByRole('textbox', { name: /^Alt-text/ })
    expect(alt).toBeTruthy()
    expect(ids()).toHaveLength(4)
    expect(page().querySelector('img')?.getAttribute('src')).toContain('/assets/')
  })

  it('shows no adding in the preview, and says what the preview is instead', async () => {
    await openRules()
    await within(page()).findByText('Dra ett kort ur högen.')
    fireEvent.click(within(bar()).getByRole('button', { name: 'Förhandsvisa' }))
    expect(within(bar()).queryByRole('group', { name: 'Lägg till' })).toBeNull()
    expect(within(bar()).getByText('Så ser spelarna boken vid bordet.')).toBeTruthy()
  })

  it('keeps no ＋ in the margin and no way to add in the column', async () => {
    await openRules()
    await within(page()).findByText('Dra ett kort ur högen.')
    expect(document.querySelector('.byd-rules-add')).toBeNull()
    const toc = screen.getByRole('navigation', { name: 'Innehåll' })
    expect(within(toc).queryAllByRole('button')).toEqual([])
  })
})

describe('the book as a file (#1258)', () => {
  it('opens a menu with the file and the print, each saying what it does', async () => {
    await openRules({ ...rules, source: { file: 'regler.md', at: new Date(Date.now() - 60_000).toISOString() } })
    await within(page()).findByText('Dra ett kort ur högen.')
    const button = within(bar()).getByRole('button', { name: 'Boken' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const menu = document.getElementById(button.getAttribute('aria-controls') ?? '') as HTMLElement
    expect(within(menu).getByLabelText('Läs in regler.md igen')).toBeTruthy()
    expect(within(menu).getByLabelText('Ersätt med en annan fil…')).toBeTruthy()
    expect(within(menu).getByRole('button', { name: 'Ladda ner PDF-häfte' })).toBeTruthy()
    expect(within(menu).getByText('A5, för att skriva ut och vika')).toBeTruthy()
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)
  })

  it('offers one file for a book that came from none', async () => {
    await openRules()
    await within(page()).findByText('Dra ett kort ur högen.')
    fireEvent.click(within(bar()).getByRole('button', { name: 'Boken' }))
    expect(screen.getByLabelText('Ersätt med en fil…')).toBeTruthy()
    expect(screen.queryByLabelText(/igen$/)).toBeNull()
  })

  it('hands the focus back to the button once the report it opened is left', async () => {
    // The picker stands in a box that is shut by the time the report is left, and a shut box's
    // picker cannot take the focus in a browser: the hand goes to what opens it (#481, #1258).
    await openRules()
    await within(page()).findByText('Dra ett kort ur högen.')
    const button = within(bar()).getByRole('button', { name: 'Boken' })
    fireEvent.click(button)
    fireEvent.change(screen.getByLabelText('Ersätt med en fil…'), { target: { files: [new File(['# Skogens herrar\n\n## Nytt\n\nText.'], 'regler.md', { type: 'text/markdown' })] } })
    const report = await screen.findByRole('region', { name: 'Vad importen gör med boken du har' })
    fireEvent.click(within(report).getByRole('button', { name: 'Avbryt' }))
    await waitFor(() => expect(document.activeElement).toBe(within(bar()).getByRole('button', { name: 'Boken' })))
  })

  it('takes a file let go on the button, as the picker does', async () => {
    await openRules()
    await within(page()).findByText('Dra ett kort ur högen.')
    const button = within(bar()).getByRole('button', { name: 'Boken' })
    fireEvent.drop(button, { dataTransfer: { files: [new File(['# Skogens herrar\n\n## Nytt\n\nText.'], 'regler.md', { type: 'text/markdown' })] } })
    expect(await screen.findByRole('region', { name: 'Vad importen gör med boken du har' })).toBeTruthy()
  })
})

describe('the open block says what it is and how it goes, in one row (#1258)', () => {
  it.each([
    ['Dra ett kort ur högen.', 'Ta bort stycket'],
    ['Så spelar ni', 'Ta bort avsnittet'],
  ])('names the removal after the block: %s', async (text, removal) => {
    await openRules()
    fireEvent.click(await within(page()).findByText(text))
    const head = await waitFor(() => page().querySelector('.byd-rules-head') as HTMLElement)
    expect(within(head).getByRole('button', { name: removal })).toBeTruthy()
    expect(page().querySelector('.byd-rules-foot')).toBeNull()
  })

  it('stands the kinds and the removal in the same row', async () => {
    await openRules()
    fireEvent.click(await within(page()).findByText('Dra ett kort ur högen.'))
    const head = await waitFor(() => page().querySelector('.byd-rules-head') as HTMLElement)
    expect(within(head).getByRole('group', { name: /^Blockets slag/ })).toBeTruthy()
    expect(within(head).getByRole('button', { name: 'Ta bort stycket' })).toBeTruthy()
  })
})

describe('an empty book (#1258)', () => {
  it('offers the three ways in on the page, each with what it gives', async () => {
    await openRules(null)
    const ways = await screen.findByRole('region', { name: 'Reglerna hör till spelet' })
    expect(within(ways).getByRole('button', { name: /^Fem avsnitt med frågor/ })).toBeTruthy()
    expect(within(ways).getByRole('button', { name: /^Ett tomt blad/ })).toBeTruthy()
    expect(within(ways).getByLabelText('Läs in en fil')).toBeTruthy()
    expect(within(ways).getByText(/Bara en översikt/)).toBeTruthy()
    // Nothing in the row adds to a book that is not there yet.
    expect(within(bar()).queryByRole('group', { name: 'Lägg till' })).toBeNull()
    expect(within(bar()).queryByRole('button', { name: 'Boken' })).toBeNull()
  })

  it('makes the five sections from the first way in', async () => {
    await openRules(null)
    const ways = await screen.findByRole('region', { name: 'Reglerna hör till spelet' })
    fireEvent.click(within(ways).getByRole('button', { name: /^Fem avsnitt med frågor/ }))
    await waitFor(() => expect(page().querySelectorAll('h2')).toHaveLength(5))
  })

  it('makes one section from the blank page', async () => {
    await openRules(null)
    const ways = await screen.findByRole('region', { name: 'Reglerna hör till spelet' })
    fireEvent.click(within(ways).getByRole('button', { name: /^Ett tomt blad/ }))
    await waitFor(() => expect(page().querySelectorAll('h2')).toHaveLength(1))
  })
})

describe('in the reader\'s language', () => {
  it('names the row in English too', async () => {
    await openRules(rules, 'en')
    await within(page()).findByText('Dra ett kort ur högen.')
    expect(within(bar()).getByRole('group', { name: 'Show the book' })).toBeTruthy()
    expect(within(bar()).getByRole('group', { name: 'Add' })).toBeTruthy()
    expect(within(bar()).getByRole('button', { name: 'The book' })).toBeTruthy()
  })
})
