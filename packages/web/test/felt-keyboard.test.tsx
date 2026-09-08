// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { feltLabels } from '../src/table/keyboard.js'
import { buildScene } from './scene.js'

const noop = (): undefined => undefined
const stops = (labels: ReadonlyMap<string, string>, at: string | null) => ({
  labels,
  itemProps: (key: string) => ({ tabIndex: key === at ? 0 : -1, ref: noop, onKeyDown: noop, onFocus: noop }),
  onActivate: noop,
})

describe('the felt as controls (#2, variant C)', () => {
  it('names every card and pile out of the projection, and says no more about a card this seat may not see', () => {
    const { view } = buildScene()
    const snapshot = view('A')
    const labels = feltLabels(snapshot)
    render(<TableRenderer view={snapshot} mode="table" scale={2} keyboard={stops(labels, null)} />)

    expect(screen.getByRole('button', { name: 'wizard, kort i Spelyta, vridet. Enter öppnar handlingar.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dolt kort, kort i Spelyta. Enter öppnar handlingar.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Översta kortet i Draghög: Dolt kort. Enter öppnar handlingar.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Draghög, hela högen, 3 kort. Enter öppnar handlingar.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Kasthög, hela högen, 3 kort. Enter öppnar handlingar.' })).toBeTruthy()
  })

  it('a table that is only shown grows no tab stops at all — the editor renders thumbnails through the same component (K9)', () => {
    const { view } = buildScene()
    render(<TableRenderer view={view(null)} mode="table" scale={2} />)
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(document.querySelectorAll('[tabindex]')).toHaveLength(0)
  })
})
