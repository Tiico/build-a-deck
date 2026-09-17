// @vitest-environment jsdom
// The empty rules tab (#131). It was a paragraph in the corner of an empty screen; it is now the
// book's own disposition — the table of contents laid out as sections ready to be written in,
// beside the column that stays there once the book is written. That is the whole point of the
// decision: empty and written are one surface and not two, because the column the reader finds
// her way with was the book's skeleton all along.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
const sheet = () => document.querySelector('.byd-rulebook') as HTMLElement

describe('the empty rules tab is the book’s disposition (#131)', () => {
  it('lays the five sections out ready to be written in, with the table of contents beside them', async () => {
    await openRules()
    // Each entry says it is still empty, so a tab that looks like a book cannot be mistaken for
    // one: what stands there is a proposal, and it says so where the reader is looking. The space
    // between the name and the mark is the row's own gap and not a character, so it is not here.
    expect(within(toc()).getAllByRole('link').map((a) => a.textContent)).toEqual(SECTIONS.map((s) => `${s}\u00b7 tomt`))
    expect(
      within(sheet())
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(SECTIONS)
  })

  it('says what the rules are for in one line above the disposition, and not in a box', async () => {
    await openRules()
    const line = screen.getByText(/Reglerna hör till spelet/)
    expect(line.textContent).toMatch(/versioneras med korten/)
    expect(line.textContent).toMatch(/telefonen, TV:n och observatören/)
  })
})

describe('the two ways in (#131)', () => {
  it('offers only the ways that work, so nothing on the surface is a promise nobody kept', async () => {
    await openRules()
    expect(screen.getByRole('button', { name: 'Börja skriva reglerna' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Börja från en mall' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Importera/ })).toBeNull()
  })

  it('writes, from “Börja skriva reglerna”, a book of one section carrying a question', async () => {
    await openRules()
    fireEvent.click(screen.getByRole('button', { name: 'Börja skriva reglerna' }))
    const written = await waitFor(() => document.querySelector('[data-rulebook]') as HTMLElement)
    expect(within(written).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Översikt'])
    expect(within(written).getByText('Vad handlar spelet om, i två meningar? Hur många spelar, och hur länge?')).toBeTruthy()
  })

  it('writes, from “Börja från en mall”, the five sections with the setup already in its own', async () => {
    await openRules()
    fireEvent.click(screen.getByRole('button', { name: 'Börja från en mall' }))
    const written = await waitFor(() => document.querySelector('[data-rulebook]') as HTMLElement)
    expect(within(written).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(SECTIONS)
    // Every section asks its question rather than standing as an empty line.
    expect(written.querySelectorAll('[data-ask]')).toHaveLength(SECTIONS.length)
    // And the setup is the game's own zones (B5), so it is right from the start and never drawn.
    expect(written.querySelectorAll('[data-setup-zone]').length).toBeGreaterThan(1)
  })
})

describe('a question a section carries (#131)', () => {
  it('is gone at the first character, because it is the field’s placeholder and never its value', async () => {
    await openRules()
    fireEvent.click(screen.getByRole('button', { name: 'Börja från en mall' }))
    const written = await waitFor(() => document.querySelector('[data-rulebook]') as HTMLElement)
    fireEvent.click(written.querySelector('[data-ask]') as HTMLElement)
    const field = (await within(written).findByLabelText(/^Text /)) as HTMLTextAreaElement
    expect(field.value).toBe('')
    expect(field.placeholder).toBe('Vad handlar spelet om, i två meningar? Hur många spelar, och hur länge?')
    fireEvent.change(field, { target: { value: 'E' } })
    await waitFor(() => expect(within(written).getByText('E')).toBeTruthy())
    expect(written.querySelectorAll('[data-ask]')).toHaveLength(SECTIONS.length - 1)
  })
})

describe('the template is a proposal and not a form (#131)', () => {
  it('takes a whole section away, question and all, before a word has been written in it', async () => {
    await openRules()
    fireEvent.click(screen.getByRole('button', { name: 'Börja från en mall' }))
    const written = await waitFor(() => document.querySelector('[data-rulebook]') as HTMLElement)
    const asked = written.querySelectorAll('[data-ask]').length
    fireEvent.click(within(written).getByRole('heading', { name: 'Handlingar' }))
    fireEvent.click(await within(written).findByRole('button', { name: 'Ta bort avsnittet' }))
    await waitFor(() =>
      expect(within(written).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Översikt', 'Uppställning', 'En tur', 'Spelet tar slut']),
    )
    // The question under it goes with it; a heading taken away never leaves its own prompt behind.
    expect(written.querySelectorAll('[data-ask]')).toHaveLength(asked - 1)
    expect(within(toc()).getAllByRole('link').map((a) => a.textContent)).toEqual(['Översikt', 'Uppställning', 'En tur', 'Spelet tar slut'])
  })

  it('adds one of the designer’s own sections from the foot of the same column', async () => {
    await openRules()
    fireEvent.click(screen.getByRole('button', { name: 'Börja från en mall' }))
    const written = await waitFor(() => document.querySelector('[data-rulebook]') as HTMLElement)
    fireEvent.click(within(toc()).getByRole('button', { name: '＋ Eget avsnitt' }))
    await waitFor(() => expect(within(toc()).getAllByRole('link')).toHaveLength(SECTIONS.length + 1))
    // It opens where it lands, so the name is written rather than found and clicked.
    const field = (await within(written).findByLabelText(/^Rubrik /)) as HTMLInputElement
    expect(field.value).toBe('Nytt avsnitt')
  })
})

describe('a way in is a step back (#131, B4, L14)', () => {
  it('leaves whoever picked the wrong one standing in the empty tab again', async () => {
    await openRules()
    fireEvent.click(screen.getByRole('button', { name: 'Börja från en mall' }))
    await waitFor(() => expect(document.querySelector('[data-rulebook]')).not.toBeNull())
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(document.querySelector('[data-rulebook]')).toBeNull())
    // And the disposition is standing there to choose from, not an empty screen.
    expect(screen.getByRole('button', { name: 'Börja från en mall' })).toBeTruthy()
    expect(within(toc()).getAllByRole('link')).toHaveLength(SECTIONS.length)
  })
})

describe('the written book finds its way with the column the empty tab already had (#131)', () => {
  it('lists its sections in the same column, each an anchor to where its heading stands', async () => {
    await openRules()
    fireEvent.click(screen.getByRole('button', { name: 'Börja från en mall' }))
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
