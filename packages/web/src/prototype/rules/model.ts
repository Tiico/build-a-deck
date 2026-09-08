// PROTOTYPE — the rulebook in the editor (B7): a game to write rules for, and the real renderer.
import { renderRules, type Names, type RenderedRules, type RuleBlock, type RuleDoc } from '@byd/template'

export { renderRules }
export type { Names, RenderedRules, RuleBlock, RuleDoc }

export const names: Names = {
  zones: { table: 'Spelyta', draw: 'Draghög', discard: 'Kasthög', market: 'Marknad', 'mine:A': 'Framför A', 'hand:A': 'Hand' },
  cards: { drake: 'Drake', riddare: 'Riddare', trollkarl: 'Trollkarl', bonde: 'Bonde' },
}

export function rulebook(): RuleDoc {
  return {
    title: 'Skogens herrar',
    blocks: [
      { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
      { kind: 'text', id: 't1', text: 'Skogens herrar spelas av två till fyra spelare. Varje spelare har en hand och en yta framför sig.\n\nSpelet slutar när [[zon:draw]] är tom. Den med flest poäng vinner.' },
      { kind: 'heading', id: 'h2', level: 2, text: 'En tur' },
      { kind: 'list', id: 'l1', ordered: true, items: ['Dra ett kort ur [[zon:draw]].', 'Spela ett kort från handen till [[zon:table]].', 'Lägg ett kort i [[zon:discard]].'] },
      { kind: 'text', id: 't2', text: 'En **[[kort:drake]]** kostar {2} att spela och anfaller vid gryningen. En *[[kort:bonde]]* skördar i stället ett ax.' },
      { kind: 'setup', id: 's1', caption: 'Så ställs bordet upp' },
      { kind: 'heading', id: 'h3', level: 2, text: 'Att vinna' },
      { kind: 'text', id: 't3', text: 'Räkna ihop poängen på korten framför er. Kort i [[zon:hand:A]] räknas inte.' },
    ],
  }
}

// What can be referred to, for the picker: everything the game has, by what it is called.
export function referables(n: Names): { of: 'zone' | 'card'; id: string; name: string }[] {
  return [
    ...Object.entries(n.zones).map(([id, name]) => ({ of: 'zone' as const, id, name })),
    ...Object.entries(n.cards).map(([id, name]) => ({ of: 'card' as const, id, name })),
  ]
}

export const refFor = (of: 'zone' | 'card', id: string): string => `[[${of === 'zone' ? 'zon' : 'kort'}:${id}]]`

// The whole book as one piece of text, and back again: what variant B edits.
export function toText(doc: RuleDoc): string {
  return doc.blocks
    .map((b) => {
      switch (b.kind) {
        case 'heading':
          return `${b.level === 1 ? '#' : '##'} ${b.text}`
        case 'text':
          return b.text
        case 'list':
          return b.items.map((item, i) => `${b.ordered ? `${i + 1}.` : '-'} ${item}`).join('\n')
        case 'setup':
          return `![uppställning]${b.caption ? ` ${b.caption}` : ''}`
      }
    })
    .join('\n\n')
}

export function fromText(title: string, text: string): RuleDoc {
  const blocks: RuleBlock[] = []
  let n = 0
  for (const chunk of text.split(/\n[ \t]*\n/)) {
    const trimmed = chunk.trim()
    if (!trimmed) continue
    const id = `b${++n}`
    const heading = /^(#{1,2})\s+(.*)$/.exec(trimmed)
    if (heading) {
      blocks.push({ kind: 'heading', id, level: heading[1] === '#' ? 1 : 2, text: heading[2] ?? '' })
      continue
    }
    const setup = /^!\[uppställning\]\s*(.*)$/.exec(trimmed)
    if (setup) {
      blocks.push({ kind: 'setup', id, ...(setup[1] ? { caption: setup[1] } : {}) })
      continue
    }
    const lines = trimmed.split('\n')
    if (lines.every((l) => /^\s*(?:[-*]|\d+\.)\s+/.test(l))) {
      blocks.push({
        kind: 'list',
        id,
        ordered: /^\s*\d+\./.test(lines[0] ?? ''),
        items: lines.map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, '')),
      })
      continue
    }
    blocks.push({ kind: 'text', id, text: trimmed })
  }
  return { title, blocks }
}
