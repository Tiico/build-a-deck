// @vitest-environment jsdom
// A picture is brought into the game from the library (#222, L22, beslut 5 och 6).
//
// This reverses what steg 1 decided: «ingenting laddas upp härifrån». The reason it reverses is
// beslut 2 — the crop follows the picture — which makes "cropping at upload" and "cropping in the
// library" the same act on the same thing. Cutting it in two places would have meant two surfaces
// that can disagree; so there is one place to put a picture in and one place to cut it, and they
// are the same place. The picture that has just arrived is therefore the picture in the window.
//
// The file name travels with it (beslut 6) and becomes what the library calls the picture, because
// the bytes are content-addressed and would otherwise be nameless for ever.
//
// Watched on the wire and not on the screen. An upload from jsdom has lied in this repo before:
// every one of them sent the thirteen bytes of the string "[object Blob]" and watched a 201 come
// back (see `test/setup.ts`). So what is asked here is what the *server* now holds — the address
// is the hash of the bytes that left the browser, and those bytes are read back off the wire.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)
// Whole PNG signatures, because the gate reads the file and never its name (#204). Two of them,
// differing after the signature, so that "the same picture" and "another picture" are a question
// about bytes and not about what the files were called.
const SKOGSBRYN = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const BORGEN = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9])
const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex')

// A deck whose template draws a picture, with one picture already on one card — so the library has
// something in it before anybody uploads anything.
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

async function openMedia(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await user.click(screen.getByRole('tab', { name: 'Media' }))
  await screen.findByRole('img', { name: 'Bild på dragon' })
}

const choose = (bytes: Uint8Array<ArrayBuffer>, name: string): void => {
  fireEvent.change(screen.getByLabelText('Lägg till en bild'), { target: { files: [new File([bytes], name, { type: 'image/png' })] } })
}

describe('a picture is uploaded in the library (#222, beslut 5)', () => {
  it('stores the very bytes the designer chose, and files them under the name her file had', async () => {
    const user = userEvent.setup()
    await openMedia(user)

    choose(SKOGSBRYN, 'skogsbryn.png')

    // Named by the file, where the library is looked over (beslut 6).
    const tile = await screen.findByRole('img', { name: 'skogsbryn.png' })
    // The address it was filed under is the hash of the file that left the browser — which is
    // what a body of "[object Blob]" could never produce.
    expect(tile.closest('li')?.getAttribute('data-asset')).toBe(sha256(SKOGSBRYN))
    // And the server really holds those bytes: read back off the wire, byte for byte.
    const served = await fetch(`${run.http}/assets/${sha256(SKOGSBRYN)}`)
    expect(served.status).toBe(200)
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(SKOGSBRYN)
    // The picture is in the game and in nobody's card yet, which is exactly what beslut 4 lets
    // stand: marked as used by nothing, never quietly gone.
    expect(tile.closest('li')?.getAttribute('data-unused')).toBe('true')
  })

  // What an upload leaves behind has to be readable without seeing the screen: the arrival is
  // said, and the picture that arrived is the one under the hand.
  it('opens the picture that has just arrived in the crop window, and says that it arrived', async () => {
    const user = userEvent.setup()
    await openMedia(user)

    choose(SKOGSBRYN, 'skogsbryn.png')

    await waitFor(() => expect(document.querySelector('.byd-media-crop img')?.getAttribute('src')).toBe(`${run.http}/assets/${sha256(SKOGSBRYN)}`))
    const window_ = screen.getByRole('button', { name: /Beskärning/ })
    await waitFor(() => expect(document.activeElement).toBe(window_))
    expect(screen.getByText('Bilden skogsbryn.png är tillagd.')).toBeTruthy()
  })

  // «Samma fil laddas upp igen så fort någon glömmer att den redan finns.» The answer is the one
  // the tool has always had: a picture is its bytes, so the same file is the same picture however
  // many times it is handed over and whatever the copy on the disk was called.
  it('adds no second entry for a file the game already has, and one for a file it has not', async () => {
    const user = userEvent.setup()
    await openMedia(user)

    choose(SKOGSBRYN, 'skogsbryn.png')
    await screen.findByRole('img', { name: 'skogsbryn.png' })
    choose(SKOGSBRYN, 'skogsbryn-kopia.png')
    await screen.findByRole('img', { name: 'skogsbryn-kopia.png' })

    expect(screen.getAllByRole('listitem')).toHaveLength(2)

    // Other bytes are another picture, which is what makes the line above a fact about the file
    // and not about the surface failing to notice anything at all.
    choose(BORGEN, 'borgen.png')
    await screen.findByRole('img', { name: 'borgen.png' })

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('data-asset'))).toEqual([SKOG, sha256(SKOGSBRYN), sha256(BORGEN)])
  })

  // A file name comes off the designer's own disk, which is to say it is anything at all. It is
  // stored, so what is stored is a name: never a way to somewhere, and never anything the
  // surfaces that read it out have to be careful with.
  it('keeps a file’s own name to the name of the file', async () => {
    const user = userEvent.setup()
    await openMedia(user)

    choose(SKOGSBRYN, '../../etc/skogsbryn.png')

    const tile = await screen.findByRole('img', { name: 'skogsbryn.png' })
    expect(tile.closest('li')?.getAttribute('data-asset')).toBe(sha256(SKOGSBRYN))
  })
})
