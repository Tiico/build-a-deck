// @vitest-environment jsdom
// The felt's one tab stop with arrows that follow the screen (K16, #572): `spatial` asks where each
// item is drawn and goes to the nearest one the arrow points at, never the other way.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { useRoving } from '../src/editor/roving.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Drawn as a reader sees them, in screen pixels, and in a list order that is not the screen's.
const DRAWN: Record<string, { x: number; y: number }> = { a: { x: 400, y: 300 }, b: { x: 100, y: 300 }, c: { x: 250, y: 100 }, d: { x: 700, y: 310 } }
function Felt() {
  const roving = useRoving({ ids: ['a', 'b', 'c', 'd'], selected: null, orientation: 'spatial' })
  return (
    <div>
      {Object.keys(DRAWN).map((id) => {
        const props = roving.itemProps(id)
        return (
          <button
            key={id}
            data-id={id}
            {...props}
            ref={(el) => {
              props.ref(el)
              if (el) el.getBoundingClientRect = () => ({ x: DRAWN[id]!.x - 20, y: DRAWN[id]!.y - 30, left: DRAWN[id]!.x - 20, top: DRAWN[id]!.y - 30, right: DRAWN[id]!.x + 20, bottom: DRAWN[id]!.y + 30, width: 40, height: 60, toJSON: () => ({}) }) as DOMRect
            }}
          />
        )
      })}
    </div>
  )
}
const on = (id: string) => document.querySelector(`[data-id="${id}"]`) as HTMLElement
const press = (id: string, key: string) => fireEvent.keyDown(on(id), { key })
const focused = () => (document.activeElement as HTMLElement | null)?.dataset['id']

describe('arrows that follow the screen (K16, #572)', () => {
  it('goes to what is drawn in the arrow’s direction, whatever the list order', () => {
    render(<Felt />)
    on('a').focus()
    press('a', 'ArrowRight')
    expect(focused()).toBe('d')
    press('d', 'ArrowLeft')
    expect(focused()).toBe('a')
    press('a', 'ArrowLeft')
    expect(focused()).toBe('b')
    press('b', 'ArrowUp')
    expect(focused()).toBe('c')
  })

  it('stays where it is when nothing lies that way, and keeps the arrow from scrolling the page', () => {
    render(<Felt />)
    on('d').focus()
    const passed = fireEvent.keyDown(on('d'), { key: 'ArrowRight' })
    expect(focused()).toBe('d')
    expect(passed).toBe(false)
  })

  it('keeps Home and End on the list’s own ends', () => {
    render(<Felt />)
    on('c').focus()
    press('c', 'End')
    expect(focused()).toBe('d')
    press('d', 'Home')
    expect(focused()).toBe('a')
  })
})
