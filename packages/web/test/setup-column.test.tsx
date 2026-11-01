// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { applyEdit } from '@byd/server/doc'
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
// Dokumentet som servern håller det: projektet med varje loggad redigering lagd på.
const truth = async (): Promise<ProjectDoc> => (await run.projects.readEdits(run.projectId, 0)).reduce((doc, e) => applyEdit(doc, e.intent), projectDoc())
const row = (id: string) => document.querySelector(`[data-zone-row="${id}"]`) as HTMLElement
const strip = () => screen.getByRole('button', { name: /^Spelet/ })
// Listans rader i DOM-ordning: en zon som sitt id, en familj som `roll:*`.
const rows = () => [...document.querySelectorAll('[data-zone-row], [data-zone-family]')].map((el) => el.getAttribute('data-zone-row') ?? `${el.getAttribute('data-zone-family')}:*`)
const list = (name: string) => screen.getByRole('list', { name })
// Namnet på varje rad direkt i en lista, utan det som står i raderna under.
const names = (name: string) => [...list(name).querySelectorAll(':scope > li')].map((li) => (li.querySelector('.byd-setup-name') as HTMLElement).textContent)
// Ett vals namn i ＋-menyn: det som står på knappen, utan undertexten (#1477, «meeple, kub eller skiva»).
const itemName = (b: HTMLElement) => b.getAttribute('aria-label') ?? b.textContent
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
    expect(within(menu).getAllByRole('menuitem').map(itemName)).toEqual(['＋ Yta', '＋ Hög', '＋ Tärning', '＋ Pjäs', '＋ Bricka'])
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
    // En hög rymmer kort och brickor, inte zoner eller trädelar: dess ＋ har bara «Bricka» (#1487).
    // En hand har inget ＋.
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till i Hög 1' }))
    expect(within(screen.getByRole('menu', { name: 'Lägg till i Hög 1' })).getAllByRole('menuitem').map(itemName)).toEqual(['＋ Bricka'])
    expect(screen.queryByRole('button', { name: 'Lägg till i Hand' })).toBeNull()
  })
})

// Materialet ligger i trädet där det ligger på filten (K31): en tärning under sin yta, en räknare
// under den zon varje plats har som den ligger i. Panelerna Räknare och Tärningar är borta.
describe('material i trädet (#1403, beslut C)', () => {
  it('lägger en tärning under den yta vars ＋ la den, och en räknare under platsernas zon', async () => {
    await openBord()
    expect(screen.queryByRole('heading', { name: 'Räknare' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Tärningar' })).toBeNull()

    addVia('Spelyta', '＋ Tärning')
    await waitFor(async () => expect((await truth()).setup.dice).toEqual([{ faces: 6, count: 1, zone: 'table' }]))
    expect(names('Spelyta')).toEqual(['Draghög leken', 'Kasthög', '1 × d6 totalt'])
    // Den nya raden står öppen med sina fält, och antalet har fokus: ＋ lämnade en med raden.
    const count = screen.getByRole('spinbutton', { name: 'Antal för tärning 1' })
    await waitFor(() => expect(document.activeElement).toBe(count))
    expect(screen.getByRole('combobox', { name: 'Sort för tärning 1' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Hur antalet räknas för tärning 1' })).toBeTruthy()
    // Var den ligger säger trädet; raden har ingen väljare för det.
    expect(screen.queryByRole('combobox', { name: 'Yta för tärning 1' })).toBeNull()
    fireEvent.change(count, { target: { value: '2' } })
    fireEvent.keyDown(count, { key: 'Enter' })
    await waitFor(() => expect(names('Spelyta')).toEqual(['Draghög leken', 'Kasthög', '2 × d6 totalt']))

    // En tärning i en yta varje plats har är per spelare, och står under familjen.
    addVia('Varje plats', '＋ Yta per plats')
    addVia('Framför', '＋ Tärning')
    await waitFor(async () => expect((await truth()).setup.dice?.[1]).toEqual({ faces: 6, count: 1, role: 'mine' }))
    expect(names('Framför')).toEqual(['1 × d6 per spelare'])
    expect(screen.queryByRole('combobox', { name: 'Hur antalet räknas för tärning 2' })).toBeNull()

    // En räknare utan räknarzon står under Varje plats och säger varför den inte hamnar på bordet.
    addVia('Varje plats', '＋ Räknare')
    await waitFor(() => expect(names('Varje plats')).toEqual(['Hand 2 platser', 'Framför 2 platser', 'Poäng från 0']))
    expect(screen.getByText(/Ingen plats har någon räknarzon/)).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Namn för räknare 1' })))
    addVia('Varje plats', '＋ Räknarzon per plats')
    await waitFor(() => expect(names('Räknare')).toEqual(['Poäng från 0']))
    expect(names('Varje plats')).toEqual(['Hand 2 platser', 'Framför 2 platser', 'Räknare 2 platser'])
    expect(screen.queryByText(/Ingen plats har någon räknarzon/)).toBeNull()

    // ＋ Räknare på en familj lägger räknaren i den familjens zon (K31).
    addVia('Framför', '＋ Räknare')
    await waitFor(() => expect(names('Framför')).toEqual(['1 × d6 per spelare', 'Liv från 20']))
    const counters = (await truth()).setup.counters
    expect(counters?.map((c) => ({ name: c.name, start: c.start, role: c.role }))).toEqual([
      { name: 'Poäng', start: 0, role: undefined },
      { name: 'Liv', start: 20, role: 'mine' },
    ])

    // × tar bort raden där den står, och de som är kvar räknas om.
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort tärning 1' }))
    await waitFor(async () => expect((await truth()).setup.dice).toEqual([{ faces: 6, count: 1, role: 'mine' }]))
    expect(names('Spelyta')).toEqual(['Draghög leken', 'Kasthög'])
    expect(screen.getByRole('button', { name: 'Ta bort tärning 1' })).toBeTruthy()
  })
})

// Hur en tärnings antal räknas (#1139): per spelare i en yta varje plats har, där det inte finns
// något att välja; totalt eller per spelare på bordet, där «per spelare» gör antalet gånger platserna.
describe('tärningens sort och räkning (#1403, #1139)', () => {
  it('byter sort, och räknar per spelare på en delad yta', async () => {
    await openBord()
    addVia('Spelyta', '＋ Tärning')
    const select = (name: string) => screen.getByRole('combobox', { name }) as HTMLSelectElement
    await waitFor(() => expect(select('Sort för tärning 1')).toBeTruthy())
    fireEvent.change(select('Sort för tärning 1'), { target: { value: '20' } })
    await waitFor(async () => expect((await truth()).setup.dice).toEqual([{ faces: 20, count: 1, zone: 'table' }]))
    expect(names('Spelyta')).toEqual(['Draghög leken', 'Kasthög', '1 × d20 totalt'])
    fireEvent.change(select('Hur antalet räknas för tärning 1'), { target: { value: 'perSeat' } })
    await waitFor(async () => expect((await truth()).setup.dice).toEqual([{ faces: 20, count: 1, zone: 'table', perSeat: true }]))
    expect(names('Spelyta')).toEqual(['Draghög leken', 'Kasthög', '1 × d20 per spelare'])
    fireEvent.change(select('Hur antalet räknas för tärning 1'), { target: { value: 'total' } })
    await waitFor(async () => expect((await truth()).setup.dice).toEqual([{ faces: 20, count: 1, zone: 'table' }]))
  })
})

// Som räknarna utan räknarzon: en tärning vars yta tagits bort står kvar och säger varför den inte
// hamnar på bordet, så att ett steg tillbaka över borttagningen ger tillbaka tärningen där den låg.
describe('en tärning vars yta försvinner (#1403, #1139)', () => {
  it('står kvar under Spelyta, säger det, och tar en ny yta ur en väljare', async () => {
    await openBord()
    addVia('Spelyta', '＋ Yta')
    await waitFor(() => expect(row('yta-1')).toBeTruthy())
    addVia('Yta 1', '＋ Tärning')
    await waitFor(async () => expect((await truth()).setup.dice).toEqual([{ faces: 6, count: 1, zone: 'yta-1' }]))
    expect(names('Yta 1')).toEqual(['1 × d6 totalt'])
    expect(screen.queryByText(/Ytan finns inte längre/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Yta 1' }))
    await waitFor(() => expect(screen.getByText(/Ytan finns inte längre, så tärningen läggs inte på bordet/)).toBeTruthy())
    expect(names('Spelyta')).toEqual(['Draghög leken', 'Kasthög', '1 × d6 totalt'])
    const place = screen.getByRole('combobox', { name: 'Yta för tärning 1' }) as HTMLSelectElement
    expect(place.getAttribute('aria-invalid')).toBe('true')
    expect(await (await truth()).setup.dice).toEqual([{ faces: 6, count: 1, zone: 'yta-1' }])

    fireEvent.change(place, { target: { value: 'zone:table' } })
    await waitFor(async () => expect((await truth()).setup.dice).toEqual([{ faces: 6, count: 1, zone: 'table' }]))
    expect(screen.queryByRole('combobox', { name: 'Yta för tärning 1' })).toBeNull()
    expect(screen.queryByText(/Ytan finns inte längre/)).toBeNull()
  })
})

// Trädelarna i trädet (#1477, editorvariant B i #1472): en enda «＋ Pjäs» i ＋-menyn, som «＋ Tärning»,
// och sorten väljs i raden bland meeple, kub och skiva. Raden säger «5 × meeple · per spelare», och
// öppnas till sort, antal och hur en meeple börjar. Färgen är platsens (L11) och väljs inte.
describe('pjäserna i trädet (#1477)', () => {
  it('lägger fem meeples per spelare ur «＋ Pjäs», byter sort i raden och låter en meeple börja liggande', async () => {
    await openBord()
    addVia('Varje plats', '＋ Yta per plats')
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till i Framför' }))
    const menu = screen.getByRole('menu', { name: 'Lägg till i Framför' })
    expect(within(menu).getAllByRole('menuitem').map(itemName)).toEqual(['＋ Tärning', '＋ Pjäs', '＋ Räknare'])
    expect(within(menu).getByRole('menuitem', { name: '＋ Pjäs' }).textContent).toContain('meeple, kub eller skiva')
    fireEvent.click(within(menu).getByRole('menuitem', { name: '＋ Pjäs' }))
    await waitFor(async () => expect((await truth()).setup.pieces).toEqual([{ kind: 'meeple', count: 5, role: 'mine' }]))
    expect(names('Framför')).toEqual(['5 × meeple per spelare'])
    // Den nya raden står öppen, och antalet har fokus: ＋ lämnade en med raden.
    const count = screen.getByRole('spinbutton', { name: 'Antal för pjäs 1' })
    await waitFor(() => expect(document.activeElement).toBe(count))

    const sort = screen.getByRole('group', { name: 'Sort för pjäs 1' })
    expect(within(sort).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['meeple', 'true'],
      ['kub', 'false'],
      ['skiva', 'false'],
    ])
    const start = screen.getByRole('group', { name: 'Hur pjäs 1 börjar' })
    fireEvent.click(within(start).getByRole('button', { name: 'Liggande' }))
    await waitFor(async () => expect((await truth()).setup.pieces).toEqual([{ kind: 'meeple', count: 5, role: 'mine', lying: true }]))

    // En kub har ingen sida att ligga på: sorten byts, raden står kvar och «Börjar» försvinner.
    fireEvent.click(within(sort).getByRole('button', { name: 'kub' }))
    await waitFor(async () => expect((await truth()).setup.pieces).toEqual([{ kind: 'cube', count: 5, role: 'mine' }]))
    expect(names('Framför')).toEqual(['5 × kub per spelare'])
    expect(screen.queryByRole('group', { name: 'Hur pjäs 1 börjar' })).toBeNull()

    fireEvent.change(count, { target: { value: '3' } })
    fireEvent.keyDown(count, { key: 'Enter' })
    await waitFor(async () => expect((await truth()).setup.pieces).toEqual([{ kind: 'cube', count: 3, role: 'mine' }]))

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort pjäs 1' }))
    await waitFor(async () => expect((await truth()).setup.pieces).toBeUndefined())
    expect(screen.queryByRole('list', { name: 'Framför' })).toBeNull()
  })

  it('har «＋ Pjäs» på Spelyta, och en pjäs där räknas totalt eller per spelare', async () => {
    await openBord()
    addVia('Spelyta', '＋ Pjäs')
    await waitFor(async () => expect((await truth()).setup.pieces).toEqual([{ kind: 'meeple', count: 5, zone: 'table' }]))
    expect(names('Spelyta')).toEqual(['Draghög leken', 'Kasthög', '5 × meeple totalt'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Hur antalet räknas för pjäs 1' }), { target: { value: 'perSeat' } })
    await waitFor(async () => expect((await truth()).setup.pieces).toEqual([{ kind: 'meeple', count: 5, zone: 'table', perSeat: true }]))
  })

  // Som tärningen: en rad vars yta tas bort står kvar under Spelyta och säger varför.
  it('står kvar med ett besked när dess yta tas bort, och tar en ny yta ur en väljare', async () => {
    await openBord()
    addVia('Spelyta', '＋ Yta')
    await waitFor(() => expect(row('yta-1')).toBeTruthy())
    addVia('Yta 1', '＋ Pjäs')
    await waitFor(async () => expect((await truth()).setup.pieces).toEqual([{ kind: 'meeple', count: 5, zone: 'yta-1' }]))
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Yta 1' }))
    await waitFor(() => expect(screen.getByText(/Ytan finns inte längre, så pjäsen läggs inte på bordet/)).toBeTruthy())
    expect(names('Spelyta')).toEqual(['Draghög leken', 'Kasthög', '5 × meeple totalt'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Yta för pjäs 1' }), { target: { value: 'zone:table' } })
    await waitFor(async () => expect((await truth()).setup.pieces).toEqual([{ kind: 'meeple', count: 5, zone: 'table' }]))
  })
})

// Brickorna i trädet (#1487, editorvariant A i #1474): «＋ Bricka» i ＋-menyn på en yta och en hög
// öppnar två val sida vid sida, så att vad det andra kostar syns: en markör (en bild i n exemplar,
// en rad i Bord) och en hög ur en lek (en bild per rad, en lek med mall och tabell).
describe('brickorna i trädet (#1487)', () => {
  const blank = { base: [], variants: {} }
  const choose = (node: string, item: 'Markör' | 'Hög ur en lek') => {
    fireEvent.click(screen.getByRole('button', { name: `Lägg till i ${node}` }))
    const menu = screen.getByRole('menu', { name: `Lägg till i ${node}` })
    const tile = within(menu).getByRole('menuitem', { name: '＋ Bricka' })
    expect(tile.textContent).toContain('markör eller lek')
    expect(tile.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(tile)
    expect(tile.getAttribute('aria-expanded')).toBe('true')
    // Valen står sida vid sida, och var och en säger vad den kostar.
    const both = within(menu).getByRole('group', { name: 'Bricka' })
    expect(within(both).getAllByRole('menuitem').map((b) => b.querySelector('b')?.textContent)).toEqual(['Markör', 'Hög ur en lek'])
    expect(within(both).getByRole('menuitem', { name: 'Markör' }).textContent).toMatch(/Kostar: en rad i Bord/)
    expect(within(both).getByRole('menuitem', { name: 'Hög ur en lek' }).textContent).toMatch(/Kostar: en lek med mall och tabell/)
    fireEvent.click(within(both).getByRole('menuitem', { name: item }))
  }

  it('lägger en markör på Spelyta, och raden säger «10 × Markör» och öppnas till namn, antal och form', async () => {
    await openBord()
    choose('Spelyta', 'Markör')
    await waitFor(async () => expect((await truth()).setup.markers).toEqual([{ id: 'markor-1', name: 'Markör', type: { id: 'tile.round.25', version: 1 }, faces: { front: blank, back: blank }, count: 10, zone: 'table' }]))
    expect(names('Spelyta')).toEqual(['Draghög leken', 'Kasthög', '10 × Markör rund 25 mm, totalt'])
    const count = screen.getByRole('spinbutton', { name: 'Antal för markör 1' })
    await waitFor(() => expect(document.activeElement).toBe(count))
    fireEvent.change(count, { target: { value: '30' } })
    fireEvent.keyDown(count, { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Namn på markör 1' }), { target: { value: 'Guld' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Form för markör 1' }), { target: { value: 'tile.hex.52' } })
    await waitFor(async () => expect((await truth()).setup.markers?.[0]).toMatchObject({ name: 'Guld', count: 30, type: { id: 'tile.hex.52', version: 1 } }))
    expect(names('Spelyta')).toEqual(['Draghög leken', 'Kasthög', '30 × Guld sexhörning 52 mm, totalt'])
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort markör 1' }))
    await waitFor(async () => expect((await truth()).setup.markers).toBeUndefined())
  })

  it('lägger en markör i en hög, som en bank att ta ur', async () => {
    await openBord()
    choose('Kasthög', 'Markör')
    await waitFor(async () => expect((await truth()).setup.markers?.[0]).toMatchObject({ count: 10, zone: 'discard' }))
    expect(names('Kasthög')).toEqual(['10 × Markör rund 25 mm, totalt'])
  })

  it('lägger en hög ur en ny lek av brickor, i en ny hög på Spelyta, som ett steg', async () => {
    await openBord()
    choose('Spelyta', 'Hög ur en lek')
    await waitFor(async () => expect((await truth()).decks).toHaveLength(1))
    const doc = await truth()
    const deck = doc.decks![0]!
    expect(deck).toMatchObject({ id: 'brickor-1', name: 'Brickor', type: { id: 'tile.hex.52', version: 1 }, rows: [{ id: 'kort-1', fields: { title: '', antal: 1 } }] })
    const pile = doc.setup.zones.find((z) => z.id === deck.zone)!
    expect(pile).toMatchObject({ kind: 'pile', name: 'Brickor' })
    expect(names('Spelyta')).toEqual(['Draghög leken', 'Kasthög', 'Brickor leken'])
    expect(names('Brickor')).toEqual(['1 × Brickor sexhörning 52 mm'])
    // Ett steg tillbaka tar både högen och leken.
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(async () => expect((await truth()).decks).toBeUndefined())
    expect((await truth()).setup.zones.some((z) => z.id === deck.zone)).toBe(false)
  })

  it('lägger leken i högen den valdes i', async () => {
    await openBord()
    addVia('Spelyta', '＋ Hög')
    await waitFor(() => expect(row('hog-1')).toBeTruthy())
    choose('Hög 1', 'Hög ur en lek')
    await waitFor(async () => expect((await truth()).decks?.[0]).toMatchObject({ zone: 'hog-1' }))
    expect((await truth()).setup.zones.filter((z) => z.kind === 'pile')).toHaveLength(3)
  })
})
