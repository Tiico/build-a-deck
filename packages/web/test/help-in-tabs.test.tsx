// @vitest-environment jsdom
// The editor's explanatory prose, behind a question mark (L32, #303).
//
// The inventory found 29 strings of prose in the whole editor and nineteen more it left alone —
// errors, waiting status and the sentence that says what an action costs. What moves is the
// prose; what stays is a short line the surface still reads by, and everything that was excluded.
// Every tab below asks the same two things: the moved text is gone from the surface and present in
// the box once it is opened, and what was kept is still where it was.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { translate } from '../src/i18n/index.js'
import { DeckWall } from '../src/editor/DeckWall.js'
import type { ProjectDoc } from '../src/editor/types.js'
import type { Element } from '@byd/template'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
  await run.projects.create(run.projectId, projectDoc())
})
afterEach(async () => {
  await run.stop()
})

async function openEditor(tab?: string): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  if (tab) fireEvent.click(screen.getByRole('tab', { name: tab }))
}

// The box, opened from the question mark about a topic. The text is asserted absent from the
// whole document before the press, and present inside the box — and only there — after it. The
// box's code and its stylesheet travel when it is asked for (#304), so it is waited for.
const opened = async (topic: string): Promise<HTMLElement> => {
  fireEvent.click(screen.getByRole('button', { name: `Hjälp om ${topic}` }))
  return screen.findByRole('dialog', { name: topic })
}
// The counters' own button, by the catalogue's word for it.
const ADD_COUNTER = translate('sv', 'setup.counter.add')
const absent = (text: RegExp) => expect(screen.queryByText(text)).toBeNull()

describe('Mall: the layer column (L32, the surface that measured the cost)', () => {
  it('keeps one line about dragging and moves the keyboard behind the question mark', async () => {
    await openEditor('Mall')
    await waitFor(() => expect(document.querySelector('.byd-canvas-layers .byd-canvas-hint')).not.toBeNull())
    const hint = document.querySelector('.byd-canvas-layers .byd-canvas-hint')!
    expect(hint.textContent).toContain('Dra för att ändra ordningen.')
    absent(/håll Alt/)
    absent(/F2 byter namn/)
    const box = await opened('lagerlistan')
    expect(box.textContent).toMatch(/Håll Alt och tryck pil upp eller ner/)
    expect(box.textContent).toMatch(/F2 byter namn på lagret/)
    expect(box.textContent).toMatch(/Enter går in i flyttläge/)
    // Kept: the empty properties panel still says where to go.
    expect(screen.getByText('Välj ett lager i lagerlistan, eller ett element på kortet.')).toBeTruthy()
  })
})

describe('Regler', () => {
  it('says what the tab is in one short line, and the rest behind the question mark', async () => {
    await openEditor('Regler')
    expect(screen.getByText('Reglerna hör till spelet.')).toBeTruthy()
    absent(/versioneras med korten/)
    absent(/följer med när det byter namn/)
    const box = await opened('reglerna')
    expect(box.textContent).toMatch(/versioneras med korten/)
    expect(box.textContent).toMatch(/telefonen, TV:n och observatören/)
    expect(box.textContent).toMatch(/följer med när det byter namn/)
  })
})

describe('Bord: the list and the setup', () => {
  it('keeps the revision a new table starts from, and moves how long a table lives', async () => {
    await openEditor('Bord')
    await waitFor(() => expect(document.querySelector('.byd-tables > .byd-tables-lead')).not.toBeNull())
    const lead = document.querySelector('.byd-tables > .byd-tables-lead')!
    expect(lead.textContent).toContain('rev 1')
    absent(/överlever att alla kopplar ner/)
    const box = await opened('borden')
    expect(box.textContent).toMatch(/överlever att alla kopplar ner/)
    expect(box.textContent).toMatch(/efter ett dygn/)
  })

  it('keeps one line about dragging a zone, and moves the corner, the keys and the list', async () => {
    await openEditor('Bord')
    await screen.findByText('Dra en zon på filten för att flytta den.')
    absent(/Listan är varje zon/)
    absent(/Delete tar bort den/)
    const box = await opened('zonerna')
    expect(box.textContent).toMatch(/hörnet för att ändra storlek/)
    expect(box.textContent).toMatch(/Delete tar bort den/)
    expect(box.textContent).toMatch(/varje zon bordet har/)
  })

  it('moves what a seat brings and what a third counter does, and keeps the chips that have nowhere to lie', async () => {
    await openEditor('Bord')
    await screen.findByText('Dra en zon på filten för att flytta den.')
    absent(/En ny plats får en hand/)
    absent(/En tredje staplar/)
    expect((await opened('platserna')).textContent).toMatch(/En plats som lämnar bordet tar sina zoner med sig/)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect((await opened('räknarna')).textContent).toMatch(/En tredje staplar platsens brickor/)
    // Kept: the status about chips with no zone is a consequence, and the sample deck has seats
    // without a counters zone once a counter is added.
    fireEvent.click(screen.getByRole('button', { name: ADD_COUNTER }))
    await screen.findByText(/Ingen plats har någon räknarzon/)
  })
})

describe('Symboler', () => {
  it('moves the library’s and the meanings’ leads, and keeps the empty states', async () => {
    await openEditor('Symboler')
    await screen.findByRole('heading', { name: 'Symbolbibliotek' })
    absent(/Fritt licensierade symboler/)
    absent(/En betydelse, en färg/)
    expect((await opened('biblioteket')).textContent).toMatch(/Licensen följer med in i trycket/)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect((await opened('betydelserna')).textContent).toMatch(/målar om varje kort som säger den/)
    // Kept: an empty state that says what an unnamed meaning draws as.
    expect(screen.getByText(/En symbol utan betydelse ritas i bläck/)).toBeTruthy()
  })
})

describe('Historik and Delning', () => {
  it('keeps what bringing a version back does, and moves the rest', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /rev 1/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })
    expect(within(panel).getByText('Den du tar tillbaka blir nästa version.')).toBeTruthy()
    absent(/Varje sparning är en version/)
    expect((await opened('historiken')).textContent).toMatch(/Varje sparning är en version/)
  })

  it('moves the sharing lead behind the question mark', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Vilka som har spelet' }))
    await screen.findByRole('dialog', { name: 'Vilka som har spelet' })
    absent(/De som är inne nu står överst/)
    expect((await opened('delningen')).textContent).toMatch(/Samma lista säger vem som får vara med/)
  })
})

// The checks stand in the crown's last box and need a deck with a fault in it, the way
// `wall-check-fix.test.tsx` makes one.
const tooSmall = (): ProjectDoc => {
  const doc = projectDoc()
  const base = doc.template.faces['front']!.base
  doc.template.faces['front']!.base = base.map((el) => (el.id === 'body' && el.kind === 'text' ? { ...el, font: { ...el.font, sizePt: 3 } } : el)) as Element[]
  return doc
}

describe('Kortvägg: the checks', () => {
  it('keeps the count of faults and what cannot be mended, and moves whose a fault usually is', async () => {
    render(<DeckWall doc={tooSmall()} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /^Fysisk kontroll/ }))
    expect(document.querySelector('.byd-wall-checks .byd-wall-lead')!.textContent).toMatch(/slags fel|Bara varningar/)
    absent(/En anmärkning är oftast mallens/)
    expect((await opened('anmärkningarna')).textContent).toMatch(/syns på varje kort som ärver elementet/)
  })
})
