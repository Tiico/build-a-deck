// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { ProjectClient } from '../src/editor/ProjectClient.js'

// The game's icons, in Speltema (L57): the tab, and the part that holds them, opened if folded.
function openThemeIcons(): void {
  fireEvent.click(screen.getByRole('tab', { name: 'Speltema' }))
  const head = screen.getByRole('button', { name: /^Spelets ikoner/ })
  if (head.getAttribute('aria-expanded') === 'false') fireEvent.click(head)
}

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// A card that shows a row of icons (L1): the element reads the field as a list of names, not as
// card text, so what belongs in that cell is not what belongs in a sentence.
function withIconRow() {
  const doc = projectDoc()
  return {
    ...doc,
    template: {
      ...doc.template,
      faces: {
        ...doc.template.faces,
        front: { ...doc.template.faces['front']!, base: [...doc.template.faces['front']!.base, { kind: 'icons' as const, id: 'marks', x: 5, y: 72, w: 40, h: 6, bind: { field: 'marks' }, iconMm: 5 }] },
      },
    },
    rows: doc.rows.map((r) => ({ ...r, fields: { ...r.fields, marks: '' } })),
  }
}

async function openTable(doc = projectDoc()) {
  await run.projects.create(run.projectId, doc)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
  return await waitFor(() => {
    const el = document.querySelector('.byd-data tbody td:not(.byd-data-check, [data-col="antal"]) input') as HTMLInputElement | null
    if (!el) throw new Error('no cell yet')
    return el
  })
}

// A press on the document reaches whoever is listening at the instant it is sent, and nobody
// afterwards: the canvas hangs its key listener in a passive effect and the editor's chords hang
// theirs the same way, so a press made before that effect has run is heard by no one and is gone
// for good — there is no later state for a `waitFor` to wait in (#56). Both answer a key they act
// on by preventing its default, and that is the one thing that is true only while the listener is
// live, so the press is repeated until it is answered rather than trusted to arrive first.
const press = async (init: KeyboardEventInit) => {
  await waitFor(() => expect(fireEvent.keyDown(document, init)).toBe(false))
}

const cellFor = (field: string) => {
  const head = [...document.querySelectorAll('.byd-data thead th')].findIndex((th) => th.textContent?.startsWith(field))
  return document.querySelectorAll('.byd-data tbody tr')[0]!.children[head]!.querySelector('input') as HTMLInputElement
}

// Typing `{` in a cell has always opened the icon picker, and nothing ever said so (#33). The
// prototype settled it: a handle in the cell the designer is standing in, so the shortcut is
// visible exactly where the icon ends up — and it opens the very picker the brace does, rather
// than becoming a second way to the same place.
describe('the way to an icon (#33)', () => {
  it('offers the picker from the cell, and writes the icon the way card text reads it', async () => {
    const cell = await openTable()
    cell.focus()

    fireEvent.click(await screen.findByRole('button', { name: 'Sätt in en ikon' }))
    const list = await screen.findByRole('listbox', { name: 'Symboler' })
    fireEvent.click(within(list).getAllByRole('option')[0]!)

    // L2: an icon in card text is its name in braces, and that is what the cell now holds.
    await waitFor(() => expect((document.querySelector('.byd-data tbody td:not(.byd-data-check, [data-col="antal"]) input') as HTMLInputElement).value).toMatch(/\{[^}]+\}/))
  })

  it('writes a bare name where a row of icons reads one, and a sentence where card text does', async () => {
    await openTable(withIconRow())
    const marks = cellFor('marks')
    marks.focus()

    fireEvent.click(await screen.findByRole('button', { name: 'Sätt in en ikon' }))
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Symboler' })).getAllByRole('option')[0]!)

    // The element splits this cell on spaces and commas (L1), so a brace here would be read as
    // part of the name and the icon would simply not be found.
    await waitFor(() => expect(cellFor('marks').value).toMatch(/^[^{}]+$/))
    expect(cellFor('marks').value.trim()).not.toBe('')
  })
})

async function openTemplate(doc = projectDoc()) {
  await run.projects.create(run.projectId, doc)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
  return await screen.findByRole('toolbar', { name: 'Verktyg' })
}

// How big the symbol is actually drawn, read off the CSS the compiler wrote for that element.
// The size on the screen is the only place the answer is: the panel's numbers are the box, and
// the whole trouble was that the box and the symbol had come apart.
function drawnMm(id: string): number | null {
  const css = [...document.querySelectorAll('#canvas style')].map((s) => s.textContent).join('\n')
  return Number(new RegExp(`\\[data-element="${id}"\\] \\.byd-icon\\{height:([0-9.]+)mm`).exec(css)?.[1] ?? NaN) || null
}

// The other half of #33, and a different question from the cell's: this one is about the card
// rather than about a sentence. The glossary settled the word and where it stands — `ikon` is the
// single image, and it belongs "där en sätts: i tabellcellen och på duken" (A4).
describe('the icon as a tool on the canvas (#33)', () => {
  // The tool places an icon layer and opens the libraries under the card for it (#1093, beslut
  // 2026-10-22): one way to an icon, the one the panel's «Ikon och färg» already takes (L71), where
  // a small list of the twenty symbols drawn for the project used to hang off the rail.
  const sheet = () => screen.findByRole('dialog', { name: 'Sök i ikonbiblioteken' })
  const take = async (query: string, tile: RegExp) => {
    const open = await sheet()
    fireEvent.change(within(open).getByRole('searchbox'), { target: { value: query } })
    fireEvent.click(await within(open).findByRole('button', { name: tile }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sök i ikonbiblioteken' })).toBeNull())
  }

  it('places an icon layer, selected, and opens the libraries under the card for it', async () => {
    const tools = await openTemplate()
    // The control case: a row of icons is a tool of its own, and it is not this one.
    expect(within(tools).getByRole('button', { name: 'Ikonrad' })).toBeTruthy()

    fireEvent.click(within(tools).getByRole('button', { name: 'Ikon' }))
    // Selected the moment it lands, so the next thing the designer does is about it (#18).
    await screen.findByRole('heading', { name: /icon-1/ })
    const open = await sheet()
    expect(within(open).getByText('för alla kort')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(within(open).getByRole('searchbox')))
    // Nothing is chosen yet, and the panel says so in words (#849).
    expect(within(screen.getByRole('region', { name: 'Ikon och färg' })).getByText('ingen ikon')).toBeTruthy()
  })

  it('puts the chosen icon on the card, drawn by the one renderer', async () => {
    // The game already has a symbol, and the card still draws none: the control below is then a
    // fact about this template rather than about a fixture that happens to hold an empty set.
    const doc = projectDoc()
    doc.icons = { pil: `asset:${'d'.repeat(64)}` }
    const tools = await openTemplate(doc)
    expect(document.querySelectorAll('#canvas img.byd-icon')).toHaveLength(0)

    fireEvent.click(within(tools).getByRole('button', { name: 'Ikon' }))
    await take('svärd', /^svärd · Deckster/)

    // `byd-icon` is a class only the compiler in packages/template writes, so an image wearing it
    // inside the preview is the card having gone through the one renderer (E2) and nothing else.
    // And it is inside the element the tool just placed, so this is what the tool did.
    const icon = await waitFor(() => {
      const found = document.querySelector('#canvas [data-element="icon-1"] img.byd-icon') as HTMLImageElement | null
      // Drawn as nothing yet while its bytes are on their way (#959), and from the service once.
      if (!found || found.getAttribute('src')?.startsWith('data:')) throw new Error('no icon on the card yet')
      return found
    })
    expect(document.querySelectorAll('#canvas img.byd-icon')).toHaveLength(1)
    // And it is an icon that can actually be fetched: a symbol lives in the project's own assets
    // (E1), so a preview handed the raw `asset:` reference draws a broken image and calls it done.
    const src = icon.getAttribute('src') ?? ''
    expect(src).toMatch(/\/assets\/[0-9a-f]{64}$/)
    expect((await fetch(src)).headers.get('content-type')).toBe('image/svg+xml')
  })

  // Choosing is one thing the designer did, so the icon taken into the game and the layer shown
  // with it come back together with one Ctrl+Z (B4) — and placing the layer was a thing of its own,
  // so it is the next step back. A state between the presses where the card names an icon the set
  // no longer has is the one thing this must never leave behind.
  it('is one step back to unchoose the icon, and one more to take the layer away', async () => {
    const tools = await openTemplate()
    fireEvent.click(within(tools).getByRole('button', { name: 'Ikon' }))
    await take('svärd', /^svärd · Deckster/)
    await waitFor(() => expect(document.querySelector('#canvas img.byd-icon')).toBeTruthy())

    await press({ key: 'z', ctrlKey: true })
    await waitFor(() => expect(document.querySelector('#canvas img.byd-icon')).toBeNull())
    expect(document.querySelector('#canvas [data-element="icon-1"]')).toBeTruthy()
    expect(document.querySelector('#canvas .byd-icon-missing')).toBeNull()
    openThemeIcons()
    expect(screen.queryByText('{svärd}')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
    await press({ key: 'z', ctrlKey: true })
    await waitFor(() => expect(document.querySelector('#canvas [data-element="icon-1"]')).toBeNull())
  })

  // What the client throws when an icon cannot be taken in is English for the developer (#812,
  // A4): the sheet says it in a sentence of its own, where the icon was pressed.
  it('says an icon that could not be taken in, in words and not in the client’s', async () => {
    const spy = vi.spyOn(ProjectClient.prototype, 'chooseIcon').mockRejectedValue(new Error('icon crossed-swords already exists'))
    try {
      const tools = await openTemplate()
      fireEvent.click(within(tools).getByRole('button', { name: 'Ikon' }))
      const open = await sheet()
      fireEvent.change(within(open).getByRole('searchbox'), { target: { value: 'svärd' } })
      fireEvent.click(await within(open).findByRole('button', { name: /^crossed-swords · Game Icons/ }))
      expect((await within(open).findByRole('alert')).textContent).toBe('Ikonen crossed-swords kunde inte läggas till. Försök igen.')
    } finally {
      spy.mockRestore()
    }
  })

  // The way out of the sheet places nothing more and takes nothing back: the layer stays, empty and
  // saying so, and the focus goes back to the tool that opened it (#8).
  it('closes the sheet with Escape, leaving the layer and the focus on the tool', async () => {
    const tools = await openTemplate()
    const tool = within(tools).getByRole('button', { name: 'Ikon' })
    tool.focus()
    fireEvent.click(tool)
    const open = await sheet()
    fireEvent.keyDown(within(open).getByRole('searchbox'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sök i ikonbiblioteken' })).toBeNull())
    expect(document.activeElement).toBe(tool)
    expect(document.querySelector('#canvas [data-element="icon-1"]')).toBeTruthy()
    expect(document.querySelector('#canvas img.byd-icon')).toBeNull()
  })

  it('lands where every element lands and behaves like every other element', async () => {
    const tools = await openTemplate()
    fireEvent.click(within(tools).getByRole('button', { name: 'Ikon' }))
    await take('svärd', /^svärd · Deckster/)
    // The card is 63 × 88 mm, so a centred 8 mm square starts at 27,5.
    const x = screen.getByRole('spinbutton', { name: /^x/i }) as HTMLInputElement
    expect(x.value).toBe('27.5')
    // The panel says which icon this is, and it does not claim a column it does not show: one
    // icon on every card has no column to name (#1087).
    const look = screen.getByRole('region', { name: 'Ikon och färg' })
    expect((within(look).getByLabelText('Visar') as HTMLSelectElement).value).toBe('fixed')
    expect(within(look).getByText('svärd')).toBeTruthy()
    expect(within(look).queryByText('Kolumn')).toBeNull()

    // Nudged and taken away by the same keys as everything else on the canvas: the move is made
    // from the element's own stop, inside the mode Enter opens (#144).
    const box = document.querySelector('[data-drag="icon-1"]') as HTMLElement
    box.focus()
    fireEvent.keyDown(box, { key: 'Enter' })
    fireEvent.keyDown(box, { key: 'ArrowRight' })
    await waitFor(() => expect((screen.getByRole('spinbutton', { name: /^x/i }) as HTMLInputElement).value).toBe('28'))
    fireEvent.keyDown(box, { key: 'Enter' })
    await press({ key: 'Delete' })
    // An element is not taken on the key alone, whichever tool placed it (#143, L9): the key
    // opens the question and the answer is what removes it.
    fireEvent.click(screen.getByRole('button', { name: 'Ja, ta bort' }))
    await waitFor(() => expect(document.querySelector('#canvas img.byd-icon')).toBeNull())
  })

  // The tool places a square filled edge to edge, and that was true only at the instant of
  // placing: the compiler sizes the symbol from `iconMm`, and nothing afterwards touched it, so
  // dragging a corner grew an empty box around an 8 mm symbol that then sat off to one side. For
  // a tool whose whole product is one image, the size is the thing being edited.
  it('grows the symbol with the box, so what is dragged is what shows', async () => {
    const tools = await openTemplate()
    fireEvent.click(within(tools).getByRole('button', { name: 'Ikon' }))
    await take('svärd', /^svärd · Deckster/)

    // The control: it is placed at 8 mm, and the compiler draws it at 8 mm.
    await waitFor(() => expect(drawnMm('icon-1')).toBe(8))

    fireEvent.change(screen.getByLabelText('Bredd (mm)'), { target: { value: '20' } })
    // A typed number is written when the field is left (#478).
    fireEvent.blur(screen.getByLabelText('Bredd (mm)'))

    // Measured on what the one renderer emits (E2), not on what the panel says.
    await waitFor(() => expect(drawnMm('icon-1')).toBe(20))
    // And the box is still the symbol: a single icon is a square thing, so the two sides are one
    // measurement and the other one followed.
    expect((screen.getByLabelText('Höjd (mm)') as HTMLInputElement).value).toBe('20')
  })

  // An icon bound to a column "for the day it should differ per card" has to have a day it stops:
  // one icon on every card again is the way back, and back to the icon it was (#320's rule).
  it('lets an icon bound to a column be an icon again', async () => {
    const tools = await openTemplate()
    fireEvent.click(within(tools).getByRole('button', { name: 'Ikon' }))
    await take('svärd', /^svärd · Deckster/)

    const look = screen.getByRole('region', { name: 'Ikon och färg' })
    fireEvent.change(within(look).getByLabelText('Visar'), { target: { value: 'cell' } })
    const column = () => within(look).getByRole('combobox', { name: /^Kolumn/ }) as HTMLSelectElement
    fireEvent.change(column(), { target: { value: 'title' } })
    await waitFor(() => expect(column().value).toBe('title'))
    // It is the column's now, so the card draws whatever that column says — which is not an icon.
    await waitFor(() => expect(document.querySelector('#canvas img.byd-icon')).toBeNull())

    fireEvent.change(within(look).getByLabelText('Visar'), { target: { value: 'fixed' } })
    await waitFor(() => expect(document.querySelector('#canvas img.byd-icon')).toBeTruthy())
    expect(within(look).queryByText('Kolumn')).toBeNull()
    expect(within(look).getByText('svärd')).toBeTruthy()
  })

  // A row of icons placed where the game has no column of names reads none and draws nothing
  // until the designer says what (#700), and says it in words (#849).
  it('says in words that a row of icons has no icon yet', async () => {
    const tools = await openTemplate()
    // The game holds one icon first, so the sheet has one of the game's own to offer.
    fireEvent.click(within(tools).getByRole('button', { name: 'Ikon' }))
    await take('svärd', /^svärd · Deckster/)
    fireEvent.click(within(tools).getByRole('button', { name: 'Ikonrad' }))
    await screen.findByRole('heading', { name: /icons-1/ })

    const look = screen.getByRole('region', { name: 'Ikon och färg' })
    expect(within(look).getByText('ingen ikon')).toBeTruthy()

    // And choosing one is how the row gets its icon: the game's own are a shelf of the sheet.
    fireEvent.click(within(look).getByRole('button', { name: 'Välj ikon för alla kort' }))
    const open = await sheet()
    fireEvent.click(within(open).getByRole('button', { name: /^I spelet/ }))
    fireEvent.click(await within(open).findByRole('button', { name: 'svärd · I spelet' }))
    await waitFor(() => expect(within(look).getByText('svärd')).toBeTruthy())
    expect(within(look).queryByText('ingen ikon')).toBeNull()
  })
})
