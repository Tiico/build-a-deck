import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, type FaceTemplate } from '@byd/template'

export const face: FaceTemplate = {
  base: [
    { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#f4ead8', stroke: '#333', strokeMm: 0.5, radiusMm: 3 },
    { kind: 'text', id: 'title', x: 5, y: 5, w: 53, h: 10, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 14, weight: 700 }, color: '#111' },
    { kind: 'text', id: 'body', x: 5, y: 30, w: 53, h: 40, bind: { field: 'body' }, font: { family: 'sans-serif', sizePt: 9 }, color: '#222' },
  ],
  variants: {},
}

export const compiled = (row: Record<string, string>, bleed = false) =>
  compile({ type: CARD_STANDARD_63x88, face, row, icons: {}, bleed })

// PNG dimensions from the IHDR chunk.
export function pngSize(png: Uint8Array): { w: number; h: number } {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { w: dv.getUint32(16), h: dv.getUint32(20) }
}
