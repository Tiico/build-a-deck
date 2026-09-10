// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { TypeRegistry, initialState, project, STANDARD_TYPES } from '@byd/engine'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { seatSetup } from './fixture.js'

const registry = new TypeRegistry(STANDARD_TYPES)
const table = () => project(initialState('v1', seatSetup(), registry), registry, null)

// A counter token is a 24 mm chip. On a TV the whole felt is scaled to fit the screen, and at the
// scale a two-seat table lands on that chip is smaller than the word standing in it — so the name
// spills out over the felt as an unreadable smear on top of itself (UX-kontroll 2026-09-10).
describe('a counter token', () => {
  it('keeps its name inside the chip: below the width the word needs, the value stands alone', () => {
    const { container } = render(<TableRenderer view={table()} mode="tv" scale={0.75} />)
    const token = container.querySelector('.byd-token')!
    expect(parseFloat((token as HTMLElement).style.width)).toBeLessThan(34)
    expect(token.querySelector('span')).toBeNull()
    expect(token.querySelector('b')!.textContent).toBe('20')
  })

  it('says the name when the chip is wide enough to hold it', () => {
    const { container } = render(<TableRenderer view={table()} mode="tv" scale={2} />)
    const token = container.querySelector('.byd-token')!
    expect(parseFloat((token as HTMLElement).style.width)).toBeGreaterThanOrEqual(34)
    expect(token.querySelector('span')!.textContent).toBe('Liv')
  })
})
