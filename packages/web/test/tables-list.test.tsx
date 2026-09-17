// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { WebSocket as WsClient } from 'ws'
import { EditorPage } from '../src/editor/EditorPage.js'
import { TableClient, useWebSocketImplementation, type WebSocketCtor } from '../src/client.js'
import { projectDoc } from './project-doc.js'
import { asSeat, asTable, registerRoom, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Vilka bord som faktiskt öppnat en anslutning, räknat på trafiken och inte på skärmen (#176). Det
// är hela poängen med issuet: fem rader var fem levande WebSockets och fem renderingar, oavsett om
// raden syntes. En rad som inte ritas ska inte höras av på nätet heller.
let dialled: string[] = []
class Counting extends WsClient {
  constructor(url: string) {
    super(url)
    dialled.push(url)
  }
}
const connectedTo = (id: string) => dialled.filter((url) => url.includes(`/sessions/${id}`)).length

let run: Running
beforeEach(async () => {
  run = await startServer()
  dialled = []
  useWebSocketImplementation(Counting as unknown as WebSocketCtor)
})
afterEach(async () => {
  useWebSocketImplementation(WsClient as unknown as WebSocketCtor)
  await run.stop()
})

// Ett bord av det här spelet, startat som editorn startar ett.
async function startTable(): Promise<string> {
  const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
  if (!res.ok) throw new Error(`could not start a table: ${res.status}`)
  const made = (await res.json()) as { id: string; code: string; hostKey: string }
  registerRoom(made.id, made)
  return made.id
}

// Ett bord som någon har spelat: ett drag i loggen, vilket är det enda som skiljer ett bord som
// spelas från ett som bara startats.
async function play(id: string): Promise<void> {
  const ada = TableClient.connect(await asSeat(run, id, 'A', 'Ada'))
  await ada.ready()
  await ada.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
  await waitFor(async () => expect((await run.store.read(id)).length).toBeGreaterThan(0))
  ada.close()
}

// Ett bord vars logg är låst (C9): avslutat, kvar att läsas, aldrig att spelas.
async function end(id: string): Promise<void> {
  const table = TableClient.connect(await asTable(run, id))
  await table.ready()
  await table.send({ v: 'session.end' })
  await waitFor(async () => expect((await run.store.read(id)).map((l) => l.intent.v)).toEqual(['session.end']))
  table.close()
}

async function openTables(): Promise<void> {
  const user = userEvent.setup()
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await user.click(screen.getByRole('tab', { name: 'Bord' }))
}

const list = async () => await screen.findByRole('list', { name: 'Spelets bord' })
// Vilka bord som står i spalten, i den ordning de står där.
const shown = async () => [...(await list()).querySelectorAll('li[data-table]')].map((el) => el.getAttribute('data-table'))
// Ett bords rad, när den står i listan: listan är serverns svar och kommer när den kommer, så den
// väntas ut i stället för att läsas ur den ruta råkade vara ritad.
const rowOf = async (id: string): Promise<HTMLElement> => {
  await list()
  return await waitFor(() => {
    const row = document.querySelector(`li[data-table="${id}"]`)
    if (row === null) throw new Error(`ingen rad för bordet ${id}`)
    return row as HTMLElement
  })
}
// Spalten uppifrån och ner: ett bord står som sitt id, en hopfällbar grupp som det raden säger.
const column = async () => [...(await list()).children].map((li) => li.querySelector(':scope > button')?.textContent ?? li.getAttribute('data-table'))

// Granskningens mätning: fem bord, ett spelat och fyra som startades och aldrig rördes, gav 2 350 px
// och 85 fokuserbara kontroller (#176). Ett bord är en rad, och de aldrig spelade ligger bakom en
// rad som säger hur många de är — utan att kopplas upp innan någon ber om dem.
describe('bordslistan (#176): en rad per bord', () => {
  it('ger fem rader vid fem bord, och kopplar bara upp de rader som syns', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    const played = await startTable()
    const cold = [await startTable(), await startTable(), await startTable(), await startTable()]
    await play(played)
    dialled = []

    await openTables()

    // Det som spelas står i spalten; de fyra som aldrig rörts ligger bakom en enda rad.
    expect(await shown()).toEqual([played])
    const fold = within(await list()).getByRole('button', { name: 'Startade, aldrig spelade 4' })
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    // Och de är tysta på nätet: bara det bord som ritas har en anslutning.
    await waitFor(() => expect(connectedTo(played)).toBe(1))
    expect(cold.map(connectedTo)).toEqual([0, 0, 0, 0])

    await user.click(fold)

    // Nyast först, som servern svarar; grupperna ändrar var ett bord står, aldrig ordningen inom en.
    expect(await shown()).toEqual([played, ...[...cold].reverse()])
    await waitFor(() => expect(cold.map(connectedTo)).toEqual([1, 1, 1, 1]))
  })
})

// Beställarens beslut (#176): avslutade bord får en egen hopfällbar grupp, skild från de startade
// men aldrig rörda. Det är två olika fakta — det ena är färdigt, det andra väntar — och en avslutad
// session är dessutom där enkätsvaren finns (G3), så den ska inte ligga bland bord där ingenting
// hänt. Ordningen i spalten blir: bord som spelas, sedan de aldrig rörda, sedan de avslutade.
describe('bordslistan (#176): ordningen i spalten', () => {
  it('sätter det spelade bordet före det ospelade, och håller de avslutade i en grupp för sig', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    const closed = await startTable()
    await end(closed)
    const cold = await startTable()
    const live = await startTable()
    await play(live)

    await openTables()

    // Det som spelas är det man letar efter, och det är det enda som står framme.
    expect(await column()).toEqual([live, 'Startade, aldrig spelade 1', 'Avslutade 1'])

    await user.click(screen.getByRole('button', { name: 'Startade, aldrig spelade 1' }))
    await user.click(screen.getByRole('button', { name: 'Avslutade 1' }))

    expect(await shown()).toEqual([live, cold, closed])
    // Och grupperna är verkligen var sin: det avslutade bordet ligger inte bland dem där
    // ingenting hänt.
    expect([...within(screen.getByRole('list', { name: 'Startade, aldrig spelade' })).getAllByRole('listitem')].map((li) => li.getAttribute('data-table'))).toEqual([cold])
    expect([...within(screen.getByRole('list', { name: 'Avslutade' })).getAllByRole('listitem')].map((li) => li.getAttribute('data-table'))).toEqual([closed])

    // Och det syns i raden vilket som är vilket, inte bara var raden hamnade.
    expect((await rowOf(live)).textContent).toContain('senaste drag')
    expect((await rowOf(cold)).textContent).toContain('inga drag än')
    expect((await rowOf(closed)).textContent).toContain('avslutat')
  })
})

// Beställarens beslut (#176): vägen som står framme i raden är «Spela härifrån», inte «Öppna
// TV-vyn» som prototypen ritade. Designern sitter oftast ensam när hon playtestar, och då är TV:n
// ett extra steg. De fem andra vägarna, TV-vyn inräknad, ligger i radens meny.
describe('bordslistan (#176): en väg in står framme, fem ligger i menyn', () => {
  it('ställer «Spela härifrån» i raden och håller de andra fem bakom menyns knapp', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    const live = await startTable()
    await play(live)
    await openTables()
    const name = live.slice(0, 8)
    const row = within(await rowOf(live))

    // Platsen att sätta sig på kommer ur bordet självt, så vägen är komplett först när det svarat.
    await row.findByRole('link', { name: `Spela härifrån för bordet ${name} (öppnas i ny flik)` })
    expect(row.getAllByRole('link')).toHaveLength(1)
    expect(row.queryByRole('button', { name: `QR för telefoner ${name}` })).toBeNull()
    expect(row.queryByRole('button', { name: `Avsluta bordet ${name}` })).toBeNull()

    const more = row.getByRole('button', { name: `Fler vägar in till bordet ${name}` })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    await user.click(more)

    expect(more.getAttribute('aria-expanded')).toBe('true')
    const menu = within(row.getByRole('group', { name: `Vägar in till bordet ${name}` }))
    expect(menu.getAllByRole('link').map((a) => a.getAttribute('aria-label'))).toEqual([
      `Öppna TV-vyn för bordet ${name} (öppnas i ny flik)`,
      `Bordsläge för bordet ${name} (öppnas i ny flik)`,
      `Titta på för bordet ${name} (öppnas i ny flik)`,
    ])
    expect(menu.getAllByRole('button').map((b) => b.textContent)).toEqual([`QR för telefoner ${name}`, `Avsluta bordet ${name}`])
    // `Avsluta bordet` (C9) är inte en väg in och står inte bland dem: en linje skiljer den från
    // resten, och den står sist.
    expect(menu.getByRole('separator').nextElementSibling).toBe(menu.getByRole('button', { name: `Avsluta bordet ${name}` }))
  })

  it('stänger menyn med Escape och lämnar fokus på knappen som öppnade den', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    const live = await startTable()
    await play(live)
    await openTables()
    const name = live.slice(0, 8)
    const row = within(await rowOf(live))
    const more = await row.findByRole('button', { name: `Fler vägar in till bordet ${name}` })

    await user.click(more)
    expect(row.getByRole('group', { name: `Vägar in till bordet ${name}` })).toBeTruthy()

    await user.keyboard('{Escape}')

    expect(row.queryByRole('group', { name: `Vägar in till bordet ${name}` })).toBeNull()
    expect(more.getAttribute('aria-expanded')).toBe('false')
    await waitFor(() => expect(document.activeElement).toBe(more))
  })
})

// Koden är gjord för att hållas upp mot en kamera, och en spalt full av koder går inte att läsa.
// Den öppnas per bord som förut (#19) — och nu när den öppnas ur radens meny är «aldrig flera
// samtidigt» listans sak att hålla reda på, inte radens (#176).
describe('bordslistan (#176): QR-koden för telefonerna', () => {
  it('visar koden för ett bord i taget och tar undan den förra', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    const one = await startTable()
    const other = await startTable()
    await play(one)
    await play(other)
    await openTables()

    const showQr = async (id: string) => {
      await user.click(await within(await rowOf(id)).findByRole('button', { name: `Fler vägar in till bordet ${id.slice(0, 8)}` }))
      await user.click(within(await rowOf(id)).getByRole('button', { name: `QR för telefoner ${id.slice(0, 8)}` }))
    }

    await showQr(one)
    expect(await within(await rowOf(one)).findByRole('img')).toBeTruthy()

    await showQr(other)

    expect(await within(await rowOf(other)).findByRole('img')).toBeTruthy()
    expect(within(await rowOf(one)).queryByRole('img')).toBeNull()
  })
})

// Ett avslutat bord kan läsas men aldrig spelas (C9), så vägen som står framme kan inte vara den
// som sätter någon vid det. Då står TV-vyn där i stället, och menyn har varken «Spela härifrån»
// eller «Avsluta bordet» kvar att erbjuda.
describe('bordslistan (#176): raden för ett avslutat bord', () => {
  it('ställer TV-vyn framme i stället, och har ingen väg som sätter någon vid bordet', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    const closed = await startTable()
    await end(closed)
    await openTables()
    const name = closed.slice(0, 8)

    await user.click(await screen.findByRole('button', { name: 'Avslutade 1' }))
    const row = within(await rowOf(closed))

    expect(row.getAllByRole('link').map((a) => a.getAttribute('aria-label'))).toEqual([`Öppna TV-vyn för bordet ${name} (öppnas i ny flik)`])
    expect(row.getByText('avslutat')).toBeTruthy()

    await user.click(row.getByRole('button', { name: `Fler vägar in till bordet ${name}` }))

    const menu = within(row.getByRole('group', { name: `Vägar in till bordet ${name}` }))
    expect(menu.getAllByRole('link').map((a) => a.textContent)).toEqual(['Bordsläge', 'Titta på'])
    expect(menu.getAllByRole('button').map((b) => b.textContent)).toEqual([`QR för telefoner ${name}`])
  })
})
