// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { SymbolPanel } from '../src/editor/SymbolPanel.js'
import { projectDoc } from './project-doc.js'
import type { ProjectClient } from '../src/editor/ProjectClient.js'

// The game's own colours (E4). A card writes the meaning and never the colour, so this is the one
// place a deck is repainted — and the one place it can be told that a colour will not be read on
// the card it sits on, or that two of its meanings become one for a colour-blind reader (E5).
const client = () => ({ setRole: vi.fn(), renameRole: vi.fn(), removeRole: vi.fn(), useSymbol: vi.fn() }) as unknown as ProjectClient & { setRole: ReturnType<typeof vi.fn>; renameRole: ReturnType<typeof vi.fn>; removeRole: ReturnType<typeof vi.fn> }

const mount = (palette: Record<string, string>, extra: Partial<ReturnType<typeof projectDoc>> = {}) => {
  const c = client()
  const doc = { ...projectDoc(), palette, ...extra }
  render(<SymbolPanel doc={doc} client={c} assetBase="http://test.local" />)
  return c
}

describe('the game’s colours', () => {
  it('shows every meaning with what it is painted in and how often the deck says it', () => {
    mount({ fara: '#8f2d20', vinst: '#2f6136' }, {
      rows: [{ id: 'dragon', fields: { title: 'Drake', body: 'Skada {svard|fara} 2.', antal: 1 } }],
    })
    const list = screen.getByRole('list', { name: 'Spelets färger' })
    const rows = within(list).getAllByRole('listitem')

    expect(rows.map((r) => r.getAttribute('data-role'))).toEqual(['fara', 'vinst'])
    expect(rows[0]!.textContent).toContain('1 kort')
    // A meaning nothing says yet is not an error, but the deck should be able to see it.
    expect(rows[1]!.textContent).toContain('inga kort')
  })

  it('repaints a meaning, renames it, and takes it away', () => {
    const c = mount({ fara: '#8f2d20' })

    fireEvent.click(screen.getByRole('button', { name: 'Måla fara i lund' }))
    expect(c.setRole).toHaveBeenCalledWith('fara', '#2f6136')

    const name = screen.getByLabelText('Namn på fara')
    fireEvent.blur(name, { target: { value: 'hot' } })
    expect(c.renameRole).toHaveBeenCalledWith('fara', 'hot')

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort fara' }))
    expect(c.removeRole).toHaveBeenCalledWith('fara')
  })

  it('names a new meaning without asking the designer to invent a colour first', () => {
    const c = mount({ fara: '#8f2d20' })

    fireEvent.click(screen.getByRole('button', { name: 'Ny betydelse' }))

    // The name is the designer's to change at once; the colour is one the palette does not use.
    expect(c.setRole).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/^#[0-9a-f]{6}$/))
    expect(c.setRole.mock.calls[0]![1]).not.toBe('#8f2d20')
  })

  it('says when a meaning will not be read on the card it sits on', () => {
    mount({ ljus: '#e8d9a0' })

    expect(screen.getByRole('alert').textContent).toContain('ljus')
    expect(screen.getByRole('alert').textContent).toContain('3:1')
  })

  it('says when two meanings become one colour for a colour-blind reader', () => {
    mount({ kostnad: '#3b3a86', vinst: '#2f6136' })

    const said = screen.getByRole('alert').textContent ?? ''
    expect(said).toContain('kostnad')
    expect(said).toContain('vinst')
  })
})
