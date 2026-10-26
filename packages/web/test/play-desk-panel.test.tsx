// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TableClient } from '../src/client.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { DESK_QUERY } from '../src/player/desk.js'
import { admit, asTable, createSession, roomOf, seatSetup, startServer, type Running } from './fixture.js'

// `/play` in a wide window keeps its rare things in a panel at the right, from the head down to the
// foot (#1376 punkt 3, beställarens beslut 2026-10-26: variant A). The flag is `/online`'s (#1255):
// a click on a card points it out, and it is no mode. Lämna, «Avsluta bordet?» and the removal of a
// name hold the focus while they stand. The survey asks one question at a time beside the table as
// it lay when it ended, with 1 to 5 on the keys, and the question before the end says that every
// player gets it where they hold their hand. The phone and narrow windows keep their sheets.

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  sessionStorage.clear()
  await run.stop()
})

function windowIs(wide: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: wide && query === DESK_QUERY,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

async function seated(wide = true): Promise<{ table: TableClient; id: string }> {
  windowIs(wide)
  const id = await createSession(run, 's1', undefined, seatSetup())
  const table = TableClient.connect(await asTable(run, id))
  await table.ready()
  const token = await admit(run, id, 'A', 'Ada')
  history.replaceState(null, '', `/play?session=${id}&seat=A&code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}#token=${token}`)
  render(<PlayerPage onLeave={() => undefined} />)
  await screen.findAllByText('Ada')
  await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
  await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(3))
  return { table, id }
}

const card = (i: number) => document.querySelectorAll<HTMLElement>('[data-hand-card]')[i]!
const head = () => document.querySelector('.byd-desk-head')!
const play = () => document.querySelector('.byd-desk-play')!
const exit = () => screen.getByRole('button', { name: /^Lämna… eller avsluta/ })
const press = (key: string, on: Element = document.activeElement ?? document.body) => fireEvent.keyDown(on, { key })

// The panel is the body's own column, beside the targets and the hand, and never a sheet over them.
function besideTheTable(panel: HTMLElement): void {
  expect(panel.parentElement?.classList.contains('byd-desk-body')).toBe(true)
  expect(play().parentElement).toBe(panel.parentElement)
  expect(document.querySelector('.byd-sheet-backdrop')).toBeNull()
}

describe('the flag in the panel beside the desk (#1376, #1255)', () => {
  it('opens beside the table, leaves it live, and flags the card a click points out without turning it', async () => {
    const { table, id } = await seated()
    fireEvent.click(screen.getByRole('button', { name: 'Flagga' }))
    const panel = await screen.findByRole('dialog', { name: 'Flagga' })
    besideTheTable(panel)
    // No modal window: the table beside it stays where a click can reach it.
    expect(panel.getAttribute('aria-modal')).toBeNull()
    expect(head().closest('[inert]')).toBeNull()
    expect(play().closest('[inert]')).toBeNull()
    expect(within(head() as HTMLElement).getByRole('button', { name: 'Flagga' }).getAttribute('aria-expanded')).toBe('true')

    const pointed = card(1)
    const which = pointed.getAttribute('data-hand-card')!
    await act(async () => {
      fireEvent.pointerDown(pointed, { pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse', clientX: 400, clientY: 700 })
      fireEvent.pointerUp(pointed, { pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse', clientX: 400, clientY: 700 })
      fireEvent.click(pointed)
    })
    expect(await within(panel).findByRole('button', { name: 'Ta bort kortet' })).toBeTruthy()
    expect(pointed.getAttribute('data-turned')).toBeNull()
    fireEvent.click(within(panel).getByRole('button', { name: 'Flagga' }))
    await waitFor(async () => expect((await run.store.read(id)).at(-1)).toMatchObject({ by: 'A', intent: { v: 'flag', component: which } }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Flagga' })).toBeNull())
    table.close()
  })
})

describe('Lämna and «Avsluta bordet?» in the panel, holding the focus (#1376)', () => {
  it('stands beside the table with the focus on «Avbryt», keeps Tab inside, and Escape gives it back to «Lämna»', async () => {
    const { table } = await seated()
    exit().focus()
    fireEvent.click(exit())
    const panel = await screen.findByRole('dialog', { name: 'Lämna bordet?' })
    besideTheTable(panel)
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(exit().getAttribute('aria-expanded')).toBe('true')
    // The ways out in the phone's order (C9, L87), the cross first and «Avbryt» last.
    expect(within(panel).getAllByRole('button').map((b) => b.textContent || b.getAttribute('aria-label'))).toEqual(['Stäng', 'Lämna bordet', 'Avsluta för alla', 'Lämna och ta bort mitt namn…', 'Avbryt'])
    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByRole('button', { name: 'Avbryt' })))
    // What is beside it is out of reach while a question that cannot be undone stands.
    expect(head().closest('[inert]')).not.toBeNull()
    expect(play().closest('[inert]')).not.toBeNull()
    // Tab from the last stop goes round to the first, not out into the hand.
    press('Tab')
    expect(document.activeElement).toBe(within(panel).getByRole('button', { name: 'Stäng' }))
    press('Escape')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Lämna bordet?' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(exit()))
    expect(play().closest('[inert]')).toBeNull()
    table.close()
  })

  it('asks «Avsluta bordet?» in the same panel, saying the survey comes where every player holds their hand', async () => {
    const { table, id } = await seated()
    fireEvent.click(exit())
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Lämna bordet?' })).getByRole('button', { name: 'Avsluta för alla' }))
    const ask = await screen.findByRole('alertdialog', { name: 'Avsluta bordet?' })
    besideTheTable(ask)
    expect(ask.textContent).toContain('Spelet avslutas för alla och kan inte fortsätta. Alla spelare får enkäten där de håller sin hand.')
    expect(ask.textContent).not.toContain('telefon')
    expect(within(ask).getAllByRole('button').map((b) => b.textContent || b.getAttribute('aria-label'))).toEqual(['Stäng', 'Avbryt', 'Avsluta för alla'])
    await waitFor(() => expect(document.activeElement).toBe(within(ask).getByRole('button', { name: 'Avbryt' })))
    expect(play().closest('[inert]')).not.toBeNull()
    fireEvent.click(within(ask).getByRole('button', { name: 'Avsluta för alla' }))
    await waitFor(async () => expect((await run.store.read(id)).at(-1)).toMatchObject({ intent: { v: 'session.end' } }))
    table.close()
  })

  it('asks before her name is removed in the same panel, holding the focus on «Avbryt»', async () => {
    const { table } = await seated()
    fireEvent.click(exit())
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Lämna bordet?' })).getByRole('button', { name: 'Lämna och ta bort mitt namn…' }))
    const ask = await screen.findByRole('alertdialog', { name: 'Lämna och ta bort ditt namn?' })
    besideTheTable(ask)
    expect(ask.textContent).toContain('namnet du satt under, Ada')
    await waitFor(() => expect(document.activeElement).toBe(within(ask).getByRole('button', { name: 'Avbryt' })))
    expect(play().closest('[inert]')).not.toBeNull()
    press('Escape')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    table.close()
  })
})

describe('the survey beside the table as it lay when it ended (#1376, G3)', () => {
  async function ended(): Promise<{ table: TableClient; id: string; panel: HTMLElement }> {
    const s = await seated()
    await s.table.send({ v: 'session.end' })
    const title = await screen.findByRole('heading', { name: 'Bordet är avslutat' })
    const panel = title.closest<HTMLElement>('.byd-desk-panel')!
    expect(panel).not.toBeNull()
    return { ...s, panel }
  }

  it('stands in the wide panel, live, with the table out of reach beside it and its hand still drawn', async () => {
    const { table, panel } = await ended()
    besideTheTable(panel)
    expect(panel.hasAttribute('data-wide')).toBe(true)
    expect(panel.closest('[inert]')).toBeNull()
    expect(play().closest('[inert]')).not.toBeNull()
    expect(head().closest('[inert]')).not.toBeNull()
    expect(play().querySelectorAll('[data-hand-card]')).toHaveLength(3)
    // Not the phone's survey, which takes the whole screen.
    expect(document.querySelector('.byd-survey')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(panel))
    table.close()
  })

  it('answers one question at a time on the keys 1 to 5, and Enter goes on once there is an answer', async () => {
    const { table, id, panel } = await ended()
    await waitFor(() => expect(document.activeElement).toBe(panel))
    expect(within(panel).getByRole('heading', { name: 'Hur kul var det?' })).toBeTruthy()
    // Enter before an answer goes nowhere.
    press('Enter')
    expect(within(panel).getByRole('heading', { name: 'Hur kul var det?' })).toBeTruthy()
    press('4')
    expect(within(panel).getByRole('button', { name: '4' }).getAttribute('aria-pressed')).toBe('true')
    press('Enter')
    expect(await within(panel).findByRole('heading', { name: /^Hur (lätt|tydliga)/ })).toBeTruthy()
    press('3')
    press('Enter')
    expect(await within(panel).findByRole('heading', { name: 'Hur balanserat kändes det?' })).toBeTruthy()
    press('2')
    press('Enter')
    const text = await within(panel).findByPlaceholderText('En mening räcker')
    // A digit typed into the free line is a digit, not an answer.
    fireEvent.keyDown(text, { key: '5' })
    fireEvent.change(text, { target: { value: 'Färre kort' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Skicka' }))
    expect(await within(panel).findByText('Tack, Ada.')).toBeTruthy()
    expect(within(panel).getByRole('button', { name: 'Svara igen' })).toBeTruthy()
    const answers = (await (await fetch(`${run.http}/sessions/${id}/surveys`)).json()) as { answers: { fun: number; clarity: number; balance: number; change: string } }[]
    expect(answers.map((a) => a.answers)).toEqual([{ fun: 4, clarity: 3, balance: 2, change: 'Färre kort' }])
    table.close()
  })

  it('asks before her name and answers are removed under the thanks, in the panel and holding the focus', async () => {
    const { table, panel } = await ended()
    for (const n of ['4', '3', '2']) {
      fireEvent.click(within(panel).getByRole('button', { name: n }))
      fireEvent.click(within(panel).getByRole('button', { name: 'Nästa' }))
    }
    fireEvent.click(within(panel).getByRole('button', { name: 'Skicka' }))
    fireEvent.click(await within(panel).findByRole('button', { name: 'Ta bort mitt namn och mina svar…' }))
    const ask = await screen.findByRole('alertdialog', { name: 'Ta bort ditt namn och dina svar?' })
    expect(panel.contains(ask) || ask.parentElement?.classList.contains('byd-desk-body')).toBe(true)
    expect(document.querySelector('.byd-sheet-backdrop')).toBeNull()
    expect(ask.textContent).toContain('dina enkätsvar')
    await waitFor(() => expect(document.activeElement).toBe(within(ask).getByRole('button', { name: 'Avbryt' })))
    press('Escape')
    expect(await screen.findByText('Tack, Ada.')).toBeTruthy()
    table.close()
  })
})

describe('a narrow window keeps the sheets (#1376)', () => {
  it('asks «Lämna bordet?» and «Avsluta bordet?» in sheets over the tabs, with the same sentence', async () => {
    const { table } = await seated(false)
    fireEvent.click(screen.getByRole('tab', { name: /^Mer/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Lämna… eller avsluta/ }))
    const sheet = screen.getByRole('dialog', { name: 'Lämna bordet?' })
    expect(sheet.closest('.byd-sheet-backdrop')).not.toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Avsluta för alla' }))
    const end = screen.getByRole('dialog', { name: 'Avsluta bordet?' })
    expect(end.closest('.byd-sheet-backdrop')).not.toBeNull()
    expect(end.textContent).toContain('Alla spelare får enkäten där de håller sin hand.')
    expect(document.querySelector('.byd-desk-panel')).toBeNull()
    table.close()
  })
})
