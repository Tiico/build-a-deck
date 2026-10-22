// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { applyEdit } from '@byd/server/doc'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// Tärningarna i fliken Bord (#1139, beställarens beslut A med dynamiskt antal): under RÄKNARE står
// TÄRNINGAR, och varje rad är «[antal] [d6] [per spelare / totalt] i [yta] ×». En yta vid
// platserna ger varje plats sitt antal; en delad yta tar antalet totalt eller gånger platserna.
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
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
  // Varje plats får en yta framför sig, så att det finns en yta per plats att lägga tärningar i.
  fireEvent.click(screen.getByRole('button', { name: '＋ Yta per plats' }))
}

// Dokumentet som servern håller det: projektet med varje loggad redigering lagd på.
const truth = async (): Promise<ProjectDoc> => (await run.projects.readEdits(run.projectId, 0)).reduce((doc, e) => applyEdit(doc, e.intent), projectDoc())
const diceOnServer = async () => (await truth()).setup.dice

const select = (name: string) => screen.getByRole('combobox', { name }) as HTMLSelectElement
const field = (name: string) => screen.getByRole('spinbutton', { name }) as HTMLInputElement

describe('tärningarna i fliken Bord (#1139)', () => {
  it('lägger «2 d6 per spelare i Framför» och «1 d20 totalt i Spelyta» i setupen', async () => {
    await openBord()
    expect(screen.getByRole('heading', { name: 'Tärningar' })).toBeTruthy()

    // «＋ Tärning» lägger en d6 i Spelyta när det inte finns någon rad att ärva ytan av.
    fireEvent.click(screen.getByRole('button', { name: '＋ Tärning' }))
    await waitFor(async () => expect(await diceOnServer()).toEqual([{ faces: 6, count: 1, zone: 'table' }]))
    expect(select('Yta för tärning 1').selectedOptions[0]?.textContent).toBe('Spelyta')
    expect(select('Sort för tärning 1').value).toBe('6')

    fireEvent.change(field('Antal för tärning 1'), { target: { value: '2' } })
    fireEvent.keyDown(field('Antal för tärning 1'), { key: 'Enter' })
    fireEvent.change(select('Yta för tärning 1'), { target: { value: 'role:mine' } })
    await waitFor(async () => expect(await diceOnServer()).toEqual([{ faces: 6, count: 2, role: 'mine' }]))
    // En yta vid platserna är alltid per spelare: där finns inget att välja.
    expect(screen.queryByRole('combobox', { name: 'Hur antalet räknas för tärning 1' })).toBeNull()
    expect(screen.getByText('per spelare')).toBeTruthy()

    // Den nya raden ärver ytan från raden ovanför.
    fireEvent.click(screen.getByRole('button', { name: '＋ Tärning' }))
    await waitFor(() => expect(select('Yta för tärning 2').value).toBe('role:mine'))
    fireEvent.change(select('Sort för tärning 2'), { target: { value: '20' } })
    fireEvent.change(select('Yta för tärning 2'), { target: { value: 'zone:table' } })
    // Flyttad från en yta vid platserna behåller raden vad antalet betydde: per spelare.
    await waitFor(() => expect(select('Hur antalet räknas för tärning 2').value).toBe('perSeat'))
    fireEvent.change(select('Hur antalet räknas för tärning 2'), { target: { value: 'total' } })
    await waitFor(async () =>
      expect(await diceOnServer()).toEqual([
        { faces: 6, count: 2, role: 'mine' },
        { faces: 20, count: 1, zone: 'table' },
      ]),
    )

    // «per spelare» på en delad yta gör antalet till antal gånger platserna.
    fireEvent.change(select('Hur antalet räknas för tärning 2'), { target: { value: 'perSeat' } })
    await waitFor(async () => expect((await diceOnServer())?.[1]).toEqual({ faces: 20, count: 1, zone: 'table', perSeat: true }))

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort tärning 1' }))
    await waitFor(async () => expect(await diceOnServer()).toEqual([{ faces: 20, count: 1, zone: 'table', perSeat: true }]))
  })

  // Som räknarna utan räknarzon: raden står kvar och säger varför den inte hamnar på bordet, så
  // att ett steg tillbaka över borttagningen ger tillbaka tärningarna där de låg.
  it('låter en tärning vars yta tagits bort stå kvar, och säger det', async () => {
    await openBord()
    fireEvent.click(screen.getByRole('button', { name: '＋ Yta' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ Tärning' }))
    await waitFor(() => expect(select('Yta för tärning 1')).toBeTruthy())
    fireEvent.change(select('Yta för tärning 1'), { target: { value: 'zone:yta-1' } })
    await waitFor(async () => expect(await diceOnServer()).toEqual([{ faces: 6, count: 1, zone: 'yta-1' }]))
    expect(screen.queryByText(/ligger i en yta som inte finns/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Yta 1' }))
    await waitFor(() => expect(screen.getByText(/Tärning 1 ligger i en yta som inte finns längre/)).toBeTruthy())
    expect(select('Yta för tärning 1').getAttribute('aria-invalid')).toBe('true')
    expect(await diceOnServer()).toEqual([{ faces: 6, count: 1, zone: 'yta-1' }])
  })
})
