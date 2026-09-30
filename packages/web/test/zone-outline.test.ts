import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../src/player/contrast.js'

// A zone's outline is the only thing that says where a zone — a place to drop a card — ends
// (#553 P-9, beställarens beslut 2026-09-30, B for the zones). It was one band of white at 18 %,
// 1.5:1 on the green felt and 1.76:1 on the TV's, under WCAG's 3:1 for what is not text. It is two
// bands now, as the seat band is (K16): a dark hairline inside and the felt's chalk outside. The
// contrast is carried between the two bands, so it holds on every part of the felt's gradient, on
// the TV, and against a card that lies in the zone.
const css = readFileSync(join(import.meta.dirname, '..', 'src/table/table.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = /\.byd-zone\s*\{([^}]*)\}/.exec(css)![1]!
const chalk = /--byd-felt-chalk:\s*(#[0-9a-f]{6})/i.exec(css)![1]!

type Rgba = [number, number, number, number]
const parse = (colour: string): Rgba => {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(colour)
  if (hex) return [...[0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)), hex[2] ? parseInt(hex[2], 16) / 255 : 1] as Rgba
  const fn = /rgba?\(([^)]+)\)/.exec(colour)!
  const parts = fn[1]!.split(/[\s,/]+/).filter(Boolean).map((p) => (p.endsWith('%') ? Number(p.slice(0, -1)) / 100 : Number(p)))
  return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1]
}
const over = (fg: Rgba, bg: readonly number[]) => [0, 1, 2].map((i) => fg[i]! * fg[3] + bg[i]! * (1 - fg[3]))
const hex = (rgb: readonly number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
const resolve = (value: string) => value.replace('var(--byd-felt-chalk)', chalk)

// The felt's gradient, lightest to darkest, and the TV's felt.
const GROUNDS = { 'the felt’s middle': [46, 107, 70], 'the felt’s edge': [23, 58, 38], 'the TV': [21, 25, 36] } as const

describe('a zone’s outline on the felt (#553)', () => {
  it('is two bands: the chalk outside a dark hairline inside', () => {
    expect(rule).toMatch(/border:\s*1px solid/)
    expect(rule).toMatch(/box-shadow:\s*inset 0 0 0 1px/)
  })

  it.each(Object.entries(GROUNDS))('clears 3:1 between its two bands on %s', (_, ground) => {
    const outer = parse(resolve(/border:\s*1px solid ([^;]+)/.exec(rule)![1]!.trim()))
    const inner = parse(/box-shadow:\s*inset 0 0 0 1px ([^;]+)/.exec(rule)![1]!.trim())
    const dark = over(inner, ground)
    const light = over(outer, ground)
    expect(contrastRatio(hex(light), hex(dark))).toBeGreaterThanOrEqual(3)
  })

  it('would have said so: one band of white at 18 % does not clear it on the felt', () => {
    const was = over([255, 255, 255, 0.18], GROUNDS['the felt’s middle'])
    expect(contrastRatio(hex(was), hex(GROUNDS['the felt’s middle']))).toBeLessThan(3)
  })
})
