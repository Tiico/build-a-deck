// @vitest-environment jsdom
// The empty rules tab (#131). It was a paragraph in the corner of an empty screen; it became the
// book's own disposition — the template's five sections laid out in the page, marked «· tomt» in the
// column beside them. #1258 (variant A) took that layout away: the empty tab is now the page the book
// will be, offering its three ways in, each with a line on what it gives, and the five sections are
// named in the line under the template's way rather than drawn as a book that is not there. What
// #131 decided still holds — the ways in do what they say, the template is a proposal and not a
// form, a way in is one step back, and the written book finds its way with the column.
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

// The five the product owner approved (B7): the five questions a player asks, in the order she
// asks them — what is this, how do we begin, what do I do now, what may I do, when are we done.
const SECTIONS = ['Översikt', 'Uppställning', 'En tur', 'Handlingar', 'Spelet tar slut']

async function openRules(): Promise<void> {
  await run.projects.create(run.projectId, projectDoc())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
}

const toc = () => screen.getByRole('navigation', { name: 'Innehåll' })
const ways = () => screen.getByRole('region', { name: 'Reglerna hör till spelet' })
const template = () => within(ways()).getByRole('button', { name: /^Fem avsnitt med frågor/ })

describe('the empty rules tab is the page the book will be (#131, #1258)', () => {
  it('names the template’s five sections on its way in, and lays out no book that is not there', async () => {
    await openRules()
    // The five are said in the line under the way that makes them, in the order they come.
    const said = template().textContent ?? ''
    const at = SECTIONS.map((section) => said.indexOf(section))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    // And nothing is drawn as though it were a book: no sections in the page, and no column of
    // contents for a book that has none (#1258) — the «· tomt» marks went with them.
    expect(within(ways()).queryAllByRole('heading', { level: 4 })).toEqual([])
    expect(screen.queryByRole('navigation', { name: 'Innehåll' })).toBeNull()
    expect(document.querySelector('[data-rulebook]')).toBeNull()
  })

  it('says what the rules are for as the page’s heading, and the rest behind its question mark', async () => {
    await openRules()
    // The page's own heading and never a box of its own (#131, #1258); what the line used to go on
    // to say — that the rules are versioned with the cards and where the players reach them — is
    // the help behind the question mark (L32, #303).
    expect(within(ways()).getByRole('heading', { name: 'Reglerna hör till spelet' })).toBeTruthy()
    expect(screen.queryByText(/sparas med varje version/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hjälp om reglerna' }))
    const help = await screen.findByRole('dialog', { name: 'Hjälp om reglerna' })
    expect(help.textContent).toMatch(/sparas med varje version/)
    expect(help.textContent).toMatch(/telefonen, TV:n och i observatörsvyn/)
  })
})

describe('the three ways in (#131)', () => {
  it('offers only the ways that work, so nothing on the surface is a promise nobody kept', async () => {
    await openRules()
    expect(within(ways()).getByRole('button', { name: /^Ett tomt blad/ })).toBeTruthy()
    expect(template()).toBeTruthy()
    // The third arrived with the import itself (rules-import.test.tsx), and not before it.
    expect(within(ways()).getByLabelText('Läs in en fil')).toBeTruthy()
  })

  it('writes, from “Ett tomt blad”, a book of one section carrying a question', async () => {
    await openRules()
    fireEvent.click(within(ways()).getByRole('button', { name: /^Ett tomt blad/ }))
    const written = await waitFor(() => document.querySelector('[data-rulebook]') as HTMLElement)
    expect(within(written).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Översikt'])
    expect(within(written).getByText('Vad handlar spelet om, i två meningar? Hur många spelar, och hur länge?')).toBeTruthy()
  })

  it('writes, from “Fem avsnitt med frågor”, the five sections with the setup already in its own', async () => {
    await openRules()
    fireEvent.click(template())
    const written = await waitFor(() => document.querySelector('[data-rulebook]') as HTMLElement)
    expect(within(written).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(SECTIONS)
    // Every section asks its question rather than standing as an empty line.
    expect(written.querySelectorAll('[data-ask]')).toHaveLength(SECTIONS.length)
    // And the setup is the game's own zones (B5), so it is right from the start and never drawn.
    // Folded, as the reader will meet it (#270).
    fireEvent.click(within(written).getByRole('button', { name: 'Visa uppställningen' }))
    expect(written.querySelectorAll('[data-setup-zone]').length).toBeGreaterThan(1)
  })
})

describe('a question a section carries (#131)', () => {
  it('is gone at the first character, because it is the field’s placeholder and never its value', async () => {
    await openRules()
    fireEvent.click(template())
    const written = await waitFor(() => document.querySelector('[data-rulebook]') as HTMLElement)
    fireEvent.click(written.querySelector('[data-ask]') as HTMLElement)
    const field = (await within(written).findByLabelText(/^Text /)) as HTMLTextAreaElement
    expect(field.value).toBe('')
    // The section's own question first, and under it the tool's notice about the way to a
    // reference (#215, «Radad»). The question is the block's and stands untouched; the second
    // line is the tool's and is what an empty field is for.
    expect(field.placeholder).toBe('Vad handlar spelet om, i två meningar? Hur många spelar, och hur länge?\n[[ hämtar en zon eller ett kort.')
    fireEvent.change(field, { target: { value: 'E' } })
    await waitFor(() => expect(within(written).getByText('E')).toBeTruthy())
    expect(written.querySelectorAll('[data-ask]')).toHaveLength(SECTIONS.length - 1)
  })
})

describe('the template is a proposal and not a form (#131)', () => {
  it('takes a whole section away, question and all, before a word has been written in it', async () => {
    await openRules()
    fireEvent.click(template())
    const written = await waitFor(() => document.querySelector('[data-rulebook]') as HTMLElement)
    const asked = written.querySelectorAll('[data-ask]').length
    fireEvent.click(within(within(written).getByRole('heading', { name: 'Handlingar' })).getByRole('button'))
    fireEvent.click(await within(written).findByRole('button', { name: 'Ta bort avsnittet' }))
    await waitFor(() =>
      expect(within(written).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Översikt', 'Uppställning', 'En tur', 'Spelet tar slut']),
    )
    // The question under it goes with it; a heading taken away never leaves its own prompt behind.
    expect(written.querySelectorAll('[data-ask]')).toHaveLength(asked - 1)
    expect(within(toc()).getAllByRole('link').map((a) => a.textContent)).toEqual(['Översikt', 'Uppställning', 'En tur', 'Spelet tar slut'])
  })

  // It stood at the foot of the column; it is «＋ Avsnitt» in the row above the book now (#1258), and
  // lands at the end of a book nobody has written in yet.
  it('adds one of the designer’s own sections from the row above the book', async () => {
    await openRules()
    fireEvent.click(template())
    const written = await waitFor(() => document.querySelector('[data-rulebook]') as HTMLElement)
    const adding = within(document.querySelector('.byd-rules-bar') as HTMLElement).getByRole('group', { name: 'Lägg till' })
    fireEvent.click(within(adding).getByRole('button', { name: '＋ Avsnitt' }))
    await waitFor(() => expect(within(toc()).getAllByRole('link')).toHaveLength(SECTIONS.length + 1))
    // It opens where it lands, so the name is written rather than found and clicked.
    const field = (await within(written).findByLabelText(/^Rubrik /)) as HTMLInputElement
    expect(field.value).toBe('Nytt avsnitt')
    expect(within(toc()).getAllByRole('link').at(-1)?.textContent).toBe('Nytt avsnitt')
  })
})

describe('a way in is a step back (#131, B4, L14)', () => {
  it('leaves whoever picked the wrong one standing in the empty tab again', async () => {
    await openRules()
    fireEvent.click(template())
    await waitFor(() => expect(document.querySelector('[data-rulebook]')).not.toBeNull())
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(document.querySelector('[data-rulebook]')).toBeNull())
    // And the three ways in are standing there to choose from again, not an empty screen.
    expect(template()).toBeTruthy()
    expect(within(ways()).getByRole('button', { name: /^Ett tomt blad/ })).toBeTruthy()
  })
})

describe('the written book finds its way with its column (#131)', () => {
  it('lists its sections in the same column, each an anchor to where its heading stands', async () => {
    await openRules()
    fireEvent.click(template())
    await waitFor(() => expect(document.querySelector('[data-rulebook]')).not.toBeNull())
    const links = within(toc()).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(SECTIONS)
    for (const link of links) {
      const heading = document.getElementById(link.getAttribute('href')!.slice(1))
      expect(heading?.tagName).toBe('H2')
      expect(heading?.textContent).toBe(link.textContent)
    }
  })
})
