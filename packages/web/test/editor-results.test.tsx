// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { TableClient } from '../src/client.js'
import { projectDoc } from './project-doc.js'
import { asObserver, asSeat, asTable, registerRoom, roomOf, startServer, type Running } from './fixture.js'

// «Resultat» in the Bord tab (#1010, beställarens val 2026-10-18): an ended table's row says what
// came of it in one line, and the line opens the Resultat view on that table — the version it
// ended on, the players' answers, the observer's apart and marked, and every flag.

let run: Running
beforeEach(async () => {
  run = await startServer()
  await run.projects.create(run.projectId, projectDoc())
})
afterEach(async () => {
  await run.stop()
})

// A table played by Ada and Bo and watched by Cilla: Ada flags a moment, the table ends, Ada and
// Cilla answer the survey and Bo does not.
async function playedAndAnswered(): Promise<string> {
  const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
  const made = (await res.json()) as { id: string; code: string; hostKey: string }
  registerRoom(made.id, made)
  const id = made.id
  const ada = await asSeat(run, id, 'A', 'Ada')
  const bo = await asSeat(run, id, 'B', 'Bo')
  const cilla = await asObserver(run, id, 'Cilla')
  const seats = [TableClient.connect(ada), TableClient.connect(bo), TableClient.connect(cilla)]
  await Promise.all(seats.map((s) => s.ready()))
  await seats[0]!.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
  await seats[1]!.send({ v: 'seat.claim', seat: 'B', name: 'Bo' })
  await seats[0]!.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
  await seats[0]!.send({ v: 'flag', note: 'Draken är för stark' })
  const table = TableClient.connect(await asTable(run, id))
  await table.ready()
  await table.send({ v: 'session.end' })
  await waitFor(async () => expect((await run.store.read(id)).map((l) => l.intent.v)).toContain('session.end'))
  for (const s of [...seats, table]) s.close()
  const answer = (token: string, seat: string | null, fun: number, change: string) =>
    fetch(`${run.http}/sessions/${id}/survey`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, seat, ...(seat === null ? { observer: true } : {}), answers: { fun, clarity: 3, balance: 4, change } }) })
  expect((await answer(ada.token, 'A', 4, 'Kortare runda')).status).toBe(201)
  expect((await answer(cilla.token, null, 5, 'Roligt att titta på')).status).toBe(201)
  return id
}

async function openTables() {
  const user = userEvent.setup()
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await user.click(screen.getByRole('tab', { name: 'Bord' }))
  return user
}

describe('an ended table’s row and the Resultat view (#1010)', () => {
  it('says in one line what came of the table, and opens Resultat on it', async () => {
    const id = await playedAndAnswered()
    const code = roomOf(id).code
    const user = await openTables()
    await user.click(await screen.findByRole('button', { name: 'Avslutade bord · 1' }))
    const line = await screen.findByRole('button', { name: `Svar och flaggor från ${code}: 2 svar · 1 flagga` })
    expect(line.textContent).toBe('2 svar · 1 flagga')

    await user.click(line)
    // The view the line asked for: the version the table ended on, narrowed to the table.
    const heading = await screen.findByRole('heading', { level: 2, name: 'Version 1' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(screen.getByRole('button', { name: 'Resultat', pressed: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: code, pressed: true })).toBeTruthy()
    expect(screen.getByText('1 av 2 spelare svarade', { exact: false })).toBeTruthy()

    // Ada's answer among the players', Cilla's apart and marked, Bo named as the one who did not.
    expect(screen.getByText('Kortare runda')).toBeTruthy()
    const observers = screen.getByRole('heading', { level: 4, name: 'Observatörernas svar' })
    expect(observers.nextElementSibling?.nextElementSibling?.textContent).toMatch(/Cilla.*observatör.*Roligt att titta på/)
    expect(screen.getByText('Svarade inte: Bo.')).toBeTruthy()
    // The flag, by name, how far into the game, and what was written.
    expect(screen.getByText(/drag 1 av 1/)).toBeTruthy()
    expect(screen.getByText(/«Draken är för stark»/)).toBeTruthy()
  })

  it('says in each cell of the distribution what its number means, and counts the observer out', async () => {
    await playedAndAnswered()
    const user = await openTables()
    await user.click(screen.getByRole('button', { name: 'Resultat' }))
    const table = await screen.findByRole('table', { name: 'Fördelningen per fråga för version 1' })
    const fun = within(table).getByRole('row', { name: /^Kul/ })
    // Ada answered 4; Cilla's 5 is an observer's and is not in it.
    // What a reader hears in a cell is the cell without what is drawn only for the eye.
    const heard = (cell: HTMLElement) => {
      const copy = cell.cloneNode(true) as HTMLElement
      for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove()
      return copy.textContent
    }
    expect(within(fun).getAllByRole('cell').map(heard)).toEqual(['0 svarade 1', '0 svarade 2', '0 svarade 3', '1 svarade 4', '0 svarade 5', '4,0'])
  })

  it('has a real chosen state in the list of versions, and the switch back to the board', async () => {
    await playedAndAnswered()
    const user = await openTables()
    await user.click(screen.getByRole('button', { name: 'Resultat' }))
    const versions = await screen.findByRole('radiogroup', { name: 'Versioner' })
    expect(within(versions).getByRole('radio', { name: /Version 1/, checked: true })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Bord', pressed: false }))
    expect(await screen.findByRole('button', { name: 'Bord', pressed: true })).toBe(document.activeElement)
    expect(document.querySelector('[data-setup-editor]')).not.toBeNull()
  })
})

// A flag about a card (#1142, beställarens val 2026-10-22: «1 · miniatyren i raden»): the flag's row
// carries the card as it lay — the texture of the version it was raised on — and a press lifts it,
// with where it lay and whether the game draws it differently now.
describe('a flag about a card in Resultat (#1142)', () => {
  it('shows the card as it was in the flag’s row, and lifts it on a press', async () => {
    const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
    const made = (await res.json()) as { id: string; code: string; hostKey: string }
    registerRoom(made.id, made)
    const ada = TableClient.connect(await asSeat(run, made.id, 'A', 'Ada'))
    await ada.ready()
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    await ada.send({ v: 'draw', from: 'draw', to: 'table', count: 1, face: 'front' })
    const card = ada.view!.components.find((c) => c.zone === 'table')!
    await ada.send({ v: 'flag', component: card.id, note: 'Draken är för stark' })
    await ada.send({ v: 'session.end' })
    ada.close()

    const user = await openTables()
    await user.click(screen.getByRole('button', { name: 'Resultat' }))
    const thumb = await screen.findByRole('button', { name: `Visa ${card.title} som kortet såg ut` })
    expect(thumb.querySelector('img')?.getAttribute('src')).toBe(`${run.http}/faces/${card.faces!['front']}`)
    expect(screen.getByText(`${card.title} · Spelyta · oförändrat sedan`)).toBeTruthy()

    await user.click(thumb)
    const lifted = screen.getByRole('dialog', { name: `${card.title} som kortet såg ut` })
    expect(lifted.querySelector('img.byd-texture')?.getAttribute('src')).toBe(`${run.http}/faces/${card.faces!['front']}`)
    expect(lifted.textContent).toMatch(/när Ada flaggade/)
    expect(lifted.textContent).toMatch(/«Draken är för stark»/)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(thumb)
  })
})
