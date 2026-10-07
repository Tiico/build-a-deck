// PROTOTYP — kastas (#940). En falsk, deterministisk leverantör: ingen nyckel, inget nät.
// Allt den föreslår byggs ur projektets egna kolumner, värden och mall, så att förslaget ritas av
// den riktiga kompilatorn på riktiga kort (E2) och inte av en attrapp.
import type { Element, FaceTemplate } from '@byd/template'
import type { ProjectDoc, ProjectRow } from '../../types.js'
import { fieldsOf } from '../../fields.js'

export type Ask =
  | { kind: 'kort'; prompt: string }
  | { kind: 'urval'; prompt: string; ids: string[] }
  | { kind: 'kolumn'; prompt: string; field: string }
  | { kind: 'mall'; prompt: string }
  | { kind: 'fråga'; prompt: string }
  | { kind: 'förfina'; prompt: string; previous: Proposal }

export type Change = { id: string; field: string; from: string; to: string }
export type Proposal = {
  id: string
  // Vad förslaget gör, i ord: «7 nya kort, 3 ändrade».
  summary: string
  newRows: ProjectRow[]
  changes: Change[]
  newFields: string[]
  face?: FaceTemplate
  version: number
  from: Ask['kind']
}
export type Outcome = 'svar' | 'nyckel' | 'oanvandbart'
export type Provider = 'Anthropic' | 'OpenAI'
export type Failure = { kind: 'leverantör' | 'oanvändbart'; title: string; text: string; action?: 'byt-nyckel' | 'igen' }

// Det strömmade svaret, som ett manus: text i bitar, förslagets delar när de kommer, och slutet.
export type Beat = { at: number } & ({ text: string } | { row: ProjectRow } | { change: Change } | { face: FaceTemplate } | { done: Proposal | null } | { fail: Failure })

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const has = (doc: ProjectDoc, field: string) => fieldsOf(doc).includes(field)

// Ord för ord, som en ström ser ut: ungefär 35 ms per ord, med ett andetag efter varje mening.
function words(text: string, from: number, pace = 34): { beats: Beat[]; end: number } {
  const beats: Beat[] = []
  let at = from
  for (const piece of text.split(/(?<=\s)/)) {
    beats.push({ at, text: piece })
    at += pace + (/[.!?:]\s*$/.test(piece) ? 160 : 0)
  }
  return { beats, end: at }
}

// Sju fällkort i saloonens ton, med lekens egna typer och rariteter.
const TRAPS: { title: string; typ: string; raritet: string; body: string; antal: number }[] = [
  { title: 'Spottkoppen', typ: 'Trap-', raritet: 'Koppar', body: 'När någon slår en etta: den spelaren dricker 2 och ger dig 1 guld.', antal: 3 },
  { title: 'Lös planka', typ: 'Trap-', raritet: 'Koppar', body: 'Nästa spelare som går in i saloonen snubblar: hoppa över ett köp och drick 2.', antal: 3 },
  { title: 'Falskspelaren', typ: 'Trap-', raritet: 'Silver', body: 'När någon vinner en duell mot dig: byt plats på era stöldgods. Förloraren dricker 3.', antal: 2 },
  { title: 'Sheriffens tips', typ: 'Trap+', raritet: 'Koppar', body: 'När någon säljer stöldgods: du får 1 guld från banken.', antal: 3 },
  { title: 'Gömd revolver', typ: 'Trap+', raritet: 'Silver', body: 'Vänd när du utmanas på duell: du vinner automatiskt. Dela ut 3.', antal: 2 },
  { title: 'Tom flaska', typ: 'Trap+', raritet: 'Guld', body: 'Vänd när du ska dricka 4 eller fler: ge hälften till valfri spelare.', antal: 1 },
  { title: 'Bartenderns skuld', typ: 'Trap-', raritet: 'Guld', body: 'Nästa gång någon köper i saloonen betalar du 1 guld av priset. Drick 1 per guld du saknar.', antal: 1 },
]

function slug(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
function freshId(doc: ProjectDoc, base: string, taken: Set<string>): string {
  const ids = new Set([...doc.rows.map((r) => r.id), ...taken])
  let id = base
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`
  taken.add(id)
  return id
}

// Nya kort i lekens egna kolumner: ett fält som leken inte har skrivs inte, och ett fält som leken
// har men som förslaget inte vet något om får lekens vanligaste värde.
function newCards(doc: ProjectDoc, count: number): ProjectRow[] {
  const fields = fieldsOf(doc)
  const taken = new Set<string>()
  return TRAPS.slice(0, count).map((card) => {
    const row: Record<string, string | number> = {}
    for (const f of fields) {
      if (f in card) row[f] = card[f as keyof typeof card]
      else if (f === 'antal') row[f] = 1
      else row[f] = commonest(doc, f)
    }
    if (!has(doc, 'title')) row[fields[0] ?? 'title'] = card.title
    return { id: freshId(doc, slug(card.title), taken), fields: row }
  })
}
function commonest(doc: ProjectDoc, field: string): string {
  const counts = new Map<string, number>()
  for (const r of doc.rows) {
    const v = str(r.fields[field])
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

// «Drick 6», «Förloraren dricker 7», «Dela ut 4»: talen ett kort straffar med.
const PENALTY = /((?:[Dd]rick(?:er)?|[Dd]ela ut)\s+)(\d+)/g
function shift(text: string, by: number): string {
  return text.replace(PENALTY, (_, lead: string, n: string) => `${lead}${Math.max(1, Number(n) + by)}`)
}
function hardest(doc: ProjectDoc, n: number): ProjectRow[] {
  const score = (r: ProjectRow) => Math.max(0, ...[...str(r.fields['body']).matchAll(PENALTY)].map((m) => Number(m[2])))
  return [...doc.rows].filter((r) => score(r) >= 6).sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id)).slice(0, n)
}
function softened(rows: ProjectRow[], by: number): Change[] {
  return rows.flatMap((r) => {
    const from = str(r.fields['body'])
    const to = shift(from, by)
    return to === from ? [] : [{ id: r.id, field: 'body', from, to }]
  })
}

const RARITY_COPIES: Record<string, number> = { Koppar: 4, Silver: 3, Guld: 2, Diamant: 1 }
const RARITY_COST: Record<string, number> = { Koppar: 1, Silver: 2, Guld: 3, Diamant: 5 }

// En mall i den riktiga elementmodellen (L1): kostnaden i ett mynt uppe till vänster, namnet,
// en bildyta som platshållare (E4: ingen bildgenerering) och effekttexten. Spelets egna färger,
// varianter per typ och raritetsbrickor följer med från den mall som redan finns.
export function proposedFace(doc: ProjectDoc, coinMm = 11): FaceTemplate {
  const now = doc.template.faces['front']
  const kept = (now?.base ?? []).filter((e) => (e.kind === 'if' && e.when.field === 'raritet') || e.id === 'raritet')
  const LIGHT = '#fff8e7'
  const INK = '#2b2118'
  const rect = (id: string, x: number, y: number, w: number, h: number, more: Partial<Extract<Element, { kind: 'shape' }>>): Element => ({ kind: 'shape', id, x, y, w, h, shape: 'rect', ...more })
  const titleAt = (x: number): Element => ({ kind: 'text', id: 'title', x, y: 4.6, w: 58 - x, h: 7, bind: { field: 'title' }, font: { family: 'Georgia, serif', sizePt: 12, weight: 800 }, color: LIGHT, fit: 'shrink' })
  const typAt = (x: number): Element => ({ kind: 'text', id: 'typ', x, y: 11.4, w: 40, h: 4, bind: { field: 'typ' }, font: { family: 'system-ui, sans-serif', sizePt: 8.5, weight: 700 }, color: LIGHT, fit: 'fixed' })
  const inset = 5.5 + coinMm
  const coin: Element = {
    kind: 'if',
    id: 'om-kostnad',
    name: 'Kostnad',
    when: { field: 'kostnad', nonEmpty: true },
    children: [
      { kind: 'shape', id: 'mynt', x: 3.6, y: 3.6, w: coinMm, h: coinMm, shape: 'circle', fill: '#e2b13c', stroke: '#3b2a1a', strokeMm: 0.5 },
      { kind: 'text', id: 'kostnad', x: 3.6, y: 3.6 + coinMm * 0.18, w: coinMm, h: coinMm * 0.7, bind: { field: 'kostnad' }, font: { family: 'Georgia, serif', sizePt: Math.round(coinMm * 1.05), weight: 800, align: 'center' }, color: INK, fit: 'fixed' },
    ],
  }
  const variants: FaceTemplate['variants'] = {}
  for (const [name, v] of Object.entries(now?.variants ?? {})) variants[name] = { ...v, override: [...(v.override ?? [])] }
  // Butikskorten bär en kostnad: myntet läggs till i deras variant och namnet flyttar åt sidan för
  // det. Basen — det duken visar under «Bas (alla)» — har inget mynt.
  const shop = variants['Shopcard'] ?? { override: [] }
  variants['Shopcard'] = { ...shop, override: [...(shop.override ?? []).filter((e) => e.id !== 'title' && e.id !== 'typ'), titleAt(inset), typAt(inset), coin] }
  return {
    ...(now?.variantBy ? { variantBy: now.variantBy } : {}),
    base: [
      rect('paper', -3, -3, 69, 94, { fill: '#f6efe0' }),
      rect('band', 3, 3, 57, 13, { fill: '#6b4a2b', radiusMm: 2.5 }),
      rect('frame', 3, 3, 57, 82, { stroke: '#3b2a1a', strokeMm: 0.5, radiusMm: 3 }),
      rect('bildyta', 5, 18, 53, 25, { name: 'Bildyta', fill: '#e8dcc3', radiusMm: 2, pattern: { kind: 'stripes', color: '#d8c8a8', scaleMm: 3, angleDeg: 45, weight: 0.35 } }),
      titleAt(5),
      typAt(5),
      { kind: 'text', id: 'body', x: 5, y: 45.5, w: 53, h: 29, bind: { field: 'body' }, font: { family: 'system-ui, sans-serif', sizePt: 8.5, lineHeight: 1.25 }, color: INK, fit: 'shrink' },
      ...kept,
    ],
    variants,
  }
}

const say = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
export function summarize(p: Pick<Proposal, 'newRows' | 'changes' | 'face' | 'newFields'>): string {
  const parts: string[] = []
  if (p.face) {
    const cards = new Set(p.changes.map((c) => c.id)).size
    return `Ny mall för framsidan${p.newFields.length ? `, och fältet ${p.newFields.join(', ')} på ${cards} kort` : ''}`
  }
  if (p.newFields.length) parts.push(say(p.newFields.length, 'nytt fält', 'nya fält'))
  if (p.newRows.length) parts.push(say(p.newRows.length, 'nytt kort', 'nya kort'))
  const changedCards = new Set(p.changes.map((c) => c.id)).size
  if (changedCards) parts.push(say(changedCards, 'ändrat', 'ändrade'))
  return parts.join(', ').replace(/^./, (c) => c.toUpperCase())
}

let serial = 0
function proposal(from: Ask['kind'], parts: Pick<Proposal, 'newRows' | 'changes' | 'newFields'> & { face?: FaceTemplate }, version = 1): Proposal {
  return { id: `forslag-${++serial}`, version, from, summary: summarize(parts), ...parts }
}

// Vad som skickas med en fråga, i ord: det designern ser i kontextraden.
export function contextOf(doc: ProjectDoc, ask: Pick<Ask, 'kind'> & { ids?: string[]; field?: string }): string[] {
  const parts = [`${doc.rows.length} kort`, 'regelbok', 'mallen']
  if (ask.ids?.length) parts.unshift(ask.ids.length === 1 ? `valt: ${ask.ids[0]}` : `${ask.ids.length} markerade`)
  if (ask.field) parts.unshift(`kolumnen ${ask.field}`)
  return parts
}

// Från en fråga till ett manus. Allt är bestämt i förväg: samma fråga på samma lek ger samma svar.
export function script(doc: ProjectDoc, ask: Ask, outcome: Outcome, provider: Provider): Beat[] {
  const beats: Beat[] = []
  const add = (text: string, from: number) => {
    const w = words(text, from)
    beats.push(...w.beats)
    return w.end
  }
  if (outcome === 'nyckel') {
    return [{ at: 900, fail: { kind: 'leverantör', title: `Nyckeln godtogs inte av ${provider}`, text: `${provider} svarade att nyckeln är ogiltig — den kan ha tagits bort eller gått ut. Ingenting skickades vidare och ingenting ändrades.`, action: 'byt-nyckel' } }]
  }
  let at = 700
  let result: Proposal | null = null
  switch (ask.kind) {
    case 'kort': {
      const soften = /mild|hård|balans/i.test(ask.prompt)
      const rows = newCards(doc, 7)
      const changes = soften ? softened(hardest(doc, 3), -2) : []
      at = add(`Leken har ${doc.rows.filter((r) => /^Trap/.test(str(r.fields['typ']))).length} fällkort, alla i Trap+ och Trap−. Jag följer regelbokens guld och klunkar och lekens rariteter, och håller korten billiga: mest Koppar och Silver. `, at)
      for (const row of rows) {
        beats.push({ at, row })
        at += 330
      }
      if (changes.length) {
        const worst = changes.map((c) => Math.max(...[...c.from.matchAll(PENALTY)].map((m) => Number(m[2]))))
        at = add(`De ${changes.length} hårdaste korten straffar med ${worst.join(', ').replace(/, (\d+)$/, ' och $1')} klunkar; jag sänker dem med två. `, at)
        for (const change of changes) {
          beats.push({ at, change })
          at += 260
        }
      }
      at = add('Inget av korten finns redan i leken.', at)
      result = proposal('kort', { newRows: rows, changes, newFields: [] })
      break
    }
    case 'urval': {
      const chosen = doc.rows.filter((r) => ask.ids.includes(r.id))
      const by = /hård|dyr|mer|fler|större/i.test(ask.prompt) ? 1 : -1
      let changes = softened(chosen, by)
      if (changes.length === 0) changes = chosen.map((r) => ({ id: r.id, field: 'antal', from: str(r.fields['antal'] ?? 1), to: String(Math.max(1, Number(r.fields['antal'] ?? 1) + by)) }))
      at = add(`${chosen.length === 1 ? 'Kortet' : `De ${chosen.length} korten`} ${by < 0 ? 'blir mildare' : 'blir hårdare'}: ${changes[0]?.field === 'antal' ? 'antalet ändras, eftersom texten inte har något tal att ändra' : 'talen i texten ändras med ett, inget annat'}. `, at)
      for (const change of changes) {
        beats.push({ at, change })
        at += 240
      }
      result = proposal('urval', { newRows: [], changes, newFields: [] })
      break
    }
    case 'kolumn': {
      const field = ask.field
      let changes: Change[] = []
      if (field === 'antal' && has(doc, 'raritet')) {
        changes = doc.rows.flatMap((r) => {
          const want = RARITY_COPIES[str(r.fields['raritet'])]
          const now = str(r.fields['antal'] ?? 1)
          return want === undefined || String(want) === now ? [] : [{ id: r.id, field, from: now, to: String(want) }]
        })
        at = add(`Antalet följer rariteten i resten av leken: Koppar 4, Silver 3, Guld 2, Diamant 1. ${changes.length} kort avviker. `, at)
      } else {
        const empty = doc.rows.filter((r) => str(r.fields[field]) === '')
        const value = commonest(doc, field)
        changes = empty.map((r) => ({ id: r.id, field, from: '', to: value }))
        at = add(changes.length ? `${changes.length} kort saknar ${field}; jag fyller dem med det vanligaste värdet, «${value}». ` : `Alla ${doc.rows.length} kort har redan ett värde i ${field}, så det finns inget att fylla. Be mig skriva om dem om det är det du vill. `, at)
      }
      for (const change of changes.slice(0, 12)) {
        beats.push({ at, change })
        at += 120
      }
      for (const change of changes.slice(12)) beats.push({ at, change })
      result = changes.length ? proposal('kolumn', { newRows: [], changes, newFields: [] }) : null
      break
    }
    case 'mall': {
      const face = proposedFace(doc)
      const shops = doc.rows.filter((r) => str(r.fields['typ']) === 'Shopcard')
      const changes = shops.map((r) => ({ id: r.id, field: 'kostnad', from: '', to: String(RARITY_COST[str(r.fields['raritet'])] ?? 2) }))
      at = add('En mall med myntet uppe till vänster, namnet och typen i bandet, en bildyta och effekttexten under. Bandets färg per typ och raritetsbrickan behålls från din mall. ', at)
      beats.push({ at, face })
      at += 400
      at = add(`Leken har inget fält för kostnad, så jag föreslår ett nytt, kostnad, och fyller det på de ${shops.length} butikskorten efter raritet. Myntet ritas bara på kort som har en kostnad. `, at)
      for (const change of changes) {
        beats.push({ at, change })
        at += 90
      }
      result = proposal('mall', { newRows: [], changes, newFields: ['kostnad'], face })
      break
    }
    case 'fråga': {
      const hits = doc.rows.filter((r) => /tärning/i.test(str(r.fields['body'])))
      at = add(`${hits.length} kort nämner tärningen: ${hits.slice(0, 8).map((r) => str(r.fields['title']) || r.id).join(', ')}${hits.length > 8 ? ` och ${hits.length - 8} till` : ''}. Regelboken säger inte hur många tärningar som finns på bordet — det kan vara värt en rad. `, at)
      result = null
      break
    }
    case 'förfina': {
      const prev = ask.previous
      const harder = /hård|dyr|större|mer/i.test(ask.prompt)
      const fewer = /färre|bara|ta bort/i.test(ask.prompt)
      const newRows = (fewer ? prev.newRows.slice(0, Math.max(1, prev.newRows.length - 3)) : prev.newRows).map((r) => ({ ...r, fields: { ...r.fields, ...(typeof r.fields['body'] === 'string' ? { body: shift(r.fields['body'], harder ? 1 : -1) } : {}) } }))
      const changes = prev.changes.map((c) => (c.field === 'body' ? { ...c, to: shift(c.to, harder ? 1 : -1) } : c))
      const face = prev.face ? proposedFace(doc, harder ? 14 : 9) : undefined
      at = add(fewer ? `Färre kort: jag behåller de ${newRows.length} första. ` : prev.face ? `Myntet blir ${harder ? 'större' : 'mindre'}; namnet flyttar med. ` : `Alla tal i förslaget ${harder ? 'höjs' : 'sänks'} med ett. `, at)
      for (const row of newRows) {
        beats.push({ at, row })
        at += 160
      }
      if (face) beats.push({ at, face })
      result = proposal(prev.from, { newRows, changes, newFields: prev.newFields, ...(face ? { face } : {}) }, prev.version + 1)
      break
    }
  }
  if (outcome === 'oanvandbart' && ask.kind !== 'fråga') {
    beats.push({ at: at + 200, fail: { kind: 'oanvändbart', title: 'Förslaget gick inte att använda', text: 'Svaret hänvisade till fältet «styrka» och ikonen {sköld}, som spelet inte har. Det var AI:ns svar som var fel, inte ditt spel — ingenting ändrades.', action: 'igen' } })
    return beats
  }
  beats.push({ at: at + 120, done: result })
  return beats
}

// Förslaget lagt på en kopia av dokumentet: bara de delar som är valda.
export function applied(doc: ProjectDoc, p: Proposal, picked: ReadonlySet<string> | null): ProjectDoc {
  const keep = (key: string) => picked === null || picked.has(key)
  // En mall och fälten den kräver är en del: kostnaden på butikskorten hör till myntet.
  const rows = doc.rows.map((r) => {
    const mine = p.changes.filter((c) => c.id === r.id && keep(p.face ? 'mall' : r.id))
    if (!mine.length) return r
    const fields = { ...r.fields }
    for (const c of mine) fields[c.field] = c.field === 'antal' || c.field === 'kostnad' ? Number(c.to) : c.to
    return { ...r, fields }
  })
  const added = p.newRows.filter((r) => keep(r.id))
  const template = p.face && keep('mall') ? { ...doc.template, faces: { ...doc.template.faces, front: p.face } } : doc.template
  const columns = doc.columns && p.newFields.length && keep('mall') ? [...doc.columns, ...p.newFields.filter((f) => !doc.columns!.includes(f))] : doc.columns
  return { ...doc, template, rows: [...rows, ...added], ...(columns ? { columns } : {}) }
}

// Förslagets delar, som designern väljer bland: nya kort och ändrade kort per id, och mallen.
export function partsOf(p: Proposal): string[] {
  return [...(p.face ? ['mall'] : []), ...p.newRows.map((r) => r.id), ...(p.face ? [] : new Set(p.changes.map((c) => c.id)))]
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI']
// En stor lek (sample-deck-hides-density): provleken gånger n, med egna id:n.
export function scaled(doc: ProjectDoc, times: number): ProjectDoc {
  if (times <= 1) return doc
  const rows: ProjectRow[] = [...doc.rows]
  for (let k = 2; k <= times; k++) for (const r of doc.rows) rows.push({ id: `${r.id}-${k}`, fields: { ...r.fields, ...(typeof r.fields['title'] === 'string' ? { title: `${r.fields['title']} ${ROMAN[k] ?? k}` } : {}) } })
  return { ...doc, rows }
}
