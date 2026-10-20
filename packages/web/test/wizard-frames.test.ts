import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, type Element, type FaceTemplate } from '@byd/template'
import { FRAMES, type Field } from '../src/wizard/frames.js'
import { translate } from '../src/i18n/index.js'

const sv = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate('sv', key, params)
const ALL: Field[] = [
  { key: 'title', label: 'Titel', kind: 'text' },
  { key: 'cost', label: 'Kostnad', kind: 'number' },
  { key: 'body', label: 'Text', kind: 'text' },
  { key: 'art', label: 'Illustration', kind: 'image' },
]
const without = (key: string) => ALL.filter((f) => f.key !== key)
const walk = (els: readonly Element[]): Element[] => els.flatMap((e) => ('children' in e ? [e, ...walk(e.children)] : [e]))
const drawn = (face: FaceTemplate, row: Record<string, string>) => {
  const html = compile({ type: CARD_STANDARD_63x88, face, row, icons: {} }).html
  return new Set([...html.matchAll(/data-element="([^"]+)"/g)].map((m) => m[1]!))
}

// The starter frames, as a beginner meets them in the guide and on the wall (#730).
describe('the starter frames (#730)', () => {
  const classic = FRAMES.find((f) => f.id === 'classic')!

  it('draws the cost circle only on a card that has a cost', () => {
    const face = classic.front(ALL, sv)
    expect(drawn(face, { title: 'Drake', Kostnad: '3' }).has('costbg')).toBe(true)
    expect(drawn(face, { title: 'Drake', Kostnad: '' })).not.toContain('costbg')
    expect(drawn(face, { title: 'Drake' })).not.toContain('costbg')
  })

  it.each(FRAMES.map((f) => [f.id, f] as const))('%s shrinks a cost that does not fit rather than running over', (_, frame) => {
    const cost = walk(frame.front(ALL, sv).base).find((e) => e.id === 'cost')
    expect(cost).toMatchObject({ kind: 'text', fit: 'shrink' })
  })

  it.each(FRAMES.map((f) => [f.id, f] as const))('%s marks where a picture goes when the game has a picture field, and draws no plate when it has none', (_, frame) => {
    const withArt = walk(frame.front(ALL, sv).base)
    if (withArt.some((e) => e.id === 'art')) {
      const art = withArt.find((e) => e.id === 'art')!
      expect(art.kind).toBe('image')
      // A placeholder under the picture's box, so an empty cell still shows where it lands.
      const mark = withArt.find((e) => e.id === 'artbg')
      expect(mark).toBeDefined()
      expect(withArt.indexOf(mark!)).toBeLessThan(withArt.indexOf(art))
    }
    const noArt = walk(frame.front(without('art'), sv).base)
    expect(noArt.some((e) => e.id === 'art' || e.id === 'artbg')).toBe(false)
  })

  it.each(FRAMES.map((f) => [f.id, f] as const))('%s names every layer in the game s language, not by its id', (_, frame) => {
    const layers = [...walk(frame.front(ALL, sv).base), ...walk(frame.back(sv).base)].filter((e) => e.kind !== 'if')
    for (const el of layers) expect({ [el.id]: el.name }).toEqual({ [el.id]: expect.stringMatching(/^[A-ZÅÄÖ][a-zåäö ]+$/) })
    expect(walk(frame.front(ALL, (k) => translate('en', k)).base).find((e) => e.id === 'title')?.name).toBe('Title')
  })

  it.each(FRAMES.map((f) => [f.id, f] as const))('%s writes every colour as #rrggbb, the one form a colour field reads', (_, frame) => {
    const colours = [...walk(frame.front(ALL, sv).base), ...walk(frame.back(sv).base)].flatMap((e) =>
      (['color', 'fill', 'stroke'] as const).map((k) => (e as Record<string, unknown>)[k]).filter((v): v is string => typeof v === 'string'),
    )
    expect(colours.length).toBeGreaterThan(0)
    for (const c of colours) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })
})
