// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { applyEdit, layMaterial } from '@byd/server/doc'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { addVia } from './bord-tab.js'

// Materialets plats (#1292, beställarens beslut A): varje tärning och räknare har ett handtag i
// filten, och det flyttas dit biten ska ligga. Med tangentbordet flyttar pilarna den 10 mm, och
// punkten sparas i setupen, så att bordet föds med biten där.
let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function openBord(doc: ProjectDoc = projectDoc()): Promise<void> {
  await run.projects.create(run.projectId, doc)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  // Where the page says things (#558): the tab's own status line, as the app mounts it.
  render(
    <StatusLive>
      <EditorPage />
    </StatusLive>,
  )
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
}

const truth = async (): Promise<ProjectDoc> => (await run.projects.readEdits(run.projectId, 0)).reduce((doc, e) => applyEdit(doc, e.intent), projectDoc())
const middleOf = (doc: ProjectDoc, kind: 'die' | 'counter', zone: string) => {
  const piece = layMaterial(doc.setup).find((p) => p.line.kind === kind && p.zone === zone)
  return piece ? { x: piece.x + piece.size / 2, y: piece.y + piece.size / 2 } : null
}
// Where the piece lies once the server has it: the button is drawn from the editor's own copy,
// which is a step ahead of what the server has written.
const laid = async (kind: 'die' | 'counter', zone: string) => {
  let at: { x: number; y: number } | null = null
  await waitFor(async () => expect((at = middleOf(await truth(), kind, zone))).not.toBeNull())
  return at!
}

describe('materialet i filten (#1292)', () => {
  it('flyttar en tärning med pilarna och sparar punkten i ytan', async () => {
    await openBord()
    addVia('Spelyta', '＋ Tärning')
    const handle = await screen.findByRole('button', { name: 'Tärning 1, d6 i Spelyta' })
    const before = await laid('die', 'table')

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    await waitFor(async () => expect((await truth()).setup.dice).toEqual([{ faces: 6, count: 1, zone: 'table', at: { x: before.x + 10, y: before.y } }]))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Tärning 1, d6 i Spelyta' }), { key: 'ArrowDown', shiftKey: true })
    await waitFor(async () => expect((await truth()).setup.dice?.[0]?.at).toEqual({ x: before.x + 10, y: before.y + 50 }))
    // Där den nu ligger på bordet är där handtaget sa.
    expect(middleOf(await truth(), 'die', 'table')).toEqual({ x: before.x + 10, y: before.y + 50 })
  })

  it('flyttar en räknare i sin räknaryta och säger var den hamnade', async () => {
    await openBord()
    addVia('Varje plats', '＋ Räknarzon per plats')
    addVia('Varje plats', '＋ Räknare')
    const [handle] = await screen.findAllByRole('button', { name: /^Räknare .* i Räknare A$/ })
    const before = await laid('counter', 'counters:A')

    fireEvent.keyDown(handle!, { key: 'ArrowUp' })
    await waitFor(async () => expect((await truth()).setup.counters?.[0]?.at).toEqual({ x: before.x, y: before.y - 10 }))
    expect((await truth()).setup.counters?.[0]?.role).toBeUndefined()
    await waitFor(() => expect(document.querySelector('[data-status-live="polite"]')?.textContent).toMatch(/^Räknare .* i Räknare A · \d+, \d+ mm$/))
  })

  // Trädelarna (#1477, K31): en meeples rad har ett handtag i filten ur samma `layMaterial` som bordet
  // läggs ur, och pilarna flyttar den 10 mm, Skift 50, som tärningen.
  it('flyttar en meeples rad med pilarna och sparar punkten i ytan', async () => {
    const doc = projectDoc()
    const withMeeples: ProjectDoc = { ...doc, setup: { ...doc.setup, pieces: [{ kind: 'meeple', count: 2, zone: 'table' }] } }
    await openBord(withMeeples)
    const handle = await screen.findByRole('button', { name: 'Pjäs 1, meeple i Spelyta' })
    // Raden flyttas som den rad den är: båda meeplarna lika långt.
    const row = (d: ProjectDoc) => layMaterial(d.setup).filter((p) => p.line.kind === 'piece' && p.zone === 'table').map((p) => ({ x: p.x, y: p.y }))
    const before = row(withMeeples)
    expect(before).toHaveLength(2)
    const by = (from: { x: number; y: number }[], dx: number, dy: number) => from.map((p) => ({ x: p.x + dx, y: p.y + dy }))

    // Den första flytten ger raden en punkt, och en rad på en punkt har sitt eget jämna avstånd mellan
    // bitarna, så den kan hamna en millimeter från tio; därefter är varje steg exakt, utan glidning.
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    await waitFor(async () => expect((await truth()).setup.pieces?.[0]?.at).toBeDefined())
    const moved = row(await truth())
    moved.forEach((p, i) => {
      expect(Math.abs(p.x - (before[i]!.x - 10))).toBeLessThanOrEqual(1)
      expect(p.y).toBe(before[i]!.y)
    })
    expect((await truth()).setup.pieces).toEqual([{ kind: 'meeple', count: 2, zone: 'table', at: expect.any(Object) }])
    await waitFor(() => expect(document.querySelector('[data-status-live="polite"]')?.textContent).toMatch(/^Pjäs 1, meeple i Spelyta · \d+, \d+ mm$/))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Pjäs 1, meeple i Spelyta' }), { key: 'ArrowUp', shiftKey: true })
    await waitFor(async () => expect(row(await truth())).toEqual(by(moved, 0, -50)))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Pjäs 1, meeple i Spelyta' }), { key: 'ArrowRight' })
    await waitFor(async () => expect(row(await truth())).toEqual(by(moved, 10, -50)))
  })

  // Ett grepp är ett steg tillbaka (L14): ett ändrat antal i raden är en redigering, och Ctrl+Z tar
  // tillbaka just den.
  it('gör ett ändrat antal till en redigering som ett steg tillbaka tar tillbaka', async () => {
    await openBord()
    addVia('Spelyta', '＋ Pjäs')
    await waitFor(async () => expect((await truth()).setup.pieces).toEqual([{ kind: 'meeple', count: 5, zone: 'table' }]))
    const count = screen.getByRole('spinbutton', { name: 'Antal för pjäs 1' })
    fireEvent.change(count, { target: { value: '7' } })
    fireEvent.keyDown(count, { key: 'Enter' })
    await waitFor(async () => expect((await truth()).setup.pieces?.[0]?.count).toBe(7))
    ;(document.activeElement as HTMLElement | null)?.blur()

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(async () => expect((await truth()).setup.pieces).toEqual([{ kind: 'meeple', count: 5, zone: 'table' }]))
    expect(screen.getByRole('button', { name: /^5 × meeple/ })).toBeTruthy()
  })
})
