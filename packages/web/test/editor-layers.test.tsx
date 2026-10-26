// @vitest-environment jsdom
// The layer panel and the lock (L15, #—), as a designer meets them: the panel is opened in the
// editor, a layer is locked from its own row, and the card is then dragged the way a pointer
// drags it. A lock that is only a property in a document protects nothing; what is tested here is
// that the card refuses to move and says why.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { dragVia, laidOut, target } from './drag.js'
import { layerNames, layerShown } from './layers.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function openTheTemplate(doc = projectDoc()) {
  await run.projects.create(run.projectId, doc)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
  await waitFor(() => {
    if (!target('title')) throw new Error('no drag box yet')
  })
  laidOut()
}

const row = (name: string) => document.querySelector(`[data-layer="${name}"]`) as HTMLElement
const top = (id: string) => target(id)?.style.top

describe('locking a layer (L15)', () => {
  it('refuses the drag, keeps the element where it was, and says which layer is locked', async () => {
    await openTheTemplate()
    expect(top('title')).toBe('5mm')
    await userEvent.click(screen.getByRole('button', { name: 'Lås title' }))

    dragVia(target('title')!, [30, 30], [[30, 48], [30, 66], [30, 90]])
    expect(top('title')).toBe('5mm')
    expect(screen.getByRole('alert').textContent).toMatch(/title.*låst/i)

    // The handles are gone with it: a box that cannot be resized does not offer four corners.
    expect(document.querySelectorAll('[data-handle]')).toHaveLength(0)
  })

  it('refuses the arrow keys and Delete, and leaves the layer on the card', async () => {
    await openTheTemplate()
    await userEvent.click(screen.getByRole('button', { name: 'Lås title' }))
    // Chosen from the panel, so what follows is about the keyboard and not about the pointer
    // having already been refused.
    await userEvent.click(within(row('title')).getByRole('button', { name: /^title/ }))
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(target('title')?.style.left).toBe('5mm')
    fireEvent.keyDown(document, { key: 'Delete' })
    expect(target('title')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toMatch(/låst/i)
  })

  it('lets the layer go again when it is unlocked, and the lock is part of the project', async () => {
    await openTheTemplate()
    await userEvent.click(screen.getByRole('button', { name: 'Lås title' }))
    // It is an edit like any other: it lands in the document, and is therefore saved and shared.
    await screen.findByText('Osparat')
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })
    await screen.findByText('Sparat')
    expect((await run.projects.load(run.projectId))?.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ locked: true })

    await userEvent.click(screen.getByRole('button', { name: 'Lås upp title' }))
    dragVia(target('title')!, [30, 30], [[30, 48], [30, 66], [30, 90]])
    await waitFor(() => expect(top('title')).toBe('15mm'))
  })

  it('still lets a locked layer be moved up and down the order: the lock is about the card, not the list', async () => {
    await openTheTemplate()
    await userEvent.click(screen.getByRole('button', { name: 'Lås title' }))
    const names = () => [...document.querySelectorAll('[data-layer]')].map((el) => el.getAttribute('data-layer'))
    expect(names()).toEqual(['body', 'title', 'frame'])

    row('title').focus()
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(names()).toEqual(['title', 'body', 'frame'])
  })
})

// What a row says (L15). The panel used to read `text title` — the tool's word for the kind, and
// the raw id — which says nothing about which layer is which once the rail has added `bild-1` and
// `shape-2` to the card.
// Why a locked layer did not move, and where that is said (#1181). The note stood over the
// canvas' foot, on top of the card row, from the first press that only chose the layer until the
// layer was unlocked: nothing else took it away.
describe('the note a locked layer gives (#1181)', () => {
  const note = () => document.querySelector('.byd-canvas-locked') as HTMLElement | null
  const lockTheTitle = async () => {
    await openTheTemplate()
    await userEvent.click(screen.getByRole('button', { name: 'Lås title' }))
  }
  // A pull that goes somewhere: the hand meant to move the layer.
  const pull = () => dragVia(target('title')!, [30, 30], [[30, 48]])

  it('says nothing to a press that only chooses the layer, tremble and all', async () => {
    await lockTheTitle()
    dragVia(target('title')!, [30, 30], [[31, 31]])
    expect(row('title').getAttribute('aria-selected')).toBe('true')
    expect(note()).toBeNull()
  })

  it('stands on the card beside the layer that did not move, and not in the canvas\' foot', async () => {
    await lockTheTitle()
    pull()
    expect(note()?.textContent).toMatch(/title.*låst/i)
    // On the card, at the layer's own lower edge: the title stands in the card's upper half, so
    // the note opens downwards, over the card and away from the stage's top.
    expect(document.querySelector('[data-drag-layer]')!.contains(note())).toBe(true)
    const box = target('title')!.style
    const at = (note()!.closest('.byd-canvas-locked-at') as HTMLElement).style
    expect(at.top.endsWith('mm')).toBe(true)
    expect(parseFloat(at.top)).toBeCloseTo(parseFloat(box.top) + parseFloat(box.height))
    expect(parseFloat(at.left)).toBeCloseTo(parseFloat(box.left) + parseFloat(box.width) / 2)
  })

  it('goes with its own button, with Escape, and when another layer is chosen', async () => {
    await lockTheTitle()
    pull()
    await userEvent.click(within(note()!).getByRole('button', { name: 'Stäng' }))
    expect(note()).toBeNull()
    // The hand is given back to the layer the note was about, not dropped on the page.
    expect(document.activeElement).toBe(target('title'))

    pull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(note()).toBeNull()

    pull()
    await userEvent.click(within(row('body')).getByRole('button', { name: /^body/ }))
    expect(note()).toBeNull()
  })

  it('unlocks the layer from the note, which is its answer', async () => {
    await lockTheTitle()
    pull()
    await userEvent.click(within(note()!).getByRole('button', { name: 'Lås upp' }))
    expect(note()).toBeNull()
    expect(screen.getByRole('button', { name: 'Lås title' })).toBeTruthy()
    dragVia(target('title')!, [30, 30], [[30, 48], [30, 66], [30, 90]])
    await waitFor(() => expect(top('title')).toBe('15mm'))
  })
})

describe('what a layer says it is (L15)', () => {
  it('is called by its name, and says what it shows when that is something else', async () => {
    const doc = projectDoc()
    const front = doc.template.faces['front']!
    // A title bound to a column of another name, which is what happens as soon as a template
    // outlives the column it was made from.
    front.base = front.base.map((el) => (el.id === 'title' ? { ...el, bind: { field: 'body' } } : el))
    await openTheTemplate(doc)

    expect(layerNames()).toEqual(['body', 'title', 'frame'])
    expect(layerShown('title')).toBe('body')
    // A shape shows nothing, and a layer whose name is the column it draws says it once.
    expect(layerShown('frame')).toBeNull()
    expect(layerShown('body')).toBeNull()
  })

  // The guide keeps the title under the key `title` and calls the layer «Titel» (#1375): the row
  // said «Titel · title», the key after the very word the table heads the column with.
  it('says the title column by the word the table heads it with, and not at all when that is the layer’s name', async () => {
    const doc = projectDoc()
    const front = doc.template.faces['front']!
    front.base = front.base.map((el) => (el.id === 'title' ? { ...el, name: 'Titel', bind: { field: 'title' } } : el.id === 'body' ? { ...el, name: 'Rubrik', bind: { field: 'title' } } : el))
    await openTheTemplate(doc)

    expect(layerShown('title')).toBeNull()
    expect(layerShown('body')).toBe('Titel')
  })

  it('takes a new name on F2, keeps it in the project, and gives the id back when the name is emptied', async () => {
    await openTheTemplate()
    await userEvent.click(within(row('title')).getByRole('button', { name: /^title/ }))
    await userEvent.keyboard('{F2}')

    const field = screen.getByRole('textbox', { name: /title/i })
    await userEvent.clear(field)
    await userEvent.type(field, 'Rubriken{Enter}')
    expect(within(row('title')).getByRole('button', { name: /^Rubriken/ })).toBeTruthy()
    // The id is what the document knows the layer by; the name is what the designer calls it.
    expect(row('title')).toBeTruthy()

    fireEvent.keyDown(document, { key: 's', ctrlKey: true })
    await screen.findByText('Sparat')
    expect((await run.projects.load(run.projectId))?.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ name: 'Rubriken' })

    // Emptying the box is not naming a layer the empty string: it is having no name of its own.
    await userEvent.keyboard('{F2}')
    await userEvent.clear(screen.getByRole('textbox', { name: /Rubriken/i }))
    await userEvent.keyboard('{Enter}')
    expect(within(row('title')).getByRole('button', { name: /^title/ })).toBeTruthy()
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.template.faces['front']?.base.find((e) => e.id === 'title')).not.toHaveProperty('name'))
  })

  it('leaves the name alone when the rename is escaped', async () => {
    await openTheTemplate()
    await userEvent.click(within(row('title')).getByRole('button', { name: /^title/ }))
    await userEvent.keyboard('{F2}')
    await userEvent.type(screen.getByRole('textbox', { name: /title/i }), 'Rubriken')
    await userEvent.keyboard('{Escape}')
    expect(within(row('title')).getByRole('button', { name: /^title/ })).toBeTruthy()
    expect(screen.queryByText('Osparat')).toBeNull()
  })
})

// The grid is one tab stop with two columns (APG). The panel used to be a listbox, which cannot
// carry a control of its own: an option's contents are flattened, so a lock button inside one is
// a button a screen reader never reaches (UX-37, #82).
describe('the layer panel under a keyboard (L15)', () => {
  it('walks the rows with the arrows, crosses to the lock with right, and is a single tab stop', async () => {
    await openTheTemplate()
    const pick = (id: string) => within(row(id)).getByRole('button', { name: new RegExp(`^${id}`) })
    pick('body').focus()
    expect(document.activeElement).toBe(pick('body'))

    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(pick('title'))
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Lås title' }))
    // Down stays in the column it is walking, which is what a grid does.
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Lås frame' }))
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(pick('frame'))

    // One stop in the tab order: every other cell is out of it.
    const cells = [...document.querySelectorAll('.byd-layers button')]
    expect(cells.filter((c) => c.getAttribute('tabindex') === '0')).toHaveLength(1)
  })
})
