// What a drawn file measures, read off its own bytes (#1207): a PNG's and a JPEG's pixels from
// their headers, and a PDF's page from its MediaBox. The suite holds a provider's files to its
// `requirements()` by these, so the proof is the file that would be sent and not the order that
// asked for it.

export type Measured = { kind: 'raster'; format: 'png' | 'jpg'; widthPx: number; heightPx: number } | { kind: 'vector'; format: 'pdf'; widthMm: number; heightMm: number }

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function measureFile(bytes: Uint8Array): Measured {
  if (PNG.every((b, i) => bytes[i] === b)) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { kind: 'raster', format: 'png', widthPx: dv.getUint32(16), heightPx: dv.getUint32(20) }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { kind: 'raster', format: 'jpg', ...jpegSize(bytes) }
  const text = new TextDecoder('latin1').decode(bytes)
  if (text.startsWith('%PDF')) {
    const m = /\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/.exec(text)
    if (!m) throw new Error('a PDF with no MediaBox')
    const mm = (pt: number) => (pt / 72) * 25.4
    return { kind: 'vector', format: 'pdf', widthMm: mm(Number(m[3]) - Number(m[1])), heightMm: mm(Number(m[4]) - Number(m[2])) }
  }
  throw new Error('neither a PNG, a JPEG nor a PDF')
}

// The width and height in a JPEG's start-of-frame marker.
function jpegSize(bytes: Uint8Array): { widthPx: number; heightPx: number } {
  const u16 = (at: number) => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0)
  for (let at = 2; at + 9 < bytes.length; ) {
    if (bytes[at] !== 0xff) throw new Error(`a JPEG with no marker at ${at}`)
    const marker = bytes[at + 1] ?? 0
    if (marker >= 0xc0 && marker <= 0xc3) return { heightPx: u16(at + 5), widthPx: u16(at + 7) }
    at += 2 + u16(at + 2)
  }
  throw new Error('a JPEG with no start of frame')
}
