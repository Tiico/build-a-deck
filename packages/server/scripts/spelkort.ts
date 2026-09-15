// The seed game (README, "Demodata"): a game that has been played for real, as its design sheet
// exports it — one line per physical card, with the card's title, text, type and rarity. Both
// seed scripts start from the document built here, and test/spelkort.test.ts holds it to the
// sheet: every card in the export is in the deck, and the faces say what the sheet says.
import { readFileSync } from 'node:fs'
import type { Element, FaceTemplate, Template } from '@byd/template'
import type { ProjectDoc, ProjectRow } from '../src/projects.js'
import { openingSetup, SWEDISH_WORDS, type Zone } from '../src/recipe.js'

export const SPELKORT_CSV = new URL('./spelkort.csv', import.meta.url)
// One line of the sheet, keyed by its header: `card title`, `description`, `cardtype`, `rarity`,
// `title color`, `back rarity icon` and the rest.
export type SheetCard = Record<string, string>

export function readSpelkort(): SheetCard[] {
  return parseSheet(readFileSync(SPELKORT_CSV, 'utf8'))
}

// CSV as the spreadsheet exports it: a header line, then one record per line, RFC-style quotes
// with doubled quotes and line breaks inside them. Cells are trimmed at the ends only, so a
// description keeps its own line breaks.
export function parseSheet(text: string): SheetCard[] {
  const [head, ...records] = splitCsv(text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'))
  if (!head) return []
  const headers = head.map((h) => h.trim())
  return records
    .filter((cells) => cells.some((cell) => cell.trim().length > 0))
    .map((cells) => Object.fromEntries(headers.map((header, i) => [header, (cells[i] ?? '').trim()])))
}

function splitCsv(text: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') cell += c
      else if (text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
    } else if (c === '"') quoted = true
    else if (c === ',') {
      record.push(cell)
      cell = ''
    } else if (c === '\n') {
      record.push(cell)
      records.push(record)
      record = []
      cell = ''
    } else cell += c
  }
  if (cell.length > 0 || record.length > 0) {
    record.push(cell)
    records.push(record)
  }
  return records
}

// The sheet lists physical cards; the deck lists distinct ones with a count (L4). Two lines
// that say the same thing are one row with `antal` 2. The id is the title, unless the title is
// shared by different cards — four different "Duel" cards, one per rarity — in which case the
// rarity tells them apart, and a number after that.
export function rowsOfSheet(cards: readonly SheetCard[]): ProjectRow[] {
  const rows: { fields: { title: string; typ: string; raritet: string; body: string }; antal: number }[] = []
  for (const card of cards) {
    const fields = { title: card['card title'] ?? '', typ: card['cardtype'] ?? '', raritet: card['rarity'] ?? '', body: card['description'] ?? '' }
    const same = rows.find((r) => r.fields.title === fields.title && r.fields.typ === fields.typ && r.fields.raritet === fields.raritet && r.fields.body === fields.body)
    if (same) same.antal++
    else rows.push({ fields, antal: 1 })
  }
  const taken = new Set<string>()
  return rows.map(({ fields, antal }) => {
    const title = slug(fields.title)
    const shared = rows.filter((r) => slug(r.fields.title) === title).length > 1
    const base = shared ? `${title}-${slug(fields.raritet)}` : title
    let id = base
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
    taken.add(id)
    return { id, fields: { ...fields, antal } }
  })
}

export function spelkortRows(text: string): ProjectRow[] {
  return rowsOfSheet(parseSheet(text))
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// What colour each rarity is, as the sheet colours the titles: read off the sheet rather than
// written here, so a rarity the sheet adds arrives with its colour.
export function rarityColours(cards: readonly SheetCard[]): Record<string, string> {
  const colours: Record<string, string> = {}
  for (const card of cards) {
    const rarity = card['rarity'] ?? ''
    const colour = card['title color'] ?? ''
    if (rarity && colour && !(rarity in colours)) colours[rarity] = colour
  }
  return colours
}

// The types whose rarity the sheet also prints on the back — the shop and trap cards, which are
// dealt and bought face down but by rarity.
export function typesWithRarityOnBack(cards: readonly SheetCard[]): string[] {
  return [...new Set(cards.filter((card) => (card['back rarity icon'] ?? '') !== 'RarityIcon=NONE').map((card) => card['cardtype'] ?? ''))]
}

// The band colour of each card type. The sheet has none of its own: these are the seed's.
export const TYPE_COLOURS: Record<string, string> = {
  Playcard: '#6b4a2b',
  Location: '#2f5d3a',
  Effect: '#8b2e2e',
  Event: '#3a4d7a',
  'Trap+': '#4f6d2a',
  'Trap-': '#5a2a4a',
  Character: '#7a2a6b',
  Shopcard: '#8a5514',
}
const PAPER = '#f6efe0'
const INK = '#2b2118'
const LIGHT = '#fff8e7'

const rect = (id: string, x: number, y: number, w: number, h: number, style: { fill?: string; stroke?: string; strokeMm?: number; radiusMm?: number }): Element => ({ kind: 'shape', id, x, y, w, h, shape: 'rect', ...style })

// A pill in the rarity's colour with the rarity's name on it: one condition per rarity chooses
// the colour (L3), and one text says the name.
function rarityPill(colours: Record<string, string>, x: number, y: number): Element[] {
  const pills: Element[] = Object.entries(colours).map(([rarity, fill]) => ({
    kind: 'if',
    id: `if-${slug(rarity)}`,
    when: { field: 'raritet', equals: rarity },
    children: [rect(`pill-${slug(rarity)}`, x, y, 26, 6, { fill, radiusMm: 3 })],
  }))
  return [...pills, { kind: 'text', id: 'raritet', x, y: y + 0.3, w: 26, h: 5.4, bind: { field: 'raritet' }, font: { family: 'system-ui, sans-serif', sizePt: 8.5, weight: 700, align: 'center' }, color: '#000000', fit: 'fixed' }]
}

// The card's physical rules (E5) shape the layout: a background runs 3 mm past the trim into the
// bleed, everything else keeps 3 mm inside it, and no text is set under 8.5 pt.
const BLEED = 3
const SAFE = 3
const W = 63
const H = 88
const background = (id: string, fill: string): Element => rect(id, -BLEED, -BLEED, W + 2 * BLEED, H + 2 * BLEED, { fill })
const band = (id: string, y: number, h: number, type: string): Element => rect(id, SAFE, y, W - 2 * SAFE, h, { fill: TYPE_COLOURS[type] ?? '#6b4a2b', radiusMm: 2.5 })

export function spelkortTemplate(cards: readonly SheetCard[]): Template {
  const colours = rarityColours(cards)
  const types = Object.keys(TYPE_COLOURS)
  const onBack = new Set(typesWithRarityOnBack(cards))
  const front: FaceTemplate = {
    variantBy: 'typ',
    base: [
      background('paper', PAPER),
      band('band', SAFE, 13, 'Playcard'),
      rect('frame', SAFE, SAFE, W - 2 * SAFE, H - 2 * SAFE, { stroke: '#3b2a1a', strokeMm: 0.5, radiusMm: 3 }),
      { kind: 'text', id: 'title', x: 5, y: 4.5, w: 53, h: 7, bind: { field: 'title' }, font: { family: 'Georgia, serif', sizePt: 12, weight: 800 }, color: LIGHT, fit: 'shrink' },
      { kind: 'text', id: 'typ', x: 5, y: 11.5, w: 40, h: 4, bind: { field: 'typ' }, font: { family: 'system-ui, sans-serif', sizePt: 8.5, weight: 700 }, color: LIGHT, fit: 'fixed' },
      { kind: 'text', id: 'body', x: 5, y: 19, w: 53, h: 55, bind: { field: 'body' }, font: { family: 'system-ui, sans-serif', sizePt: 8.5, lineHeight: 1.25 }, color: INK, fit: 'shrink' },
      ...rarityPill(colours, 5, 77),
    ],
    variants: Object.fromEntries(types.map((type) => [type, { override: [band('band', SAFE, 13, type)] }])),
  }
  // The back names the type, so the decks can be told apart face down, and carries the rarity
  // where the sheet does.
  const back: FaceTemplate = {
    variantBy: 'typ',
    base: [
      background('bg', '#2a1f14'),
      rect('inner', SAFE, SAFE, W - 2 * SAFE, H - 2 * SAFE, { stroke: '#c9a25a', strokeMm: 0.6, radiusMm: 3 }),
      band('band', 36, 16, 'Playcard'),
      { kind: 'text', id: 'typ', x: 5, y: 40, w: 53, h: 8, bind: { field: 'typ' }, font: { family: 'Georgia, serif', sizePt: 13, weight: 800, align: 'center' }, color: LIGHT, fit: 'shrink' },
    ],
    variants: Object.fromEntries(types.map((type) => [type, { override: [band('band', 36, 16, type), ...(onBack.has(type) ? rarityPill(colours, 18.5, 58) : [])] }])),
  }
  return { faces: { front, back } }
}

// The table the game is played at: the recipe's zones (K2) with the game's own words for them —
// the market is the saloon the shop cards are bought in — a place in front of every seat for
// traps and characters, and gold to count (C4).
export function spelkortDoc(players = 4): ProjectDoc {
  const cards = readSpelkort()
  const words = { ...SWEDISH_WORDS, draw: 'Kortlek' }
  const opened = openingSetup({ players, counters: [{ name: 'Guld', start: 0 }] }, words)
  // The saloon is a zone of the game's own, laid where the market knob used to lay one (B5).
  const saloon: Zone = { id: 'market', kind: 'area', name: "Sal's Saloon", visibility: 'all', geometry: { x: -260, y: -200, w: 520, h: 120, rot: 0 }, shortcut: { label: 'Till saloonen', at: 'top' } }
  const setup = { ...opened, zones: [...opened.zones, saloon] }
  return { name: "Sal's Saloon", template: spelkortTemplate(cards), rows: rowsOfSheet(cards), icons: {}, setup }
}
