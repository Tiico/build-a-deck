// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IconCatalog } from '../src/editor/IconCatalog.js'

// The libraries arrive when `libraries.gate` lets them; every test but one finds it open.
const libraries = vi.hoisted(() => ({ gate: Promise.resolve() }))
vi.mock('../src/editor/icon-catalog.js', async (actual) => {
  const real = await actual<typeof import('../src/editor/icon-catalog.js')>()
  return { ...real, loadIconCatalog: async (lang: 'sv' | 'en') => (await libraries.gate, real.loadIconCatalog(lang)) }
})

// The icon libraries' sheet under the card (#1087, L71, beslut A): the typeface catalog's form, so
// a library looks the same whether it holds families or icons. It searches in the designer's own
// words, narrows to a library, and draws every hit on the card's paper in the colour the layer will
// wear — a sample against the editor's dark ground is no sample (L34).
describe('the icon sheet (#1087)', () => {
  const open = (props: Partial<Parameters<typeof IconCatalog>[0]> = {}) => {
    const onChoose = vi.fn(async () => undefined)
    render(<IconCatalog inGame={[]} colour="#a8322d" paper="#f4ead8" target="för typ = Anfall" onChoose={onChoose} onClose={() => undefined} {...props} />)
    return onChoose
  }

  it('finds an icon under the designer’s own word, drawn in the layer’s colour on the card’s paper', async () => {
    const onChoose = open()
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'svärd' } })

    const swords = await screen.findByRole('button', { name: /^crossed-swords · Game Icons · CC-BY-3\.0 · Lorc$/ })
    const sample = swords.querySelector('.byd-icon-sample') as HTMLElement
    expect(sample.style.background).toBe('rgb(168, 50, 45)')
    expect((sample.parentElement as HTMLElement).style.background).toBe('rgb(244, 234, 216)')
    expect(screen.getByText('för typ = Anfall')).toBeTruthy()

    fireEvent.click(swords)
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith({ icon: expect.objectContaining({ id: 'game-icons:crossed-swords' }) }))
  })

  it('narrows to one library, and to the icons the game already has', async () => {
    const onChoose = open({ inGame: [{ name: 'eldklot', src: 'data:image/svg+xml,<svg/>' }] })
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'heart' } })
    fireEvent.click(screen.getByRole('button', { name: /^Lucide/ }))
    const hits = within(screen.getByRole('list', { name: 'Träffar' }))
    await waitFor(() => expect(hits.getAllByRole('button').every((b) => / · Lucide · ISC · /.test(b.getAttribute('aria-label') ?? ''))).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: /^I spelet/ }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    fireEvent.click(await screen.findByRole('button', { name: /^eldklot · I spelet$/ }))
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith({ inGame: 'eldklot' }))
  })

  // Deckster's own symbols are in the editor already, and the two libraries are megabytes behind a
  // dynamic import: the sheet does not keep the first waiting for the second. On a busy machine it
  // stood on «Biblioteken läses in …» for a minute with the sword it was asked for in hand.
  it('finds Deckster’s own symbols while the libraries are still loading, and says which are', async () => {
    let arrive!: () => void
    libraries.gate = new Promise<void>((resolve) => (arrive = resolve))
    try {
      const onChoose = open()
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'svärd' } })

      const sword = await screen.findByRole('button', { name: /^svärd · Deckster · / })
      expect(screen.getByRole('status').textContent).toBe('Game Icons och Lucide läses in …')
      expect(screen.queryByRole('button', { name: / · Game Icons · / })).toBeNull()
      // A library not yet in says so where its hits will stand, and has no count to give.
      fireEvent.click(screen.getByRole('button', { name: 'Lucide' }))
      expect(screen.getByRole('status').textContent).toBe('Lucide läses in …')
      expect(screen.queryByRole('list', { name: 'Träffar' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /^Alla/ }))

      arrive()
      expect(await screen.findByRole('button', { name: /^crossed-swords · Game Icons · / })).toBeTruthy()
      expect(screen.queryByRole('status')).toBeNull()
      expect(within(screen.getByRole('list', { name: 'Träffar' })).getAllByRole('button')[0]?.getAttribute('aria-label')).toMatch(/^svärd · Deckster · /)

      fireEvent.click(sword.isConnected ? sword : screen.getByRole('button', { name: /^svärd · Deckster · / }))
      await waitFor(() => expect(onChoose).toHaveBeenCalledWith({ icon: expect.objectContaining({ id: 'deckster:svard' }) }))
    } finally {
      arrive()
      libraries.gate = Promise.resolve()
    }
  })

  // A designer's own drawing, in the same sheet (#1087, beslut 4): cleaned in the browser before
  // its hash is taken, shown as the file and as the shape the card will paint, and taken in with a
  // licence only when both halves of one are given — as an uploaded typeface is (L27).
  it('takes a drawing of the designer’s own in, cleaned, and says what it will look like', async () => {
    const onChoose = open()
    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><path d="M0 0h10v10z"/></svg>'], 'Min Logga.svg', { type: 'image/svg+xml' })
    fireEvent.change(screen.getByLabelText('Ladda upp SVG …'), { target: { files: [file] } })

    const own = await screen.findByRole('group', { name: 'Egen ikon' })
    expect((within(own).getByLabelText('Namn') as HTMLInputElement).value).toBe('min-logga')
    expect(within(own).getByText(/det vita i filen blir färg/)).toBeTruthy()
    fireEvent.click(within(own).getByRole('button', { name: 'Lägg till i spelet' }))
    await waitFor(() => expect(onChoose).toHaveBeenCalledTimes(1))
    const { own: taken } = (onChoose.mock.calls[0] as unknown as [{ own: { svg: string; name: string; credit?: unknown } }])[0]
    expect(taken.name).toBe('min-logga')
    expect(taken.svg).not.toMatch(/script|onload/)
    expect(taken.credit).toBeUndefined()
  })

  it('records a licence only when both the licence and the person are given', async () => {
    const onChoose = open()
    fireEvent.change(screen.getByLabelText('Ladda upp SVG …'), { target: { files: [new File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>'], 'mark.svg')] } })
    const own = await screen.findByRole('group', { name: 'Egen ikon' })
    fireEvent.change(within(own).getByLabelText('Licens'), { target: { value: 'CC-BY-4.0' } })
    fireEvent.change(within(own).getByLabelText('Upphovsperson'), { target: { value: 'Ada' } })
    fireEvent.click(within(own).getByRole('button', { name: 'Lägg till i spelet' }))
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith({ own: expect.objectContaining({ name: 'mark', credit: { licence: 'CC-BY-4.0', by: 'Ada' } }) }))
  })

  it('says in words that a file is no drawing it can use, and takes nothing in', async () => {
    const onChoose = open()
    fireEvent.change(screen.getByLabelText('Ladda upp SVG …'), { target: { files: [new File(['<html><body>nej</body></html>'], 'sida.svg')] } })
    expect((await screen.findByRole('alert')).textContent).toBe('sida.svg går inte att använda som ikon: det är ingen SVG-ritning.')
    expect(screen.queryByRole('group', { name: 'Egen ikon' })).toBeNull()
    expect(onChoose).not.toHaveBeenCalled()
  })
})

