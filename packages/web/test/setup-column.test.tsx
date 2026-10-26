// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// Bordets vänsterkolumn (#1403, beställarens beslut C — bordet som träd): det som är spelets står
// överst i en remsa som fälls ut, och under den speglar listan filten: allt ligger i något.
let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function openBord(): Promise<void> {
  await run.projects.create(run.projectId, projectDoc())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  await run.answering()
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
}
const row = (id: string) => document.querySelector(`[data-zone-row="${id}"]`) as HTMLElement
const strip = () => screen.getByRole('button', { name: /^Spelet/ })

async function spara(): Promise<void> {
  const button = (await screen.findByRole('button', { name: 'Spara' })) as HTMLButtonElement
  expect(button.getAttribute('aria-disabled')).toBe('false')
  fireEvent.click(button)
  await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('true'))
}

describe('Spelet överst i kolumnen (#1403, beslut C)', () => {
  it('väljer vilken hög korten delas ut från under Spelet, och högen bär leken', async () => {
    await openBord()
    // Hopfälld säger remsan vad spelet är, i ett andetag.
    expect(strip().getAttribute('aria-expanded')).toBe('false')
    expect(strip().textContent).toMatch(/2 spelare/)
    expect(strip().textContent).toMatch(/leken i Draghög/)
    expect(screen.queryByRole('group', { name: 'Spelare' })).toBeNull()

    fireEvent.click(strip())
    expect(strip().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('group', { name: 'Spelare' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Turordning' })).toBeTruthy()
    const deck = screen.getByRole('combobox', { name: 'Korten delas ut från' }) as HTMLSelectElement
    expect([...deck.options].map((o) => o.textContent)).toEqual(['Draghög', 'Kasthög'])
    expect(deck.value).toBe('draw')
    expect(row('draw').textContent).toMatch(/leken/)
    expect(screen.queryByRole('button', { name: 'Ta bort Draghög' })).toBeNull()

    fireEvent.change(deck, { target: { value: 'discard' } })
    expect(row('discard').textContent).toMatch(/leken/)
    expect(row('draw').textContent).not.toMatch(/leken/)
    // Först nu går draghögen att ta bort: leken ligger någon annanstans.
    expect(screen.getByRole('button', { name: 'Ta bort Draghög' })).toBeTruthy()
    // Och knappen i högens panel finns inte längre: leken är spelets egenskap, inte högens.
    fireEvent.click(row('draw').querySelector('.byd-setup-name') as HTMLElement)
    expect(screen.queryByRole('button', { name: /Lägg leken i/ })).toBeNull()

    fireEvent.click(strip())
    expect(strip().textContent).toMatch(/leken i Kasthög/)

    await spara()
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.setup.deckZone).toBe('discard'))
  })
})
