// @vitest-environment jsdom
// Measuring a deck's pictures where they already are (E1). The browser has decoded the file to
// show it, so the measurement costs one draw and no new dependency anywhere. What the pixels
// then say is `motifOf`'s business and is tested on its own; what is asked here is the wiring —
// the file's own size, the draw, the read back, and what happens when a browser refuses it.
import { describe, expect, it } from 'vitest'
import { measureMotif, previewMotifs } from '../src/editor/motifs.js'

// A canvas as the measuring uses one, with pixels a test decides. jsdom has no rendering at all,
// so the drawing surface is the thing being stood in for.
function withCanvas(pixels: { width: number; height: number; data: Uint8ClampedArray } | 'refuses'): { drawn: unknown[] } {
  const drawn: unknown[] = []
  const context = {
    drawImage: (...args: unknown[]) => drawn.push(args),
    getImageData: () => {
      if (pixels === 'refuses') throw new Error('the canvas has been tainted by cross-origin data')
      return pixels
    },
  }
  const make = document.createElement.bind(document)
  document.createElement = ((tag: string) => {
    const el = make(tag)
    if (tag === 'canvas') Object.assign(el, { getContext: () => context })
    return el
  }) as typeof document.createElement
  return { drawn }
}

// A picture of a given size with a border of transparent air around a flat drawing.
function pixels(size: number, border: number) {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = border; y < size - border; y++) {
    for (let x = border; x < size - border; x++) data.set([224, 43, 43, 255], (y * size + x) * 4)
  }
  return { width: size, height: size, data }
}

// jsdom loads nothing, so an image there is always 0 × 0 and its own size has to be given to it.
const image = (w: number, h: number) =>
  Object.defineProperties(new Image(), { naturalWidth: { value: w }, naturalHeight: { value: h } })

describe('measuring a picture in the editor (E1)', () => {
  it('draws the file at its own size and answers with the air around what is drawn', () => {
    const canvas = withCanvas(pixels(40, 8))

    expect(measureMotif(image(40, 40))).toEqual({ w: 40, h: 40, trim: { left: 8, top: 8, right: 8, bottom: 8 } })
    // Its own pixels, never the size it happens to be shown at: the measurement belongs to the
    // file, and the same file is shown at a different size on every surface of the editor.
    expect(canvas.drawn).toEqual([[expect.anything(), 0, 0]])
  })

  it('says nothing of a picture that has not loaded, rather than measuring an empty canvas', () => {
    withCanvas(pixels(4, 1))

    expect(measureMotif(image(0, 0))).toBeNull()
  })

  it('says nothing of a picture the browser will not let it read back', () => {
    withCanvas('refuses')

    // Such a picture is then drawn as a file, which is what every picture was until now.
    expect(measureMotif(image(10, 10))).toBeNull()
  })
})

describe('the measurements a preview needs (E1)', () => {
  const motif = { w: 10, h: 10, trim: { left: 1, top: 1, right: 1, bottom: 1 } }
  const hash = 'a'.repeat(64)

  it('keys them by the very URL the resolved rows carry, as the icon set is re-keyed', () => {
    expect(previewMotifs({ [hash]: motif }, 'http://x')).toEqual({ [`http://x/assets/${hash}`]: motif })
    // Without a place to serve pictures from there are no pictures, so there is nothing to say.
    expect(previewMotifs({ [hash]: motif }, undefined)).toEqual({})
  })
})
