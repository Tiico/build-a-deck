import { strToU8, zipSync, type Zippable } from 'fflate'
import type { PreparedOrder, PrintRequirements } from '@byd/print'
import type { Issue } from '@byd/template'
import type { ProjectCredit } from './projects.js'
import { RULEBOOK_FILE } from './export.js'

// The print package as a file to keep (#1208, beslut B 2026-10-23): what would be sent to a print
// partner, in one zip that opens without the tool. Prepared by the provider the order would go to
// (F1, F2), so it is the partner's files in the partner's form and not the export's (G5).
//
//   LASMIG.md      — what is what, bleed and trim explained, in the reader's language (A4)
//   manifest.json  — the order as the provider prepared it, its requirements and the print checks
//   tryck/<file>   — a file per side of each card, named as the provider names them
//   tryck/regelhafte.pdf — the rulebook as a booklet
//
// A version the physical checks (E5) stop has no card files, by the same rule as the export (G5): the
// package is still handed over, and the findings stand in the manifest and are said in the readme.
// The file names are the format's and are never translated; ASCII, as the export's (#526).

export const PRINT_PACKAGE_FORMAT = 'byd-print-package'
export const PRINT_PACKAGE_FORMAT_VERSION = 1
export const PRINT_FOLDER = 'tryck/'

export type Finding = Issue & { cardRef: string; face: string }

export type PrintPackageManifest = {
  format: typeof PRINT_PACKAGE_FORMAT
  formatVersion: typeof PRINT_PACKAGE_FORMAT_VERSION
  createdAt: string
  release?: string
  project: { id: string; name: string }
  rev: number
  provider: { id: string; label: string; manufacturesIn: readonly string[] }
  requirements: PrintRequirements[]
  order: PreparedOrder
  // The card files in the zip, by path; none when the print checks stopped the version.
  files: string[]
  rulebook: string | null
  errors: Finding[]
  warnings: Finding[]
  // Files the renderer could not draw, by the name the order gave them.
  failed: string[]
  credits: (ProjectCredit & { name: string })[]
}

export const printPathOf = (name: string): string => `${PRINT_FOLDER}${name}`

export function packPrintPackage(parts: { manifest: PrintPackageManifest; readme: string; files: ReadonlyMap<string, Uint8Array> }): Uint8Array {
  const zip: Zippable = {
    'LASMIG.md': strToU8(parts.readme),
    'manifest.json': strToU8(`${JSON.stringify(parts.manifest, null, 2)}\n`),
  }
  // PDFs are compressed already; storing them saves the time and loses nothing.
  for (const [path, bytes] of parts.files) zip[path] = [bytes, { level: 0 }]
  return zipSync(zip, { level: 6 })
}

// What the zip is called when it is saved: the game, its version as people read it (#703), and what
// it is, in the reader's language. A header value is ASCII, so the name travels encoded beside it.
export function printPackageDisposition(name: string, rev: number, lang: 'sv' | 'en'): string {
  const file = `${name} v${rev} ${lang === 'en' ? 'print package' : 'tryckpaket'}.zip`
  const ascii = file.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file)}`
}

const mm = (n: number, lang: 'sv' | 'en'): string => (lang === 'sv' ? String(n).replace('.', ',') : String(n))

// What the package holds, said to whoever opens it, in the language it was asked for in (A4).
export function printPackageReadme(lang: 'sv' | 'en', m: PrintPackageManifest): string {
  const when = m.createdAt.slice(0, 10)
  const card = m.requirements.find((r) => r.kind === 'printed')
  const stopped = m.errors.length
  if (lang === 'en') {
    const cut = card?.kind === 'printed' ? `\nThe knife goes along the trim, ${mm(card.trim.widthMm, lang)} × ${mm(card.trim.heightMm, lang)} mm. The background carries on ${mm(card.bleedMm, lang)} mm past it on every edge, the bleed, so that a knife that slips leaves no white edge. Text and important details keep ${mm(card.safeMm, lang)} mm inside the trim, the safe margin.\n` : ''
    return `# ${m.project.name} v${m.rev}, print package ${when}

This is what a printer would be sent if ${m.project.name} were printed at version ${m.rev}: the cards as files, a list of what is to be made, and what is bought ready-made.
No order has been placed. The files are made after the requirements of ${m.provider.label}, a printer that does not exist and stands in for a real one during the beta.

- \`manifest.json\` — what is to be made: every physical card with its files (\`order.cards\`), the stock parts the printer packs (\`order.hardware\`) and those it does not (\`order.omitted\`), and the requirements the files are made after (\`requirements\`).
- \`tryck/\` — one PDF per side of each card, with bleed. Copies of a card share their files. And the rulebook, \`${RULEBOOK_FILE}\`, as an A5 booklet.${stopped > 0 ? `\n  The card files are left out: the print checks found ${stopped} errors in this version, listed in \`errors\`. Fix them in Deckster and download the package again.` : ''}
${cut}
Not in the package yet: the print for the box, and files in printing colours (CMYK).

Format \`${m.format}\`, version ${m.formatVersion}.
`
  }
  const cut = card?.kind === 'printed' ? `\nKniven går i snittet, ${mm(card.trim.widthMm, lang)} × ${mm(card.trim.heightMm, lang)} mm. Bakgrunden fortsätter ${mm(card.bleedMm, lang)} mm förbi det på varje kant, utfallet, så att en kniv som slirar inte lämnar en vit kant. Text och viktiga detaljer håller sig ${mm(card.safeMm, lang)} mm innanför snittet, skyddsmarginalen.\n` : ''
  return `# ${m.project.name} v${m.rev}, tryckpaket ${when}

Det här är vad ett tryckeri skulle få om ${m.project.name} trycktes i version ${m.rev}: korten som filer, en lista över vad som ska tillverkas, och det som köps färdigt.
Ingen beställning är lagd. Filerna är gjorda efter kraven från ${m.provider.label}, ett tryckeri som inte finns och som står i ett riktigt tryckeris ställe under betan.

- \`manifest.json\` — vad som ska tillverkas: varje fysiskt kort med sina filer (\`order.cards\`), lagervarorna som tryckeriet packar (\`order.hardware\`) och de det inte packar (\`order.omitted\`), och kraven filerna är gjorda efter (\`requirements\`).
- \`tryck/\` — en PDF per sida av varje kort, med utfall. Kopior av ett kort delar filer. Och regelhäftet, \`${RULEBOOK_FILE}\`, som häfte i A5.${stopped > 0 ? `\n  Kortfilerna är utelämnade: tryckkontrollen hittade ${stopped} fel i den här versionen, listade i \`errors\`. Rätta dem i Deckster och ladda ner paketet igen.` : ''}
${cut}
Det här finns inte i paketet ännu: tryckbilden till lådan, och filer i tryckfärger (CMYK).

Formatet \`${m.format}\`, version ${m.formatVersion}.
`
}
