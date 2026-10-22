// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { Activity, Intent, NoteView, Snapshot } from '@byd/protocol'
import { NotesColumn } from '../src/online/NotesColumn.js'
import { seatColor } from '../src/table/seatColor.js'

// Bordets anteckningsblock på /online (#1131, beställarens beslut B · Spalten): en spalt till vänster
// om filten med rader som var och en bär sin skribents platsfärg, kan bockas av och tas bort, och en
// rad längst ner att skriva en ny i. Spalten fälls ihop till en list, och listen säger när någon
// annan har skrivit sedan man såg efter.
const view = (notes: NoteView[], seq = 10) =>
  ({
    seq,
    seat: 'A',
    floor: 'table',
    seats: [
      { id: 'A', name: 'Ada', edge: 'S' },
      { id: 'B', name: 'Bo', edge: 'N' },
    ],
    zones: [],
    components: [],
    notes,
  }) as unknown as Snapshot
const ROWS: NoteView[] = [
  { id: 'n3', by: 'B', text: 'Poäng: Ada 7, Bo 4', done: false },
  { id: 'n5', by: 'A', text: 'Vems tur att blanda: Bo', done: true },
  { id: 'n6', by: null, text: 'Regelfråga till efteråt', done: false },
]
const noteLine = (seq: number, by: string | null): Activity => ({ seq, batch: `b${seq}`, schemaVersion: 1, by, at: '2026-10-22T00:00:00.000Z', intent: { v: 'note.add', text: 'x' } }) as Activity

let sent: Intent[]
const send = vi.fn(async (...intents: Intent[]) => {
  sent.push(...intents)
  return { ok: true as const, seqs: [1] }
})
beforeEach(() => {
  sent = []
  send.mockClear()
  localStorage.clear()
})
afterEach(cleanup)

const mount = (notes = ROWS, activity: Activity[] = [], seq = 10) => render(<NotesColumn view={view(notes, seq)} activity={activity} seat="A" send={send} />)

describe('anteckningsspalten (#1131)', () => {
  it('visar varje rad med vem som skrev den, i platsens färg, och bockade rader som bockade', () => {
    mount()
    const list = screen.getByRole('list', { name: 'Anteckningar' })
    const items = list.querySelectorAll('li')
    expect([...items].map((li) => li.querySelector('[data-note-by]')?.textContent)).toEqual(['Bo', 'Ada', 'Bordet'])
    expect((items[0] as HTMLElement).style.getPropertyValue('--note-seat')).toBe(seatColor(1))
    expect((items[1] as HTMLElement).style.getPropertyValue('--note-seat')).toBe(seatColor(0))
    expect((screen.getByRole('checkbox', { name: 'Klar: Vems tur att blanda: Bo' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'Klar: Poäng: Ada 7, Bo 4' }) as HTMLInputElement).checked).toBe(false)
    expect(items[1]?.hasAttribute('data-done')).toBe(true)
  })

  it('säger vad blocket är till för när det är tomt', () => {
    mount([])
    expect(screen.getByText(/Det ni skriver här ser alla vid bordet/)).toBeTruthy()
  })

  it('skriver en ny rad med Enter, utan blanktecken runt, och tömmer fältet', async () => {
    const user = userEvent.setup()
    mount()
    const field = screen.getByRole('textbox', { name: 'Ny anteckning' })
    await user.type(field, '  Cy har en extra tur  {Enter}')
    expect(sent).toEqual([{ v: 'note.add', text: 'Cy har en extra tur' }])
    expect((field as HTMLInputElement).value).toBe('')
    await user.type(field, '   {Enter}')
    expect(sent).toHaveLength(1)
    expect(field.getAttribute('maxlength')).toBe('280')
  })

  it('bockar av och tar bort en rad', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('checkbox', { name: 'Klar: Poäng: Ada 7, Bo 4' }))
    await user.click(screen.getByRole('checkbox', { name: 'Klar: Vems tur att blanda: Bo' }))
    await user.click(screen.getByRole('button', { name: 'Ta bort: Regelfråga till efteråt' }))
    expect(sent).toEqual([
      { v: 'note.check', note: 'n3', done: true },
      { v: 'note.check', note: 'n5', done: false },
      { v: 'note.remove', note: 'n6' },
    ])
  })

  // Bocken står som den klickades medan bordet svarar, och går tillbaka bara om bordet säger nej:
  // en ruta som hoppar tillbaka till sitt gamla läge tills svaret kommer ser ut som ett klick som
  // inte tog (E2E, online-notes.spec.ts).
  it('håller bocken som den klickades medan bordet svarar, och tar tillbaka den om bordet säger nej', async () => {
    const user = userEvent.setup()
    let answer: (r: { ok: false; reason: string }) => void = () => undefined
    const slow = vi.fn(() => new Promise<{ ok: false; reason: string }>((resolve) => (answer = resolve)))
    render(<NotesColumn view={view(ROWS)} activity={[]} seat="A" send={slow} />)
    const box = screen.getByRole('checkbox', { name: 'Klar: Poäng: Ada 7, Bo 4' }) as HTMLInputElement
    await user.click(box)
    expect(box.checked).toBe(true)
    answer({ ok: false, reason: 'unknown note n3' })
    await screen.findByRole('status')
    expect(box.checked).toBe(false)
  })

  it('skriver om en rad där den står: Enter sparar, Escape ångrar, och en oförändrad rad skickas inte', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Ändra: Poäng: Ada 7, Bo 4' }))
    const box = screen.getByRole('textbox', { name: 'Ändra: Poäng: Ada 7, Bo 4' })
    expect(document.activeElement).toBe(box)
    await user.clear(box)
    await user.type(box, 'Poäng: Ada 9, Bo 4{Enter}')
    expect(sent).toEqual([{ v: 'note.edit', note: 'n3', text: 'Poäng: Ada 9, Bo 4' }])
    // Tillbaka på raden, så att tangentbordet står kvar där det var.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ändra: Poäng: Ada 7, Bo 4' }))

    await user.click(screen.getByRole('button', { name: 'Ändra: Regelfråga till efteråt' }))
    await user.type(screen.getByRole('textbox', { name: 'Ändra: Regelfråga till efteråt' }), ' – nej{Escape}')
    await user.click(screen.getByRole('button', { name: 'Ändra: Vems tur att blanda: Bo' }))
    await user.keyboard('{Enter}')
    expect(sent).toHaveLength(1)
  })

  it('fälls ihop till en list, och minns det till nästa gång', async () => {
    const user = userEvent.setup()
    const first = mount()
    const toggle = screen.getByRole('button', { name: 'Anteckningar' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    first.unmount()
    mount()
    expect(screen.getByRole('button', { name: 'Anteckningar' }).getAttribute('aria-expanded')).toBe('false')
  })

  // Hopfälld där den kostar (beställarens beslut 2026-10-22, K9): sidan säger om korten håller sitt
  // golv med spalten öppen, och svaret kan komma efter att filten mätts — spalten följer det tills
  // spelaren själv har valt, och då står valet.
  it('följer sidans standardläge tills spelaren själv valt, och sedan valet', async () => {
    const user = userEvent.setup()
    const page = render(<NotesColumn view={view(ROWS)} activity={[]} seat="A" send={send} defaultOpen={false} />)
    const toggle = () => screen.getByRole('button', { name: 'Anteckningar' })
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    page.rerender(<NotesColumn view={view(ROWS)} activity={[]} seat="A" send={send} defaultOpen={true} />)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    await user.click(toggle())
    page.rerender(<NotesColumn view={view(ROWS)} activity={[]} seat="A" send={send} defaultOpen={true} />)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('säger på den ihopfällda listen att någon annan har skrivit sedan man såg efter, och inte sina egna rader', async () => {
    const user = userEvent.setup()
    const page = mount(ROWS, [], 10)
    await user.click(screen.getByRole('button', { name: 'Anteckningar' }))
    page.rerender(<NotesColumn view={view(ROWS, 11)} activity={[noteLine(11, 'A')]} seat="A" send={send} />)
    expect(screen.getByRole('button', { name: 'Anteckningar' }).hasAttribute('data-unseen')).toBe(false)
    page.rerender(<NotesColumn view={view(ROWS, 12)} activity={[noteLine(11, 'A'), noteLine(12, 'B')]} seat="A" send={send} />)
    const toggle = screen.getByRole('button', { name: 'Anteckningar, nytt från någon annan' })
    expect(toggle.hasAttribute('data-unseen')).toBe(true)
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: 'Anteckningar' }))
    expect(screen.getByRole('button', { name: 'Anteckningar' }).hasAttribute('data-unseen')).toBe(false)
  })

  it('säger när bordet inte tog emot raden, och lämnar texten kvar i fältet', async () => {
    const user = userEvent.setup()
    const refuse = vi.fn(async () => ({ ok: false as const, reason: 'the notepad holds at most 100 notes' }))
    render(<NotesColumn view={view(ROWS)} activity={[]} seat="A" send={refuse} />)
    const field = screen.getByRole('textbox', { name: 'Ny anteckning' })
    await user.type(field, 'en till{Enter}')
    expect((await screen.findByRole('status')).textContent).toMatch(/^Blocket är fullt/)
    expect((field as HTMLInputElement).value).toBe('en till')
  })
})
