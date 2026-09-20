// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ZoneAction } from '@byd/protocol'
import type { Zone } from '@byd/server/doc'
import { ZoneActions } from '../src/editor/ZoneActions.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Ett val bland femtio (#230). I ett spel med tjugo zoner har rutan fyrtiosju val i fyra osorterade
// block, och den sista är sex rullningar bort. Beslutet 2026-09-18: en ruta, inte fyra steg — allt
// kvar på ett ställe, men sökbart, med senast valda överst och rubriker som verkligen skiljer
// blocken åt. Sökfältet tar fokus när rutan öppnas.
const actions: ZoneAction[] = [{ id: 'a1', label: 'Dra', steps: [{ v: 'split', count: { of: 'number', n: 1 }, to: { at: 'beside' }, face: 'keep' }] }]

// Ett spel av verklig storlek: tjugo zoner, inte fixturens fem.
function bigDoc() {
  const doc = projectDoc()
  const extra: Zone[] = ['Marknaden', 'Ruinen', 'Skogsbrynet', 'Borgen', 'Floden', 'Altaret', 'Gruvan', 'Hamnen', 'Torget', 'Valvet'].map((name, i) => ({
    id: `z${i}`,
    kind: 'pile',
    name,
    visibility: 'all',
    geometry: { x: 0, y: 0, w: 0, h: 0, rot: 0 },
  }))
  return { ...doc, setup: { ...doc.setup, zones: [...doc.setup.zones, ...extra] } }
}

const pop = () => document.querySelector('.byd-slot-pop') as HTMLElement

function openSlot(name: string | RegExp): HTMLElement {
  const doc = bigDoc()
  const zone = doc.setup.zones.find((z) => z.id === 'draw')!
  render(<ZoneActions doc={doc} zone={{ ...zone, actions }} onPatch={() => undefined} onClose={() => undefined} />)
  fireEvent.click(screen.getByRole('button', { name }))
  return pop()
}

// Panelen som den sitter i editorn: det som väljs i meningen stannar i den.
function Panel() {
  const doc = bigDoc()
  const [zone, setZone] = useState<Zone>({ ...doc.setup.zones.find((z) => z.id === 'draw')!, actions })
  return <ZoneActions doc={doc} zone={zone} onPatch={(patch) => setZone((was) => ({ ...was, ...patch }))} onClose={() => undefined} />
}

// Ett val taget som designern tar det: öppna ordet i meningen, välj i rutan.
function choose(knob: string | RegExp, choice: string): void {
  fireEvent.click(screen.getByRole('button', { name: knob }))
  fireEvent.click(within(pop()).getByRole('button', { name: choice }))
}

const words = (pop: HTMLElement): string[] => [...pop.querySelectorAll('button')].map((b) => b.textContent ?? '')
const search = (text: string) => fireEvent.change(screen.getByLabelText('Sök bland valen'), { target: { value: text } })

describe('rutan som öppnas ur en slot (#230)', () => {
  it('har ett sökfält, och fältet tar fokus när rutan öppnas', async () => {
    const pop = openSlot('1')
    const field = screen.getByLabelText('Sök bland valen')
    expect(pop.contains(field)).toBe(true)
    await waitFor(() => expect(document.activeElement).toBe(field))
  })

  // Sökningen går tvärs igenom blocken: «hand» är både en plats meningen känner till och zoner
  // spelet har, och båda sorterna ska stå kvar när ordet skrivs.
  //
  // De två sista raderna hette båda «Hand» till och med #255 — samma text två gånger, vilket var
  // just det fyndet. Nu bär de platsen efter namnet, och «hand a» når den ena av dem.
  it('filtrerar valen i hela rutan, oavsett block, när något skrivs', () => {
    const pop = openSlot('till vänster om högen')
    expect(words(pop).length).toBeGreaterThan(15)
    search('hand')
    expect(words(pop)).toEqual(['i varje hand', 'i min hand', 'Hand A', 'Hand B'])
    search('hand a')
    expect(words(pop)).toEqual(['Hand A'])
  })

  // Blocken finns redan i rutan; de syns bara inte. En rubrik är därför inte dekoration utan det
  // som skiljer dem åt — för ögat och för den som lyssnar sig igenom rutan.
  it('delar valen i block med rubriker som också hörs', () => {
    const pop = openSlot('1')
    const count = within(pop).getByRole('group', { name: 'Antal' })
    const ofAZone = within(pop).getByRole('group', { name: 'Lika många som en zon' })
    expect(words(count)).toEqual(['ett per spelare', 'så många jag säger'])
    expect(count.contains(screen.getByLabelText('ett tal'))).toBe(true)
    expect(words(ofAZone)).toContain('så många som ligger i Hamnen')
  })

  // Samma zon väljs om och om igen när en uppsättning byggs. Tre stycken: två är knappt en lista,
  // fem trycker undan rubrikerna under den (beställaren, 2026-09-18).
  it('ställer de tre senast valda överst, senast först', () => {
    render(<Panel />)
    choose('till vänster om högen', 'Hamnen')
    choose('i Hamnen', 'Torget')
    choose('i Torget', 'Valvet')
    choose('i Valvet', 'Gruvan')

    fireEvent.click(screen.getByRole('button', { name: 'i Gruvan' }))
    const blocks = within(pop()).getAllByRole('group')
    expect(words(blocks[0]!)).toEqual(['Gruvan', 'Valvet', 'Torget'])
    expect(blocks[0]!.textContent).toContain('Senast valda')
    // Ingenting försvinner ur rutan för att det står överst: blocken under är hela.
    expect(words(within(pop()).getByRole('group', { name: 'Zoner i spelet' }))).toContain('Hamnen')
  })

  // Med fokus i sökfältet måste pilarna fortfarande gå ned i listan därifrån (följdkrav i
  // beslutet). Annars är fältet en återvändsgränd för den som inte vill skriva.
  it('går ned i listan med piltangenten från sökfältet, och tillbaka upp i fältet', () => {
    const box = openSlot('till vänster om högen')
    const field = screen.getByLabelText('Sök bland valen')
    const [first, second] = [...box.querySelectorAll('button')]

    fireEvent.keyDown(field, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(field)
  })

  // «Tangentbordet blir snabbast möjligt: öppna, skriv, Enter» (beslutet). Enter tar det som blev
  // kvar överst, utan att handen behöver gå till musen eller ned genom listan.
  it('tar det översta kvarvarande valet när Enter trycks i sökfältet', () => {
    render(<Panel />)
    fireEvent.click(screen.getByRole('button', { name: 'till vänster om högen' }))
    search('gruv')
    fireEvent.keyDown(screen.getByLabelText('Sök bland valen'), { key: 'Enter' })

    expect(document.querySelector('.byd-slot-pop')).toBeNull()
    expect(screen.getByRole('button', { name: 'i Gruvan' })).toBeTruthy()
  })

  // Rutan är en dörr, som varje annan yta som står över arbetet (#152, L9): trycket hörs på
  // dokumentet och inte bara inuti rutan, för Escape anländer där fokus råkar stå — och fokus
  // lämnas tillbaka till ratten rutan fälldes ut ur, i stället för på ingenting.
  it('är en dörr: hör trycket på dokumentet och lämnar tillbaka fokus till ratten', () => {
    openSlot('till vänster om högen')
    // Ratten i meningen och inte raden i rutan, som just nu bär samma ord.
    const knob = [...document.querySelectorAll('.byd-slot')].find((b) => b.textContent === 'till vänster om högen')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(document.querySelector('.byd-slot-pop')).toBeNull()
    expect(document.activeElement).toBe(knob)
  })

  // Escape stänger rutan, och gör det på första trycket: den tömmer inte fältet först.
  it('stänger rutan på Escape utan att först tömma fältet', () => {
    openSlot('till vänster om högen')
    search('gruv')
    fireEvent.keyDown(screen.getByLabelText('Sök bland valen'), { key: 'Escape' })
    expect(document.querySelector('.byd-slot-pop')).toBeNull()

    // Och nästa gång rutan öppnas står den öppen med allt i sig, inte med gårdagens sökning kvar.
    fireEvent.click(screen.getByRole('button', { name: 'till vänster om högen' }))
    expect((screen.getByLabelText('Sök bland valen') as HTMLInputElement).value).toBe('')
    expect(words(pop()).length).toBeGreaterThan(15)
  })

  // En tom ruta säger ingenting om varför den är tom. Sökningen som inte träffar något får svara.
  it('säger ifrån när ingenting heter så', () => {
    const box = openSlot('till vänster om högen')
    search('xyz')
    expect(words(box)).toEqual([])
    expect(box.textContent).toContain('Inget som heter så.')
  })

  // Ändringen gäller rutorna som växer med spelet. Tre sidor är ingen lista att söka i, och den
  // rutan står kvar som den var.
  it('lämnar den korta rutan i fred: tre sidor söks inte igenom', () => {
    const box = openSlot('som de ligger')
    expect(words(box)).toEqual(['som de ligger', 'uppvända', 'nedvända'])
    expect(within(box).queryByLabelText('Sök bland valen')).toBeNull()
  })

  // Pilarna går ned i listan, men talet är inte ett val i listan — det skrivs. I ett nummerfält
  // stegar pilarna värdet, och den som står i fältet och trycker uppåt menar «en till», inte
  // «nästa knapp». Rutans egen pilnavigering får inte äta det.
  it('låter pilarna stega talet när de trycks i nummerfältet', () => {
    openSlot('1')
    const number = screen.getByLabelText('ett tal')
    number.focus()

    const stepped = fireEvent.keyDown(number, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(number)
    // `fireEvent` svarar false när något kallat preventDefault: då hade webbläsaren inte stegat.
    expect(stepped).toBe(true)

    expect(fireEvent.keyDown(number, { key: 'ArrowDown' })).toBe(true)
    expect(document.activeElement).toBe(number)
  })
})
