// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { applyEdit, layMaterial } from '@byd/server/doc'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

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

async function openBord(): Promise<void> {
  await run.projects.create(run.projectId, projectDoc())
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
    fireEvent.click(screen.getByRole('button', { name: '＋ Tärning' }))
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
    fireEvent.click(screen.getByRole('button', { name: '＋ Räknarzon per plats' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ Räknare' }))
    const [handle] = await screen.findAllByRole('button', { name: /^Räknare .* i Räknare A$/ })
    const before = await laid('counter', 'counters:A')

    fireEvent.keyDown(handle!, { key: 'ArrowUp' })
    await waitFor(async () => expect((await truth()).setup.counters?.[0]?.at).toEqual({ x: before.x, y: before.y - 10 }))
    expect((await truth()).setup.counters?.[0]?.role).toBeUndefined()
    await waitFor(() => expect(document.querySelector('[data-status-live="polite"]')?.textContent).toMatch(/^Räknare .* i Räknare A · \d+, \d+ mm$/))
  })
})
