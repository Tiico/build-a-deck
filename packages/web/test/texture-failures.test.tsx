// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { VisibleComponentState } from '@byd/protocol'
import { Texture } from '../src/table/Texture.js'
import { TextureFailures } from '../src/table/TextureFailures.js'
import { App } from '../src/App.js'

const FRONT = 'a'.repeat(64)
const BACK = 'b'.repeat(64)
const FACES = 'http://faces.test'
const base = { id: 'c1', type: { id: 'card.standard.63x88', version: 1 }, zone: 'table', x: 0, y: 0, rot: 0 }
const faceUp: VisibleComponentState = { ...base, face: 'front', cardRef: 'wizard', faces: { front: FRONT, back: BACK } }
const faceDown: VisibleComponentState = { ...base, id: 'c2', face: 'back', cardRef: null, faces: { back: BACK } }

// A card that cannot be rendered says so on its own face, but a face is not an announcement: a
// screen reader hears nothing of it. One region per card would be worse — a table of fifty-two
// would announce fifty-two times at once — so the whole screen shares a single one (#10).
describe('cards that could not be rendered are announced once for the screen', () => {
  it('counts every lost card into one polite region and takes it out again when it is asked for anew', () => {
    vi.useFakeTimers()
    const { container } = render(
      <TextureFailures>
        <Texture faces={FACES} c={faceUp} />
        <Texture faces={FACES} c={faceDown} />
      </TextureFailures>,
    )
    // The region is in the tree from the start, so a failure changes its text rather than adding
    // a node a screen reader was never watching.
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
    expect(container.querySelector('[role="status"]')!.textContent).toBe('')

    for (let i = 0; i <= 8; i++) {
      for (const img of container.querySelectorAll('img')) fireEvent.error(img)
      act(() => vi.advanceTimersByTime(1500 * (i + 1)))
    }
    expect(container.querySelectorAll('[data-texture="failed"]')).toHaveLength(2)
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
    expect(container.querySelector('[role="status"]')!.textContent).toBe('2 kort kunde inte renderas')

    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: /försök igen/i })[0]!)
    })
    expect(container.querySelector('[role="status"]')!.textContent).toBe('1 kort kunde inte renderas')
    vi.useRealTimers()
  })

  it('is mounted once around whichever screen the app is showing', () => {
    history.replaceState(null, '', '/table')
    const { container } = render(<App />)
    expect(container.querySelectorAll('[data-texture-failures]')).toHaveLength(1)
  })
})
