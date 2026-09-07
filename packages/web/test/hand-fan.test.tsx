// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { HandFan } from '../src/online/HandFan.js'
import { buildScene } from './scene.js'

it('shows the visible card name while an online-hand texture is pending', () => {
  const { view } = buildScene()
  const card = view('A').components.find((c) => c.zone === 'hand:A')!
  const textured = { ...card, faces: { front: 'a'.repeat(64) } }

  render(<HandFan cards={[textured]} faces="http://faces.test" onPlay={() => undefined} />)

  expect(document.querySelector('[data-hand-fan] .byd-texture-fallback strong')?.textContent).toBe(card.cardRef)
})

it('keeps the same named fallback on the online drag ghost', () => {
  const { view } = buildScene()
  const card = view('A').components.find((c) => c.zone === 'hand:A')!
  const textured = { ...card, faces: { front: 'a'.repeat(64) } }
  render(<HandFan cards={[textured]} faces="http://faces.test" onPlay={() => undefined} />)

  fireEvent.pointerDown(document.querySelector('[data-hand-card]')!, { clientX: 10, clientY: 20, pointerId: 1 })

  expect(document.querySelector('.byd-fan-ghost .byd-texture-fallback strong')?.textContent).toBe(card.cardRef)
})
