// @vitest-environment jsdom
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
  await run.projects.create('p1', doc)
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
  return await waitFor(() => {
    const el = document.querySelector('.byd-data tbody td:not(.byd-data-check) input') as HTMLInputElement | null
    if (!el) throw new Error('no cell yet')
    return el
  })
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
    await waitFor(() => expect((document.querySelector('.byd-data tbody td:not(.byd-data-check) input') as HTMLInputElement).value).toMatch(/\{[^}]+\}/))
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
  await run.projects.create('p1', doc)
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
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
  it('opens the library from the tool row, so an icon is chosen rather than remembered', async () => {
    const tools = await openTemplate()

    // The control case: a row of icons is a tool of its own, and it is not this one.
    expect(within(tools).getByRole('button', { name: 'Ikonrad' })).toBeTruthy()

    fireEvent.click(within(tools).getByRole('button', { name: 'Ikon' }))
    const list = await screen.findByRole('listbox', { name: 'Symboler' })
    expect(within(list).getAllByRole('option').length).toBeGreaterThan(0)
  })

  it('puts the chosen icon on the card, drawn by the one renderer', async () => {
    const tools = await openTemplate()
    // The control case: nothing draws an icon on this card until one is placed, so the assertion
    // below is about what the tool did and not about what the fixture already held.
    expect(document.querySelectorAll('#canvas img.byd-icon')).toHaveLength(0)

    fireEvent.click(within(tools).getByRole('button', { name: 'Ikon' }))
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Symboler' })).getByRole('option', { name: /svärd/ }))

    // `byd-icon` is a class only the compiler in packages/template writes, so an image wearing it
    // inside the preview is the card having gone through the one renderer (E2) and nothing else.
    const icon = await waitFor(() => {
      const found = document.querySelector('#canvas img.byd-icon') as HTMLImageElement | null
      if (!found) throw new Error('no icon on the card yet')
      return found
    })
    // And it is an icon that can actually be fetched: a symbol lives in the project's own assets
    // (E1), so a preview handed the raw `asset:` reference draws a broken image and calls it done.
    const src = icon.getAttribute('src') ?? ''
    expect(src.startsWith(`${run.http}/assets/`)).toBe(true)
    expect(src).toMatch(/\/assets\/[0-9a-f]{64}$/)
    expect((await fetch(src)).headers.get('content-type')).toBe('image/svg+xml')
  })

  // Placing an icon is two things at once — a symbol the game did not have and an element that
  // shows it — and the designer did one thing to ask for both. So it is one edit, one version and
  // one step back (B4, #32). Two would leave a state nobody asked for between the presses: a card
  // carrying an element that points at a name the icon set no longer answers to.
  it('is one edit: the symbol and the element that shows it come and go together', async () => {
    const tools = await openTemplate()
    fireEvent.click(within(tools).getByRole('button', { name: 'Ikon' }))
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Symboler' })).getByRole('option', { name: /svärd/ }))
    await waitFor(() => expect(document.querySelector('#canvas img.byd-icon')).toBeTruthy())

    // Both halves happened: the element is on the card, and the game's set has the symbol.
    fireEvent.click(screen.getByRole('tab', { name: 'Symboler' }))
    expect(await screen.findByText('{svärd}')).toBeTruthy()

    // And one press takes both back. Not the element first and the symbol on the next press.
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(screen.queryByText('{svärd}')).toBeNull())
    fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
    await waitFor(() => expect(document.querySelector('#canvas img.byd-icon')).toBeNull())

    // The same fact from the other side: one step forward brings both halves back together.
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(document.querySelector('#canvas img.byd-icon')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: 'Symboler' }))
    expect(await screen.findByText('{svärd}')).toBeTruthy()
  })

  it('lands selected and behaves like every other element, and says which icon it shows', async () => {
    const tools = await openTemplate()
    fireEvent.click(within(tools).getByRole('button', { name: 'Ikon' }))
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Symboler' })).getByRole('option', { name: /svärd/ }))

    // Selected the moment it lands, so the next thing the designer does is about it (#18).
    await screen.findByRole('heading', { name: /icon-1/ })
    // The card is 63 × 88 mm, so a centred 8 mm square starts at 27,5.
    const x = screen.getByLabelText(/^x/i) as HTMLInputElement
    expect(x.value).toBe('27.5')

    // The panel says which icon this is, and it does not claim a column it does not show: the
    // picker names the first field for anything bound to a literal, and that would be a lie.
    expect((screen.getByLabelText('Ikon') as HTMLSelectElement).value).toBe('svärd')
    const field = screen.getByLabelText('Fält') as HTMLSelectElement
    expect(field.value).toBe('')
    expect(within(field).getByRole('option', { name: 'inget fält' }).getAttribute('value')).toBe('')

    // Nudged and taken away by the same keys as everything else on the canvas.
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await waitFor(() => expect((screen.getByLabelText(/^x/i) as HTMLInputElement).value).toBe('28'))
    fireEvent.keyDown(document, { key: 'Delete' })
    await waitFor(() => expect(document.querySelector('#canvas img.byd-icon')).toBeNull())
  })

  // The tool places a square filled edge to edge, and that was true only at the instant of
  // placing: the compiler sizes the symbol from `iconMm`, and nothing afterwards touched it, so
  // dragging a corner grew an empty box around an 8 mm symbol that then sat off to one side. For
  // a tool whose whole product is one image, the size is the thing being edited.
  it('grows the symbol with the box, so what is dragged is what shows', async () => {
    const tools = await openTemplate()
    fireEvent.click(within(tools).getByRole('button', { name: 'Ikon' }))
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Symboler' })).getByRole('option', { name: /svärd/ }))
    await screen.findByRole('heading', { name: /icon-1/ })

    // The control: it is placed at 8 mm, and the compiler draws it at 8 mm.
    expect(drawnMm('icon-1')).toBe(8)

    fireEvent.change(screen.getByLabelText('Bredd (mm)'), { target: { value: '20' } })

    // Measured on what the one renderer emits (E2), not on what the panel says.
    await waitFor(() => expect(drawnMm('icon-1')).toBe(20))
    // And the box is still the symbol: a single icon is a square thing, so the two sides are one
    // measurement and the other one followed.
    expect((screen.getByLabelText('Höjd (mm)') as HTMLInputElement).value).toBe('20')
  })

  it('closes the library with Escape, placing nothing and leaving the focus where it was', async () => {
    const tools = await openTemplate()
    const tool = within(tools).getByRole('button', { name: 'Ikon' })
    fireEvent.click(tool)
    await screen.findByRole('listbox', { name: 'Symboler' })
    expect(tool.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(tools, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('listbox', { name: 'Symboler' })).toBeNull())
    expect(tool.getAttribute('aria-expanded')).toBe('false')
    // The way out gives the focus back to what opened it (#8): a rail reached with the keyboard
    // must not have to be reached again from the top.
    expect(document.activeElement).toBe(tool)
    expect(document.querySelector('#canvas img.byd-icon')).toBeNull()
  })
})
