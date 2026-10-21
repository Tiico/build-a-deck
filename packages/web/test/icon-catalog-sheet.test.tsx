// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IconCatalog } from '../src/editor/IconCatalog.js'

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
})
