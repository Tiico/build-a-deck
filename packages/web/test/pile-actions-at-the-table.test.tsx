// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Intent, Snapshot, ZoneAction } from '@byd/protocol'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { buildScene, tableOf } from './scene.js'
import { twoSeatSetup } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const ACTIONS: ZoneAction[] = [
  { id: 'a1', label: 'Vänd upp ett per spelare', steps: [{ v: 'split', count: { of: 'seats' }, to: { at: 'zone', zone: 'discard' }, face: 'front' }] },
  { id: 'a2', label: 'Ge alla en starthand', steps: [{ v: 'shuffle' }, { v: 'deal', each: { of: 'number', n: 2 }, to: { at: 'hands' }, face: 'keep' }] },
]

const withActions = (view: Snapshot, actions: ZoneAction[] = ACTIONS): Snapshot => ({
  ...view,
  zones: view.zones.map((z) => (z.id === 'draw' ? { ...z, actions } : z)),
})

const client = (mmX: number, mmY: number) => ({ clientX: mmX + 500, clientY: mmY + 300, pointerId: 1, isPrimary: true, button: 0 })
const clickPile = () => {
  const label = document.querySelector('[data-zone="draw"] .byd-pile-count')!
  fireEvent.pointerDown(label, client(-200, 50))
  fireEvent.pointerUp(label, client(-200, 50))
}

// Ringen plus listan (K14, utvidgad): ringen behåller de fysiska verben, och spelets egna
// åtgärder hänger under den som en namngiven lista med plats för hela meningen.
describe('en högs egna åtgärder vid bordet', () => {
  it('visar dem som en lista under ringen, med högens namn över', () => {
    const { view } = buildScene()
    render(<TableRenderer view={withActions(view(null))} mode="tv" scale={1} onAct={() => undefined} />)
    clickPile()

    const sheet = screen.getByRole('group', { name: 'Draghög' })
    expect([...sheet.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Vänd upp ett per spelare', 'Ge alla en starthand'])
    // Och ringen är orörd: de fysiska verben står kvar.
    expect(screen.getByRole('button', { name: 'Blanda' })).toBeTruthy()
  })

  it('skickar stegen som ett enda kuvert när en åtgärd väljs', () => {
    const { view } = buildScene()
    const sent: Intent[][] = []
    render(<TableRenderer view={withActions(view(null))} mode="tv" scale={1} onAct={(i) => sent.push(i)} />)
    clickPile()
    fireEvent.click(screen.getByRole('button', { name: 'Ge alla en starthand' }))

    expect(sent).toEqual([[{ v: 'shuffle', pile: 'draw' }, { v: 'deal', from: 'draw', to: ['hand:A'], each: 2 }]])
  })

  // En åtgärd som räknar "ett per spelare" vid ett bord ingen satt sig vid blir noll kort — men
  // noll kort är inte skälet, det är följden. Skälet är att ingen sitter där, och det är vad
  // listan ska säga (K14): "det blir inga kort just nu" läser som att leken är tom.
  it('säger att ingen sitter vid bordet när "ett per spelare" är det som blir noll', () => {
    const empty = tableOf(twoSeatSetup())
    const perPlayer: ZoneAction[] = [{ id: 'a3', label: 'Vänd upp ett per spelare', steps: [{ v: 'split', count: { of: 'seats' }, to: { at: 'beside' }, face: 'front' }] }]
    render(<TableRenderer view={withActions(empty.view(null), perPlayer)} mode="tv" scale={1} onAct={() => undefined} />)
    clickPile()

    expect(screen.getByRole('button', { name: /Vänd upp ett per spelare/ }).textContent).toContain('ingen sitter vid bordet än')
  })

  it('öppnar inget ark alls för en hög utan egna åtgärder — en tom lista är samma fel som en tom ring', () => {
    const { view } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={() => undefined} />)
    clickPile()
    expect(screen.getByRole('button', { name: 'Blanda' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Draghög' })).toBeNull()
  })
})
