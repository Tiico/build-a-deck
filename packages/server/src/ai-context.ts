import { CARD_STANDARD_63x88 } from '@byd/engine'
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
// The context has a budget (#1007). A deck that fits is sent whole. One that does not is summarised:
// how every field's values are spread over the whole deck, and a sample of cards written whole,
// chosen evenly through the deck and from every variant — never at random, so the same deck is the
// same sample and the same bytes. The template, the rules and the theme are always sent whole, and
// the cards a question is about (the selected ones, the ones a proposal being refined changes) go
// whole with the question itself, never through the budget.
//
// The budget is in the providers' tokens, estimated from the bytes (`estimatedTokens`), since there
// is no tokenizer for either provider to run here. 32 000 of them, about 96 kB: the 77-card sample
// deck (27 kB) goes whole with room to spare, and so does a deck of some 150 cards with fifteen
// fields; the 308-card deck of fifteen fields (173 kB whole) is summarised. Both default models read
// far more — Claude Sonnet 5.5 a million tokens and GPT-5 272 000 in — so the budget leaves room for
// the answer (16 000), the instructions, the proposal schema, a long conversation and a large
// selection; what it bounds is what the designer's own key pays for a question about a game that
// changed since the last one, and how long the first word takes (DRIFT §1, the AI section).
export const AI_CONTEXT_BUDGET = 32_000
// Tokens from text, without a tokenizer: three bytes of UTF-8 a token. Anthropic gives about 3.5
// English characters a token, OpenAI about 4; Swedish words and JSON are cut finer than English
// prose, and counting bytes counts å, ä and ö twice, so this errs towards more tokens, never fewer.
export function estimatedTokens(text: string): number {
  return Math.ceil(utf8Length(text) / 3)
}
const BUDGET_BYTES = AI_CONTEXT_BUDGET * 3
// How many different values of a column are counted one by one; a column with more of them, or with
// values longer than a label, is free text and is described by its lengths instead.
const DISTINCT_CAP = 24
const LABEL_CHARS = 60

// What the model is told to be, before it is told about the game. Kept apart from the context so
// that the context — the large, cacheable part — is the game and nothing else.
export const AI_INSTRUCTIONS = [
  'You are the AI help in the editor of a tool for designing card and board games that are played digitally at a shared table.',
  'The designer you talk to is making the game described below. Answer questions about it: its cards, fields, template, rules, icons and colour roles.',
  'Always answer in the language the designer writes in. Names, card text and rules are the designer’s own words: quote them exactly as written and never translate them.',
  'Be concise and concrete, and refer to cards, zones and fields by the names the designer gave them.',
  'When the designer asks for new cards, or for changes to cards the game has, propose them — with the propose tool when it is offered, or as the proposal of a structured answer — and say in a sentence or two what you propose. Otherwise answer in words and propose nothing.',
  'A proposed card fills every field the template draws on it, and antal: how many copies the deck holds. It uses the game’s own fields, icons and colour roles and nothing else, and differs from the cards the game already has. Never write a picture: the art is the designer’s own, so leave picture fields out.',
  'A changed card goes in changes: the id of a card the game has, and only the fields that change, each with its new value; antal changes how many copies the deck holds. Write each value as the column reads: a number in a column of numbers. When the designer has selected cards, "these" and "the selected cards" mean them.',
  'When the designer describes a card type, or asks for a change to the template, propose a template: the whole face, every element of it in drawing order — the ones you keep as well as the ones you change — in millimetres, each element wholly inside the card or its bleed. Write the elements as one flat list, and put an element in a group or an if by naming that element’s id as its parent. Use the game’s fields, fonts, colour roles and icons; write a colour as #rrggbb or as a colour role’s name. A field the template needs and the game does not have goes in fields, with its value for each card the game has that needs one; never a picture. Groups (variants) are chosen by a column, as the game’s are.',
  'Nothing you propose changes the game until the designer accepts it. Anything else you would change, say in words, and never claim to have changed anything.',
  'Write your answer as plain text: paragraphs separated by a blank line, points as lines that start with "- ", and **bold** or *italic* where it helps. No headings, tables, links or code blocks; the editor shows nothing else.',
  'Never write HTML or CSS. Card text uses only the inline syntax described below.',
].join('\n')

// What is sent, in the parts the editor names to the designer before she asks («Skickas till …»),
// and whether the deck went whole or summarised (#1007), so that the chip says «308 kort
// (sammanfattade)» off the same decision the context is built with.
export type AiContextParts = { cards: number; summarised: boolean; template: boolean; rules: boolean; table: boolean }
export function aiContextParts(doc: ProjectDoc): AiContextParts {
  return {
    cards: doc.rows.length,
    summarised: planOf(doc).summarised,
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
  return built(doc)
}

// The context in its three parts: what comes before the cards (the game, its table and its fields),
// the cards, and what comes after (the template, the rules, the theme and the card text syntax). The
// first and the last are always whole; the cards are whole when the whole fits the budget, and
// summarised when it does not. Whether it fits is a sum of bytes, so the editor can ask it (the
// chips) without the text being written.
function planOf(doc: ProjectDoc) {
  const head = headOf(doc)
  const tail = tailOf(doc)
  const columns = cardColumnsOf(doc)
  const rows = doc.rows.map((row) => cardLineOf(row, columns))
  const sizes = rows.map((line) => utf8Length(line) + 1)
  const copies = doc.rows.reduce((n, row) => n + countOf(row.fields[ANTAL]), 0)
  const heading = `## Cards (${doc.rows.length} rows, ${copies} cards counting ${ANTAL}`
  const wholeFrame = [head, `${heading})`, 'One card per line, as JSON; empty fields and pictures are left out, and so is a count of 1.', '', tail]
  const wholeBytes = utf8Length(wholeFrame.join('\n')) + sizes.reduce((a, b) => a + b, 0)
  return { head, tail, rows, sizes, copies, heading, wholeFrame, summarised: wholeBytes > BUDGET_BYTES }
}

function built(doc: ProjectDoc): string {
  const plan = planOf(doc)
  const { head, tail, rows, sizes, heading, wholeFrame } = plan
  if (!plan.summarised) return [...wholeFrame.slice(0, 3), ...rows, ...wholeFrame.slice(3)].join('\n')

  // Summarised: the spread of every field over the whole deck, and as many cards as the budget
  // leaves room for, written as the whole deck writes them.
  const variantBy = Object.values(doc.template.faces).find((face) => face.variantBy !== undefined)?.variantBy
  const values = valuesOf(doc, plan.copies)
  const frame = (count: number) => [
    head,
    values,
    '',
    `${heading} — summarised)`,
    `A sample of ${count} of the ${doc.rows.length} rows, chosen evenly through the deck${variantBy !== undefined ? ` and from every ${variantBy}` : ''}, one per line as JSON; empty fields and pictures are left out, and so is a count of 1. The other rows exist but are not written here: when a question needs them, ask the designer to select them.`,
    '',
    tail,
  ]
  const frameBytes = utf8Length(frame(0).join('\n')) - 1
  const bytesOf = (sample: readonly number[]) => frameBytes + String(sample.length).length + sample.reduce((n, i) => n + (sizes[i] ?? 0), 0)
  const average = sizes.reduce((a, b) => a + b, 0) / Math.max(1, sizes.length)
  // A guess from the average card, then one card fewer until the whole text fits: cards differ in
  // length, and the sample's own count is written in it.
  let size = Math.max(0, Math.min(rows.length - 1, Math.floor((BUDGET_BYTES - frameBytes) / average)))
  let sample = sampleOf(doc, variantBy, size)
  while (size > 0 && bytesOf(sample) > BUDGET_BYTES) sample = sampleOf(doc, variantBy, --size)
  const lines = frame(sample.length)
  return [...lines.slice(0, 5), ...sample.map((i) => rows[i] ?? ''), ...lines.slice(5)].join('\n')
}

function headOf(doc: ProjectDoc): string {
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
  return out.join('\n')
}

function tailOf(doc: ProjectDoc): string {
  const out: string[] = []
  const line = (text = '') => out.push(text)
  line('## Template')
  const { widthMm, heightMm } = CARD_STANDARD_63x88.physical
  const { bleedMm, safeMm } = CARD_STANDARD_63x88.print
  line(`Cards are ${widthMm} × ${heightMm} mm, from (0, 0) at the top left. A background reaches ${bleedMm} mm past each edge, the bleed, so the knife leaves no white line; text and symbols stay ${safeMm} mm inside it.`)
  line('Each face is drawn from elements in millimetres (text, image, icons, shape, group, if); a text or image element is bound to a column or to a literal.')
  for (const [id, face] of Object.entries(doc.template.faces)) {
    line(`### Face: ${id}`)
    line(`Base elements: ${JSON.stringify(face.base)}`)
    if (face.variantBy !== undefined) line(`Variants chosen by the column: ${face.variantBy}`)
    if (Object.keys(face.variants).length > 0) line(`Variants (override or remove base elements by id): ${JSON.stringify(face.variants)}`)
  }
  line()

  if (doc.rules && doc.rules.blocks.length > 0) {
    const rendered = renderRules(doc.rules, namesOfProject(doc), arrangementOf(doc))
    line(`## Rulebook: ${oneLine(rendered.title)}`)
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

// The columns a card in the deck is written with: every column but the count, which is written
// apart, and the pictures, which are the designer's own and whose cells hold only where the picture
// is kept.
function cardColumnsOf(doc: ProjectDoc): string[] {
  const images = imageFieldsOf(doc)
  return columnsOf(doc).filter((f) => f !== ANTAL && !images.includes(f))
}

// A card as the deck writes it: its id, its count when it is not one, and its filled fields.
function cardLineOf(row: ProjectDoc['rows'][number], columns: readonly string[]): string {
  const card: Record<string, unknown> = { id: row.id }
  const count = countOf(row.fields[ANTAL])
  if (count !== 1) card[ANTAL] = count
  for (const field of columns) {
    const value = row.fields[field]
    if (value === undefined || value === null || value === '') continue
    card[field] = value
  }
  return JSON.stringify(card)
}

// How every field's values are spread over the whole deck (#1007): the count's total, a number
// column's range, each of a few labels with how many cards have it, a free text's lengths, and how
// many cards have a picture — with the empty cells counted, so the sample's gaps are not mistaken
// for the deck's. In the deck's column order, and every list in an order the values alone decide.
function valuesOf(doc: ProjectDoc, copies: number): string {
  const n = doc.rows.length
  const out = ['## Values across the deck', `The deck has ${n} cards (${copies} counting ${ANTAL}), more than are written whole here: this is how each field's values are spread over all ${n} of them.`]
  const counted = <T>(values: readonly T[]) => {
    const seen = new Map<T, number>()
    for (const v of values) seen.set(v, (seen.get(v) ?? 0) + 1)
    return [...seen.entries()]
  }
  const times = (pairs: readonly [string, number][]) => pairs.map(([v, k]) => `${v} ×${k}`).join(', ')
  const counts = counted(doc.rows.map((row) => countOf(row.fields[ANTAL]))).sort((a, b) => a[0] - b[0])
  out.push(`- ${ANTAL}: ${copies} copies in all${counts.length <= DISTINCT_CAP ? `; ${times(counts.map(([v, k]) => [String(v), k]))}` : ''}`)
  const images = imageFieldsOf(doc)
  for (const field of columnsOf(doc).filter((f) => f !== ANTAL)) {
    const filled = doc.rows.map((row) => row.fields[field]).filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
    const empty = n - filled.length
    const emptyNote = empty > 0 ? `; empty ×${empty}` : ''
    if (filled.length === 0) {
      out.push(`- ${field}: empty on every card`)
      continue
    }
    if (images.includes(field)) {
      out.push(`- ${field}: image, set on ${filled.length} cards`)
      continue
    }
    const kind = kindOf(doc, field)
    if (kind === 'yes/no') {
      const yes = filled.filter((v) => v === true).length
      out.push(`- ${field}: yes/no; yes ×${yes}, no ×${filled.length - yes}${emptyNote}`)
    } else if (kind === 'number') {
      const numbers = counted(filled.map((v) => Number(v))).sort((a, b) => a[0] - b[0])
      const range = `${numbers[0]?.[0]} to ${numbers.at(-1)?.[0]}`
      out.push(`- ${field}: number, ${range}${numbers.length <= DISTINCT_CAP ? `; ${times(numbers.map(([v, k]) => [String(v), k]))}` : `, ${numbers.length} different values`}${emptyNote}`)
    } else {
      const texts = filled.map((v) => String(v))
      // Most common first; equally common in the order the deck first has them.
      const labels = counted(texts).sort((a, b) => b[1] - a[1])
      if (labels.length <= DISTINCT_CAP && texts.every((t) => [...t].length <= LABEL_CHARS)) {
        out.push(`- ${field}: text, ${labels.length} different values; ${times(labels.map(([v, k]) => [JSON.stringify(v), k]))}${emptyNote}`)
      } else {
        const lengths = texts.map((t) => [...t].length)
        out.push(`- ${field}: text, ${labels.length} different values, ${Math.min(...lengths)} to ${Math.max(...lengths)} characters${emptyNote}`)
      }
    }
  }
  return out.join('\n')
}

// `size` rows of the deck, chosen evenly through it: the deck is split by the column its variants
// are chosen by, each part gets its share of the sample (at least one row while there is room for
// one from every part), and within a part the rows are taken at even steps. The deck's order and
// nothing else decides, so the same deck is always the same sample. Indexes in the deck's order.
function sampleOf(doc: ProjectDoc, variantBy: string | undefined, size: number): number[] {
  const n = doc.rows.length
  if (size >= n) return doc.rows.map((_, i) => i)
  const byKey = new Map<string, number[]>()
  doc.rows.forEach((row, i) => {
    const key = variantBy === undefined ? '' : String(row.fields[variantBy] ?? '')
    byKey.set(key, [...(byKey.get(key) ?? []), i])
  })
  // Shares by the largest remainder, ties to the part the deck has first; a floor of one when every
  // part can have one.
  const floor = size >= byKey.size ? 1 : 0
  const parts = [...byKey.values()].map((rows, first) => {
    const exact = (rows.length / n) * size
    return { rows, first, rest: exact - Math.floor(exact), share: Math.min(rows.length, Math.max(floor, Math.floor(exact))) }
  })
  let left = size - parts.reduce((sum, part) => sum + part.share, 0)
  const order = [...parts].sort((a, b) => b.rest - a.rest || a.first - b.first)
  while (left > 0 && order.some((part) => part.share < part.rows.length)) {
    for (const part of order) {
      if (left === 0) break
      if (part.share >= part.rows.length) continue
      part.share++
      left--
    }
  }
  // The floor of one gave more than the sample holds: take back from the largest shares.
  while (left < 0) {
    const largest = parts.reduce((a, b) => (b.share > a.share ? b : a))
    largest.share--
    left++
  }
  return parts.flatMap((part) => Array.from({ length: part.share }, (_, j) => part.rows[Math.floor(((j + 0.5) * part.rows.length) / part.share)] ?? 0)).sort((a, b) => a - b)
}

// Cards written whole for a question (#1003, #1007): every column of the game with the empty ones said
// as empty, and the count always said, in the deck's order.
function wholeCardsOf(doc: ProjectDoc, ids: readonly string[]): string[] {
  const chosen = new Set(ids)
  const columns = columnsOf(doc).filter((f) => f !== ANTAL)
  return doc.rows
    .filter((row) => chosen.has(row.id))
    .map((row) => {
      const card: Record<string, unknown> = { id: row.id }
      for (const field of columns) card[field] = row.fields[field] ?? ''
      card[ANTAL] = countOf(row.fields[ANTAL])
      return JSON.stringify(card)
    })
}

// The cards the designer has selected in the editor (#1003) — the card she has chosen and the rows
// she has ticked — written to stand before her question. Each is written whole, every column of the
// game with the empty ones said as empty and the count always said, so that a question about these
// cards is about cards the model reads every field of, whatever a large deck's context leaves out
// (#1007). In the deck's order, so the same cards are the same bytes however they were selected.
// Nothing at all when none of them is in the deck: a card removed since it was ticked is not one.
export function aiSelectionOf(doc: ProjectDoc, ids: readonly string[]): string | null {
  const cards = wholeCardsOf(doc, ids)
  if (cards.length === 0) return null
  return [
    '## Selected cards',
    `The designer has selected ${cards.length === 1 ? 'this card' : `these ${cards.length} cards`} in the editor: when she says "these", "the selected cards" or "this card", she means ${cards.length === 1 ? 'it' : 'them'}. Every field is written, the empty ones too.`,
    ...cards,
  ].join('\n')
}

// The cards a proposal being refined changes (#1004, #1007), written whole beside it as the selected
// cards are, so that refining a change to a card a large deck's sample left out is refining a card
// the model reads every field of. Nothing when the game no longer has any of them.
export function aiChangedCardsOf(doc: ProjectDoc, ids: readonly string[]): string | null {
  const cards = wholeCardsOf(doc, ids)
  if (cards.length === 0) return null
  return ['## Cards the proposal changes', 'As they stand in the game now, before the proposal; every field is written, the empty ones too.', ...cards].join('\n')
}

// Bytes of UTF-8, counted without making them: the budget is measured in what goes over the wire.
function utf8Length(text: string): number {
  let n = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4
      i++
    } else n += 3
  }
  return n
}

// A count as the engine reads it (L4): a whole number of copies, one when nothing is said.
function countOf(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 1
}

// How a column's values read (L4): numbers when every value is one, yes/no when every value is a
// truth, text otherwise. The same reading the table sorts by, and the one a proposal's values are
// held to (#1003).
export function kindOf(doc: ProjectDoc, field: string): 'number' | 'yes/no' | 'text' {
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

// A rendered block as the lines a reader of the book reads, set inside the context's own outline
// (#1049). The context is one Markdown outline whose sections are `#` and `##` — the game, its
// cards, its template, the rulebook, the theme — and the rulebook is a document inside one of them,
// so its two levels of heading are nested below it, `###` and `####`, as a book quoted in a chapter
// is: a rule heading called «Kort», «Mall» or «Theme» is then a heading of the book and never a
// section of the context. A line of the book that is no heading and still opens with `#` — a
// paragraph the designer began with one, or with a reference to something named so — gets
// Markdown's escape before it, so the only lines that open with a heading mark are headings, at the
// level they have. Delimiting the book with tags was the other way: it leaves `##` inside the tags
// reading as a section to whatever reads the outline, and needs an escape for the closing tag anyway.
const BOOK_LEVEL = 2
// One line of the book, as one line: a name with a line break in it does not start another.
const oneLine = (text: string): string => text.replace(/\s*\n\s*/g, ' ')
const bookLine = (text: string): string => oneLine(text).replace(/^#/, '\\#')
function blockText(block: RenderedBlock): string[] {
  switch (block.kind) {
    case 'heading':
      return [`${'#'.repeat(BOOK_LEVEL + block.level)} ${oneLine(plainOf(block.children))}`]
    case 'text':
      return block.paragraphs.map((p) => bookLine(plainOf(p.children)))
    case 'list':
      return block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${oneLine(plainOf(item))}`)
    case 'setup':
      return [
        `[Setup${block.caption ? `: ${oneLine(block.caption)}` : ''}] On the table: ${block.common.map((z) => oneLine(z.name)).join(', ') || 'nothing'}`,
        ...block.seats.map((s) => `[Setup] Seat ${s.id}: ${s.zones.map((z) => oneLine(z.name)).join(', ') || 'nothing'}`),
      ]
    case 'image':
      return [block.alt || block.caption ? `[Picture: ${oneLine([block.alt, block.caption].filter(Boolean).join(' — '))}]` : '[Picture]']
  }
}
