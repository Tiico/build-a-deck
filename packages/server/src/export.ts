import { z } from 'zod'
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { ASSET_MAX_BYTES, sniffAsset } from '@byd/protocol'
import { BoxFace } from '@byd/engine'
import { ProjectDoc, checkedHistory, liftDoc } from './projects.js'
import { assetHash, assetHashesOf, svgBytesRefusal } from './assets.js'
import { PROJECT_NAME_MAX } from './edits.js'

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
//   tryck/         the print-ready PDFs of the current version, with bleed, and the rulebook; the
//                  box's faces in `tryck/lada/` (#1418)
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
// The game's box as it is measured and drawn (#1418, L91): the type the game pins, its measure out of
// the deck with the designer's locks and air, the net the sheet is folded from, and which print file
// is which face. The document's own `box` stands in every version; this is that box worked out, so a
// reader of the zip need not run our arithmetic. Derived, like the PDFs, so the import does not read it.
const Measure = z.object({ width: z.number(), height: z.number(), depth: z.number() })
export const ExportBox = z.object({
  type: z.object({ id: z.string(), version: z.number().int().nonnegative() }),
  size: Measure,
  locked: z.object({ width: z.boolean(), height: z.boolean(), depth: z.boolean() }),
  clearance: z.object({ around: z.number(), depth: z.number() }),
  net: z.object({ width: z.number(), height: z.number() }),
  // `drawn` is false for a face the designer has not drawn, which is printed as the neutral box.
  faces: z.partialRecord(BoxFace, z.object({ file: z.string(), drawn: z.boolean() })),
})
export type ExportBox = z.infer<typeof ExportBox>

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
  // Pictures blocked after a report (#1274): not in the zip, and not to be brought back with it. A
  // version that names one draws it empty, as it does on the box.
  blocked: z.array(z.object({ hash: Hash, since: z.string() })).optional(),
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
    // The box (#1418); absent from an export made before the box was.
    box: ExportBox.optional(),
  }),
})
export type ProjectExport = z.infer<typeof ProjectExport>

// The manifest's schema, for the zip: generated, so it cannot drift from what validates.
export function exportSchema(): unknown {
  return z.toJSONSchema(ProjectExport, { io: 'input', unrepresentable: 'any' })
}

// Every asset a document uses lives beside the asset store (#1197), since storage is counted out of
// exactly what an export carries; it is said here too, where the export has always asked it.
export { assetHashesOf }

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
// A face of the box (#1418), in a folder of its own: a card's file is `<id>-<face>.pdf`, and a card
// may be called `lada`.
export const BOX_PRINT_FOLDER = 'tryck/lada/'
export const boxPrintFileOf = (face: BoxFace): string => `${BOX_PRINT_FOLDER}${face}.pdf`
const safe = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_')

// What the zip is called when it is saved: the game and its version, said as people read it, «v3»
// and never the id «rev-3» (#703). A header value is ASCII, so the name the browser shows travels
// beside it, encoded (RFC 6266).
export function exportDisposition(name: string, rev: number): string {
  const file = `${name} v${rev}.zip`
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
//
// It names only what is in the zip (#1356): a game with no pictures has no `assets/`, a version
// the print checks stop has no card PDFs, and a game without a rulebook has none. What was left
// out is said on a line of its own, with why and where the manifest lists it.
export function readmeOf(lang: 'sv' | 'en', m: ProjectExport): string {
  const when = m.exportedAt.slice(0, 10)
  const en = lang === 'en'
  const blocked = m.blocked?.length ?? 0
  const cards = m.print.cards.length > 0
  const rulebook = m.print.rulebook !== undefined
  const lines: string[] = []
  if (en) {
    lines.push(
      `- \`spel.json\` — the game. \`versions\` holds every saved version of the document, oldest first, each complete; \`current.rev\` is the latest. \`assets\` says which file is which picture or typeface, and \`print\` which PDF is which card's which face.`,
      `- \`schema.json\` — the JSON Schema of \`spel.json\`.`,
    )
    if (m.assets.length > 0) lines.push(`- \`assets/\` — every picture and typeface the game uses. A file is named by the SHA-256 of its bytes, and the document refers to it as \`asset:<that hash>\`.`)
    if (m.absent.length > 0) lines.push(`- ${m.absent.length} ${m.absent.length === 1 ? 'picture or typeface' : 'pictures or typefaces'} the game points at ${m.absent.length === 1 ? 'was' : 'were'} not on the server when it was exported; listed in \`absent\`.`)
    if (blocked > 0) lines.push(`- ${blocked} ${blocked === 1 ? 'picture' : 'pictures'} the game points at ${blocked === 1 ? 'is' : 'are'} blocked after a report and not included; listed in \`blocked\`, and the cards that used ${blocked === 1 ? 'it' : 'them'} stand without.`)
    if (cards || rulebook) lines.push(`- \`tryck/\` — ${cards ? `print-ready PDFs of version ${m.print.rev}, with bleed: one per face of each card${rulebook ? ', and the rulebook as a booklet' : ''}` : `the rulebook of version ${m.print.rev} as a booklet`}.`)
    if (m.print.errors.length > 0) lines.push(`- The cards' print-ready PDFs are left out: the print checks stopped version ${m.print.rev} (${m.print.errors.length} ${m.print.errors.length === 1 ? 'finding' : 'findings'}, listed in \`print.errors\`).`)
    if (m.print.failed.length > 0) lines.push(`- ${m.print.failed.length} print ${m.print.failed.length === 1 ? 'file' : 'files'} could not be made and ${m.print.failed.length === 1 ? 'is' : 'are'} left out; listed in \`print.failed\`.`)
    if (m.print.box) lines.push(...boxLines('en', m.print.box))
    return `# ${m.project.name}, exported ${when}

This is the whole of the game as it stood at version ${m.current.rev}, and every version before it.
It needs nothing but this folder to be read.

${lines.join('\n')}

Format \`${m.format}\`, version ${m.formatVersion}.
`
  }
  lines.push(
    `- \`spel.json\` — spelet. \`versions\` håller varje sparad version av dokumentet, äldst först och var och en hel; \`current.rev\` är den senaste. \`assets\` säger vilken fil som är vilken bild eller vilket typsnitt, och \`print\` vilken PDF som är vilket korts vilken sida.`,
    `- \`schema.json\` — JSON Schema för \`spel.json\`.`,
  )
  if (m.assets.length > 0) lines.push(`- \`assets/\` — varje bild och typsnitt spelet använder. En fil heter efter SHA-256 av sina byte, och dokumentet pekar på den som \`asset:<den hashen>\`.`)
  if (m.absent.length > 0) lines.push(`- ${m.absent.length} ${m.absent.length === 1 ? 'bild eller typsnitt' : 'bilder eller typsnitt'} som spelet pekar på fanns inte på servern när det exporterades; de står i \`absent\`.`)
  if (blocked > 0) lines.push(`- ${blocked} ${blocked === 1 ? 'bild' : 'bilder'} som spelet pekar på ${blocked === 1 ? 'är spärrad' : 'är spärrade'} efter en anmälan och följer inte med; de står i \`blocked\`, och korten som använde dem står kvar utan.`)
  if (cards || rulebook) lines.push(`- \`tryck/\` — ${cards ? `tryckfärdiga PDF:er av version ${m.print.rev}, med utfall: en per sida av varje kort${rulebook ? ', och regelhäftet som häfte' : ''}` : `regelhäftet för version ${m.print.rev} som häfte`}.`)
  if (m.print.errors.length > 0) lines.push(`- Kortens tryckfärdiga PDF:er är utelämnade: tryckkontrollen stoppade version ${m.print.rev} (${m.print.errors.length} fynd, listade i \`print.errors\`).`)
  if (m.print.failed.length > 0) lines.push(`- ${m.print.failed.length} ${m.print.failed.length === 1 ? 'tryckfil' : 'tryckfiler'} kunde inte skapas och följer inte med; de står i \`print.failed\`.`)
  if (m.print.box) lines.push(...boxLines('sv', m.print.box))
  return `# ${m.project.name}, exporterat ${when}

Det här är hela spelet som det stod i version ${m.current.rev}, och varje version före den.
Det behöver ingenting utöver den här mappen för att läsas.

${lines.join('\n')}

Formatet \`${m.format}\`, version ${m.formatVersion}.
`
}

// The box in LASMIG (#1418): where its faces are, what it measures and what is the designer's, and
// that the files a printer folds it from come with the partner (L91, F1, F2).
const mmOf = (n: number, lang: 'sv' | 'en'): string => (lang === 'sv' ? String(n).replace('.', ',') : String(n))
const SIDE_WORDS = { sv: { width: 'bredden', height: 'höjden', depth: 'djupet' }, en: { width: 'the width', height: 'the height', depth: 'the depth' } } as const
function boxLines(lang: 'sv' | 'en', box: ExportBox): string[] {
  const files = Object.values(box.faces).filter((f) => f !== undefined)
  const drawn = files.filter((f) => f.drawn).length
  const size = `${mmOf(box.size.width, lang)} × ${mmOf(box.size.height, lang)} × ${mmOf(box.size.depth, lang)} mm`
  const locked = (['width', 'height', 'depth'] as const).filter((side) => box.locked[side]).map((side) => SIDE_WORDS[lang][side])
  const lockedSaid = locked.length === 0 ? '' : lang === 'sv' ? `, och ${locked.join(' och ')} ${locked.length === 1 ? 'är låst' : 'är låsta'}` : `, and ${locked.join(' and ')} ${locked.length === 1 ? 'is' : 'are'} locked`
  if (lang === 'en') {
    const said = drawn === 0 ? `No face is drawn yet, so all ${files.length} are the neutral box with the game's name and the deck's colour` : `${drawn} of ${files.length} faces ${drawn === 1 ? 'is' : 'are'} drawn, and the rest are the neutral box`
    return [
      `- \`tryck/lada/\` — the box's faces as print-ready PDFs with bleed, one per face: a tuckbox of ${size} (width × height × depth)${lockedSaid}. ${said}. Its measure, locks, air and net are in \`print.box\`, and what the designer drew is the document's \`box\`.`,
      `- The box's print files for a printer, with the die line and in printing colours (CMYK), come once a print partner is chosen.`,
    ]
  }
  const said = drawn === 0 ? `Ingen yta är ritad än, så alla ${files.length} är den neutrala lådan med spelets namn och lekens färg` : `${drawn} av ${files.length} ytor ${drawn === 1 ? 'är ritad' : 'är ritade'}, och resten är den neutrala lådan`
  return [
    `- \`tryck/lada/\` — lådans ytor som tryckfärdiga PDF:er med utfall, en per yta: en tuckbox på ${size} (bredd × höjd × djup)${lockedSaid}. ${said}. Måtten, låsen, luften och nätet står i \`print.box\`, och det designern ritat står i dokumentets \`box\`.`,
    `- Lådans tryckfiler till ett tryckeri, med stansform och i tryckfärger (CMYK), kommer när en tryckpartner är vald.`,
  ]
}

// What the window that hands the zip over says about it (#1356), in a header beside the zip: the
// version, how many findings stopped its card PDFs, and how many print files could not be made.
// Read off the same manifest LASMIG is written from, so the two cannot say different things.
export const EXPORT_SUMMARY_HEADER = 'x-byd-export'
export function exportSummaryOf(m: ProjectExport): string {
  return JSON.stringify({ rev: m.print.rev, errors: m.print.errors.length, failed: m.print.failed.length })
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
  | 'asset-unsafe'
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
    // A drawing is held to the allowlist `POST /assets` holds it to (#1087): a zip is the other
    // door into the store, and the gate is no gate if a hand-made export walks round it.
    const unsafe = format.type === 'image/svg+xml' ? svgBytesRefusal(bytes) : null
    if (unsafe) {
      problems.push({ code: 'asset-unsafe', values: { ...about, reason: unsafe } })
      continue
    }
    assets.set(asset.hash, { bytes, contentType: format.type, ...(asset.motif ? { motif: asset.motif } : {}) })
  }
  if (problems.length > 0) return { ok: false, problems }
  // What the export said was already missing is not asked for again; anything else must be here.
  const listed = new Set([...manifest.assets.map((a) => a.hash), ...manifest.absent, ...(manifest.blocked ?? []).map((b) => b.hash)])
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

// What a duplicated game is called (#738): the name with a word saying it is a copy, in the reader's
// language (A4), and a number from the second on, so the account never has two games of one name to
// tell apart. It is held to a name's length (#476) by shortening the original's part: the word that
// says it is a copy is what tells the two tiles apart.
export function duplicatedName(name: string, taken: readonly string[], lang: 'sv' | 'en'): string {
  const word = lang === 'en' ? 'copy' : 'kopia'
  for (let n = 1; ; n++) {
    const tail = ` (${word}${n === 1 ? '' : ` ${n}`})`
    const candidate = `${name.slice(0, PROJECT_NAME_MAX - tail.length).trimEnd()}${tail}`
    if (!taken.includes(candidate)) return candidate
  }
}
