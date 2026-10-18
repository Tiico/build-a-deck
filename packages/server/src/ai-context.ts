import { plainOf, renderRules, type Element, type RenderedBlock } from '@byd/template'
import type { ProjectDoc } from './projects.js'
import { ANTAL, columnsOf } from './edits.js'
import { arrangementOf, counterId, namesOfProject } from './names.js'

// The game as the model reads it (#1001, E4, PRD module 3): a project document in, one text out.
//
// Pure, and deterministic to the byte: the same document always gives the same text, so a
// conversation about a game that has not changed sends the same prefix every time and the
// providers' prompt caches hit. Nothing here reads a clock, a random number or the network, and
// nothing is ordered by anything but the document's own order.
//
// It is written in English because it is the tool talking to the model and not to the designer;
// everything the designer wrote — names, cards, rules — is carried exactly as written (A4), and the
// instructions say which language to answer in. A rule names a zone, a card or a counter by what it
// is called now and never by its id (B7), so the model reads the book a player reads.
//
// Large decks are sent whole for now; summarising them within a budget is #1007, and this is the
// seam it will be built in.

// What the model is told to be, before it is told about the game. Kept apart from the context so
// that the context — the large, cacheable part — is the game and nothing else.
export const AI_INSTRUCTIONS = [
  'You are the AI help in the editor of a tool for designing card and board games that are played digitally at a shared table.',
  'The designer you talk to is making the game described below. Answer questions about it: its cards, fields, template, rules, icons and colour roles.',
  'Always answer in the language the designer writes in. Names, card text and rules are the designer’s own words: quote them exactly as written and never translate them.',
  'Be concise and concrete, and refer to cards, zones and fields by the names the designer gave them.',
  'You cannot change the game from here: say what you would change in words, and never claim to have changed anything.',
  'Never write HTML or CSS. Card text uses only the inline syntax described below.',
].join('\n')

// What is sent, in the parts the editor names to the designer before she asks («Skickas till …»).
export type AiContextParts = { cards: number; template: boolean; rules: boolean; table: boolean }
export function aiContextParts(doc: ProjectDoc): AiContextParts {
  return {
    cards: doc.rows.length,
    template: Object.keys(doc.template.faces).length > 0,
    rules: (doc.rules?.blocks.length ?? 0) > 0,
    table: doc.setup.zones.length > 0,
  }
}

const VISIBILITY: Record<'all' | 'owner' | 'none', string> = {
  all: 'face up, everyone sees the cards',
  owner: 'only its owner sees the cards',
  none: 'face down, nobody sees the cards',
}

export function aiContextOf(doc: ProjectDoc): string {
  const out: string[] = []
  const line = (text = '') => out.push(text)
  const names = namesOfProject(doc)

  line(`# Game: ${doc.name}`)
  line()
  line('## Players and table')
  line(`Seats: ${doc.setup.seats.join(', ')} (${doc.setup.seats.length} players)`)
  const zoneName = (id: string) => names.zones[id] ?? id
  line(`Cards start in: ${zoneName(doc.setup.deckZone)}`)
  line(`Cards played without a place land on: ${zoneName(doc.setup.floor)}`)
  line('Zones:')
  for (const zone of doc.setup.zones) {
    const parts = [`${zone.kind}`, VISIBILITY[zone.visibility]]
    if (zone.owner !== undefined) parts.push(`belongs to seat ${zone.owner}`)
    if (zone.fill) parts.push(`starts with the cards where ${zone.fill.map((c) => `${c.field} is ${c.is.join(' or ')}`).join(' and ')}`)
    if (zone.bottom) parts.push(`the card ${names.cards[zone.bottom.cardRef] ?? zone.bottom.cardRef} always lies last`)
    if (zone.actions?.length) parts.push(`actions: ${zone.actions.map((a) => a.label).join(', ')}`)
    line(`- ${zone.name}: ${parts.join('; ')}`)
  }
  const counters = doc.setup.counters ?? []
  if (counters.length > 0) line(`Every seat counts: ${counters.map((c) => `${names.counters[counterId(c)] ?? c.name} (starts at ${c.start})`).join(', ')}`)
  line()

  const columns = columnsOf(doc).filter((f) => f !== ANTAL)
  const images = imageFieldsOf(doc)
  line('## Fields')
  line('Every card is a row with these columns. A column has no declared type; this is how its values read.')
  line('- id: the card’s key, unique in the deck')
  line(`- ${ANTAL}: number — how many copies of the card the deck holds (1 when empty)`)
  for (const field of columns) line(`- ${field}: ${images.includes(field) ? 'image' : kindOf(doc, field)}`)
  line()

  const copies = doc.rows.reduce((n, row) => n + countOf(row.fields[ANTAL]), 0)
  line(`## Cards (${doc.rows.length} rows, ${copies} cards counting ${ANTAL})`)
  line('One card per line, as JSON; empty fields are left out, and so is a count of 1.')
  for (const row of doc.rows) {
    const card: Record<string, unknown> = { id: row.id }
    const count = countOf(row.fields[ANTAL])
    if (count !== 1) card[ANTAL] = count
    for (const field of columns) {
      const value = row.fields[field]
      if (value === undefined || value === null || value === '') continue
      card[field] = value
    }
    line(JSON.stringify(card))
  }
  line()

  line('## Template')
  line('Cards are 63 × 88 mm. Each face is drawn from elements in millimetres (text, image, icons, shape, group, if); a text or image element is bound to a column or to a literal.')
  for (const [id, face] of Object.entries(doc.template.faces)) {
    line(`### Face: ${id}`)
    line(`Base elements: ${JSON.stringify(face.base)}`)
    if (face.variantBy !== undefined) line(`Variants chosen by the column: ${face.variantBy}`)
    if (Object.keys(face.variants).length > 0) line(`Variants (override or remove base elements by id): ${JSON.stringify(face.variants)}`)
  }
  line()

  if (doc.rules && doc.rules.blocks.length > 0) {
    const rendered = renderRules(doc.rules, names, arrangementOf(doc))
    line(`## Rulebook: ${rendered.title}`)
    for (const block of rendered.blocks) for (const text of blockText(block)) line(text)
    line()
  }

  line('## Theme')
  const icons = Object.keys(doc.icons)
  line(`Icons: ${icons.length > 0 ? icons.join(', ') : 'none'}`)
  const roles = Object.entries(doc.palette ?? {})
  line(`Colour roles: ${roles.length > 0 ? roles.map(([role, colour]) => `${role} = ${colour}`).join(', ') : 'none'}`)
  const fonts = Object.keys(doc.fonts ?? {})
  if (fonts.length > 0) line(`Fonts: ${fonts.join(', ')}`)
  line()

  line('## Card text syntax')
  line('Text in a card’s cells uses exactly these constructions and nothing else:')
  line('- **bold** and *italic*')
  line('- {icon} draws one of the game’s icons by name, and {icon|role} draws it in a colour role’s colour')
  line('- {2}, a bare number in braces, draws a pip with that number')
  line('- a blank line starts a new paragraph')
  line('- a line that starts with "- " is a bullet point')
  return out.join('\n')
}

// A count as the engine reads it (L4): a whole number of copies, one when nothing is said.
function countOf(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 1
}

// How a column's values read (L4): numbers when every value is one, yes/no when every value is a
// truth, text otherwise. The same reading the table sorts by.
function kindOf(doc: ProjectDoc, field: string): 'number' | 'yes/no' | 'text' {
  const values = doc.rows.map((row) => row.fields[field]).filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
  if (values.length === 0) return 'text'
  if (values.every((v) => typeof v === 'boolean')) return 'yes/no'
  if (values.every((v) => typeof v === 'number' || (typeof v === 'string' && Number.isFinite(Number(v.trim()))))) return 'number'
  return 'text'
}

// The columns the template draws as pictures, on any face and in any variant.
function imageFieldsOf(doc: ProjectDoc): string[] {
  const out: string[] = []
  const walk = (els: readonly Element[]) => {
    for (const el of els) {
      if (el.kind === 'image' && 'field' in el.bind && !out.includes(el.bind.field)) out.push(el.bind.field)
      if (el.kind === 'if' || el.kind === 'group') walk(el.children)
    }
  }
  for (const face of Object.values(doc.template.faces)) {
    walk(face.base)
    for (const v of Object.values(face.variants)) walk(v.override ?? [])
  }
  return out
}

// A rendered block as the lines a reader of the book reads.
function blockText(block: RenderedBlock): string[] {
  switch (block.kind) {
    case 'heading':
      return [`${'#'.repeat(block.level)} ${plainOf(block.children)}`]
    case 'text':
      return block.paragraphs.map((p) => plainOf(p.children))
    case 'list':
      return block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${plainOf(item)}`)
    case 'setup':
      return [
        `[Setup${block.caption ? `: ${block.caption}` : ''}] On the table: ${block.common.map((z) => z.name).join(', ') || 'nothing'}`,
        ...block.seats.map((s) => `[Setup] Seat ${s.id}: ${s.zones.map((z) => z.name).join(', ') || 'nothing'}`),
      ]
    case 'image':
      return [block.alt || block.caption ? `[Picture: ${[block.alt, block.caption].filter(Boolean).join(' — ')}]` : '[Picture]']
  }
}
