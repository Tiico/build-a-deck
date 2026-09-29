import type { RuleBlock } from '@byd/template'
import type { Key, T } from '../i18n/index.js'

// What a block of the rulebook is called to someone who cannot see where it stands (#558). The
// controls were named by the block's internal id — «Lägg till efter b2», «Text b12» — and an id
// says nothing about which text is meant. A block is named by the section it stands in: the words
// of the nearest heading above it, or the start of the book. A heading is named by its own words.
// A second block of the same kind in one section is told apart by its number, and only then.
export type BlockName = {
  // The section, said as a place: «under Översikt», «i början av boken».
  where: string
  // The block as a thing: «Översikt», «texten 2 under Översikt».
  self: string
  // The number and its space when the section has more than one of the kind, else nothing.
  nth: string
  // A heading's place among the headings, counted from one: what its own field is called, since
  // a name taken from the words being typed would change with every key.
  heading?: number
}

const KIND: Record<Exclude<RuleBlock['kind'], 'heading'>, Key> = {
  text: 'rules.name.text',
  list: 'rules.name.list',
  image: 'rules.name.image',
  setup: 'rules.name.setup',
}

export function blockNames(blocks: readonly RuleBlock[], t: T): Map<string, BlockName> {
  // A reference in a heading is read by its name, not by its markup: «Om [[zon:draw]]» is «Om draw».
  const headingName = (b: Extract<RuleBlock, { kind: 'heading' }>) => {
    const words = b.text.replace(/\[\[[^:\]]*:([^\]]*)\]\]/g, '$1').trim()
    return words === '' ? t('rules.name.untitled') : words
  }
  // Each block's section, and how many of each kind stand in it.
  const sections: { where: string; of: RuleBlock }[] = []
  let where = t('rules.where.top')
  for (const b of blocks) {
    if (b.kind === 'heading') where = t('rules.where.under', { heading: headingName(b) })
    sections.push({ where, of: b })
  }
  const count = new Map<string, number>()
  for (const { where, of } of sections) if (of.kind !== 'heading') count.set(`${where}\u0000${of.kind}`, (count.get(`${where}\u0000${of.kind}`) ?? 0) + 1)
  const seen = new Map<string, number>()
  const names = new Map<string, BlockName>()
  let headings = 0
  for (const { where, of } of sections) {
    if (of.kind === 'heading') {
      names.set(of.id, { where, self: headingName(of), nth: '', heading: ++headings })
      continue
    }
    const key = `${where}\u0000${of.kind}`
    const at = (seen.get(key) ?? 0) + 1
    seen.set(key, at)
    const nth = (count.get(key) ?? 0) > 1 ? `${at} ` : ''
    names.set(of.id, { where, self: t('rules.name.block', { kind: t(KIND[of.kind]), nth, where }), nth })
  }
  return names
}
