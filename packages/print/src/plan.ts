import { typeKey } from '@byd/engine'
import type { TypeRef } from '@byd/protocol'
import type { PrintProvider } from './provider.js'
import { PrintManifest, type PreparedCard, type PreparedFile, type PreparedOrder, type PrintedRequirements } from './schema.js'

export type FilePlan = Pick<PreparedOrder, 'files' | 'cards' | 'hardware' | 'omitted'>

// What every adapter's `prepare` has in common: which files a partner gets, named and measured
// after its `requirements()`, and which hardware it packs. Each adapter adds its own steps.
//
// A picture is one file however many cards show it: the base back of fifty cards is drawn once,
// and a group's back is another file (L7). Files come in the order the manifest first names
// them, side by side within a card in the order the partner lists its sides, so the same
// manifest is always the same plan.
export function planFiles(provider: Pick<PrintProvider, 'id' | 'supports' | 'requirements'>, input: PrintManifest): FilePlan {
  const manifest = PrintManifest.parse(input)
  const files: PreparedFile[] = []
  const named = new Map<string, string>()
  const perSide = new Map<string, number>()
  const used = new Set<string>()

  const cards = manifest.cards.map((card): PreparedCard => {
    const req = printed(provider, card.type)
    const unknown = Object.keys(card.faces).filter((face) => !(face in req.sides))
    if (unknown.length > 0) throw new Error(`${provider.id} prints no side «${unknown.join('», «')}» of ${typeKey(card.type)}`)
    const out: Record<string, string> = {}
    for (const [face, side] of Object.entries(req.sides)) {
      const content = card.faces[face]
      if (content === undefined) continue
      const key = JSON.stringify([typeKey(card.type), face, content])
      let name = named.get(key)
      if (name === undefined) {
        const n = (perSide.get(side) ?? 0) + 1
        perSide.set(side, n)
        name = unique(used, nameOf(req, { n, cardRef: card.cardRef, face, side }))
        named.set(key, name)
        files.push({ name, type: card.type, cardRef: card.cardRef, face, side, content, trim: req.trim, bleedMm: req.bleedMm, safeMm: req.safeMm, file: req.file, colorSpace: req.colorSpace })
      }
      out[face] = name
    }
    return { cardRef: card.cardRef, type: card.type, sku: req.sku, files: out }
  })

  const counted = new Map<string, { type: TypeRef; count: number }>()
  for (const item of manifest.hardware) {
    const seen = counted.get(typeKey(item.type))
    if (seen) seen.count += item.count
    else counted.set(typeKey(item.type), { type: item.type, count: item.count })
  }
  const hardware: FilePlan['hardware'] = []
  const omitted: FilePlan['omitted'] = []
  for (const { type, count } of counted.values()) {
    const req = provider.supports(type) ? provider.requirements(type) : undefined
    if (req?.kind === 'printed') throw new Error(`${provider.id} prints ${typeKey(type)}; it is not hardware`)
    if (req) hardware.push({ type, sku: req.sku, count })
    else omitted.push({ type, count, reason: 'not-packed' })
  }
  return { files, cards, hardware, omitted }
}

// The widest bleed any of the providers asks for the type, or nothing when none of them prints it.
// What the physical checks (E5) hold a card to when no partner is chosen (#1207): a card that
// passes then passes every one of them, and the type's own bleed stands where none prints it.
export function widestBleedMm(providers: readonly Pick<PrintProvider, 'supports' | 'requirements'>[], type: TypeRef): number | undefined {
  const bleeds = providers.flatMap((p) => {
    const req = p.supports(type) ? p.requirements(type) : undefined
    return req?.kind === 'printed' ? [req.bleedMm] : []
  })
  return bleeds.length > 0 ? Math.max(...bleeds) : undefined
}

// Whether the provider prints the type, rather than packing it as stock or not making it at all.
export const prints = (provider: Pick<PrintProvider, 'supports' | 'requirements'>, type: TypeRef): boolean => provider.supports(type) && provider.requirements(type).kind === 'printed'

function printed(provider: Pick<PrintProvider, 'id' | 'supports' | 'requirements'>, type: TypeRef): PrintedRequirements {
  const req = provider.supports(type) ? provider.requirements(type) : undefined
  if (req?.kind !== 'printed') throw new Error(`${provider.id} does not print ${typeKey(type)}`)
  return req
}

// Folded the way the export folds a card id (#527): what any file system takes.
const safe = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_')

function nameOf(req: PrintedRequirements, at: { n: number; cardRef: string; face: string; side: string }): string {
  const stem = req.fileName
    .replaceAll('{n}', String(at.n))
    .replaceAll('{cardRef}', safe(at.cardRef))
    .replaceAll('{face}', safe(at.face))
    .replaceAll('{side}', safe(at.side))
  return `${stem}.${req.file.format}`
}

// Two cards whose ids fold to the same name are numbered apart, as the export does.
function unique(used: Set<string>, name: string): string {
  const dot = name.lastIndexOf('.')
  let candidate = name
  for (let nth = 2; used.has(candidate); nth++) candidate = `${name.slice(0, dot)}-${nth}${name.slice(dot)}`
  used.add(candidate)
  return candidate
}
