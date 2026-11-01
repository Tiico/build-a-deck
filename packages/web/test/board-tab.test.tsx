// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { applyRecipe, recipeOf } from '@byd/server/doc'
import { EditorPage } from '../src/editor/EditorPage.js'
import { Language } from '../src/i18n/index.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// Fliken «Bräde» (#1481, variant A i #1473): brädets sida designas med Mall:s lager, verktyg och
// egenskaper, som lådans ytor (L91). Ett lager lagt på brädet sparas i dokumentets egen mall för
// brädet, och syns i förhandsvisningen och på brädet i fliken Bords filt. Prövad genom den riktiga
// editorn mot en riktig server, som designern möter den.

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

const square = { id: 'board.square457', version: 1 }
const player = { id: 'board.player', version: 1 }
function withBoards(): ProjectDoc {
  const doc = projectDoc()
  const setup = { ...doc.setup, boards: [{ id: 'main', type: square, zone: doc.setup.floor }, { id: 'spelare', type: player, role: 'mine' }] }
  return { ...doc, setup: applyRecipe(setup, recipeOf(setup)) }
}

async function open(doc: ProjectDoc) {
  await run.projects.create(run.projectId, doc)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(
    <Language lang="sv">
      <StatusLive>
        <EditorPage />
      </StatusLive>
    </Language>,
  )
  await screen.findByText('Skogens herrar')
}
const tabs = () => within(screen.getByRole('tablist', { name: /editorlägen/i })).getAllByRole('tab').map((tab) => tab.textContent)
const stored = async () => (await run.projects.load(run.projectId))!
const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: /^spara$/i }))
  await waitFor(async () => expect((await stored()).rev).toBeGreaterThan(1))
}

describe('fliken «Bräde» (#1481)', () => {
  it('finns när spelet har ett bräde, efter Låda, och inte annars', async () => {
    await open(withBoards())
    expect(tabs()).toEqual(['Kortvägg', 'Mall', 'Låda', 'Bräde', 'Tabell', 'Speltema', 'Media', 'Regler', 'Bord'])
  })

  it('saknas i ett spel utan bräde', async () => {
    await open(projectDoc())
    expect(tabs()).not.toContain('Bräde')
  })

  it('väljer huvudbrädet eller spelarbrädet, och säger brädets mått och utfall', async () => {
    await open(withBoards())
    fireEvent.click(screen.getByRole('tab', { name: 'Bräde' }))
    const main = await screen.findByRole('button', { name: /^Huvudbräde/ })
    expect(main.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.byd-board-stage')?.textContent ?? '').toContain('457 × 457 mm')
    fireEvent.click(screen.getByRole('button', { name: /^Spelarbräde/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Spelarbräde/ }).getAttribute('aria-pressed')).toBe('true'))
    expect(document.querySelector('.byd-board-stage')?.textContent ?? '').toContain('240 × 150 mm')
  })

  it('lägger ett lager med kortets verktyg på brädet, sparat i brädets mall, och visar det i förhandsvisningen och i Bords filt', async () => {
    await open(withBoards())
    fireEvent.click(screen.getByRole('tab', { name: 'Bräde' }))
    await screen.findByRole('button', { name: /^Huvudbräde/ })
    fireEvent.click(screen.getByRole('button', { name: /^Form/ }))
    // The preview draws the board's own side with the shape on it.
    await waitFor(() => expect(document.querySelector('.byd-board-stage [data-element-id], .byd-board-stage svg, .byd-board-stage .byd-card-preview')).not.toBeNull())
    await save()
    const board = (await stored()).setup.boards?.find((b) => b.id === 'main')
    const shapes = board?.faces?.front?.base.filter((e) => e.kind === 'shape') ?? []
    expect(shapes).toHaveLength(1)
    const added = shapes[0]!
    if (!('w' in added)) throw new Error('no shape')
    // In the middle of the board, in the board's own measure.
    expect(added.x + added.w / 2).toBeCloseTo(457 / 2, 0)
    expect(added.y + added.h / 2).toBeCloseTo(457 / 2, 0)
    // And on the board in Bord's felt, drawn by the one compiler.
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    await waitFor(() => expect(document.querySelector('.byd-setup-felt .byd-board[data-board] [data-board-face]')).not.toBeNull())
  })
})
