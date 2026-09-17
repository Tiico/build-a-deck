// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { ZoneActions } from '../src/editor/ZoneActions.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// A slot opens where there is room for it (#229).
//
// The reading itself is `placement.test.ts`; this is the wiring — that the slot asks the reading
// at all, and that what comes back reaches the box. The box opens from what it is positioned
// against, which for a slot is the wrap around its knob, so that is the rectangle said out loud
// here: a slot near the foot of an 800 px window has no room under it and plenty over it, and the
// opposite for one near the top. jsdom lays nothing out, so nothing else can be read off it.
const doc = projectDoc()
const zone = doc.setup.zones.find((z) => z.actions !== undefined && z.actions.length > 0) ?? doc.setup.zones[0]!

const openSlotWithKnobAt = (topPx: number): HTMLElement => {
  render(<ZoneActions doc={doc} zone={{ ...zone, actions: [{ id: 'a1', label: 'Dra', steps: [{ v: 'split', count: { of: 'number', n: 1 }, to: { at: 'beside' }, face: 'keep' }] }] }} onPatch={() => undefined} />)
  const knob = document.querySelector('.byd-slot') as HTMLButtonElement
  const wrap = knob.closest('.byd-slot-wrap') as HTMLElement
  expect(wrap).toBeTruthy()
  wrap.getBoundingClientRect = () => ({ x: 100, y: topPx, top: topPx, left: 100, right: 190, bottom: topPx + 28, width: 90, height: 28, toJSON: () => ({}) }) as DOMRect
  fireEvent.click(knob)
  return document.querySelector('.byd-slot-pop') as HTMLElement
}

describe('a slot opens where there is room (#229)', () => {
  it('opens upward when it stands at the foot of the page', () => {
    window.innerHeight = 800
    window.innerWidth = 1200
    expect(openSlotWithKnobAt(740).getAttribute('data-place-y')).toBe('up')
  })

  it('opens downward when it stands at the top of it', () => {
    window.innerHeight = 800
    window.innerWidth = 1200
    expect(openSlotWithKnobAt(60).getAttribute('data-place-y')).toBe('down')
  })

  it('is never taller than the room it was given, whichever way it went', () => {
    window.innerHeight = 800
    window.innerWidth = 1200
    const pop = openSlotWithKnobAt(740)
    const tall = parseFloat(pop.style.getPropertyValue('--byd-place-room'))
    expect(tall).toBeGreaterThan(0)
    expect(tall).toBeLessThanOrEqual(740)
  })
})
