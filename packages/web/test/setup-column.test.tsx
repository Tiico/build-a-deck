// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
// Listans rader i DOM-ordning: en zon som sitt id, en familj som `roll:*`.
const rows = () => [...document.querySelectorAll('[data-zone-row], [data-zone-family]')].map((el) => el.getAttribute('data-zone-row') ?? `${el.getAttribute('data-zone-family')}:*`)
const list = (name: string) => screen.getByRole('list', { name })
// Namnet på varje rad direkt i en lista, utan det som står i raderna under.
const names = (name: string) => [...list(name).querySelectorAll(':scope > li')].map((li) => (li.querySelector('.byd-setup-name') as HTMLElement).textContent)
// Öppnar ＋-menyn på en rad och trycker ett av dess val.
const addVia = (node: string, item: string) => {
  fireEvent.click(screen.getByRole('button', { name: `Lägg till i ${node}` }))
  fireEvent.click(within(screen.getByRole('menu', { name: `Lägg till i ${node}` })).getByRole('menuitem', { name: item }))
}

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

// Listan speglar filten: allt ligger i något. Spelyta är roten för det som står på bordet, och
// «Varje plats» samlar det varje plats har — en rad per familj, inte en per plats (#175).
describe('bordet som träd (#1403, beslut C)', () => {
  it('har Spelyta och Varje plats som rötter, och lägger till i den zon vars ＋ trycks', async () => {
    await openBord()
    expect(rows()).toEqual(['table', 'draw', 'discard', 'hand:*'])
    expect(names('Bordet')).toEqual(['Spelyta', 'Varje plats 2 platser'])
    expect(names('Spelyta')).toEqual(['Draghög leken', 'Kasthög'])
    expect(names('Varje plats')).toEqual(['Hand 2 platser'])
    // De två rubrikerna som delade listan är borta; roten säger vad den rymmer.
    expect(screen.queryByRole('heading', { name: 'På bordet' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Vid platserna' })).toBeNull()

    // ＋ på Spelyta är en meny med det som går att lägga just där.
    const plus = screen.getByRole('button', { name: 'Lägg till i Spelyta' })
    expect(plus.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(plus)
    const menu = screen.getByRole('menu', { name: 'Lägg till i Spelyta' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['＋ Yta', '＋ Hög', '＋ Tärning'])
    // Menyn tar fokus på sitt första val, och Escape lämnar det tillbaka till ＋.
    await waitFor(() => expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: '＋ Yta' })))
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(plus)

    addVia('Spelyta', '＋ Hög')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(names('Spelyta')).toEqual(['Draghög leken', 'Kasthög', 'Hög 1'])
    // Den nya högen är vald, som förut: dess panel står öppen under raden.
    expect(screen.getByLabelText('Namn för Hög 1')).toBeTruthy()
    // Inga ＋ på en hög eller en hand: de rymmer kort, inte zoner eller material.
    expect(screen.queryByRole('button', { name: 'Lägg till i Hög 1' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lägg till i Hand' })).toBeNull()
  })
})
