// @vitest-environment jsdom
// A list written in the rulebook's own page (#707, beslut 2026-10-06: «C med A:s genväg»,
// prototype on `proto/707-regellistor`).
//
// ＋ only ever made a paragraph, and a paragraph written as «- Dra ett kort.⏎- Spela ett kort.»
// closed into one line — «- Dra ett kort. - Spela ett kort.» — so the only way to a list was an
// import from a file. What was decided: the open block chooses its kind — Stycke · Punktlista ·
// Numrerad lista — on the block being written and nowhere else, and a line that opens with «- » or
// «1. » becomes a list as well. No new buttons in the margin. (The row above the book has since
// gained «＋ Lista» beside «＋ Text», #1258; the kinds stay where this put them.)
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
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
    { kind: 'heading', id: 'h1', level: 1, text: 'En tur' },
    { kind: 'text', id: 't1', text: 'Varje tur har tre steg.' },
    { kind: 'list', id: 'l1', items: ['Dra.', 'Spela.'] },
  ],
}

async function openBook(): Promise<void> {
  await run.projects.create(run.projectId, { ...projectDoc(), rules })
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await userEvent.click(screen.getByRole('tab', { name: 'Regler' }))
  await within(book()).findByText('Varje tur har tre steg.')
}
const book = () => document.querySelector('[data-rulebook]') as HTMLElement
const field = () => within(book()).getByRole('textbox', { name: /^Text/ }) as HTMLTextAreaElement
const stored = async () => (await run.projects.load(run.projectId))?.rules?.blocks
// What a reader of the book is handed for each block: its kind, and the lines it reads.
const read = () =>
  [...book().querySelectorAll('[data-block]')].map((b) => {
    const list = b.querySelector('ul, ol')
    if (list) return `${list.tagName.toLowerCase()}: ${[...list.querySelectorAll('li')].map((li) => li.textContent).join(' | ')}`
    return [...b.querySelectorAll('h2, h3, p')].map((p) => p.textContent).join(' / ')
  })

describe('a list written with the marks it is read by', () => {
  it('turns lines that open with «- » into a bulleted list when the block is closed', async () => {
    const user = userEvent.setup()
    await openBook()
    await user.click(within(book()).getByText('Varje tur har tre steg.'))
    await user.clear(field())
    await user.type(field(), 'Varje tur har tre steg.{enter}- Dra ett kort.{enter}- Spela ett kort.{enter}- Kasta ned till sju.')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(read()).toEqual(['En tur', 'Varje tur har tre steg.', 'ul: Dra ett kort. | Spela ett kort. | Kasta ned till sju.', 'ul: Dra. | Spela.']))
    await user.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () =>
      expect(await stored()).toEqual([
        rules.blocks[0],
        { kind: 'text', id: 't1', text: 'Varje tur har tre steg.' },
        { kind: 'list', id: expect.any(String), ordered: false, items: ['Dra ett kort.', 'Spela ett kort.', 'Kasta ned till sju.'] },
        rules.blocks[2],
      ]),
    )
  })
})

describe('the open block chooses its kind: Stycke · Punktlista · Numrerad lista', () => {
  const kinds = () => within(book()).getByRole('group', { name: /^Blockets slag/ })
  const pressed = () => within(kinds()).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)
  const points = () => within(book()).queryAllByRole('textbox', { name: /^Punkt \d/ }).map((f) => (f as HTMLInputElement).value)

  it('offers the three kinds on the paragraph being written, and on nothing else', async () => {
    const user = userEvent.setup()
    await openBook()
    expect(within(book()).queryByRole('group', { name: /^Blockets slag/ })).toBeNull()
    await user.click(within(book()).getByText('Varje tur har tre steg.'))
    expect(within(kinds()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Stycke', 'Punktlista', 'Numrerad lista'])
    expect(pressed()).toEqual(['Stycke'])
    // A heading has its own chooser, of rank, and is not a paragraph to be made a list.
    await user.keyboard('{Escape}')
    await user.click(within(book()).getByRole('button', { name: 'En tur' }))
    expect(within(book()).queryByRole('group', { name: /^Blockets slag/ })).toBeNull()
  })

  it('makes the paragraph a list of its lines, numbers it, and makes it a paragraph again', async () => {
    const user = userEvent.setup()
    await openBook()
    await user.click(within(book()).getByText('Varje tur har tre steg.'))
    await user.clear(field())
    await user.type(field(), 'Dra ett kort.{enter}Spela ett kort.')
    await user.click(within(kinds()).getByRole('button', { name: 'Punktlista' }))
    expect(pressed()).toEqual(['Punktlista'])
    expect(points()).toEqual(['Dra ett kort.', 'Spela ett kort.'])
    await user.click(within(kinds()).getByRole('button', { name: 'Numrerad lista' }))
    expect(pressed()).toEqual(['Numrerad lista'])
    await user.keyboard('{Escape}')
    await waitFor(() => expect(read()[1]).toBe('ol: Dra ett kort. | Spela ett kort.'))
    // The list is opened with its pencil (L51), and the same three kinds are offered on it.
    await user.click(within(book()).getAllByRole('button', { name: /^Redigera listan/ })[0]!)
    expect(pressed()).toEqual(['Numrerad lista'])
    await user.click(within(kinds()).getByRole('button', { name: 'Stycke' }))
    expect(field().value).toBe('Dra ett kort.\nSpela ett kort.')
  })

  it('starts a list made of a block just added with one empty point rather than the words «Ny text.»', async () => {
    const user = userEvent.setup()
    await openBook()
    // «＋ Text» in the row above the book (#1258), after the paragraph last written in.
    await user.click(within(book()).getByText('Varje tur har tre steg.'))
    await user.keyboard('{Escape}')
    const adding = within(document.querySelector('.byd-rules-bar') as HTMLElement).getByRole('group', { name: 'Lägg till' })
    await user.click(within(adding).getByRole('button', { name: '＋ Text' }))
    await waitFor(() => expect(field().value).toBe('Ny text.'))
    await user.click(within(kinds()).getByRole('button', { name: 'Punktlista' }))
    expect(points()).toEqual([''])
    expect(document.activeElement).toBe(within(book()).getByRole('textbox', { name: /^Punkt 1/ }))
  })
})

// What the field says about how it will be read (#707): a line break alone was a space at the
// table, and nothing said so. Now the field says it, in words, while the lines are being written.
describe('the open paragraph says how its lines will be read', () => {
  const said = () => {
    const ids = field().getAttribute('aria-describedby')
    return ids ? ids.split(' ').map((id) => document.getElementById(id)?.textContent) : []
  }

  it('says nothing about a paragraph written on one line', async () => {
    const user = userEvent.setup()
    await openBook()
    await user.click(within(book()).getByText('Varje tur har tre steg.'))
    expect(said()).toEqual([])
  })

  it('says that a line break alone is read as a space, and that an empty line starts a paragraph', async () => {
    const user = userEvent.setup()
    await openBook()
    await user.click(within(book()).getByText('Varje tur har tre steg.'))
    await user.type(field(), '{enter}Sedan nästa.')
    expect(said()).toEqual(['En ensam radbrytning läses som ett mellanslag. En tom rad börjar ett nytt stycke.'])
    await user.type(field(), '{enter}{enter}Ett nytt stycke.')
    expect(said()).toEqual(['En ensam radbrytning läses som ett mellanslag. En tom rad börjar ett nytt stycke.'])
    await user.clear(field())
    await user.type(field(), 'Ett.{enter}{enter}Två.')
    expect(said()).toEqual([])
  })

  it('says that the lines opening with «- » or «1. » become a list when the block is closed', async () => {
    const user = userEvent.setup()
    await openBook()
    await user.click(within(book()).getByText('Varje tur har tre steg.'))
    await user.type(field(), '{enter}- Dra.')
    expect(said()).toEqual(['Rader som börjar med «- » blir en punktlista och rader med «1. » en numrerad, när blocket stängs.'])
  })
})

// The help says it too (#707): the «?» of the rules tab names both ways to a list.
describe('the help of the rules tab', () => {
  it('names lists, and the marks that make one', async () => {
    const user = userEvent.setup()
    await openBook()
    await user.click(screen.getByRole('button', { name: 'Hjälp om reglerna' }))
    expect(await screen.findByText(/punktlista eller en numrerad lista.*«- » eller «1\.»/)).toBeTruthy()
  })
})

