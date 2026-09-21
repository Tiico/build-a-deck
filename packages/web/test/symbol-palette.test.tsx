// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { SymbolPanel } from '../src/editor/SymbolPanel.js'
import { projectDoc } from './project-doc.js'
import { groundOf } from '../src/editor/palette.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })
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

// The symbol set's own count (E4). It looked for `{namn}` exactly, so a deck that had painted all
// of its symbols was told, on every row, that it used none of them.
describe('how often the game says a symbol', () => {
  it('counts a symbol that wears a meaning as a symbol the deck uses', () => {
    const base = projectDoc()
    mount({ fara: '#8f2d20' }, {
      icons: { svärd: 'svard.svg' },
      rows: [
        { id: 'dragon', fields: { title: 'Drake', body: 'Skada {svärd|fara} 2.', antal: 1 } },
        { id: 'knight', fields: { title: 'Riddare', body: 'Skada {svärd} 1.', antal: 1 } },
      ],
      template: base.template,
    })

    expect(screen.getByRole('list', { name: 'Symboler i spelet' }).textContent).toContain('2 kort')
  })
})

// The relation between a meaning's name and its colour, said by being shown (L34, #302): the
// same symbol drawn once per meaning, with the string that writes it beside it. «utan betydelse»
// is one of the rows and not an exception, and every sample stands on the card's paper.
describe('the relation shown in the palette (L34)', () => {
  const sampleOf = (el: HTMLElement) => el.querySelector<HTMLElement>('.byd-symbol-sample')!
  const inkOf = (el: HTMLElement) => sampleOf(el).querySelector<HTMLElement>('.byd-ink')?.getAttribute('style') ?? null
  const withSymbols = (palette: Record<string, string>) => ({
    ...projectDoc(),
    palette,
    icons: { svärd: 'svard.svg', mynt: 'mynt.svg' },
    rows: [
      { id: 'dragon', fields: { title: 'Drake', body: 'Skada {mynt} {mynt|fara}.', antal: 1 } },
      { id: 'knight', fields: { title: 'Riddare', body: 'Skada {svärd} 1.', antal: 1 } },
    ],
  })

  it('draws the game’s most written symbol once per meaning, on the card’s paper, with the string that writes it', () => {
    const doc = withSymbols({ fara: '#8f2d20', vinst: '#2f6136' })
    render(<SymbolPanel doc={doc} client={client()} assetBase="http://test.local" />)
    const list = screen.getByRole('list', { name: 'Spelets färger' })
    const rows = within(list).getAllByRole('listitem')
    const paper = groundOf(doc, 'front')

    // `mynt` is said twice and `svärd` once, so the example is drawn with `mynt`.
    expect(rows.map((r) => r.querySelector('code')?.textContent)).toEqual(['{mynt|fara}', '{mynt|vinst}'])
    expect(rows.map((r) => sampleOf(r).getAttribute('data-paper'))).toEqual([paper, paper])
    expect(inkOf(rows[0]!)).toContain('background:#8f2d20')
    expect(inkOf(rows[1]!)).toContain('background:#2f6136')
    // Ink is one of the rows: the symbol as the card draws it without a meaning, and its string.
    const ink = screen.getByText('utan betydelse').closest('[data-ink]') as HTMLElement
    expect(ink.querySelector('code')?.textContent).toBe('{mynt}')
    expect(sampleOf(ink).getAttribute('data-paper')).toBe(paper)
    expect(sampleOf(ink).querySelector('img.byd-icon')?.getAttribute('src')).toContain('mynt.svg')
  })

  it('repaints the example when the meaning’s colour changes', () => {
    const { rerender } = render(<SymbolPanel doc={withSymbols({ fara: '#8f2d20' })} client={client()} assetBase="http://test.local" />)
    const row = () => within(screen.getByRole('list', { name: 'Spelets färger' })).getAllByRole('listitem')[0]!
    expect(inkOf(row())).toContain('background:#8f2d20')
    rerender(<SymbolPanel doc={withSymbols({ fara: '#2f6136' })} client={client()} assetBase="http://test.local" />)
    expect(inkOf(row())).toContain('background:#2f6136')
  })

  it('keeps the plain swatch when the game has no symbol to show the meaning with', () => {
    mount({ fara: '#8f2d20' })
    const row = within(screen.getByRole('list', { name: 'Spelets färger' })).getAllByRole('listitem')[0]!
    expect(row.querySelector('.byd-symbol-sample')).toBeNull()
    expect(row.querySelector('.byd-symbols-swatch')).not.toBeNull()
    expect(screen.queryByText('utan betydelse')).toBeNull()
  })
})
