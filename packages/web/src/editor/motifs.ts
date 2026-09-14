import { motifOf, type Motif } from '@byd/template'
import { assetUrl } from './assets.js'

// What is drawn inside a deck's pictures, as the editor handles it (E1).
//
// A deck's art arrives one file per card, and two files holding the same motif rarely hold it at
// the same size — one carries a wide transparent border, the next almost none — so fitting the
// files draws the motif at a different size on every card. The air is therefore measured rather
// than guessed, and an image element can then be fitted by the motif instead.
//
// It is measured here, in the browser, because the browser has already decoded the file in order
// to show it: the measurement costs one draw and puts no image decoder on the server. It is a
// property of the bytes, so it is told to the server once per content hash and never measured
// again — by anyone, for any deck.

export function measureMotif(img: HTMLImageElement): Motif | null {
  // The file's own pixels, never the size it happens to be shown at: the same file is shown at a
  // different size on every surface of the editor, and the measurement belongs to the file.
  const { naturalWidth: w, naturalHeight: h } = img
  if (w <= 0 || h <= 0) return null
  const sheet = Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ink = sheet.getContext('2d', { willReadFrequently: true })
  if (!ink) return null
  try {
    ink.drawImage(img, 0, 0)
    return motifOf(ink.getImageData(0, 0, w, h))
  } catch {
    // A picture the browser will not let us read back — one served from somewhere else — cannot
    // be measured here. It is then drawn as a file, which is what every picture was until now.
    return null
  }
}

// The file at a URL, loaded and measured. Null when it will not load or will not be read back.
export async function measureAsset(url: string): Promise<Motif | null> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  try {
    await img.decode()
  } catch {
    return null
  }
  return measureMotif(img)
}

// The measurements as a preview needs them: keyed by the URL the resolved rows carry, exactly as
// `previewIcons` re-keys the icon set. The compiler is handed URLs and knows nothing of hashes.
export function previewMotifs(byHash: Record<string, Motif>, assetBase: string | undefined): Record<string, Motif> {
  if (!assetBase) return {}
  const out: Record<string, Motif> = {}
  for (const [hash, motif] of Object.entries(byHash)) out[assetUrl(assetBase, hash)] = motif
  return out
}
