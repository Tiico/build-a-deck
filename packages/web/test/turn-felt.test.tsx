// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { nextTurn } from '@byd/engine'
import type { Activity, Intent, Snapshot } from '@byd/protocol'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { TurnBadge } from '../src/player/TurnBadge.js'
import { describeActivity } from '../src/table/describe.js'
import { documentTitle } from '../src/status/title.js'
import { translate, type T } from '../src/i18n/index.js'
import { tableOf } from './scene.js'
import { recipeSetup } from './fixture.js'

// Vems tur det är (K28, #1141): kanten lyser vid den som har turen, namnet säger det och hur
// länge, nästa plats är märkt, och den som har turen skickar den vidare med «Klar».

const swedish: T = (key, params) => translate('sv', key, params)
const NAMES: Record<string, string> = { A: 'Ada', B: 'Bo', C: 'Cy', D: 'Di' }

function table(holder: string, free: string[] = []) {
  const t = tableOf({ ...recipeSetup(4), turns: 'clockwise' })
  for (const seat of ['A', 'B', 'C', 'D']) if (!free.includes(seat)) t.run(seat, { v: 'seat.claim', seat, name: NAMES[seat]! })
  t.run(null, { v: 'turn.give', seat: holder })
  return t
}
const nameOf = (seat: string) => document.querySelector(`[data-seat-name="${seat}"]`) as HTMLElement

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  // Tabellens klocka (`tableOf`) skriver varje rad 2026-09-06 00:00:00; läsaren står 42 s senare.
  vi.setSystemTime(new Date('2026-09-06T00:00:42.000Z'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('turen på filten', () => {
  it('tänder kanten vid den som har turen, och bara där', () => {
    render(<TableRenderer view={table('B').view(null)} mode="table" scale={1} />)
    const bands = document.querySelectorAll('[data-turn-band]')
    expect([...bands].map((b) => b.getAttribute('data-turn-band'))).toEqual(['B'])
  })

  it('säger vems tur det är och hur länge, och märker nästa plats', () => {
    const view = table('B').view(null)
    render(<TableRenderer view={view} mode="table" scale={1} />)
    expect(nameOf('B').textContent).toContain('Bos tur')
    expect(nameOf('B').textContent).toContain('0:42')
    const next = nextTurn(view)!
    expect(nameOf(next).hasAttribute('data-next')).toBe(true)
    expect(document.querySelectorAll('[data-next]')).toHaveLength(1)
  })

  it('räknar klockan vidare medan turen står', () => {
    render(<TableRenderer view={table('B').view(null)} mode="table" scale={1} />)
    act(() => vi.advanceTimersByTime(20_000))
    expect(nameOf('B').textContent).toContain('1:02')
  })

  it('ger den som har turen «Din tur» och «Klar → nästa», och Klar ger turen till nästa plats', () => {
    const view = table('B').view('B')
    const onAct = vi.fn<(intents: Intent[]) => void>()
    render(<TableRenderer view={view} mode="table" scale={1} me="B" onAct={onAct} />)
    const next = nextTurn(view)!
    expect(within(nameOf('B')).getByText('Din tur')).toBeTruthy()
    fireEvent.click(within(nameOf('B')).getByRole('button', { name: `Klar → ${NAMES[next]}` }))
    expect(onAct).toHaveBeenCalledWith([{ v: 'turn.give', seat: next }])
  })

  it('ger «Klar» till den som har turen också på bordets delade skärm, där ingen plats är ens egen', () => {
    const view = table('B').view(null)
    const onAct = vi.fn<(intents: Intent[]) => void>()
    render(<TableRenderer view={view} mode="table" scale={1} onAct={onAct} />)
    const next = nextTurn(view)!
    expect(nameOf('B').textContent).toContain('Bos tur')
    fireEvent.click(within(nameOf('B')).getByRole('button', { name: `Klar → ${NAMES[next]}` }))
    expect(onAct).toHaveBeenCalledWith([{ v: 'turn.give', seat: next }])
  })

  it('hoppar över en ledig plats när den räknar nästa', () => {
    const view = table('A', ['C']).view('A')
    expect(view.turn?.order).toContain('C')
    const next = nextTurn(view)
    expect(next).not.toBe('C')
    render(<TableRenderer view={view} mode="table" scale={1} me="A" onAct={() => undefined} />)
    expect(within(nameOf('A')).getByRole('button', { name: `Klar → ${NAMES[next!]}` })).toBeTruthy()
  })

  it('ger turen till en annan plats när dess namn trycks, där filten går att spela', () => {
    const onAct = vi.fn<(intents: Intent[]) => void>()
    render(<TableRenderer view={table('B').view('A')} mode="table" scale={1} me="A" onAct={onAct} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ge turen till Di' }))
    expect(onAct).toHaveBeenCalledWith([{ v: 'turn.give', seat: 'D' }])
  })

  it('ger inga knappar där filten bara går att titta på', () => {
    render(<TableRenderer view={table('B').view('A')} mode="table" scale={1} me="A" />)
    expect(screen.queryByRole('button', { name: /Ge turen|Klar/ })).toBeNull()
  })

  it('ritar ingenting av det i ett spel utan turordning', () => {
    const t = tableOf(recipeSetup(4))
    t.run('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })
    render(<TableRenderer view={t.view('A')} mode="table" scale={1} me="A" onAct={() => undefined} />)
    expect(document.querySelector('[data-turn-band]')).toBeNull()
    expect(screen.queryByText(/tur/)).toBeNull()
  })

  it('tänder kanten och platsens skylt på TV:n också', () => {
    render(<TableRenderer view={table('C').view(null)} mode="tv" scale={1} forTheRoom />)
    expect(document.querySelector('[data-turn-band="C"]')).toBeTruthy()
    expect([...document.querySelectorAll('[data-seat-plate][data-turn]')].map((p) => p.getAttribute('data-seat-plate'))).toEqual(['C'])
  })
})

describe('turen i raden «Senast»', () => {
  const line = (by: string | null, seat: string): Activity => ({ schemaVersion: 1, seq: 9, batch: 'b', at: '', by, intent: { v: 'turn.give', seat } })
  it('säger vem som gav turen till vem, och när någon tog den själv', () => {
    const view = table('B').view('C')
    expect(describeActivity(line('A', 'B'), view, swedish)).toBe('Ada gav turen till Bo')
    expect(describeActivity(line('B', 'B'), view, swedish)).toBe('Bo tog turen')
    expect(describeActivity(line('C', 'D'), view, swedish)).toBe('Du gav turen till Di')
  })
})

describe('brickan på telefonen', () => {
  it('säger «Din tur» och skickar turen vidare med Klar', () => {
    const view: Snapshot = table('B').view('B')
    const onGive = vi.fn()
    render(<TurnBadge view={view} seat="B" onGive={onGive} />)
    expect(screen.getByText('Din tur')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: `Klar → ${NAMES[nextTurn(view)!]}` }))
    expect(onGive).toHaveBeenCalledWith(nextTurn(view))
  })

  it('säger vems tur det är annars, och har ingen knapp', () => {
    render(<TurnBadge view={table('B').view('A')} seat="A" onGive={() => undefined} />)
    expect(screen.getByText('Bos tur')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('står inte där i ett spel utan turordning', () => {
    const t = tableOf(recipeSetup(4))
    t.run('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })
    const { container } = render(<TurnBadge view={t.view('A')} seat="A" onGive={() => undefined} />)
    expect(container.textContent).toBe('')
  })
})

describe('fönstrets titel', () => {
  it('börjar med «● Din tur» när det är ens tur, och bara då', () => {
    expect(documentTitle('online', { turn: true }, swedish)).toMatch(/^● Din tur · /)
    expect(documentTitle('online', {}, swedish)).not.toMatch(/Din tur/)
  })
})
