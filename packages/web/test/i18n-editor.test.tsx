// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Language } from '../src/i18n/index.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { layerPick } from './layers.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

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
  await run.projects.create(run.projectId, doc)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
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
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Card wall', 'Template', 'Data', 'Symbols', 'Media', 'Rules', 'Tables'])
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    // The game has no table yet, so the filled action is the one that starts one (#417).
    expect(screen.getByRole('button', { name: 'Start a table' })).toBeTruthy()

    // The wall's crown (#128): a box says its name and what is chosen inside it, in the reader's
    // language, and what it opens is in that language too.
    expect(screen.getByRole('button', { name: 'Eyes: As you see it' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Guides (0)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Physical check/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Eyes:/ }))
    expect(screen.getByRole('group', { name: 'Eyes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'As you see it' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Greyscale' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Guides/ }))
    expect(screen.getByLabelText(/trim and safe margin/i)).toBeTruthy()
    expect(screen.getByLabelText(/at arm’s length/i)).toBeTruthy()
    // The deck itself is the designer's: a card keeps its title in either language.
    expect(screen.getByText('Drake')).toBeTruthy()
  })

  it('names the physical faults in English, in the words a printer uses', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /^Physical check/ }))
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
    expect(screen.getByPlaceholderText('Search every field…')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(screen.getByLabelText('Import CSV…')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Download CSV' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
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

    fireEvent.click(layerPick('title'))
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
    expect(screen.getByRole('button', { name: 'Category: All' })).toBeTruthy()
    expect(screen.getByText(/No symbols yet/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Category:/ }))
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
    // The library is the tool's own, so its symbols are named in the reader's language — and a
    // symbol taken from here is called that in the game from then on.
    expect(screen.getByRole('button', { name: 'Take in sword' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resources' })).toBeTruthy()
  })

  it('says the rulebook in English before there is a rulebook', async () => {
    await openEditor()
    openTab('Rules')
    expect(screen.getByRole('heading', { name: 'The rulebook' })).toBeTruthy()
    expect(screen.getByText(/The rules belong to the game/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start writing the rules' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start from a template' })).toBeTruthy()
    // The disposition an empty tab proposes is written in the reader's language too (#131, A4).
    expect(screen.getByRole('navigation', { name: 'Contents' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'The game ends' })).toBeTruthy()
    expect(screen.getByText('What do you do first? And then?')).toBeTruthy()
  })

  it('says the setup editor and the list of tables in English, and keeps the zone names', async () => {
    await openEditor()
    openTab('Tables')
    expect(screen.getByRole('heading', { name: 'Players' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Counters' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'On the table' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'At the seats' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '＋ Area' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '＋ Area per seat' })).toBeTruthy()
    // What the table cannot be without says so in the reader's language too.
    expect(screen.getByRole('button', { name: 'Remove Kasthög' })).toBeTruthy()
    expect(screen.getByLabelText('The felt is the table itself and cannot be removed.')).toBeTruthy()
    // The sheet is folded until asked for (#301); the fold says so in English too.
    fireEvent.click(screen.getByRole('button', { name: 'Show the player view' }))
    expect(screen.getByRole('heading', { name: 'What the player sees' })).toBeTruthy()
    // The list itself is a round trip to the server; what the tab says while it waits is the
    // tool's own word, and it is there the moment the tab opens.
    expect(screen.getByText('Loading tables…')).toBeTruthy()
    // The zones are the designer's words, in either language.
    expect(screen.getByRole('button', { name: 'Zone Kasthög' })).toBeTruthy()
  })

  // The filled action does two jobs (L5) and carries the name of the one it is about to do
  // (#417). Both names are the reader's, and the second of them is only reachable once the game
  // has a table, so the test starts one.
  it('names the filled action for the job it will do, in English', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Start a table' }))
    await screen.findByText(/New table started/)
    await run.completeRenders()
    expect(await screen.findByRole('button', { name: 'Update the table' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New table' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start a table' })).toBeNull()
  })

  it('says a zone\'s own properties in English when one is chosen', async () => {
    await openEditor()
    openTab('Tables')
    fireEvent.click(screen.getByRole('button', { name: 'Zone Kasthög' }))
    expect(screen.getByLabelText('Name for Kasthög')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Put the deck in Kasthög' })).toBeTruthy()
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
