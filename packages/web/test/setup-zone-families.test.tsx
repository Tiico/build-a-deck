// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
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

async function openBord(): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
}

// Åtta platser med allt tre: en hand, en yta framför sig och en räknarzon — tjugofyra zoner, som
// är precis det tal granskningen mätte listan på (#175).
function eightSeatsWithEverything(): void {
  fireEvent.click(screen.getByRole('button', { name: '8' }))
  fireEvent.click(screen.getByRole('button', { name: '＋ Yta per plats' }))
  fireEvent.click(screen.getByRole('button', { name: '＋ Räknare' }))
  fireEvent.click(screen.getByRole('button', { name: '＋ Räknarzon per plats' }))
}

const seatsList = () => screen.getByRole('list', { name: 'Vid platserna' })
// Vad som faktiskt står i listan vid platserna, rad för rad på den översta nivån.
const seatRows = () => [...seatsList().querySelectorAll(':scope > li')].map((li) => (li.querySelector('.byd-setup-name') as HTMLElement).textContent)
// Raderna i en utfälld familj, i platsordning.
const inFamily = (name: string) => [...screen.getByRole('list', { name }).querySelectorAll(':scope > li')].map((li) => (li.querySelector('.byd-setup-name') as HTMLElement).textContent)
const handles = () => [...document.querySelectorAll('[data-zone-handle]')].map((el) => el.getAttribute('data-zone-handle'))

// Designern fattade tre beslut — en hand, en yta och en räknarzon per plats — och listan svarade
// med tjugofyra rader (#175). Listan är bordets innehållsförteckning: zoner som delar roll och
// namnmall är en rad med hur många platser som har dem. Filten grupperar aldrig.
describe('zonlistan vid platserna (#175): familjen är raden', () => {
  it('ger tre rader vid åtta platser och inte tjugofyra, medan filten ritar var och en för sig', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    eightSeatsWithEverything()

    expect(seatRows()).toEqual(['Hand 8 platser', 'Framför 8 platser', 'Räknare 8 platser'])
    // Modellen är orörd: var och en av de tjugofyra zonerna ligger kvar där den ligger, med sitt
    // eget handtag på filten.
    expect(handles().filter((id) => id !== null && /^(hand|mine|counters):/.test(id))).toHaveLength(24)
  })

  // Familjen är innehållsförteckningen; den enskilda zonen nås genom att fälla ut den. Och det som
  // går att göra med en zon går att göra där: välja den, byta namn på den, ta bort den.
  it('fäller ut en rad per plats, och lämnar familjen med sju när en av dem tas bort', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    eightSeatsWithEverything()

    fireEvent.click(screen.getByRole('button', { name: 'Framför 8 platser' }))
    expect(inFamily('Framför')).toEqual(['Framför A A', 'Framför B B', 'Framför C C', 'Framför D D', 'Framför E E', 'Framför F F', 'Framför G G', 'Framför H H'])

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Framför C' }))
    expect(inFamily('Framför')).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Framför 7 av 8 platser' })).toBeTruthy()
    // Och zonen är borta ur bordet, inte bara ur listan.
    expect(handles()).not.toContain('mine:C')
  })

  // En familj är samma zon vid var sin plats, och det är receptets id som avgör det: `mine:A` hör
  // hemma i Framför, `yta-1` gör det inte — hur den än heter och vems den än är. En zon designern
  // lagt vid en plats är en zon vid en plats, inte en av åtta.
  it('låter en zon som inte är per plats stå som sin egen rad, också när den bär familjens namn', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    fireEvent.click(screen.getByRole('button', { name: '＋ Yta per plats' }))

    fireEvent.click(screen.getByRole('button', { name: '＋ Yta' }))
    fireEvent.change(screen.getByLabelText('Namn för Yta 1'), { target: { value: 'Framför A' } })
    fireEvent.change(screen.getByLabelText('Ägare för Framför A'), { target: { value: 'A' } })

    expect(seatRows()).toEqual(['Hand 2 platser', 'Framför 2 platser', 'Framför A A'])
  })

  // Filten och listan är en och samma markering (B5, K2). Tar man tag i en zon på filten ska dess
  // rad finnas att markera — en markering inne i en hopfälld familj vore en markering ingen ser.
  it('fäller ut familjen och öppnar raden för den zon som väljs på filten', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    fireEvent.click(screen.getByRole('button', { name: '＋ Yta per plats' }))
    expect(screen.getByRole('button', { name: 'Framför 2 platser' }).getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(document.querySelector('[data-zone-handle="mine:B"]') as HTMLElement)

    expect(screen.getByRole('button', { name: 'Framför 2 platser' }).getAttribute('aria-expanded')).toBe('true')
    const row = document.querySelector('[data-zone-row="mine:B"]') as HTMLElement
    expect(row.getAttribute('data-open')).toBe('true')
    expect(within(row).getByLabelText('Namn för Framför B')).toBeTruthy()
  })
})

// Beställarens beslut (#175): handen är en familjerad med antal, som de andra. Listan är bordets
// innehållsförteckning, och en yta som tiger om det som inte går att ändra gör det svårt att se
// när det är fel — den dagen en plats saknar sin hand är det listan som ska visa det.
describe('zonlistan vid platserna (#175): handen räknas som de andra', () => {
  it('står som en familjerad med antal, och säger på raden när en plats saknar sin hand', async () => {
    const doc = projectDoc()
    await run.projects.create(run.projectId, { ...doc, setup: { ...doc.setup, zones: doc.setup.zones.filter((z) => z.id !== 'hand:B') } })
    await openBord()

    expect(seatRows()).toEqual(['Hand 1 av 2 platser'])
    // Och den står fast av sitt eget skäl: en plats *är* en hand (C3), så raden bär inget ×.
    expect(screen.queryByRole('button', { name: /^Ta bort Hand/ })).toBeNull()
    expect(within(seatsList()).getByLabelText('En plats är en hand. Ta bort platsen i stället, så följer handen med.')).toBeTruthy()
  })
})

// Ett bord med tre platser vars ytor inte är lika: två heter det receptet döpte dem till, en har
// designern döpt om. Familjen är densamma — det är namnmallen som skiljer sig.
function threeSeatsOneRenamed(): ReturnType<typeof projectDoc> {
  const doc = projectDoc()
  const at = (y: number) => ({ x: -300, y, w: 380, h: 90, rot: 0 })
  return {
    ...doc,
    setup: {
      ...doc.setup,
      seats: ['A', 'B', 'C'],
      zones: [
        ...doc.setup.zones,
        { id: 'hand:C', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'C', returnTo: 'draw', geometry: at(-100) },
        { id: 'mine:A', kind: 'area', name: 'Framför A', visibility: 'owner', owner: 'A', geometry: at(220) },
        { id: 'mine:B', kind: 'area', name: 'Framför B', visibility: 'owner', owner: 'B', geometry: at(-310) },
        { id: 'mine:C', kind: 'area', name: 'Bordskanten', visibility: 'owner', owner: 'C', geometry: at(60) },
      ],
    },
  }
}

// Beställarens beslut (#175): en familj där platserna inte är lika säger det på familjeraden och
// fälls inte ut av sig själv. En lista som ändrar form utan att någon rört den är svår att lita på,
// och avvikelsen är en upplysning innan den är ett ärende — den som vill se vilken fäller ut själv.
describe('zonlistan vid platserna (#175): en familj vars platser inte är lika', () => {
  it('säger på familjeraden hur många som avviker, utan att öppna sig själv', async () => {
    await run.projects.create(run.projectId, threeSeatsOneRenamed())
    await openBord()

    expect(seatRows()).toEqual(['Hand 3 platser', 'Framför 3 platser 1 avviker'])
    // Hopfälld: ingen enskild plats står i listan förrän någon ber om det.
    expect(screen.getByRole('button', { name: 'Framför 3 platser 1 avviker' }).getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('[data-zone-row="mine:C"]')).toBeNull()

    // Och den som vill se vilken fäller ut raden själv.
    fireEvent.click(screen.getByRole('button', { name: 'Framför 3 platser 1 avviker' }))
    expect(inFamily('Framför')).toEqual(['Framför A A', 'Framför B B', 'Bordskanten C'])
  })

  it('räknar om avvikelsen när ett namn skrivs tillbaka', async () => {
    await run.projects.create(run.projectId, threeSeatsOneRenamed())
    await openBord()
    fireEvent.click(screen.getByRole('button', { name: 'Framför 3 platser 1 avviker' }))

    fireEvent.click(within(document.querySelector('[data-zone-row="mine:C"]') as HTMLElement).getByRole('button', { name: 'Bordskanten C' }))
    fireEvent.change(screen.getByLabelText('Namn för Bordskanten'), { target: { value: 'Framför C' } })

    expect(screen.getByRole('button', { name: 'Framför 3 platser' })).toBeTruthy()
  })
})

// Tangentbord och skärmläsare (#175): familjeraden är en knapp som säger om den är utfälld, och
// utfällningen är en lista vars namn säger zonen medan varje rad säger platsen.
describe('zonlistan vid platserna (#175): familjeraden under tangentbord och skärmläsare', () => {
  it('fälls ut från tangentbordet, säger att den är det, och namnger både zon och plats', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    fireEvent.click(screen.getByRole('button', { name: '＋ Yta per plats' }))

    const head = screen.getByRole('button', { name: 'Framför 2 platser' })
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('list', { name: 'Framför' })).toBeNull()

    head.focus()
    await userEvent.keyboard('{Enter}')
    expect(head.getAttribute('aria-expanded')).toBe('true')

    const opened = screen.getByRole('list', { name: 'Framför' })
    expect(within(opened).getByRole('button', { name: 'Framför A A' })).toBeTruthy()
    expect(within(opened).getByRole('button', { name: 'Ta bort Framför B' })).toBeTruthy()

    // Samma tangent fäller ihop den igen, och fokus står kvar där handen hade det.
    await userEvent.keyboard('{Enter}')
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(head)
  })
})
