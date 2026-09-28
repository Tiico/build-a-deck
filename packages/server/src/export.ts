import { z } from 'zod'
import { strToU8, zipSync, type Zippable } from 'fflate'
import { ProjectDoc } from './projects.js'

// Full export of a game (G5, #527): the designer's data, whole, in a format they can open without
// the tool. A game is two to four years of work before it reaches a printer, and "what happens to
// it if you go away?" is the first thing the people it is for will ask; the answer is a zip that
// needs nothing of ours to be read.
//
//   spel.json      the manifest below: every version of the document, what each asset is, and
//                  which print file is which card's which face
//   schema.json    the manifest's JSON Schema, generated from the very schema that validates it
//   LÄSMIG.md      what each part is, in the language the export was asked for in (A4)
//   assets/        every picture and typeface any version uses, as the file it is
//   tryck/         the print-ready PDFs of the current version, with bleed, and the rulebook
//
// The names are fixed and never translated: they are a format, and a format is read by machines.

export const EXPORT_FORMAT = 'byd-export'
export const EXPORT_FORMAT_VERSION = 1

const Hash = z.string().regex(/^[0-9a-f]{64}$/)
const Motif = z.object({ w: z.number(), h: z.number(), trim: z.object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() }) }).loose()
// A finding of the physical checks (E5), as the print route says it: which card, which face, which
// element, what code, and what was measured. The sentence is written where it is read.
const Finding = z.object({ cardRef: z.string(), face: z.string(), element: z.string(), code: z.string(), severity: z.enum(['error', 'warning']), values: z.record(z.string(), z.union([z.string(), z.number()])) })

export const ExportVersion = z.object({
  rev: z.number().int().positive(),
  at: z.string(),
  label: z.string().optional(),
  atSeq: z.number().int().nonnegative().optional(),
  doc: ProjectDoc,
})
export const ExportAsset = z.object({
  hash: Hash,
  // Where the bytes are in the zip: `assets/<hash>.<ext>`. The bytes hash to `hash`.
  file: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  motif: Motif.optional(),
})
export const ProjectExport = z.object({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.literal(EXPORT_FORMAT_VERSION),
  exportedAt: z.string(),
  release: z.string().optional(),
  project: z.object({ id: z.string(), name: z.string() }),
  // The version the document stood at when exported; it is the last of `versions`.
  current: z.object({ rev: z.number().int().positive() }),
  // Every version, oldest first, each whole: a document never depends on the one before it.
  versions: z.array(ExportVersion),
  assets: z.array(ExportAsset),
  print: z.object({
    rev: z.number().int().positive(),
    // One entry per card, with the file of each of its faces under `tryck/`.
    cards: z.array(z.object({ cardRef: z.string(), faces: z.record(z.string(), z.string()) })),
    rulebook: z.string().optional(),
    credits: z.array(z.object({ name: z.string() }).loose()),
    warnings: z.array(Finding),
    // What stops the version from going to a printer (E5). The game is exported whatever they
    // say; only its print files are left out.
    errors: z.array(Finding),
    // Print files the renderer could not make, by the file they would have had.
    failed: z.array(z.string()),
  }),
})
export type ProjectExport = z.infer<typeof ProjectExport>

// The manifest's schema, for the zip: generated, so it cannot drift from what validates.
export function exportSchema(): unknown {
  return z.toJSONSchema(ProjectExport, { io: 'input', unrepresentable: 'any' })
}

const ASSET_REF = /^asset:([0-9a-f]{64})$/

// Every asset a document uses. It walks the whole document rather than knowing its fields, so a
// place a picture can be put that is added later is exported without anyone remembering to: a
// string that is an `asset:<hash>` reference is one, wherever it stands. A picture's own entry is
// keyed by its bare hash, and it is only a use of the asset when that entry is in `pictures`.
export function assetHashesOf(doc: unknown): string[] {
  const found = new Set<string>()
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      const m = ASSET_REF.exec(value)
      if (m?.[1]) found.add(m[1])
    } else if (Array.isArray(value)) for (const v of value) walk(v)
    else if (value && typeof value === 'object') for (const v of Object.values(value)) walk(v)
  }
  walk(doc)
  const pictures = (doc as { pictures?: Record<string, unknown> } | null)?.pictures
  for (const hash of Object.keys(pictures ?? {})) if (/^[0-9a-f]{64}$/.test(hash)) found.add(hash)
  return [...found].sort()
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
}
export const assetFileOf = (hash: string, contentType: string): string => `assets/${hash}.${EXTENSIONS[contentType] ?? 'bin'}`

// A card's print file. A card's id is the designer's row id and may say anything, so what is not
// a plain letter, digit or dash becomes an underscore; the manifest keeps the id as it is.
export const printFileOf = (cardRef: string, face: string): string => `tryck/${safe(cardRef)}-${safe(face)}.pdf`
export const RULEBOOK_FILE = 'tryck/regelhäfte.pdf'
const safe = (s: string): string => s.normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu, '_')

// What the zip is called when it is saved: the game and its version. A header value is ASCII, so
// the name the browser shows travels beside it, encoded (RFC 6266).
export function exportDisposition(name: string, rev: number): string {
  const file = `${name} rev-${rev}.zip`
  const ascii = file.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file)}`
}

export function packExport(parts: { manifest: ProjectExport; readme: string; assets: ReadonlyMap<string, Uint8Array>; prints: ReadonlyMap<string, Uint8Array> }): Uint8Array {
  const files: Zippable = {
    'spel.json': strToU8(`${JSON.stringify(parts.manifest, null, 2)}\n`),
    'schema.json': strToU8(`${JSON.stringify(exportSchema(), null, 2)}\n`),
    'LÄSMIG.md': strToU8(parts.readme),
  }
  // Pictures and PDFs are compressed already; storing them saves the time and loses nothing.
  for (const [file, bytes] of parts.assets) files[file] = [bytes, { level: 0 }]
  for (const [file, bytes] of parts.prints) files[file] = [bytes, { level: 0 }]
  return zipSync(files, { level: 6 })
}

// What the zip holds, said to whoever opens it, in the language the export was asked for in (A4).
// The file names in it are the format's and stay as they are in both.
export function readmeOf(lang: 'sv' | 'en', m: ProjectExport): string {
  const when = m.exportedAt.slice(0, 10)
  if (lang === 'en')
    return `# ${m.project.name}, exported ${when}

This is the whole of the game as it stood at version ${m.current.rev}, and every version before it.
It needs nothing but this folder to be read.

- \`spel.json\` — the game. \`versions\` holds every saved version of the document, oldest first, each complete; \`current.rev\` is the latest. \`assets\` says which file is which picture or typeface, and \`print\` which PDF is which card's which face.
- \`schema.json\` — the JSON Schema of \`spel.json\`.
- \`assets/\` — every picture and typeface the game uses. A file is named by the SHA-256 of its bytes, and the document refers to it as \`asset:<that hash>\`.
- \`tryck/\` — print-ready PDFs of version ${m.print.rev}, with bleed: one per face of each card, and the rulebook as a booklet.${m.print.errors.length > 0 ? `\n  They are left out: the print checks stopped this version (${m.print.errors.length} findings, listed in \`print.errors\`).` : ''}

Format \`${m.format}\`, version ${m.formatVersion}.
`
  return `# ${m.project.name}, exporterat ${when}

Det här är hela spelet som det stod i version ${m.current.rev}, och varje version före den.
Det behöver ingenting utöver den här mappen för att läsas.

- \`spel.json\` — spelet. \`versions\` håller varje sparad version av dokumentet, äldst först och var och en hel; \`current.rev\` är den senaste. \`assets\` säger vilken fil som är vilken bild eller vilket typsnitt, och \`print\` vilken PDF som är vilket korts vilken sida.
- \`schema.json\` — JSON Schema för \`spel.json\`.
- \`assets/\` — varje bild och typsnitt spelet använder. En fil heter efter SHA-256 av sina byte, och dokumentet pekar på den som \`asset:<den hashen>\`.
- \`tryck/\` — tryckfärdiga PDF:er av version ${m.print.rev}, med utfall: en per sida av varje kort, och regelhäftet som häfte.${m.print.errors.length > 0 ? `\n  De är utelämnade: tryckkontrollen stoppade den här versionen (${m.print.errors.length} fynd, listade i \`print.errors\`).` : ''}

Formatet \`${m.format}\`, version ${m.formatVersion}.
`
}
