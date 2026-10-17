// @vitest-environment jsdom
// A picture on its way in, and a picture that cannot be fetched (#481, fynd 5).
//
// Since #339 a picture is put into the document before its bytes travel, so for as long as the
// upload takes its tile drew the browser's broken image and nothing said why; and a picture whose
// bytes the server never answers for looked exactly the same, with a black crop sheet behind it.
// The library now says which of the two it is, in words (L13): a line while a file is on its way,
// «Laddas upp…» on a tile whose bytes have not arrived yet, and «Bilden gick inte att hämta» on a
// tile and in a sheet whose picture did not come.
import { createHash } from 'node:crypto'
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
const SKOGSBRYN = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])

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
  vi.restoreAllMocks()
})

async function openMedia(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await user.click(screen.getByRole('tab', { name: 'Media' }))
  await screen.findByRole('img', { name: 'Bild på dragon' })
}

describe('the library says what became of a picture (#481)', () => {
  it('says so on the tile and in the sheet when a picture cannot be fetched', async () => {
    const user = userEvent.setup()
    await openMedia(user)
    const img = screen.getByRole('img', { name: 'Bild på dragon' })
    const tile = img.closest('li')!
    fireEvent.error(img)
    expect(within(tile).getByText('Bilden gick inte att hämta.')).toBeTruthy()

    await user.click(tile.querySelector('.byd-media-tile')!)
    const sheet = await screen.findByRole('dialog')
    fireEvent.error(sheet.querySelector('.byd-crop-picture img')!)
    expect(within(sheet).getByText('Bilden gick inte att hämta.')).toBeTruthy()
  })

  it('says a picture is on its way while it is, and does not call it broken meanwhile', async () => {
    const user = userEvent.setup()
    await openMedia(user)
    // The bytes are held at the door until the test lets them through.
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const real = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST' && String(input).endsWith('/assets')) await held
      return real(input, init)
    })

    fireEvent.change(screen.getByLabelText('Ladda upp media'), { target: { files: [new File([SKOGSBRYN], 'skogsbryn.png', { type: 'image/png' })] } })

    expect(await screen.findByText('Laddar upp skogsbryn.png…')).toBeTruthy()
    const arriving = await screen.findByRole('img', { name: 'skogsbryn.png' })
    fireEvent.error(arriving)
    const tile = arriving.closest('li')!
    expect(within(tile).getByText('Laddas upp…')).toBeTruthy()
    expect(within(tile).queryByText('Bilden gick inte att hämta.')).toBeNull()

    release()
    expect(await screen.findByText('Bilden skogsbryn.png är tillagd.')).toBeTruthy()
    // Asked for again once the bytes are there, so the tile is a picture and not a message.
    await waitFor(() => expect(within(screen.getByRole('img', { name: 'skogsbryn.png' }).closest('li')!).queryByText('Laddas upp…')).toBeNull())
    expect(within(screen.getByRole('img', { name: 'skogsbryn.png' }).closest('li')!).queryByText('Bilden gick inte att hämta.')).toBeNull()
  })

  // A picture uploaded from a card cell is just as early (#907), and Media had no way to know: it
  // only knew of the uploads made in it. Opened while the bytes were still on their way, the tile
  // asked for them, got a 404, and went on saying the picture could not be fetched after it came.
  // Now nothing asks before the bytes are there — not the tile, not the cell — and both ask once
  // they are.
  it('waits for the bytes of a picture uploaded from a card cell, and draws it once they come', async () => {
    const user = userEvent.setup()
    await openMedia(user)
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const real = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST' && String(input).endsWith('/assets')) await held
      return real(input, init)
    })

    await user.click(screen.getByRole('tab', { name: 'Tabell' }))
    fireEvent.change(await screen.findByLabelText('Ladda upp bild för knight'), { target: { files: [new File([SKOGSBRYN], 'skogsbryn.png', { type: 'image/png' })] } })
    const cell = await screen.findByRole('img', { name: 'knight art' })
    expect(cell.getAttribute('src')).toBeNull()
    // Nor the card drawn from the cell, nor anything else on the page.
    const bytes = `/assets/${createHash('sha256').update(SKOGSBRYN).digest('hex')}`
    const asked = () => [...document.querySelectorAll('img')].filter((img) => img.getAttribute('src')?.endsWith(bytes))
    expect(asked()).toEqual([])
    await user.click(screen.getByRole('tab', { name: 'Kortvägg' }))
    await waitFor(() => expect(document.querySelectorAll('[data-element="art"]').length).toBeGreaterThan(0))
    expect(asked()).toEqual([])

    await user.click(screen.getByRole('tab', { name: 'Media' }))
    const tile = (await screen.findByRole('img', { name: 'skogsbryn.png' })).closest('li')!
    expect(within(tile).getByRole('img').getAttribute('src')).toBeNull()
    expect(within(tile).getByText('Laddas upp…')).toBeTruthy()
    expect(asked()).toEqual([])

    release()
    await waitFor(() => expect(within(tile).getByRole('img').getAttribute('src')).toMatch(/\/assets\/[0-9a-f]{64}$/))
    expect(within(tile).queryByText('Laddas upp…')).toBeNull()
    expect(within(tile).queryByText('Bilden gick inte att hämta.')).toBeNull()
  })
})
