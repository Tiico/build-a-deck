// @vitest-environment jsdom
// A picture taken out of the game from the library (#318, L22 beslut 4). The bytes are shared and
// content-addressed, so what goes is the project's own reference — and with it every cell the
// template draws as a picture that still points at it. A picture no card uses goes at once; one
// that cards use is asked about first, with the cards named, and the cards emptied and the picture
// gone are one step back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { layerPick } from './layers.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)
const KARTA = '3'.repeat(64)

// A deck whose template draws a picture: one picture on seven cards — more than the question
// names — and one the game has taken in that no card is drawn from.
const ON_SKOG = ['dragon', 'knight', 'troll', 'orc', 'elf', 'dwarf', 'bard']
function deckWithArt(): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  for (const id of ON_SKOG.slice(2)) doc.rows.push({ id, fields: { title: id, body: '', antal: 1 } })
  for (const row of doc.rows) if (ON_SKOG.includes(row.id)) row.fields['art'] = `asset:${SKOG}`
  doc.pictures = { [SKOG]: { name: 'skogsbryn.jpg' }, [KARTA]: { name: 'karta.png' } }
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

async function openMedia(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await user.click(screen.getByRole('tab', { name: 'Media' }))
  await screen.findByRole('list', { name: 'Media i spelet' })
  return user
}

const tile = (hash: string) => document.querySelector(`[data-asset="${hash}"]`) as HTMLElement | null

describe('a picture is taken out of the game (#318)', () => {
  it('takes a picture no card uses out at once, without asking', async () => {
    const user = await openMedia()
    expect(tile(KARTA)).not.toBeNull()

    await user.click(within(tile(KARTA)!).getByRole('button', { name: 'Ta bort karta.png' }))

    await waitFor(() => expect(tile(KARTA)).toBeNull())
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(tile(SKOG)).not.toBeNull()
  })

  it('asks before taking a picture cards use, names the cards up to a cap, and keeps everything on Avbryt', async () => {
    const user = await openMedia()
    const remove = within(tile(SKOG)!).getByRole('button', { name: 'Ta bort skogsbryn.jpg' })

    await user.click(remove)

    const asked = await screen.findByRole('alertdialog', { name: /skogsbryn\.jpg/ })
    // The first five cards by name, and the rest counted rather than listed.
    expect(asked.textContent).toContain('dragon, knight, troll, orc, elf')
    expect(asked.textContent).toContain('och 2 till')
    expect(asked.textContent).not.toContain('dwarf')
    // The question opens on the answer that loses nothing.
    expect(document.activeElement).toBe(within(asked).getByRole('button', { name: 'Avbryt' }))

    await user.click(within(asked).getByRole('button', { name: 'Avbryt' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(tile(SKOG)).not.toBeNull()
    expect(within(tile(SKOG)!).getByText('7 kort')).toBeTruthy()
    expect(document.activeElement).toBe(remove)
  })

  it('takes Escape as Avbryt, and hands the focus back to the control that asked', async () => {
    const user = await openMedia()
    const remove = within(tile(SKOG)!).getByRole('button', { name: 'Ta bort skogsbryn.jpg' })

    await user.click(remove)
    await screen.findByRole('alertdialog')
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(tile(SKOG)).not.toBeNull()
    expect(document.activeElement).toBe(remove)
  })

  it('on yes empties the cards and takes the picture out, and one step back puts all of it back', async () => {
    const user = await openMedia()
    await user.click(within(tile(SKOG)!).getByRole('button', { name: 'Ta bort skogsbryn.jpg' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Ja, ta bort' }))

    await waitFor(() => expect(tile(SKOG)).toBeNull())
    expect(screen.queryByRole('alertdialog')).toBeNull()
    // The control that asked went with the picture; the hand lands on the next one, not on the page.
    expect(document.activeElement).toBe(within(tile(KARTA)!).getByRole('button', { name: 'Ta bort karta.png' }))
    await user.click(screen.getByRole('tab', { name: 'Tabell' }))
    await screen.findByRole('checkbox', { name: 'markera dragon' })
    expect(screen.queryByAltText('dragon art')).toBeNull()
    expect(screen.queryByAltText('bard art')).toBeNull()

    // One step, and not a picture followed by seven cards.
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    expect(await screen.findByText(/Tog tillbaka: hur en bild är inramad/)).toBeTruthy()
    const url = `${run.http}/assets/${SKOG}`
    expect((await screen.findByAltText('dragon art')).getAttribute('src')).toBe(url)
    expect(screen.getByAltText('bard art').getAttribute('src')).toBe(url)
    await user.click(screen.getByRole('tab', { name: 'Media' }))
    await waitFor(() => expect(tile(SKOG)).not.toBeNull())
    expect(within(tile(SKOG)!).getByRole('button', { name: 'Ta bort skogsbryn.jpg' })).toBeTruthy()
    expect(within(tile(SKOG)!).getByText('7 kort')).toBeTruthy()
  })
})

// The template as a user (#320): a picture an image element carries by itself goes the way a
// cell's does — the element stays with an empty frame — and one step back puts the picture on
// the template again, together with the record and the cards, since it is one intent.
describe('a picture the template carries is taken out and put back (#320)', () => {
  const LOGO = '4'.repeat(64)
  it('asks, empties the element’s frame on yes, and one step back binds the template to the picture again', async () => {
    const doc = deckWithArt()
    doc.template.faces['back']!.base.push({ kind: 'image', id: 'logo', x: 20, y: 30, w: 23, h: 23, bind: { literal: `asset:${LOGO}` } })
    doc.pictures = { ...doc.pictures, [LOGO]: { name: 'logga.png' } }
    expect(await run.projects.replace(run.projectId, 1, doc)).not.toBe('conflict')
    const user = await openMedia()
    expect(within(tile(LOGO)!).getByText('används av mallen')).toBeTruthy()

    await user.click(within(tile(LOGO)!).getByRole('button', { name: 'Ta bort logga.png' }))
    const asked = await screen.findByRole('alertdialog', { name: /logga\.png/ })
    expect(asked.textContent).toContain('Mallen förlorar sin fasta bild')
    await user.click(within(asked).getByRole('button', { name: 'Ja, ta bort' }))
    await waitFor(() => expect(tile(LOGO)).toBeNull())

    // The element is still there, bound to nothing: the panel says so.
    await user.click(screen.getByRole('tab', { name: 'Mall' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Baksida' }))
    fireEvent.click(layerPick('logo'))
    expect((screen.getByRole('radio', { name: 'Fast bild' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('Ingen bild vald')).toBeTruthy()
    expect(document.querySelector('#canvas [data-element="logo"] img.byd-art')).toBeNull()

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    expect(await screen.findByText(/Tog tillbaka/)).toBeTruthy()
    expect(await screen.findByText('logga.png')).toBeTruthy()
    expect(document.querySelector('#canvas [data-element="logo"] img.byd-art')?.getAttribute('src')).toBe(`${run.http}/assets/${LOGO}`)
  })
})
