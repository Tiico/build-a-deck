// @vitest-environment jsdom
// Bildrutan (L75): the one way a picture is shown and changed in Tabell. The tile is the whole
// control; what it takes dropped on it is what the cell took before (#291); and a reader's table
// draws the picture and nothing that can change it (#489).
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PictureSlot, type PictureSlotProps } from '../src/editor/PictureSlot.js'

const HASH = 'a'.repeat(64)

function slot(over: Partial<PictureSlotProps> = {}) {
  const on = { onChoose: vi.fn(), onPick: vi.fn(), onFiles: vi.fn(), onClear: vi.fn() }
  render(<PictureSlot label="Bild för knight" choose="Välj bild för knight" replace="Byt bild för knight" alt="knight art" base="http://api.local" value={null} {...on} {...over} />)
  return { ...on, group: screen.getByRole('group', { name: 'Bild för knight' }) }
}

describe('Bildrutan (L75)', () => {
  it('takes a library picture dropped on it by its hash, and hands dropped files on', () => {
    const { group, onPick, onFiles } = slot()
    fireEvent.drop(group, { dataTransfer: { getData: (type: string) => (type === 'text/x-byd-asset' ? HASH : ''), files: [] } })
    expect(onPick).toHaveBeenCalledWith(HASH)
    const file = new File(['png'], 'drake.png', { type: 'image/png' })
    fireEvent.drop(group, { dataTransfer: { getData: () => '', files: [file] } })
    expect(onFiles).toHaveBeenCalledWith([file])
  })

  it('keeps text from when the column was text in the tile, struck through, and still offers to choose (#1085)', () => {
    slot({ kept: 'en röd drake' })
    const tile = screen.getByRole('button', { name: 'Välj bild för knight' })
    expect(tile.querySelector('s')?.textContent).toBe('en röd drake')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it("draws a reader's picture with nothing that can change it: no button, no drop (#489)", () => {
    const { group, onPick, onChoose } = slot({ value: HASH, reading: true })
    expect(screen.getByRole('img', { name: 'knight art' }).getAttribute('src')).toBe(`http://api.local/assets/${HASH}`)
    expect(group.querySelectorAll('button, input, label')).toHaveLength(0)
    fireEvent.drop(group, { dataTransfer: { getData: (type: string) => (type === 'text/x-byd-asset' ? HASH : ''), files: [] } })
    fireEvent.click(group.firstElementChild!)
    expect(onPick).not.toHaveBeenCalled()
    expect(onChoose).not.toHaveBeenCalled()
  })
})
