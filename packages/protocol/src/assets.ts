// What a file a designer hands the tool may be, and how that is decided (#204).
//
// A file arrives with a claim about itself — the name it was given, the type a browser guessed
// from that name, the `content-type` an upload declares. None of that is evidence. The bytes are,
// so the type is read out of them here, and this is the one list of what the tool takes: the
// editor asks it to tell a designer at once that her file is not a picture, and the server asks it
// as the gate that actually decides what is stored and what `/assets/<hash>` later vouches for.
// Two readings that can disagree are one reading too many, which is why it is a shared function
// and not a shared comment.
export type AssetKind = 'image' | 'vector' | 'font'

// What one file may weigh. It is the gate's limit, and the editor asks it the same question
// before an import so that a report can name the picture that was too heavy rather than let one
// upload fail where nobody is reading.
export const ASSET_MAX_BYTES = 8 * 1024 * 1024

export type AssetFormat = {
  // The type the file is stored and served as, once the bytes have said so.
  type: string
  kind: AssetKind
  // What the format is called where a person reads it, so a refusal can name what was missing.
  name: string
}

type Known = AssetFormat & { is: (bytes: Uint8Array) => boolean }

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))
const starts = (bytes: Uint8Array, at: number, head: readonly number[]): boolean => head.every((b, i) => bytes[at + i] === b)
const head = (mark: readonly number[]) => (bytes: Uint8Array) => starts(bytes, 0, mark)

const KNOWN: readonly Known[] = [
  { type: 'image/png', kind: 'image', name: 'PNG', is: head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { type: 'image/jpeg', kind: 'image', name: 'JPEG', is: head([0xff, 0xd8, 0xff]) },
  { type: 'image/gif', kind: 'image', name: 'GIF', is: (b) => starts(b, 0, ascii('GIF87a')) || starts(b, 0, ascii('GIF89a')) },
  // A WebP is a RIFF container, and RIFF alone is a sound file just as readily, so both marks
  // have to be there.
  { type: 'image/webp', kind: 'image', name: 'WebP', is: (b) => starts(b, 0, ascii('RIFF')) && starts(b, 8, ascii('WEBP')) },
  // The formats Chromium loads from a `@font-face` (B3), so a file that is taken is a file the
  // one renderer can honour. They are their own list: a typeface is not a picture, and neither
  // kind may be handed in under the other's name.
  { type: 'font/woff2', kind: 'font', name: 'WOFF2', is: head(ascii('wOF2')) },
  { type: 'font/woff', kind: 'font', name: 'WOFF', is: head(ascii('wOFF')) },
  // A TrueType file opens on the version it was cut for: 1.0 as a fixed-point number, or the
  // older Apple spelling of the same thing.
  { type: 'font/ttf', kind: 'font', name: 'TTF', is: (b) => starts(b, 0, [0x00, 0x01, 0x00, 0x00]) || starts(b, 0, ascii('true')) },
  { type: 'font/otf', kind: 'font', name: 'OTF', is: head(ascii('OTTO')) },
  // A symbol taken from the library (E4). It is a kind of its own and not one of the pictures:
  // an SVG is a document that runs, so it is taken where the tool itself fetched the file and
  // never from a picture upload — which is exactly what a kind is for. It carries no mark to
  // read, being text, so what is read instead is what the document opens with: everything before
  // the first element is prologue, and the first element has to be `svg` itself. A page that
  // merely holds a drawing somewhere inside it is a page.
  { type: 'image/svg+xml', kind: 'vector', name: 'SVG', is: (b) => opensWithSvg(b) },
]

// How much of a file its prologue may take up before this stops reading. A drawing states its
// version, perhaps a doctype and a line about who drew it; anything longer than this before the
// first element is not a file this tool takes.
const PROLOGUE_BYTES = 4096
const PROLOGUE = /^(?:\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)/i

function opensWithSvg(bytes: Uint8Array): boolean {
  // `fatal: false` because bytes that are not text at all must answer "not a drawing" rather
  // than throw: this is asked of every file that arrives, including the ones that are hostile.
  let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, PROLOGUE_BYTES)).replace(/^\uFEFF/, '')
  for (let cut = PROLOGUE.exec(text); cut; cut = PROLOGUE.exec(text)) text = text.slice(cut[0].length)
  return /^<svg[\s/>]/i.test(text)
}

// What the tool takes, in the order a person would hear them named.
export const ASSET_FORMATS: readonly AssetFormat[] = KNOWN.map(({ type, kind, name }) => ({ type, kind, name }))

// What a file is, by its bytes alone; null when it is none of the formats the tool takes.
export function sniffAsset(bytes: Uint8Array): AssetFormat | null {
  const found = KNOWN.find((format) => format.is(bytes))
  return found ? { type: found.type, kind: found.kind, name: found.name } : null
}

// Which kind an upload says it is handing over. A declared type is a claim about the file and
// decides nothing about its contents; all it does is say which of the kinds is meant, so that a
// typeface is measured against the typefaces and a picture against the pictures. A claim that is
// not one of the types the tool serves at all names no kind.
export function assetKindDeclared(declared: string): AssetKind | null {
  return ASSET_FORMATS.find((format) => format.type === declared)?.kind ?? null
}

// What a refusal has to be able to say: the formats of the kind that was asked for, named the way
// a person names them. It is read off the list itself, so a format added above is a format the
// refusal offers without anyone remembering to say so.
export function assetFormatsNamed(kind: AssetKind): string {
  const names = ASSET_FORMATS.filter((format) => format.kind === kind).map((format) => format.name)
  const last = names.at(-1) ?? ''
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${last}` : last
}
