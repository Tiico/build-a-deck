// PROTOTYPE — the rules at the table (B7): the rendered rulebook a session hands out, and the
// search a player actually wants mid-game.
import { renderRules, type Names, type RenderedRules, type RuleDoc } from '@byd/template'

export const names: Names = {
  zones: { table: 'Spelyta', draw: 'Draghög', discard: 'Kasthög', market: 'Marknad', 'hand:A': 'Hand' },
  cards: { drake: 'Drake', riddare: 'Riddare', bonde: 'Bonde' },
}

const doc: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
    { kind: 'text', id: 't1', text: 'Skogens herrar spelas av två till fyra spelare. Varje spelare har en hand och en yta framför sig.\n\nSpelet slutar när [[zon:draw]] är tom. Den med flest poäng vinner.' },
    { kind: 'heading', id: 'h2', level: 2, text: 'En tur' },
    { kind: 'list', id: 'l1', ordered: true, items: ['Dra ett kort ur [[zon:draw]].', 'Spela ett kort från handen till [[zon:table]].', 'Lägg ett kort i [[zon:discard]].'] },
    { kind: 'heading', id: 'h3', level: 2, text: 'Kasthögen' },
    { kind: 'text', id: 't2', text: '[[zon:discard]] ligger öppen. Vem som helst får titta i den, men ingen får ta ur den utan att ett kort säger det.\n\nNär [[zon:draw]] tar slut blandas [[zon:discard]] och blir den nya draghögen.' },
    { kind: 'heading', id: 'h4', level: 2, text: 'Att vinna' },
    { kind: 'text', id: 't3', text: 'Räkna ihop poängen på korten framför er. Kort i [[zon:hand:A]] räknas inte. En **[[kort:drake]]** är värd tre poäng, en *[[kort:bonde]]* en.' },
  ],
}

export const rendered = (): RenderedRules => renderRules(doc, names)

// What a player asks mid-game is one rule, not the book: the paragraphs that mention the word.
export type Hit = { id: string; heading: string; text: string }
export function findRules(out: RenderedRules, query: string): Hit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: Hit[] = []
  let heading = out.title
  const lines = out.text.split('\n')
  let i = 0
  for (const block of out.blocks) {
    if (block.kind === 'heading') {
      heading = block.text
      i++
      continue
    }
    if (block.kind === 'text') {
      for (const _ of block.paragraphs) {
        const line = lines[i++] ?? ''
        if (line.toLowerCase().includes(q)) hits.push({ id: `${block.id}-${i}`, heading, text: line })
      }
      continue
    }
    if (block.kind === 'list') {
      const gathered: string[] = []
      for (const _ of block.items) gathered.push(lines[i++] ?? '')
      if (gathered.some((l) => l.toLowerCase().includes(q))) hits.push({ id: block.id, heading, text: gathered.join('\n') })
      continue
    }
    if (block.caption) i++
  }
  return hits
}

// What the player is likely to ask about: the things the game has, as ready-made questions.
export const suggestions = (n: Names): string[] => [...Object.values(n.zones), ...Object.values(n.cards)].slice(0, 6)
