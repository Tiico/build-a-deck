// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { STILL } from '../src/table/shuffle.js'
import { buildScene } from './scene.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The TV's camera follows the play by gliding for 700 ms (C5), and the whole felt pans and zooms
// when somebody else plays. A reader who has asked for less motion is not asked to watch it: the
// camera stands where it is going at once (#560 P-13, WCAG 2.3.3, the same `STILL` the shuffle's
// fan answers to).
function askedForStillness(still: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: still && query === STILL,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
afterEach(() => cleanup())

const SIZE = { w: 1280, h: 720 }
const world = () => (document.querySelector('.byd-camera-world') as HTMLElement).style.cssText

// Where the camera stands when it is told to go straight there: the same view, drawn with no glide.
function framedAt(view: Parameters<typeof TableRenderer>[0]['view']): string {
  const { unmount } = render(<TableRenderer view={view} mode="tv" camera="follow" size={SIZE} glideMs={0} />)
  const at = world()
  unmount()
  return at
}

describe('the camera and a reader who asked for less motion (#560 P-13)', () => {
  const scene = buildScene()
  const before = scene.view(null)
  const after = scene.viewAfter({ v: 'move', component: scene.faceUp, to: 'table', x: -500, y: -300 })

  it('stands where it is going at once', () => {
    askedForStillness(true)
    const target = framedAt(after)
    const { rerender } = render(<TableRenderer view={before} mode="tv" camera="follow" size={SIZE} />)
    act(() => rerender(<TableRenderer view={after} mode="tv" camera="follow" size={SIZE} />))
    expect(world()).toBe(target)
  })

  it('still glides for everyone else, so the test above is not a camera that never moves', () => {
    askedForStillness(false)
    const target = framedAt(after)
    const { rerender } = render(<TableRenderer view={before} mode="tv" camera="follow" size={SIZE} />)
    const start = world()
    act(() => rerender(<TableRenderer view={after} mode="tv" camera="follow" size={SIZE} />))
    expect(start).not.toBe(target)
    expect(world()).not.toBe(target)
  })
})
