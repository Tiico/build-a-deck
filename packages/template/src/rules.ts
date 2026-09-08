import { parseInline, type InlineNode } from './inline.js'

// The rulebook (B7): a document that lives in the project, is versioned in the same history as
// the cards (B4), and knows the game it belongs to. A rule can name a zone or a card, and what
// it says follows what the thing is called — renaming the discard pile rewrites every rule that
// mentions it, because the rules never held the name in the first place.
export type RuleBlock =
  | { kind: 'heading'; id: string; level: 1 | 2; text: string }
  | { kind: 'text'; id: string; text: string }
  | { kind: 'list'; id: string; items: string[]; ordered?: boolean | undefined }
  // The setup picture is the zones themselves (B5's follow-on), not a drawing kept beside them.
  | { kind: 'setup'; id: string; caption?: string | undefined }
export type RuleDoc = { title: string; blocks: RuleBlock[] }

// What the names of things are right now. The rulebook asks for them at render time; it never
// stores them.
export type Names = { zones: Record<string, string>; cards: Record<string, string> }
export type RuleWarning = { block: string; of: 'zone' | 'card'; id: string }

// What a rendered rule is made of. A reference arrives carrying the name it stands for, so
// whatever draws it — the editor, the table, the printed booklet — needs nothing but this.
export type RenderedNode =
  | { type: 'text'; text: string }
  | { type: 'icon'; name: string }
  | { type: 'bold'; children: RenderedNode[] }
  | { type: 'italic'; children: RenderedNode[] }
  | { type: 'ref'; of: 'zone' | 'card'; id: string; name: string | null }
export type RenderedParagraph = { children: RenderedNode[] }
export type RenderedBlock =
  | { kind: 'heading'; id: string; level: 1 | 2; text: string }
  | { kind: 'text'; id: string; paragraphs: RenderedParagraph[] }
  | { kind: 'list'; id: string; ordered: boolean; items: RenderedNode[][] }
  | { kind: 'setup'; id: string; caption?: string | undefined }
// `text` is the whole rulebook as plain text: what a search reads, and what a test can hold on to.
export type RenderedRules = { title: string; blocks: RenderedBlock[]; warnings: RuleWarning[]; text: string }

export function renderRules(doc: RuleDoc, names: Names): RenderedRules {
  const warnings: RuleWarning[] = []
  const lines: string[] = []
  const blocks: RenderedBlock[] = doc.blocks.map((block): RenderedBlock => {
    switch (block.kind) {
      case 'heading':
        lines.push(block.text)
        return block
      case 'text': {
        const parsed = parseInline(block.text, { refs: true })
        for (const p of parsed) lines.push(flatten(p.children, names, block.id, warnings))
        return { kind: 'text', id: block.id, paragraphs: parsed.map((p) => ({ children: resolve(p.children, names) })) }
      }
      case 'list': {
        const parsed = block.items.map((item) => parseInline(item, { refs: true }).flatMap((p) => p.children))
        parsed.forEach((children, i) => lines.push(`${block.ordered ? `${i + 1}. ` : '- '}${flatten(children, names, block.id, warnings)}`))
        return { kind: 'list', id: block.id, ordered: block.ordered ?? false, items: parsed.map((children) => resolve(children, names)) }
      }
      case 'setup':
        if (block.caption) lines.push(block.caption)
        return block
    }
  })
  return { title: doc.title, blocks, warnings, text: lines.join('\n') }
}

// What a reference stands for right now. A rule that names something the game no longer has says
// so where it stands, rather than quietly saying nothing — the same choice as an unknown icon (L2).
export function nameOf(node: Extract<InlineNode, { type: 'ref' }>, names: Names): string | null {
  const table = node.of === 'zone' ? names.zones : names.cards
  return table[node.id] ?? null
}
export const refText = (node: Extract<InlineNode, { type: 'ref' }>): string => `[[${node.of === 'zone' ? 'zon' : 'kort'}:${node.id}]]`

// The parse tree with every reference carrying the name it stands for right now.
function resolve(nodes: readonly InlineNode[], names: Names): RenderedNode[] {
  return nodes.map((n): RenderedNode => {
    switch (n.type) {
      case 'bold':
      case 'italic':
        return { type: n.type, children: resolve(n.children, names) }
      case 'ref':
        return { type: 'ref', of: n.of, id: n.id, name: nameOf(n, names) }
      default:
        return n
    }
  })
}

function flatten(nodes: readonly InlineNode[], names: Names, block: string, warnings: RuleWarning[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return n.text
        case 'icon':
          return `{${n.name}}`
        case 'bold':
        case 'italic':
          return flatten(n.children, names, block, warnings)
        case 'ref': {
          const found = nameOf(n, names)
          if (found === null) {
            warnings.push({ block, of: n.of, id: n.id })
            return refText(n)
          }
          return found
        }
      }
    })
    .join('')
}
