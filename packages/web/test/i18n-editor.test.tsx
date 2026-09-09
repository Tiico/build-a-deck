// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Language } from '../src/i18n/index.js'
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

// The whole editor in English, mounted the way the app mounts it: one language provider around
// the page, a real project behind it. What a designer wrote — the game's name, its card titles,
// its zone names — is never touched by the switch, and each test says so.
async function openEditor(doc = projectDoc()): Promise<void> {
  await run.projects.create('p1', doc)
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  render(
    <Language lang="en">
      <EditorPage />
    </Language>,
  )
  await screen.findByText('Skogens herrar')
}
const openTab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }))

describe('the editor in the reader\'s own language (A4)', () => {
  it('says the frame and the card wall in English, and leaves the deck alone', async () => {
    await openEditor()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Card wall', 'Template', 'Data', 'Symbols', 'Rules', 'Tables'])
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Update the table' })).toBeTruthy()

    expect(screen.getByRole('heading', { name: 'Physical check' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Eyes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'As you see it' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Greyscale' })).toBeTruthy()
    expect(screen.getByLabelText(/trim and safe margin/i)).toBeTruthy()
    expect(screen.getByLabelText(/at arm’s length/i)).toBeTruthy()
    // The deck itself is the designer's: a card keeps its title in either language.
    expect(screen.getByText('Drake')).toBeTruthy()
  })

  it('names the physical faults in English, in the words a printer uses', async () => {
    await openEditor()
    const checks = screen.getByRole('list', { name: 'Physical check' })
    // The fixture's frame stops short of the bleed on every card, which is the fault the wall
    // gathers: named by kind, counted in cards, and marked as what stops an order.
    const bleed = checks.querySelector('[data-check="short-of-bleed"]') as HTMLElement
    expect(within(bleed).getByText('short of the bleed')).toBeTruthy()
    expect(within(bleed).getByText('3 cards')).toBeTruthy()
    expect(within(bleed).getByText('error')).toBeTruthy()
    expect(screen.getByText('One kind of error stops an order.')).toBeTruthy()
  })

  it('says the data table in English and keeps the designer\'s own column names', async () => {
    await openEditor()
    openTab('Data')
    expect(screen.getByLabelText('Import CSV')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Export CSV' })).toBeTruthy()
    expect(screen.getByPlaceholderText('Search every field…')).toBeTruthy()
    expect(screen.getByText('3 of 3 cards')).toBeTruthy()
    expect(screen.getByText('Unsorted: the cards’ order in the game.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ New card' })).toBeTruthy()
    expect(screen.getByLabelText('Select all shown')).toBeTruthy()
    // `title` and `body` are the designer's own columns and stay as they are. `antal` is not
    // theirs — it is the one column the engine reads, how many copies of the card there are —
    // so it is named in the reader's language while the field itself keeps its name (L4).
    expect(screen.getByRole('button', { name: /^title/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^copies/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^antal/ })).toBeNull()
  })

  it('asks about a bulk change and a delete in English', async () => {
    await openEditor()
    openTab('Data')
    fireEvent.click(screen.getByLabelText('mark dragon'))
    expect(screen.getByText('1 card marked')).toBeTruthy()
    const bulk = screen.getByRole('toolbar', { name: 'Marked cards' })
    expect(within(bulk).getByRole('button', { name: 'Duplicate 1 card' })).toBeTruthy()
    expect(within(bulk).getByRole('button', { name: 'Unmark all' })).toBeTruthy()
    fireEvent.click(within(bulk).getByRole('button', { name: 'Remove 1 card' }))
    expect(screen.getByText('Remove 1 card from the deck?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Yes, remove' })).toBeTruthy()
  })

  it('says the template canvas, its properties and its fonts in English', async () => {
    await openEditor()
    openTab('Template')
    expect(screen.getByRole('heading', { name: 'Layers · front' })).toBeTruthy()
    expect(screen.getByRole('toolbar', { name: 'Tools' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Image/ })).toBeTruthy()
    expect(screen.getByLabelText(/Grid 1 mm/)).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'Card side' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Front' })).toBeTruthy()
    expect(screen.getByText('All 3 cards')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Fonts in the game' })).toBeTruthy()

    fireEvent.click(screen.getByRole('option', { name: 'text title' }))
    expect(screen.getByRole('heading', { name: 'Properties · title' })).toBeTruthy()
    expect(screen.getByLabelText('Width (mm)')).toBeTruthy()
    expect(screen.getByLabelText('Size (pt)')).toBeTruthy()
    expect(screen.getByLabelText('Typeface')).toBeTruthy()
  })

  it('says the symbol library and the game\'s own set in English', async () => {
    await openEditor()
    openTab('Symbols')
    expect(screen.getByRole('heading', { name: 'Symbol library' })).toBeTruthy()
    expect(screen.getByPlaceholderText('Search for a symbol…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
    expect(screen.getByText(/No symbols yet/)).toBeTruthy()
    // The library is the tool's own, so its symbols are named in the reader's language — and a
    // symbol taken from here is called that in the game from then on.
    expect(screen.getByRole('button', { name: 'Take in sword' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resources' })).toBeTruthy()
  })

  it('says the rulebook in English before there is a rulebook', async () => {
    await openEditor()
    openTab('Rules')
    expect(screen.getByRole('heading', { name: 'The rulebook' })).toBeTruthy()
    expect(screen.getByText(/No rules yet/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start writing the rules' })).toBeTruthy()
  })

  it('says the setup editor and the list of tables in English, and keeps the zone names', async () => {
    await openEditor()
    openTab('Tables')
    expect(screen.getByRole('heading', { name: 'Players' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Every player has' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Shared on the table' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '＋ Area' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'What the player sees' })).toBeTruthy()
    // The list itself is a round trip to the server; what the tab says while it waits is the
    // tool's own word, and it is there the moment the tab opens.
    expect(screen.getByText('Loading tables…')).toBeTruthy()
    // The zones are the designer's words, in either language.
    expect(screen.getByRole('button', { name: 'Zone Kasthög' })).toBeTruthy()
  })

  it('says a zone\'s own properties in English when one is chosen', async () => {
    await openEditor()
    openTab('Tables')
    fireEvent.click(screen.getByRole('button', { name: 'Zone Kasthög' }))
    expect(screen.getByText('Pile')).toBeTruthy()
    expect(screen.getByLabelText('Name for Kasthög')).toBeTruthy()
    expect(screen.getByLabelText('Shortcut for Kasthög')).toBeTruthy()
    expect(screen.getByLabelText('Placement for Kasthög')).toBeTruthy()
  })

  it('says the history and who has the game in English', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /^rev / }))
    const history = await screen.findByRole('dialog', { name: 'History' })
    expect(within(history).getByRole('heading', { name: 'History' })).toBeTruthy()
    expect(within(history).getByRole('button', { name: 'Close the history' })).toBeTruthy()
    fireEvent.click(within(history).getByRole('button', { name: 'Close the history' }))

    fireEvent.click(screen.getByRole('button', { name: 'Who has the game' }))
    const share = await screen.findByRole('dialog', { name: 'Who has the game' })
    expect(within(share).getByPlaceholderText('name@example.com')).toBeTruthy()
    expect(within(share).getByRole('button', { name: 'Invite' })).toBeTruthy()
    // The role someone is invited as is the tool's word for it, so it follows the language too.
    expect(within(share).getByRole('option', { name: 'co-editor' })).toBeTruthy()
    expect(within(share).queryByRole('option', { name: 'medredigerare' })).toBeNull()
  })
})
