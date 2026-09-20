// @vitest-environment jsdom
// The library dialog (#296, variant B): the game's pictures in a large, centred window, opened
// from a picture cell or from the marked cards, with a target, a search, a filter, a footer that
// says what a press will do, and one explicit button that does it. Nothing is written by merely
// picking a picture. It is a component of its own with a plain interface — a target, the
// pictures, `onApply(hash)`, `onClose()` — so the template's fixed picture (#320) can open the
// same window later without the table's state coming along.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { PictureLibraryDialog, type LibraryPicture } from '../src/editor/PictureLibrary.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)
const BORG = '2'.repeat(64)
const KARTA = '3'.repeat(64)

const pictures = (): LibraryPicture[] => [
  { hash: SKOG, name: 'skog', cards: ['dragon', 'knight'] },
  { hash: BORG, name: 'borg', cards: ['wizard'] },
  { hash: KARTA, name: undefined, cards: [] },
]

function open(over: Partial<Parameters<typeof PictureLibraryDialog>[0]> = {}) {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(
    <>
      <button type="button">Välj</button>
      <PictureLibraryDialog target="dragon · art" count={1} replacing={0} pictures={pictures()} assetBase="http://api.local" onApply={onApply} onClose={onClose} {...over} />
    </>,
  )
  return { onApply, onClose }
}

const dialog = () => screen.getByRole('dialog', { name: 'Bilder i spelet' })
const tiles = () => [...dialog().querySelectorAll<HTMLButtonElement>('button[data-asset]')]
const tile = (name: string) => within(dialog()).getByRole('button', { name })
const apply = () => within(dialog()).getByRole('button', { name: /^Använd/ }) as HTMLButtonElement

describe('the library dialog opens on the game’s pictures (#296)', () => {
  it('is a modal window named by its heading, says what it is for, holds the focus, and lists every picture — the unused one too', () => {
    open()
    const box = dialog()
    expect(box.getAttribute('aria-modal')).toBe('true')
    expect(within(box).getByText('dragon · art')).toBeTruthy()
    expect(box.contains(document.activeElement)).toBe(true)
    expect(tiles().map((b) => b.getAttribute('data-asset'))).toEqual([SKOG, BORG, KARTA])
    // A picture is called what its file was called, and an older one by the cards drawn from it;
    // one nothing uses says exactly that (L22, beslut 6).
    expect(tile('skog')).toBeTruthy()
    expect(tile('borg')).toBeTruthy()
    expect(tile('Bild som inget kort använder')).toBeTruthy()
    // Nothing is chosen, so nothing can be used yet.
    expect(apply().disabled).toBe(true)
    expect(apply().textContent).toBe('Använd bilden')
  })

  it('narrows the grid by name and by what nothing uses, and says so when nothing is left', async () => {
    const user = userEvent.setup()
    open()
    await user.type(within(dialog()).getByRole('searchbox', { name: 'Sök bild' }), 'bo')
    expect(tiles().map((b) => b.getAttribute('data-asset'))).toEqual([BORG])
    await user.clear(within(dialog()).getByRole('searchbox', { name: 'Sök bild' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Oanvända' }))
    expect(tiles().map((b) => b.getAttribute('data-asset'))).toEqual([KARTA])
    await user.type(within(dialog()).getByRole('searchbox', { name: 'Sök bild' }), 'skog')
    expect(tiles()).toEqual([])
    expect(within(dialog()).getByText('Ingen bild matchar. Ändra sökningen eller filtret.')).toBeTruthy()
    // The way out of the empty state is the filter and the search, both still standing.
    await user.click(within(dialog()).getByRole('button', { name: 'Alla' }))
    expect(tiles().map((b) => b.getAttribute('data-asset'))).toEqual([SKOG])
  })

  it('says so when the game has no pictures at all, and points at the upload in Data', () => {
    open({ pictures: [] })
    expect(within(dialog()).getByText('Spelet har inga bilder ännu. Ladda upp en bild direkt i tabellen.')).toBeTruthy()
    expect(within(dialog()).queryByRole('searchbox')).toBeNull()
    expect(apply().disabled).toBe(true)
  })
})

describe('the library dialog writes nothing until it is told to (#296)', () => {
  it('picks a picture without applying it, shows it in the footer, and applies it on the one button', async () => {
    const user = userEvent.setup()
    const { onApply, onClose } = open()
    await user.click(tile('borg'))
    expect(tile('borg').getAttribute('aria-pressed')).toBe('true')
    expect(onApply).not.toHaveBeenCalled()
    expect(within(dialog()).getByText('Vald bild: borg')).toBeTruthy()
    expect(apply().disabled).toBe(false)
    await user.click(apply())
    expect(onApply).toHaveBeenCalledWith(BORG)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('names the marked cards, counts what the press will replace, and says «Använd på N kort»', async () => {
    const user = userEvent.setup()
    open({ target: '3 markerade kort · art', count: 3, replacing: 2 })
    expect(within(dialog()).getByText('3 markerade kort · art')).toBeTruthy()
    expect(apply().textContent).toBe('Använd på 3 kort')
    await user.click(tile('skog'))
    expect(within(dialog()).getByText('2 av korten har redan en bild som byts ut.')).toBeTruthy()
  })

  it('says when one card’s own picture will be replaced', async () => {
    const user = userEvent.setup()
    open({ replacing: 1 })
    await user.click(tile('skog'))
    expect(within(dialog()).getByText('Kortets bild byts ut.')).toBeTruthy()
  })

  it('closes on Avbryt, on the × and on Escape without applying anything, and hands the focus back', async () => {
    const user = userEvent.setup()
    const { onApply, onClose } = open()
    await user.click(tile('skog'))
    await user.click(within(dialog()).getByRole('button', { name: 'Avbryt' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Stäng' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('cycles Tab inside the window: from the last button back to the search', async () => {
    const user = userEvent.setup()
    open()
    const last = within(dialog()).getByRole('button', { name: 'Avbryt' })
    last.focus()
    await user.tab()
    expect(dialog().contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: 'Stäng' }))
  })
})
