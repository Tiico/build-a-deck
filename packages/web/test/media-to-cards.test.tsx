// @vitest-environment jsdom
// The whole of what #222 was for: a picture onto a selection of cards in one step (L22).
//
// «Att behöva dra bilden om och om igen på 150+ kort är inte en bra lösning.» The way in was
// already there — the card table's own marking (#17) — and what was missing was the library and
// the connection. Since #296 the connection stands in Data itself: the marked cards open the
// library as a window over the table, so the picture reaches them without a walk to Media and
// back. The marking is still the deck's, and the library still writes every marked card at once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)

// A deck whose template draws a picture, with one card already drawn from one — so the library
// has something in it without anybody having uploaded anything.
function deckWithArt(): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  doc.rows[0]!.fields['art'] = `asset:${SKOG}`
  return doc
}

let run: Running
beforeEach(async () => {
  run = await startServer()
  await run.projects.create(run.projectId, deckWithArt())
})
afterEach(async () => {
  await run.stop()
})

async function openEditor(): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
}

const dialog = () => screen.getByRole('dialog', { name: 'Bilder i spelet' })

// The marked cards, the column, and the library opened on them from the action row.
async function putOnMarked(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('tab', { name: 'Tabell' }))
  await user.click(await screen.findByRole('checkbox', { name: 'markera knight' }))
  await user.click(screen.getByRole('checkbox', { name: 'markera wizard' }))
  const bulk = screen.getByRole('toolbar', { name: 'Markerade kort' })
  fireEvent.change(within(bulk).getByLabelText('Kolumn'), { target: { value: 'art' } })
  await user.click(within(bulk).getByRole('button', { name: 'Välj bild för de markerade korten' }))
  await user.click(within(dialog()).getByRole('button', { name: 'Bild på dragon' }))
  await user.click(within(dialog()).getByRole('button', { name: 'Använd på 2 kort' }))
}

describe('a picture on a selection of cards in one step (#222, L22, #296)', () => {
  it('writes every marked card at once from the library in Data, and one step back takes all of them back', async () => {
    const user = userEvent.setup()
    await openEditor()
    await putOnMarked(user)

    // One step, and the picture is on both of them — with the card that already had it untouched.
    const url = `${run.http}/assets/${SKOG}`
    expect((await screen.findByAltText('knight art')).getAttribute('src')).toBe(url)
    expect(screen.getByAltText('wizard art').getAttribute('src')).toBe(url)
    expect(screen.getByAltText('dragon art').getAttribute('src')).toBe(url)
    expect(screen.getByText('Bilden ligger nu på 2 kort.')).toBeTruthy()

    // And one step back is both cards back (L4, B4): the mass change was one change.
    ;(document.activeElement as HTMLElement | null)?.blur()
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(screen.queryByAltText('knight art')).toBeNull())
    expect(screen.queryByAltText('wizard art')).toBeNull()
    expect(screen.getByAltText('dragon art').getAttribute('src')).toBe(url)
  })
})

// «Samma fil laddas upp igen så fort någon glömmer att den redan finns.» A picture already in the
// game is a hash, and putting it on two more cards writes that hash into two more cells — so the
// server is never asked to store anything, and the library still holds one picture and not three.
//
// Watched on the wire and not on the screen, because "nothing was uploaded" is a claim about what
// left the browser. The watch counts every request so that a green here cannot mean that nothing
// was measured at all.
describe('a picture the game already has is never uploaded again (#222, E1)', () => {
  it('asks the server to store nothing, and leaves one picture in the library', async () => {
    const user = userEvent.setup()
    const asked: string[] = []
    const stored: string[] = []
    const real = globalThis.fetch
    globalThis.fetch = ((input: Parameters<typeof real>[0], init?: Parameters<typeof real>[1]) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      asked.push(href)
      if (method !== 'GET' && new URL(href, 'http://x').pathname === '/assets') stored.push(href)
      return real(input, init)
    }) as typeof globalThis.fetch
    try {
      await openEditor()
      await putOnMarked(user)
      await screen.findByAltText('knight art')

      // The watch is not vacuous: the editor did go to the network, and never with a picture.
      expect(asked.length).toBeGreaterThan(0)
      expect(stored).toEqual([])
      // One picture, three cards — not one picture per card.
      await user.click(screen.getByRole('tab', { name: 'Media' }))
      expect(await screen.findAllByRole('listitem')).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Bild på dragon, knight, wizard' })).toBeTruthy()
    } finally {
      globalThis.fetch = real
    }
  })
})
