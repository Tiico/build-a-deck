// @vitest-environment jsdom
// The library reached from Data (#296, variant B): a picture cell's «Välj» and the marked cards'
// «Välj bild för de markerade korten» open the same window, and the window writes the same asset
// reference the picture already has — into one cell, or into every marked card in one change.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ProjectDoc } from '@byd/server'
import { DataTable, type DataTableProps } from '../src/editor/DataTable.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)
const KARTA = '3'.repeat(64)

// A deck whose template draws a picture: one card drawn from a named picture, and a picture the
// game holds that nothing is drawn from yet — the very picture the old strip could not offer.
function deckWithArt(): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  doc.rows[0]!.fields['art'] = `asset:${SKOG}`
  doc.pictures = { [SKOG]: { name: 'skog' }, [KARTA]: { name: 'karta' } }
  return doc
}

function renderTable(doc: ProjectDoc, handlers: Partial<DataTableProps> = {}) {
  const noop = () => undefined
  return render(
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={noop}
      onCell={noop}
      onAddRow={noop}
      onRemoveRow={noop}
      onReplaceRows={noop}
      onAddField={noop}
      onRemoveField={noop}
      onMoveField={noop}
      assetBase="http://api.local"
      onUpload={async () => 'e'.repeat(64)}
      {...handlers}
    />,
  )
}

const dialog = () => screen.getByRole('dialog', { name: 'Bilder i spelet' })
const tile = (name: string) => within(dialog()).getByRole('button', { name })
const row = (cardRef: string) => screen.getAllByRole('row').find((r) => r.getAttribute('data-card-ref') === cardRef)!

describe('a picture cell opens the library (#296)', () => {
  it('opens the window on the card and its field, lists the unused picture too, and writes the chosen one into that cell', async () => {
    const user = userEvent.setup()
    const onCell = vi.fn()
    renderTable(deckWithArt(), { onCell })
    const opener = within(row('knight')).getByRole('button', { name: 'Välj bild för knight' })
    await user.click(opener)
    expect(within(dialog()).getByText('Kortet knight, bildfältet art')).toBeTruthy()
    expect(dialog().contains(document.activeElement)).toBe(true)
    expect([...dialog().querySelectorAll('button[data-asset]')].map((b) => b.getAttribute('data-asset'))).toEqual([SKOG, KARTA])

    await user.click(tile('karta'))
    expect(onCell).not.toHaveBeenCalled()
    await user.click(within(dialog()).getByRole('button', { name: 'Använd bilden' }))
    expect(onCell).toHaveBeenCalledTimes(1)
    expect(onCell).toHaveBeenCalledWith('knight', 'art', `asset:${KARTA}`)
    // The window is gone, the designer is still in Data, the status says what happened, and the
    // hand is back on the control that opened it.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Bilden karta ligger nu på knight.')).toBeTruthy()
    expect(document.activeElement).toBe(opener)
  })

  it('keeps the upload straight into the cell beside it', () => {
    const onCell = vi.fn()
    const onUpload = vi.fn(async () => 'd'.repeat(64))
    renderTable(deckWithArt(), { onCell, onUpload })
    const file = new File(['png'], 'riddare.png', { type: 'image/png' })
    fireEvent.change(within(row('knight')).getByLabelText('Ladda upp bild för knight'), { target: { files: [file] } })
    expect(onUpload).toHaveBeenCalledWith(file)
  })

  it('changes nothing on Avbryt, on the × and on Escape, and hands the focus back each time', async () => {
    const user = userEvent.setup()
    const onCell = vi.fn()
    renderTable(deckWithArt(), { onCell })
    const opener = within(row('knight')).getByRole('button', { name: 'Välj bild för knight' })
    for (const leave of ['Avbryt', 'Stäng', 'Escape']) {
      await user.click(opener)
      await user.click(tile('karta'))
      if (leave === 'Escape') fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
      else await user.click(within(dialog()).getByRole('button', { name: leave }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(opener)
    }
    expect(onCell).not.toHaveBeenCalled()
  })
})

describe('the marked cards open the library (#296)', () => {
  const mark = (cardRef: string) => fireEvent.click(screen.getByLabelText(`markera ${cardRef}`))
  const bulk = () => screen.getByRole('toolbar', { name: 'Markerade kort' })

  it('opens on the marked cards and the column, warns how many pictures go, and writes every marked card in one change', async () => {
    const user = userEvent.setup()
    const onReplaceRows = vi.fn()
    renderTable(deckWithArt(), { onReplaceRows })
    mark('dragon')
    mark('knight')
    fireEvent.change(within(bulk()).getByLabelText('Kolumn'), { target: { value: 'art' } })
    const opener = within(bulk()).getByRole('button', { name: 'Välj bild för de markerade korten' })
    await user.click(opener)
    expect(within(dialog()).getByText('2 markerade kort, bildfältet art')).toBeTruthy()
    await user.click(tile('karta'))
    // dragon already has a picture, knight has none.
    expect(within(dialog()).getByText('1 av korten har redan en bild som byts ut.')).toBeTruthy()
    await user.click(within(dialog()).getByRole('button', { name: 'Använd på 2 kort' }))

    expect(onReplaceRows).toHaveBeenCalledTimes(1)
    expect(onReplaceRows.mock.calls[0]![0].map((r: { id: string; fields: Record<string, unknown> }) => [r.id, r.fields['art']])).toEqual([
      ['dragon', `asset:${KARTA}`],
      ['knight', `asset:${KARTA}`],
      ['wizard', undefined],
    ])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Bilden karta ligger nu på 2 kort.')).toBeTruthy()
    expect(document.activeElement).toBe(opener)
  })

  it('keeps the upload for the marked cards beside it', async () => {
    const onReplaceRows = vi.fn()
    renderTable(deckWithArt(), { onReplaceRows, onUpload: async () => KARTA })
    mark('knight')
    fireEvent.change(within(bulk()).getByLabelText('Kolumn'), { target: { value: 'art' } })
    fireEvent.change(within(bulk()).getByLabelText('Ladda upp bild för de markerade korten'), { target: { files: [new File(['png'], 'karta.png', { type: 'image/png' })] } })
    await screen.findByRole('img', { name: 'Bild för de markerade korten' })
    fireEvent.click(within(bulk()).getByRole('button', { name: 'Sätt bild på 1 kort' }))
    expect(onReplaceRows).toHaveBeenCalledTimes(1)
  })
})
