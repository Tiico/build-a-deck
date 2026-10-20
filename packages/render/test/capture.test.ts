import { describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { capture } from '../src/capture.js'

// A page that has not drawn yet has nothing for Chromium to copy (#533): on a loaded runner the
// page's script is done before its compositor has a frame sink in viz, and a capture asked for in
// that gap is refused. So the capture waits for a frame the page has drawn. That ordering is the
// whole contract and cannot be provoked in a real Chromium on demand, so it is held here against
// a page that says what it was asked, in what order, and draws only when told.
function stalledPage() {
  const asked: string[] = []
  let draw: (() => void) | undefined
  const page = {
    evaluate: () => {
      asked.push('frame')
      return new Promise<void>((done) => {
        draw = done
      })
    },
    screenshot: () => {
      asked.push('shot')
      return Promise.resolve(Buffer.from('png'))
    },
  } as unknown as Page
  return { page, asked, draw: () => draw?.() }
}

describe('capture (#533)', () => {
  it('asks for the picture only once the page has drawn a frame', async () => {
    const { page, asked, draw } = stalledPage()
    const shot = capture(page, { type: 'png' })
    await new Promise((r) => setTimeout(r, 20))
    expect(asked).toEqual(['frame'])
    draw()
    expect((await shot).toString()).toBe('png')
    expect(asked).toEqual(['frame', 'shot'])
  })
})
