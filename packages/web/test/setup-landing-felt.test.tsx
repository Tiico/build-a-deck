// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import type { ZoneAction } from '@byd/protocol'
import { EditorPage } from '../src/editor/EditorPage.js'
import { besidePile, CARD_MM } from '../src/table/drop.js'
import { projectDoc } from './project-doc.js'
import { edgeDoc } from './landing-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Konturen bredvid högen på uppställningens filt (L30, #316): den syns medan väljaren «Bredvid
// högen» hovras eller har fokus, och står kvar i bärnsten så länge högen är vald när korten
// hamnar utanför bordet. Vad som mäts här är millimetrarna konturen bär, inte bildpunkter:
// filten ritas i Chromium i setup-landing-room.test.tsx.

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

type Zone = ProjectDoc['setup']['zones'][number]
const withZones = (change: (z: Zone) => Zone, extra: Zone[] = []): ProjectDoc => {
  const doc = projectDoc()
  return { ...doc, setup: { ...doc.setup, zones: [...doc.setup.zones.map(change), ...extra] } }
}
const act = (id: string, steps: ZoneAction['steps']): ZoneAction => ({ id, label: id, steps })
const split = (n: number): ZoneAction['steps'][number] => ({ v: 'split', count: { of: 'number', n }, to: { at: 'beside' }, face: 'keep' })

async function openBord(): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
}
const row = (id: string) => document.querySelector(`[data-zone-row="${id}"]`) as HTMLElement
const openZone = (id: string, name: RegExp) => fireEvent.click(within(row(id)).getByRole('button', { name: (n) => name.test(n) && !n.startsWith('Ta bort') }))
const picker = (name: string) => screen.getByLabelText(`Bredvid högen för ${name}`) as HTMLSelectElement
const outlines = () => [...document.querySelectorAll('[data-landing]')] as HTMLElement[]
const seen = (el: HTMLElement) => ({ pile: el.getAttribute('data-landing'), at: el.getAttribute('data-at'), rot: el.getAttribute('data-rot'), cards: el.getAttribute('data-cards'), off: el.getAttribute('data-off') })
// Konturens övre vänstra hörn för en hög (mitten) och för ett ensamt kort (hörnet), som besidePile ger.
const cornerOf = (g: { x: number; y: number; rot: number }, cards: 1 | 2, side: 'left' | 'right' | 'above' | 'below') => {
  const at = besidePile(g, cards, side)
  return cards === 1 ? `${at.x},${at.y}` : `${at.x - CARD_MM.w / 2},${at.y - CARD_MM.h / 2}`
}

describe('konturen syns medan väljaren hålls (L30, B · Vid fokus)', () => {
  it('ritas för den valda högen medan väljaren hovras eller har fokus, och inte annars', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    openZone('draw', /Draghög/)
    expect(outlines()).toEqual([])

    fireEvent.mouseEnter(picker('Draghög'))
    expect(outlines().map(seen)).toEqual([{ pile: 'draw', at: cornerOf({ x: -200, y: 0, rot: 0 }, 2, 'left'), rot: '0', cards: '2', off: null }])
    fireEvent.mouseLeave(picker('Draghög'))
    expect(outlines()).toEqual([])

    // Tangentbordet får samma sak som musen.
    fireEvent.focus(picker('Draghög'))
    expect(outlines().map((o) => o.getAttribute('data-landing'))).toEqual(['draw'])
    // Sidan byts med väljaren i handen: konturen flyttar med.
    fireEvent.change(picker('Draghög'), { target: { value: 'below' } })
    expect(outlines().map(seen)).toEqual([{ pile: 'draw', at: cornerOf({ x: -200, y: 0, rot: 0 }, 2, 'below'), rot: '0', cards: '2', off: null }])
    fireEvent.blur(picker('Draghög'))
    expect(outlines()).toEqual([])

    // En annan högs väljare ritar för den högen.
    openZone('discard', /Kasthög/)
    fireEvent.mouseEnter(picker('Kasthög'))
    expect(outlines().map(seen)).toEqual([{ pile: 'discard', at: cornerOf({ x: 200, y: 0, rot: 0 }, 2, 'left'), rot: '0', cards: '2', off: null }])
  })

  it('ritas för det åtgärderna faktiskt lägger: ett kort när alla lägger ett, annars en hög', async () => {
    await run.projects.create(
      run.projectId,
      withZones(
        (z) => (z.id === 'draw' ? { ...z, actions: [act('Ta 1', [split(1)])] } : z.id === 'discard' ? { ...z, actions: [act('Ta 1', [split(1)]), act('Ta 3', [split(3)])] } : z),
        [{ id: 'market', kind: 'pile', name: 'Marknad', visibility: 'all', geometry: { x: 0, y: 100, w: 0, h: 0, rot: 0 } }],
      ),
    )
    await openBord()
    openZone('draw', /Draghög/)
    fireEvent.mouseEnter(picker('Draghög'))
    expect(outlines().map(seen)).toEqual([{ pile: 'draw', at: cornerOf({ x: -200, y: 0, rot: 0 }, 1, 'left'), rot: '0', cards: '1', off: null }])
    openZone('discard', /Kasthög/)
    fireEvent.mouseEnter(picker('Kasthög'))
    expect(outlines().map(seen)).toEqual([{ pile: 'discard', at: cornerOf({ x: 200, y: 0, rot: 0 }, 2, 'left'), rot: '0', cards: '2', off: null }])
    openZone('market', /Marknad/)
    fireEvent.mouseEnter(picker('Marknad'))
    expect(outlines().map(seen)).toEqual([{ pile: 'market', at: cornerOf({ x: 0, y: 100, rot: 0 }, 2, 'left'), rot: '0', cards: '2', off: null }])
  })

  it('följer högens vridning på alla fyra sidor, precis som besidePile', async () => {
    await run.projects.create(
      run.projectId,
      withZones((z) => (z.id === 'draw' ? { ...z, geometry: { ...z.geometry, rot: 30 } } : z)),
    )
    await openBord()
    openZone('draw', /Draghög/)
    fireEvent.focus(picker('Draghög'))
    for (const side of ['left', 'right', 'above', 'below'] as const) {
      fireEvent.change(picker('Draghög'), { target: { value: side } })
      expect({ side, ...seen(outlines()[0]!) }).toEqual({ side, pile: 'draw', at: cornerOf({ x: -200, y: 0, rot: 30 }, 2, side), rot: '30', cards: '2', off: null })
    }
  })
})

describe('utanför bordet är ett fel och inte en upplysning (L30)', () => {
  it('står kvar i bärnsten med orden i sig så länge högen är vald, och panelen säger vad man gör', async () => {
    await run.projects.create(run.projectId, edgeDoc())
    await openBord()
    expect(outlines()).toEqual([])
    openZone('discard', /Krönikan/)
    // Utan att väljaren rörs.
    expect(outlines().map(seen)).toEqual([{ pile: 'discard', at: cornerOf({ x: 838, y: 500, rot: 0 }, 2, 'right'), rot: '0', cards: '2', off: 'true' }])
    expect(outlines()[0]!.textContent).toBe('Hamnar utanför bordet')
    const warn = within(row('discard')).getByText(/Korten hamnar utanför bordet på den här sidan\. Välj en annan sida, eller flytta Krönikan\./)
    expect(warn.closest('[data-zone-props="discard"]')).not.toBeNull()

    // Nedanför är också utanför; ovanför ryms.
    fireEvent.change(picker('Krönikan'), { target: { value: 'below' } })
    expect(outlines().map(seen)).toEqual([{ pile: 'discard', at: cornerOf({ x: 838, y: 500, rot: 0 }, 2, 'below'), rot: '0', cards: '2', off: 'true' }])
    fireEvent.change(picker('Krönikan'), { target: { value: 'above' } })
    expect(outlines()).toEqual([])
    expect(within(row('discard')).queryByText(/hamnar utanför bordet/)).toBeNull()

    // Och en hög som inte är vald säger ingenting, hur den än står.
    fireEvent.change(picker('Krönikan'), { target: { value: 'right' } })
    expect(outlines().map((o) => o.getAttribute('data-off'))).toEqual(['true'])
    openZone('draw', /Draghög/)
    expect(outlines()).toEqual([])
  })
})
