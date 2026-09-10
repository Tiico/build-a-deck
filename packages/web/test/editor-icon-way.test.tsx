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
