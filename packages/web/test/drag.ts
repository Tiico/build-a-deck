import { fireEvent } from '@testing-library/react'

// The pointer over the card (#18), for any test that drags one. jsdom lays nothing out, so the
// one thing it cannot know — how many pixels a millimetre is on screen — is given to it. The card
// is 63 × 88 mm at 6 px per mm; where the boxes really land is measured in a browser instead (see
// `template-canvas-css.test.ts`).
export function laidOut(pxPerMm = 6): HTMLElement {
  const card = document.querySelector('[data-drag-layer]') as HTMLElement
  card.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 63 * pxPerMm, height: 88 * pxPerMm, right: 63 * pxPerMm, bottom: 88 * pxPerMm, toJSON: () => ({}) }) as DOMRect
  return card
}

// The box the pointer would grab for an element, or nothing when the canvas does not offer one.
export const target = (id: string): HTMLElement | null => document.querySelector(`[data-drag="${id}"]`)

export function drag(el: HTMLElement, from: [number, number], to: [number, number]): void {
  fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(el, { pointerId: 1, clientX: to[0], clientY: to[1] })
  fireEvent.pointerUp(el, { pointerId: 1, clientX: to[0], clientY: to[1] })
}
