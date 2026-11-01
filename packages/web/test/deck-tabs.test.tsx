// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ProjectDoc } from '@byd/server'
import { applyEdit } from '@byd/server/doc'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// En flik per lek i Mall och Tabell (#1487, editorvariant A i #1474): huvudet är oförändrat, och den
// som bara har kort ser ingenting nytt förrän en andra lek finns.
let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

const blank = () => ({ base: [], variants: {} })
const withTiles = (): ProjectDoc => {
  const doc = projectDoc()
  const bag = { id: 'bag', kind: 'pile' as const, name: 'Påsen', visibility: 'none' as const, geometry: { x: 300, y: 0, w: 0, h: 0, rot: 0 } }
  return {
    ...doc,
    setup: { ...doc.setup, zones: [...doc.setup.zones, bag], markers: [{ id: 'mynt', name: 'Guld', type: { id: 'tile.round.25', version: 1 }, faces: { front: blank(), back: blank() }, count: 20, zone: 'table' }] },
    decks: [
      {
        id: 'landskap',
        name: 'Landskap',
        type: { id: 'tile.hex.52', version: 1 },
        template: { faces: { front: blank(), back: blank() } },
        rows: [
          { id: 'skog', fields: { title: 'Skog', antal: 3 } },
          { id: 'sjo', fields: { title: 'Sjö' } },
        ],
        zone: 'bag',
      },
    ],
  }
}
async function open(doc: ProjectDoc, tab: string): Promise<void> {
  await run.projects.create(run.projectId, doc)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  await run.answering()
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: tab }))
}
const truth = async (doc: ProjectDoc): Promise<ProjectDoc> => (await run.projects.readEdits(run.projectId, 0)).reduce((d, e) => applyEdit(d, e.intent), doc)
const tabs = () => within(screen.getByRole('group', { name: 'Lek' }))
const pressed = () => tabs().getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)

describe('en flik per lek (#1487)', () => {
  it('visar ingen flikrad i Mall eller Tabell när spelet har en lek', async () => {
    await open(projectDoc(), 'Mall')
    expect(screen.queryByRole('group', { name: 'Lek' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    await screen.findByLabelText('dragon title')
    expect(screen.queryByRole('group', { name: 'Lek' })).toBeNull()
  })

  it('byter lek i Tabell, och en cell i brickleken skrivs i den leken', async () => {
    const doc = withTiles()
    await open(doc, 'Tabell')
    await screen.findByLabelText('dragon title')
    // Tabell har lekarna, inte markören: den har inga rader.
    expect(tabs().getAllByRole('button').map((b) => b.textContent)).toEqual(['Kort3', 'Landskap2', '＋ Lek'])
    expect(pressed()).toEqual(['Kort3'])
    fireEvent.click(tabs().getByRole('button', { name: /^Landskap/ }))
    const cell = (await screen.findByLabelText('skog title')) as HTMLInputElement
    expect(screen.queryByLabelText('dragon title')).toBeNull()
    fireEvent.change(cell, { target: { value: 'Granskog' } })
    await waitFor(async () => expect((await truth(doc)).decks![0]!.rows[0]!.fields['title']).toBe('Granskog'))
    expect((await truth(doc)).rows).toEqual(doc.rows)
  })

  it('ritar ett lager på brickans framsida i Mall, med «Brickan» bland egenskaperna, och lämnar kortens mall', async () => {
    const doc = withTiles()
    await open(doc, 'Mall')
    expect(tabs().getAllByRole('button').map((b) => b.textContent)).toEqual(['Kort3', 'Landskap2', 'Guldmarkör', '＋ Lek'])
    fireEvent.click(tabs().getByRole('button', { name: /^Landskap/ }))
    expect(pressed()).toEqual(['Landskap2'])
    const shape = await screen.findByRole('group', { name: 'Form' })
    expect(within(shape).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['sexhörning', 'true'],
      ['kvadrat', 'false'],
      ['rund', 'false'],
    ])
    expect(screen.getByText('Vrids i steg').nextElementSibling?.textContent).toBe('60°')
    // Formen är snittet: sexhörningen ritas över ytan.
    expect(document.querySelector('[data-cut="hex"]')).toBeTruthy()
    await userEvent.click(within(document.querySelector('.byd-canvas-tools') as HTMLElement).getByRole('button', { name: 'Text' }))
    await waitFor(async () => expect((await truth(doc)).decks![0]!.template.faces['front']!.base).toHaveLength(1))
    expect((await truth(doc)).template).toEqual(doc.template)
    // En kvadrat vrids i steg om 90°.
    fireEvent.click(within(shape).getByRole('button', { name: 'kvadrat' }))
    await waitFor(async () => expect((await truth(doc)).decks![0]!.type).toEqual({ id: 'tile.square.45', version: 1 }))
  })

  it('visar inget huvud och inget avsnitt i Kortvägg när spelet har en lek', async () => {
    await open(projectDoc(), 'Kortvägg')
    await waitFor(() => expect(document.querySelector('[data-wall]')).toBeTruthy())
    expect(document.querySelector('.byd-wall-deck-head')).toBeNull()
    expect(document.querySelector('.byd-wall-other')).toBeNull()
  })

  it('visar brickleken under korten i Kortvägg, med form och antal, och går därifrån till Tabell', async () => {
    await open(withTiles(), 'Kortvägg')
    const lands = await screen.findByRole('region', { name: 'Landskap' })
    expect(lands.querySelector('.byd-wall-deck-head small')?.textContent).toBe('4 brickor · sexhörning 52 mm · vrids 60°')
    expect(lands.querySelectorAll('.byd-wall-tiles > li')).toHaveLength(2)
    expect(document.querySelector('.byd-wall-deck-head h2')?.textContent).toBe('Kort')
    fireEvent.click(within(lands).getByRole('button', { name: 'Öppna Landskap i Tabell' }))
    expect(await screen.findByLabelText('skog title')).toBeTruthy()
    expect(pressed()).toEqual(['Landskap2'])
  })

  it('går från markörens rad i Bord till dess sidor i Mall, och ett lager där syns på filten', async () => {
    const doc = withTiles()
    await open(doc, 'Bord')
    fireEvent.click(screen.getByRole('button', { name: /^20 × Guld/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Rita sidorna i Mall' }))
    await waitFor(() => expect(pressed()).toEqual(['Guldmarkör']))
    expect(document.querySelector('[data-cut="circle"]')).toBeTruthy()
    await userEvent.click(within(document.querySelector('.byd-canvas-tools') as HTMLElement).getByRole('button', { name: 'Form' }))
    await waitFor(async () => expect((await truth(doc)).setup.markers![0]!.faces?.front?.base).toHaveLength(1))
    // På filten i Bord ligger markörerna med framsidan upp, ritade ur sin egen mall.
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    await waitFor(() => expect(document.querySelector('.byd-setup-felt [data-face="front"] .byd-card-face')).toBeTruthy())
  })
})
