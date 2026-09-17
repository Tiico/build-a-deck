import type { RuleImagePick, RuleImageTaken } from '@byd/template'
import { ASSET_IMAGE_TYPES, ASSET_MAX_BYTES } from '@byd/server/doc'
import { ASSET_PREFIX } from './assets.js'

// Taking the rulebook's pictures into the game (B7, #173).
//
// The import reads a Markdown file and comes back with addresses, and an address is the one thing
// the book may never hold: the rulebook is versioned with the cards (B4, B7), so a figure living at
// the end of a path or a URL would go missing on somebody else's schedule. What happens here is
// therefore the same thing a card's image does — the bytes become one of the game's own assets and
// the book points at `asset:<hash>`.
//
// The bytes come from the files the designer handed over with the Markdown, matched by name. That
// is how a designer who writes in her own editor actually has them: `bilder/bordet.png` beside
// `regler.md`. A browser cannot follow the path itself, so the address is read for its file name
// and nothing else — and an address pointing anywhere but at one of the handed-over files is a
// picture that did not come in, said out loud rather than dropped.
//
// Nothing is decided here about what the gate is: the accepted kinds and the weight are read from
// the same module the upload route enforces, so the reason a designer is given is the reason.
export type RuleImageWhy = 'type' | 'big' | 'missing' | 'broken'
// A picture that did not come in, with what it was called and why. `after` is kept so the proposal
// can stand it where the picture would have been; the book itself never sees it.
export type RuleImageLeft = { id: string; after: string | null; file: string; why: RuleImageWhy; bytes?: number }
export type RuleImages = { taken: RuleImageTaken[]; left: RuleImageLeft[] }

// The file name an address ends in, which is all a browser can match on. A path is not a thing it
// may open, and the folder the designer keeps her pictures in is her business.
const nameOf = (address: string): string => (address.split(/[/\\]/).pop() ?? address).split(/[?#]/)[0] ?? address

export async function takeRuleImages(
  picks: readonly RuleImagePick[],
  files: readonly File[],
  upload: (file: Blob) => Promise<string>,
  measure: (file: Blob) => Promise<{ w: number; h: number } | null> = measurePixels,
): Promise<RuleImages> {
  const byName = new Map(files.map((file) => [file.name.toLowerCase(), file]))
  // The same file named twice is one upload and one measurement: a book that shows the same
  // diagram in two sections costs what one diagram costs.
  const already = new Map<File, { src: string; px: { w: number; h: number } } | null>()
  const taken: RuleImageTaken[] = []
  const left: RuleImageLeft[] = []
  const lost = (pick: RuleImagePick, why: RuleImageWhy, bytes?: number) => left.push({ id: pick.id, after: pick.after, file: pick.address, why, ...(bytes === undefined ? {} : { bytes }) })
  for (const pick of picks) {
    const file = byName.get(nameOf(pick.address).toLowerCase())
    if (!file) {
      lost(pick, 'missing')
      continue
    }
    if (!ASSET_IMAGE_TYPES.includes(file.type)) {
      left.push({ id: pick.id, after: pick.after, file: file.name, why: 'type' })
      continue
    }
    if (file.size > ASSET_MAX_BYTES) {
      left.push({ id: pick.id, after: pick.after, file: file.name, why: 'big', bytes: file.size })
      continue
    }
    if (!already.has(file)) {
      // Measured before it is uploaded: a picture nothing can read is a picture the book cannot
      // size, and an unsized figure would be one the press guesses at.
      const px = await measure(file)
      already.set(file, px ? { src: `${ASSET_PREFIX}${await upload(file)}`, px } : null)
    }
    const got = already.get(file) ?? null
    if (!got) {
      left.push({ id: pick.id, after: pick.after, file: file.name, why: 'broken' })
      continue
    }
    // Markdown's alt text is the alt text and nothing else. A file that wrote none gives an empty
    // one, which is HTML's own word for decorative — the caption is a field of the designer's and
    // is empty after an import, because the two are written for two readers (B7).
    taken.push({ id: pick.id, src: got.src, alt: pick.alt ?? '', px: got.px })
  }
  return { taken, left }
}

// The file's own pixels, which is what the one measurement in millimetres is worked out from. It
// is done the way the deck's own pictures are measured (E1): the browser has to decode the file to
// show it anyway, so nothing here puts an image decoder anywhere else.
export async function measurePixels(file: Blob): Promise<{ w: number; h: number } | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img.naturalWidth > 0 && img.naturalHeight > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
