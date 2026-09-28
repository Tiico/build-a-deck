import { z } from 'zod'
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { ASSET_MAX_BYTES, sniffAsset } from '@byd/protocol'
import { ProjectDoc, checkedHistory, liftDoc } from './projects.js'
import { assetHash } from './assets.js'

// Full export of a game (G5, #527): the designer's data, whole, in a format they can open without
// the tool. A game is two to four years of work before it reaches a printer, and "what happens to
// it if you go away?" is the first thing the people it is for will ask; the answer is a zip that
// needs nothing of ours to be read.
//
//   spel.json      the manifest below: every version of the document, what each asset is, and
//                  which print file is which card's which face
//   schema.json    the manifest's JSON Schema, generated from the very schema that validates it
//   LASMIG.md      what each part is, in the language the export was asked for in (A4)
//   assets/        every picture and typeface any version uses, as the file it is
//   tryck/         the print-ready PDFs of the current version, with bleed, and the rulebook
//
// The names are fixed and never translated: they are a format, and a format is read by machines.
// They are ASCII, too. The zip marks a non-ASCII name as UTF-8 as it should, but the unzip macOS
// ships in its Terminal does not read the mark and writes «LÄSMIG.md» as «L+?SMIG.md».

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
  // Assets a version points at that the server did not have when it exported: the game is the
  // designer's all the same, and what was missing is said rather than left out in silence.
  absent: z.array(Hash).default([]),
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

// A card's print file. A card's id is the designer's row id and may say anything, so it is folded
// to ASCII — the accents dropped, anything else an underscore — and the manifest keeps the id as
// it is. Two ids that fold to the same name are told apart where the plan is made.
export const printFileOf = (cardRef: string, face: string, nth = 1): string => `tryck/${safe(cardRef)}${nth > 1 ? `-${nth}` : ''}-${safe(face)}.pdf`
export const RULEBOOK_FILE = 'tryck/regelhafte.pdf'
const safe = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_')

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
    'LASMIG.md': strToU8(parts.readme),
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
- \`assets/\` — every picture and typeface the game uses. A file is named by the SHA-256 of its bytes, and the document refers to it as \`asset:<that hash>\`.${m.absent.length > 0 ? `\n  ${m.absent.length} the game points at were not on the server when it was exported; they are listed in \`absent\`.` : ''}
- \`tryck/\` — print-ready PDFs of version ${m.print.rev}, with bleed: one per face of each card, and the rulebook as a booklet.${m.print.errors.length > 0 ? `\n  They are left out: the print checks stopped this version (${m.print.errors.length} findings, listed in \`print.errors\`).` : ''}

Format \`${m.format}\`, version ${m.formatVersion}.
`
  return `# ${m.project.name}, exporterat ${when}

Det här är hela spelet som det stod i version ${m.current.rev}, och varje version före den.
Det behöver ingenting utöver den här mappen för att läsas.

- \`spel.json\` — spelet. \`versions\` håller varje sparad version av dokumentet, äldst först och var och en hel; \`current.rev\` är den senaste. \`assets\` säger vilken fil som är vilken bild eller vilket typsnitt, och \`print\` vilken PDF som är vilket korts vilken sida.
- \`schema.json\` — JSON Schema för \`spel.json\`.
- \`assets/\` — varje bild och typsnitt spelet använder. En fil heter efter SHA-256 av sina byte, och dokumentet pekar på den som \`asset:<den hashen>\`.${m.absent.length > 0 ? `\n  ${m.absent.length} som spelet pekar på fanns inte på servern när det exporterades; de står i \`absent\`.` : ''}
- \`tryck/\` — tryckfärdiga PDF:er av version ${m.print.rev}, med utfall: en per sida av varje kort, och regelhäftet som häfte.${m.print.errors.length > 0 ? `\n  De är utelämnade: tryckkontrollen stoppade den här versionen (${m.print.errors.length} fynd, listade i \`print.errors\`).` : ''}

Formatet \`${m.format}\`, version ${m.formatVersion}.
`
}

// Why an export could not be read (#528, #529): a code and what it is about, never a sentence. The
// sentence is written where it is read, in the reader's language (A4).
export type ImportProblemCode =
  | 'not-zip'
  | 'no-manifest'
  | 'not-json'
  | 'not-export'
  | 'newer-format'
  | 'manifest'
  | 'history'
  | 'current-rev'
  | 'asset-missing-file'
  | 'asset-hash'
  | 'asset-too-big'
  | 'asset-format'
  | 'asset-unknown'
  | 'unplayable'
export type ImportProblem = { code: ImportProblemCode; values?: Record<string, string | number> }

// An export read back (#528): the manifest, every version lifted to today's document, and each
// asset's bytes checked against the name it carries, the kind it says it is and the size an
// upload may have. What does not hold is said, every thing at once, and nothing is kept: a zip
// is taken whole or not at all. `unlisted` are assets a version uses that the zip does not carry
// — the caller asks its own store, since an asset is the same asset wherever it was uploaded.
type ReadAsset = { bytes: Uint8Array; contentType: string; motif?: ProjectExport['assets'][number]['motif'] }
export type ReadExport =
  | { ok: true; manifest: ProjectExport; current: ProjectExport['versions'][number]['doc']; assets: Map<string, ReadAsset>; unlisted: string[] }
  | { ok: false; problems: ImportProblem[] }

export function readExport(zip: Uint8Array): ReadExport {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(zip)
  } catch {
    return { ok: false, problems: [{ code: 'not-zip' }] }
  }
  const raw = files['spel.json']
  if (!raw) return { ok: false, problems: [{ code: 'no-manifest' }] }
  let json: unknown
  try {
    json = JSON.parse(strFromU8(raw))
  } catch {
    return { ok: false, problems: [{ code: 'not-json' }] }
  }
  const head = json as { format?: unknown; formatVersion?: unknown; versions?: unknown }
  if (head.format !== EXPORT_FORMAT) return { ok: false, problems: [{ code: 'not-export' }] }
  if (typeof head.formatVersion === 'number' && head.formatVersion > EXPORT_FORMAT_VERSION)
    return { ok: false, problems: [{ code: 'newer-format', values: { version: head.formatVersion, reads: EXPORT_FORMAT_VERSION } }] }
  // Documents saved before today's shape are lifted to it, as they are when they are loaded.
  if (Array.isArray(head.versions)) for (const v of head.versions as { doc?: unknown }[]) if (v && typeof v === 'object' && v.doc) v.doc = liftDoc(v.doc)
  const parsed = ProjectExport.safeParse(json)
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.slice(0, 20).map((i) => ({ code: 'manifest', values: { path: i.path.join('.'), message: i.message } })) }
  const manifest = parsed.data
  let last: ProjectExport['versions'][number]
  try {
    last = checkedHistory(manifest.versions)
  } catch (e) {
    return { ok: false, problems: [{ code: 'history', values: { message: String((e as Error).message) } }] }
  }
  const problems: ImportProblem[] = []
  if (last.rev !== manifest.current.rev) problems.push({ code: 'current-rev' })
  const assets = new Map<string, ReadAsset>()
  for (const asset of manifest.assets) {
    const about = { hash: asset.hash, file: asset.file }
    const bytes = files[asset.file]
    if (!bytes) {
      problems.push({ code: 'asset-missing-file', values: about })
      continue
    }
    if (assetHash(bytes) !== asset.hash) {
      problems.push({ code: 'asset-hash', values: about })
      continue
    }
    if (bytes.length > ASSET_MAX_BYTES) {
      problems.push({ code: 'asset-too-big', values: about })
      continue
    }
    const format = sniffAsset(bytes)
    if (!format || format.type !== asset.contentType) {
      problems.push({ code: 'asset-format', values: { ...about, type: asset.contentType } })
      continue
    }
    assets.set(asset.hash, { bytes, contentType: format.type, ...(asset.motif ? { motif: asset.motif } : {}) })
  }
  if (problems.length > 0) return { ok: false, problems }
  // What the export said was already missing is not asked for again; anything else must be here.
  const listed = new Set([...manifest.assets.map((a) => a.hash), ...manifest.absent])
  const unlisted = [...new Set(manifest.versions.flatMap((v) => assetHashesOf(v.doc)))].filter((h) => !listed.has(h)).sort()
  return { ok: true, manifest, current: last.doc, assets, unlisted }
}

// What a copy is called when the account already has a game by that name (#529): the name with a
// word saying it was brought in, in the language it was brought in in (A4). It is written into the
// designer's document and is theirs to change like any other name.
export function importedName(name: string, taken: readonly string[], lang: 'sv' | 'en'): string {
  if (!taken.includes(name)) return name
  return `${name} ${lang === 'en' ? '(imported)' : '(importerad)'}`
}
