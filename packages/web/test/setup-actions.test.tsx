// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import type { ProjectDoc } from '@byd/server'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function openZone(id: string): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
  fireEvent.click(within(document.querySelector(`[data-zone-row="${id}"]`) as HTMLElement).getByRole('button', { name: /Draghög|Kasthög|Spelyta/ }))
}

const panel = () => document.querySelector('[data-zone-actions]') as HTMLElement

// En ny åtgärd med sitt enda steg, som är den mening rattarna sitter i.
function newStep(): HTMLElement {
  fireEvent.click(within(panel()).getByRole('button', { name: '＋ Åtgärd' }))
  return panel().querySelector('ol li') as HTMLElement
}

// Öppnar en ratt i meningen och lämnar tillbaka rutan den fällde ut.
function open(step: HTMLElement, label: string): HTMLElement {
  fireEvent.click(within(step).getByRole('button', { name: label }))
  return step.querySelector('.byd-slot-pop') as HTMLElement
}

// Raderna man väljer bland, som de står — sökfältet och rubrikerna räknas inte.
const rows = (box: HTMLElement): string[] => [...box.querySelectorAll('.byd-slot-list button')].map((b) => b.textContent ?? '')

// Raden med den texten. Den läses av texten och inte av rollens namn, för namnet är på väg att
// säga något annat än det som syns.
const rowNamed = (box: HTMLElement, text: string): HTMLElement =>
  [...box.querySelectorAll('.byd-slot-list button')].find((b) => b.textContent === text) as HTMLElement

// Ratten i den färdiga meningen som visar den texten — den stängda knappen och inte en rad i en
// ruta. Den läses av det som syns, för det som sägs är på väg att säga något mer.
const slotShowing = (step: HTMLElement, text: string): HTMLElement =>
  [...step.querySelectorAll('.byd-slot')].find((b) => b.textContent === text) as HTMLElement

// Hur många rader som är kopior av en annan rad: varje rad vars text förekommer mer än en gång,
// och alltså inte «en per dubblett».
const copies = (texts: string[]): number => texts.filter((text) => texts.indexOf(text) !== texts.lastIndexOf(text)).length

const SEATS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// Bordet prototypen mätte på (#255): åtta platser, och fyra familjer där designern gett flera
// platser samma namn — Hand, Min hög, Bortlagda kort, Askhögen. Två platser döljer tätheten på
// samma sätt som varje litet stickprov gör, och `Framför X` och `Räknare X` är med för att de bär
// platsen i namnet och därför ska lämnas i fred.
function eightSeats(): ProjectDoc {
  const doc = projectDoc()
  const at = (i: number, j: number) => ({ x: -500 + j * 180, y: -400 + i * 100, w: 160, h: 80, rot: 0 })
  const owned = SEATS.flatMap((seat, i) => [
    { id: `hand:${seat}`, kind: 'hand' as const, name: 'Hand', visibility: 'owner' as const, owner: seat, geometry: at(i, 0) },
    { id: `mine:${seat}`, kind: 'area' as const, name: `Framför ${seat}`, visibility: 'owner' as const, owner: seat, geometry: at(i, 1) },
    { id: `counters:${seat}`, kind: 'area' as const, name: `Räknare ${seat}`, visibility: 'all' as const, owner: seat, geometry: at(i, 2) },
    { id: `pile:${seat}`, kind: 'pile' as const, name: 'Min hög', visibility: 'owner' as const, owner: seat, geometry: at(i, 3) },
    ...(i < 3 ? [{ id: `out:${seat}`, kind: 'pile' as const, name: 'Bortlagda kort', visibility: 'all' as const, owner: seat, geometry: at(i, 4) }] : []),
    ...(i < 2 ? [{ id: `ash:${seat}`, kind: 'pile' as const, name: 'Askhögen', visibility: 'all' as const, owner: seat, geometry: at(i, 5) }] : []),
  ])
  return { ...doc, setup: { ...doc.setup, seats: [...SEATS], zones: [...doc.setup.zones.filter((z) => z.owner === undefined), ...owned] } }
}

// Vad rutan hade visat utan efterledet: zonernas namn, som de står i dokumentet.
const bareNames = (doc: ProjectDoc): string[] => doc.setup.zones.filter((z) => z.id !== 'draw').map((z) => z.name)

// Vilken sida av högen som är "bredvid den" är högens egen sak (K21, reviderar #87): den som
// lägger leken vid filtens vänsterkant vill inte ha sina kort utanför bordet. Valet sitter på
// zonen och inte i steget, för ringens Dra 1 och designerns egna åtgärder lägger samma kort.
describe('vilken sida av högen som är bredvid den', () => {
  it('väljs på högen, sparas med den, och står i meningen designern läser', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')

    const side = screen.getByLabelText('Bredvid högen för Draghög') as HTMLSelectElement
    expect(side.value).toBe('left')
    fireEvent.click(within(panel()).getByRole('button', { name: '＋ Åtgärd' }))
    expect(panel().textContent).toMatch(/till vänster om högen/)

    fireEvent.change(side, { target: { value: 'right' } })
    expect(panel().textContent).toMatch(/till höger om högen/)

    // Väntat fram och inte läst rakt av: knappen finns först när dokumentet är osparat, och det
    // blir det en tur genom klienten efter ändringen. Under full svit tappade den kapplöpningen
    // och provet sa «hittar ingen knapp Spara» — en tidsfråga och inte ett fel i det som mäts.
    fireEvent.click(await screen.findByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
    expect((await run.projects.load(run.projectId))?.setup.zones.find((z) => z.id === 'draw')?.beside).toBe('right')

    // Och tillbaka till vänster är «ingen egenskap alls» — också hos servern, som får valet över
    // tråden där `undefined` inte överlever (#331).
    fireEvent.change(screen.getByLabelText('Bredvid högen för Draghög'), { target: { value: 'left' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(3))
    expect((await run.projects.load(run.projectId))?.setup.zones.find((z) => z.id === 'draw')).not.toHaveProperty('beside')
  })
})

// Författandet är meningar och inte en blankett (prototypen 2026-09-15): det designern läser är
// det som kommer att hända, och rattarna sitter inne i texten.
describe('vad en zon frågar efter, skrivet som en mening', () => {
  it('säger att inga kort börjar i högen, och tar frågan när en kolumns värde väljs', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')

    expect(panel().textContent).toMatch(/börjar/)
    fireEvent.click(within(panel()).getByRole('button', { name: /inga kort/ }))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Drake' }))
    expect(panel().textContent).toMatch(/korten där title är Drake/)

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
    expect((await run.projects.load(run.projectId))?.setup.zones.find((z) => z.id === 'draw')?.fill).toEqual([{ field: 'title', is: ['Drake'] }])
  })
})

describe('en egen åtgärd på en hög, skriven som meningar', () => {
  it('får ett namn och ett steg, och steget läses som den mening det är', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')

    // En ny åtgärd har ett steg från början: en åtgärd utan steg är ingen åtgärd.
    fireEvent.click(within(panel()).getByRole('button', { name: '＋ Åtgärd' }))
    fireEvent.change(within(panel()).getByLabelText(/Namn för/), { target: { value: 'Vänd upp ett per spelare' } })
    // Sidan står utskriven och inte som ordet "bredvid": meningen säger vad som kommer att hända (K21).
    expect(panel().textContent).toMatch(/Ta 1 från högen och lägg dem som de ligger till vänster om högen/)

    // Antalet är en källa och inte ett tal: "ett per spelare" väljs inne i meningen.
    const step = panel().querySelector('ol li') as HTMLElement
    fireEvent.click(within(step).getByRole('button', { name: '1' }))
    fireEvent.click(within(step).getByRole('button', { name: 'ett per spelare' }))
    expect(panel().textContent).toMatch(/Ta ett per spelare från högen/)

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
    const zone = (await run.projects.load(run.projectId))?.setup.zones.find((z) => z.id === 'draw')
    expect(zone?.actions).toEqual([
      { id: expect.any(String), label: 'Vänd upp ett per spelare', steps: [{ v: 'split', count: { of: 'seats' }, to: { at: 'beside' }, face: 'keep' }] },
    ])
  })

  it('erbjuds bara på högar — en yta och en hand har ingen ring att hänga dem i', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('table')
    expect(document.querySelector('[data-zone-actions]')).toBeNull()
  })
})

// Ägaren i platsrutan och antalsrutan (#255). Åtta platser ger åtta zoner som heter «Hand», och
// raderna man väljer bland blir kopior av varandra: prototypen mätte 21 av 47 rader vid åtta
// platser. Efterledet är zonlistans egen bricka — `Hand` med ett dämpat `A` efter sig — och
// sammansättningen är katalogens, aldrig ytans (A4).
describe('vems zon en rad i rutan står för', () => {
  it('skiljer två zoner med samma namn åt i platsrutan', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')
    const step = newStep()

    const box = open(step, 'till vänster om högen')
    expect(rows(box)).toContain('Hand A')
    expect(rows(box)).toContain('Hand B')
  })

  // Antalsrutan nästlar samma hål in i sin egen mening, så en nyckel räcker för båda rutorna.
  it('skiljer dem åt i antalsrutan också', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')
    const step = newStep()

    const box = open(step, '1')
    expect(rows(box)).toContain('så många som ligger i Hand A')
    expect(rows(box)).toContain('så många som ligger i Hand B')
  })

  // Skalan är inte platsantalet utan varje familj designern gett samma namn vid flera platser.
  it('ger åtta platser åtskiljbara rader, inte åtta likadana', async () => {
    const doc = eightSeats()
    await run.projects.create(run.projectId, doc)
    await openZone('draw')
    const step = newStep()

    const box = open(step, 'till vänster om högen')
    // Kontrollen, och hela skälet att provet har åtta platser: utan efterledet är 21 av raderna
    // kopior av en annan rad — 8 «Hand», 8 «Min hög», 3 «Bortlagda kort», 2 «Askhögen».
    expect(copies(bareNames(doc))).toBe(21)
    expect(copies(rows(box))).toBe(0)
    // Och rutan visar dem allihop: zonerna plus högens och händernas tre egna rader.
    expect(rows(box)).toHaveLength(bareNames(doc).length + 3)
  })

  // Ordgränsregeln, som är skillnaden mot en `startsWith` någon annars hade skrivit.
  it('lämnar ett namn som redan bär platsen i fred, men inte ett ord som råkar innehålla bokstaven', async () => {
    await run.projects.create(run.projectId, eightSeats())
    await openZone('draw')
    const step = newStep()

    const shown = rows(open(step, 'till vänster om högen'))
    // `Framför A` bär sitt `A` som ett eget ord och får inget till.
    expect(shown).toContain('Framför A')
    expect(shown).not.toContain('Framför A A')
    // Det `A` som står inuti `Askhögen` är inget ord, så den zonen får efterledet.
    expect(shown).toContain('Askhögen A')
    expect(shown).toContain('Askhögen B')
  })

  // Efterledet står i `words` och inte bara i märkningen, för det är det söket läser (#230). Det
  // är vinsten: rutan får en väg till en enskild hand som inte fanns innan.
  it('låter sökningen nå en enskild hand, som «hand a» inte gjorde', async () => {
    await run.projects.create(run.projectId, eightSeats())
    await openZone('draw')
    const step = newStep()

    const box = open(step, 'till vänster om högen')
    const find = within(box).getByLabelText('Sök bland valen')
    // Kontrollen: «hand» hittar lika mycket som förut — de åtta händerna och meningens två
    // egna rader om händer.
    fireEvent.change(find, { target: { value: 'hand' } })
    expect(rows(box)).toHaveLength(10)
    // Och «hand a», som gav noll träffar, ger nu exakt en.
    fireEvent.change(find, { target: { value: 'hand a' } })
    expect(rows(box)).toEqual(['Hand A'])
  })

  // Formen är zonlistans egen bricka och inte bara en bokstav till i texten: ramen säger att
  // bokstaven är verktygets ord, så att `Hand A` inte blir omöjlig att skilja från `Framför A`,
  // som designern verkligen döpt en zon till (A4).
  it('skriver platsen som en bricka efter namnet, inte som en del av namnet', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')
    const step = newStep()

    const box = open(step, 'till vänster om högen')
    expect(rowNamed(box, 'Hand A').querySelector('em')?.textContent).toBe('A')
    // Och zonen som ingen äger bär ingen bricka alls.
    expect(rowNamed(box, 'Kasthög').querySelector('em')).toBeNull()

    // Antalsrutan bär brickan inne i sin egen mening, på samma zon.
    const amounts = open(step, '1')
    expect(rowNamed(amounts, 'så många som ligger i Hand A').querySelector('em')?.textContent).toBe('A')
  })

  // Örat hör samma skillnad som ögat ser (L12), och det som syns står först i det som sägs: en
  // röststyrd användare som säger «Hand A» — det hon läser — får träff (WCAG 2.5.3). Priset är en
  // lätt stel ordföljd, taget medvetet framför «Hand, plats A» som läser bättre men brister.
  it('läses upp som «Hand A, plats», med det synliga först', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')
    const step = newStep()

    const box = open(step, 'till vänster om högen')
    expect(within(box).getByRole('button', { name: 'Hand A, plats' })).toBe(rowNamed(box, 'Hand A'))
    expect(within(box).getByRole('button', { name: 'Hand B, plats' })).toBe(rowNamed(box, 'Hand B'))
    // Zonen som ingen äger har inget att lägga till: den heter det den heter.
    expect(within(box).getByRole('button', { name: 'Kasthög' })).toBe(rowNamed(box, 'Kasthög'))

    const amounts = open(step, '1')
    expect(within(amounts).getByRole('button', { name: 'så många som ligger i Hand A, plats' })).toBe(rowNamed(amounts, 'så många som ligger i Hand A'))
  })
})

// Och samma sak i den färdiga, stängda meningen (#269). #255 gav raden man väljer bland sitt
// efterled och lämnade meningen orörd; då läste den färdiga regeln «i Hand» vilken av åtta
// händer designern än valt. Prototypen mätte följden: 58 % av de meningar som går att skriva i
// ett spel med åtta platser går inte att läsa tillbaka till det som valdes, och K21 säger att
// meningen *är* specifikationen — det finns inget annat att kontrollera den mot.
//
// Formen är rutans egen bricka, buren av samma katalognyckel: beställarens beslut 2026-09-19.
describe('vems zon den färdiga meningen talar om', () => {
  it('bär platsen i platshålet: meningen läser «i Hand A» och inte «i Hand»', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')
    const step = newStep()

    fireEvent.click(rowNamed(open(step, 'till vänster om högen'), 'Hand A'))

    expect(step.textContent).toContain('Ta 1 från högen och lägg dem som de ligger i Hand A')
    expect(slotShowing(step, 'i Hand A').querySelector('em')?.textContent).toBe('A')
  })

  // Antalshålet är samma hål en gång till: det nästlar samma zon in i sin egen mening, och det
  // var lika tvetydigt — «så många som ligger i Hand» sa inte vilken av åtta heller.
  it('bär platsen i antalshålet också: «så många som ligger i Hand A»', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')
    const step = newStep()

    fireEvent.click(rowNamed(open(step, '1'), 'så många som ligger i Hand A'))

    expect(step.textContent).toContain('Ta så många som ligger i Hand A från högen')
    expect(slotShowing(step, 'så många som ligger i Hand A').querySelector('em')?.textContent).toBe('A')
  })

  // Samma fälla som i rutan, och samma svar (#255): brickan säger med sin ram vad bokstaven är,
  // och en uppläsning hör ingen ram. Ordet «plats» måste alltså in i knappens namn — och sist,
  // för det synliga måste stå i det upplästa: en röststyrd användare som säger «i Hand A», det
  // hon läser, får annars ingen träff (WCAG 2.5.3).
  it('läses upp som «i Hand A, plats», med det synliga först', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')
    const step = newStep()

    fireEvent.click(rowNamed(open(step, 'till vänster om högen'), 'Hand A'))
    fireEvent.click(rowNamed(open(step, '1'), 'så många som ligger i Hand A'))

    expect(within(step).getByRole('button', { name: 'i Hand A, plats' })).toBe(slotShowing(step, 'i Hand A'))
    expect(within(step).getByRole('button', { name: 'så många som ligger i Hand A, plats' })).toBe(slotShowing(step, 'så många som ligger i Hand A'))
  })

  // Regeln är alltid, **utom** när `ownerOf` säger att namnet redan bär platsen. Den sitter före
  // formen och inte i den: det är samma ordgränsregel rutan lyder, och den — och inte en
  // `startsWith` — är skälet att `Framför A` står i fred medan `Askhögen A` får sin bricka.
  it('lämnar en zon vars namn redan bär platsen utan bricka: «i Framför A», aldrig «i Framför A A»', async () => {
    await run.projects.create(run.projectId, eightSeats())
    await openZone('draw')
    const step = newStep()

    fireEvent.click(rowNamed(open(step, 'till vänster om högen'), 'Framför A'))

    expect(step.textContent).toContain('lägg dem som de ligger i Framför A')
    expect(step.textContent).not.toContain('Framför A A')
    expect(slotShowing(step, 'i Framför A').querySelector('em')).toBeNull()
    // Och det `A` som står inuti `Askhögen` är inget ord, så den zonen bär sin bricka i meningen.
    fireEvent.click(rowNamed(open(step, 'i Framför A'), 'Askhögen A'))
    expect(slotShowing(step, 'i Askhögen A').querySelector('em')?.textContent).toBe('A')
  })

  // Och en zon som ingen äger är oförändrad: den heter det den heter, den bär ingen bricka, och
  // den har inget att lägga till i det upplästa namnet heller.
  it('lämnar en zon utan ägare i fred: «i Kasthög», utan bricka och utan efterled', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')
    const step = newStep()

    fireEvent.click(rowNamed(open(step, 'till vänster om högen'), 'Kasthög'))

    expect(step.textContent).toContain('lägg dem som de ligger i Kasthög')
    expect(slotShowing(step, 'i Kasthög').querySelector('em')).toBeNull()
    expect(within(step).getByRole('button', { name: 'i Kasthög' })).toBe(slotShowing(step, 'i Kasthög'))
  })
})

// Vägen in i panelen med tangentbordet (#330, jfr #133).
//
// Panelen står numera i tredje kolumnen (L29), alltså efter filten i tabbordningen: den som valt
// en zon med tangentbordet står kvar på raden i listan och har hela mittkolumnen emellan sig och
// det hon just bad om. Fokus flyttar därför in när panelen öppnas, och krysset lämnar tillbaka
// det till raden — samma väg tillbaka som #300 redan byggde.
//
// Fokus landar på panelen själv och inte på krysset i huvudet: det första en tangentbordsanvändare
// möter ska vara vad panelen är, inte vägen ut ur den, och ett Enter som landat på krysset hade
// stängt det som just öppnades.
describe('tangentbordets väg in i högens panel (#330)', () => {
  it('flyttar fokus till panelen när den öppnas, och panelen säger vems handlingar den bär', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')

    expect(document.activeElement).toBe(panel())
    expect(panel().getAttribute('aria-label')).toBe('Vad Draghög börjar med och vad den kan')
  })

  it('lämnar tillbaka fokus till zonens rad när panelen stängs', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')
    expect(document.activeElement).toBe(panel())

    fireEvent.click(within(panel()).getByRole('button', { name: 'Stäng panel' }))

    expect(document.activeElement).toBe(document.querySelector('[data-zone-row="draw"] .byd-setup-name'))
  })
})

// Krysset som lägger undan panelen (#300). Meningarna låg över filtens nederkant och tog upp till
// 45 % av den (#218), så den som ville se bordet under dem måste ha en väg ut — och vägen ut är
// panelens och inte zonens: den som stänger blanketten har inte bett om att bli av med högen.
// Sedan #330 ligger panelen inte längre över filten, men vägen ut är densamma.
describe('krysset som stänger högens panel (#300)', () => {
  it('stänger panelen och heter det den gör: Stäng panel', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')

    fireEvent.click(within(panel()).getByRole('button', { name: 'Stäng panel' }))
    expect(document.querySelector('[data-zone-actions]')).toBeNull()
  })

  // Tangentbordet får inte landa på ingenting, och inte heller på handtaget på filten: handtaget
  // väljer zonen redan när det får fokus, så vägen ut hade lett rakt in igen. Raden i listan är
  // zonens kontroll som står kvar, och den är dessutom det som öppnar panelen på nytt.
  it('lämnar fokus på zonens rad i listan, och panelen stängd', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')

    fireEvent.click(within(panel()).getByRole('button', { name: 'Stäng panel' }))

    const row = document.querySelector('[data-zone-row="draw"] .byd-setup-name')
    expect(document.activeElement).toBe(row)
    expect(document.querySelector('[data-zone-actions]')).toBeNull()
  })

  // Det som krysset uttryckligen inte är: receptets gamla kryss, som stängde av zonen och la
  // tillbaka den nästa gång någon rörde den (B5). Det här lägger undan en blankett.
  it('lämnar högen och det som redan skrivits i fred: samma rad igen visar samma värden', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')

    fireEvent.click(within(panel()).getByRole('button', { name: '＋ Åtgärd' }))
    fireEvent.change(within(panel()).getByLabelText(/Namn för/), { target: { value: 'Lägg upp marknaden' } })

    fireEvent.click(within(panel()).getByRole('button', { name: 'Stäng panel' }))
    expect(document.querySelector('[data-zone-actions]')).toBeNull()
    // Högen står kvar, både på filten och i listan.
    expect(document.querySelector('[data-zone-handle="draw"]')).not.toBeNull()

    fireEvent.click(document.querySelector('[data-zone-row="draw"] .byd-setup-name') as HTMLElement)
    expect((within(panel()).getByLabelText(/Namn för/) as HTMLInputElement).value).toBe('Lägg upp marknaden')
  })

  // Escape är samma väg ut som krysset, för det är kontraktet varje yta som står över arbetet
  // bär (L9, C4): det som öppnats stängs med Escape och lämnar tillbaka fokus. Panelen ligger över
  // filtens nederkant och är därmed precis en sådan yta.
  it('stängs med Escape, och lämnar fokus på zonens rad precis som krysset', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(document.querySelector('[data-zone-actions]')).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('[data-zone-row="draw"] .byd-setup-name'))
  })

  // Ett Escape stänger en sak i taget, och ordningen är dörrmekanismens och inte
  // registreringsordningens (#152). Rutan i meningen är själv en dörr, så den sist öppnade får
  // trycket: först rutan, sedan panelen under den. Vore rutan bara en handpåläggning på sig själv
  // hade panelens dörr hört samma tryck, och ett enda Escape hade stängt båda.
  it('stänger den öppna rutan på första Escape och panelen först på nästa', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')
    const step = newStep()
    expect(open(step, 'till vänster om högen')).not.toBeNull()

    fireEvent.keyDown(document, { key: 'Escape' })
    // Panelen står kvar under rutan, och rutan är den som stängdes.
    expect(document.querySelector('[data-zone-actions]')).not.toBeNull()
    expect(panel().querySelector('.byd-slot-pop')).toBeNull()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('[data-zone-actions]')).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('[data-zone-row="draw"] .byd-setup-name'))
  })

  // Och varför inget annat bord och ingen annan session märker stängningen: den är ingen ändring.
  // Ingenting av den når dokumentet, så det finns ingenting att skicka vidare — leken står kvar
  // som sparad, och revisionen på servern rör sig inte.
  it('skriver ingenting: leken är fortfarande sparad och servern har samma revision', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')
    expect(screen.getByText('Sparat')).toBeDefined()

    fireEvent.click(within(panel()).getByRole('button', { name: 'Stäng panel' }))

    expect(screen.getByText('Sparat')).toBeDefined()
    expect(screen.queryByText('Osparat')).toBeNull()
    expect((await run.projects.load(run.projectId))?.rev).toBe(1)
  })
})
