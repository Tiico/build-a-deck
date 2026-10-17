// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BodyCell } from '../src/editor/BodyCell.js'

// A paste into a body cell (#479, L39): the string took the right subset of what was pasted, but
// the cell kept the pasted HTML on the screen — a table, a picture — that the card would never
// show. A paste is taken as its text, which is what the cell can hold.
describe('a paste into a body cell (#479)', () => {
  it('takes the text of what was pasted and nothing of its markup', () => {
    const onWrite = vi.fn()
    render(<BodyCell label="dragon body" head="body" value="" open={true} icons={{}} onWrite={onWrite} onOpen={() => undefined} onClose={() => undefined} />)
    const cell = screen.getByRole('textbox', { name: 'dragon body' })
    cell.focus()
    fireEvent.paste(cell, {
      clipboardData: {
        types: ['text/html', 'text/plain'],
        getData: (type: string) => (type === 'text/plain' ? 'Flygande drake' : '<table><tr><td>Flygande drake</td></tr></table><img src="x.png">'),
      },
    })
    expect(cell.querySelector('table, img')).toBeNull()
    expect(cell.textContent).toContain('Flygande drake')
    expect(onWrite).toHaveBeenLastCalledWith('Flygande drake', expect.any(Number))
  })
})
