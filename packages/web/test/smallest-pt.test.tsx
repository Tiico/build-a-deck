// @vitest-environment jsdom
// What a held-up card's smallest text was fitted to (#523), asked of the server the picture comes
// from: once per face, again while the render is still on its way, and nothing for a face there is
// no hash for.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import type { VisibleComponentState } from '@byd/protocol'
import { useSmallestPt, forgetFits } from '../src/table/smallest.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const FACES = 'http://faces.test'
const card = (front: string, cardRef: string | null = 'dragon'): VisibleComponentState => ({ id: 'c1', type: { id: 'card.standard.63x88', version: 1 }, zone: 'table', face: 'front', x: 0, y: 0, rot: 0, cardRef, faces: { front, back: 'b'.repeat(64) } })

function Probe({ c, faces = FACES }: { c: VisibleComponentState | undefined; faces?: string }) {
  const pt = useSmallestPt(faces, c)
  return <output>{pt === null ? 'okänt' : String(pt)}</output>
}
const said = () => document.querySelector('output')!.textContent

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  forgetFits()
})

describe('the smallest text of a held-up card (#523)', () => {
  it('asks /faces/:hash/fit once for the face the card shows, and remembers it', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ smallestPt: 6.5 }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const front = 'a'.repeat(64)
    const { rerender } = render(<Probe c={card(front)} />)
    expect(said()).toBe('okänt')
    await act(async () => undefined)
    expect(said()).toBe('6.5')
    rerender(<Probe c={undefined} />)
    rerender(<Probe c={card(front)} />)
    expect(said()).toBe('6.5')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(`${FACES}/faces/${front}/fit`)
  })

  it('asks for the back of a card the seat may not see, which is the face it is shown', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ smallestPt: 12 }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    render(<Probe c={card('a'.repeat(64), null)} />)
    await act(async () => undefined)
    expect(fetch).toHaveBeenCalledWith(`${FACES}/faces/${'b'.repeat(64)}/fit`)
  })

  it('asks again while the texture is still being rendered, and settles on what it is told', async () => {
    vi.useFakeTimers()
    const answers = [new Response('{"state":"queued"}', { status: 202 }), new Response(JSON.stringify({ smallestPt: 7 }), { status: 200 })]
    vi.stubGlobal('fetch', vi.fn(async () => answers.shift()!))
    render(<Probe c={card('c'.repeat(64))} />)
    await act(async () => undefined)
    expect(said()).toBe('okänt')
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    expect(said()).toBe('7')
  })

  it('says nothing, and asks nothing, without a server or a hash', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render(<Probe c={{ ...card('a'.repeat(64)), faces: undefined }} />)
    await act(async () => undefined)
    expect(said()).toBe('okänt')
    expect(fetch).not.toHaveBeenCalled()
  })
})
