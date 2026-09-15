// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

const rows = () => [...document.querySelectorAll('[data-zone-row]')].map((el) => el.getAttribute('data-zone-row'))
const row = (id: string) => document.querySelector(`[data-zone-row="${id}"]`) as HTMLElement
const select = (id: string) => fireEvent.click(within(row(id)).getAllByRole('button')[0]!)
const press = (key: string) => fireEvent.keyDown(window, { key, ctrlKey: true })

async function openBord(): Promise<void> {
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
}

// Klipp och klistra i bordvyn. Delete är redan bundet till fönstret och inte till ett handtag,
// av samma skäl: pekaren som markerar ett handtag är pekaren som börjar draget, och draget tar
// standardhandlingen. Urklippet följer efter.
describe('att kopiera en zon i fliken Bord', () => {
  it('klistrar in en kopia med allt zonen bar, bredvid originalet och med ett namn som säger vad den är', async () => {
    const doc = projectDoc()
    doc.setup.zones = doc.setup.zones.map((z) =>
      z.id === 'draw' ? { ...z, fill: [{ field: 'title', is: ['Drake'] }], actions: [{ id: 'a1', label: 'Blanda om', steps: [{ v: 'shuffle' as const }] }] } : z,
    )
    await run.projects.create('p1', doc)
    await openBord()

    select('draw')
    press('c')
    press('v')

    const made = rows().find((id) => id !== null && !['draw', 'discard', 'table', 'hand:A', 'hand:B'].includes(id))!
    expect(within(row(made)).getAllByText(/Kopia av Draghög/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(2))
    const zones = (await run.projects.load('p1'))!.setup.zones
    const copy = zones.find((z) => z.id === made)!
    const original = zones.find((z) => z.id === 'draw')!
    expect(copy).toMatchObject({ kind: 'pile', visibility: 'none', fill: original.fill, actions: original.actions })
    // Bredvid och inte under: en kopia som lade sig exakt på originalet gick inte att peka på.
    expect(copy.geometry).not.toEqual(original.geometry)
  })

  it('klipper ut: zonen försvinner och står kvar i urklippet tills den klistras in', async () => {
    await run.projects.create('p1', projectDoc())
    await openBord()

    select('discard')
    press('x')
    expect(rows()).toEqual(['draw', 'table', 'hand:A', 'hand:B'])

    press('v')
    expect(rows()).toHaveLength(5)
    expect(document.body.textContent).toMatch(/Kasthög/)
  })

  it('vägrar klippa en zon bordet inte kan vara utan, och säger varför', async () => {
    await run.projects.create('p1', projectDoc())
    await openBord()

    select('table')
    press('x')
    expect(rows()).toEqual(['draw', 'discard', 'table', 'hand:A', 'hand:B'])
    expect((document.querySelector('[data-setup-said]') as HTMLElement).textContent).toMatch(/Filten är bordet/)
  })

  it('lämnar tangenterna i fred medan någon skriver i ett fält', async () => {
    await run.projects.create('p1', projectDoc())
    await openBord()

    select('draw')
    const name = screen.getByLabelText(/Namn för Draghög/)
    fireEvent.keyDown(name, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(name, { key: 'v', ctrlKey: true })
    expect(rows()).toEqual(['draw', 'discard', 'table', 'hand:A', 'hand:B'])
  })
})
