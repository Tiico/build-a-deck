import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, type Element } from '@byd/template'
import { defaultFields, FRAMES } from '../src/wizard/frames.js'
import { THEMES } from '../src/editor/themes.js'
import { translate, type T } from '../src/i18n/index.js'

// The mark round a text that does not fit (#808, beställarens beslut A) is read on whatever card it
// stands on, light paper or dark. So it is drawn in two bands, and the decision asks that one of them
// carry it at 3:1 against every card the product starts a game on, and that the tag's words read at
// 4.5:1 on the tag. Read off the sheet the mark ships, comments stripped, so a retuned colour is a
// retuned measurement and never a number in two places.
const sheet = readFileSync(join(import.meta.dirname, '..', 'src', 'editor', 'mark.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (selector: string): string => {
  const at = sheet.indexOf(`${selector} {`)
  if (at < 0) throw new Error(`mark.css has no rule for ${selector}`)
  return sheet.slice(at, sheet.indexOf('}', at))
}
const hex = (block: string, property: string): string => {
  const m = new RegExp(`${property}\\s*:[^;]*?(#[0-9a-f]{6})`, 'i').exec(block)
  if (!m?.[1]) throw new Error(`no colour for ${property} in ${block}`)
  return m[1]
}

const frame = rule('.byd-overset-frame')
const AMBER = hex(frame, '--byd-mark-edge')
const DARK = hex(frame, '--byd-mark-dark')
const tag = rule('.byd-mark-tag')
const CHROME = hex(tag, 'background')
const INK = hex(tag, 'color')

const t: T = (key, params) => translate('sv', key, params)
// Every ground a starter card has: each frame's shapes, and each theme's paper.
const grounds = [
  ...new Set([
    ...FRAMES.flatMap((f) => f.front(defaultFields(t), t).base.flatMap((el: Element) => (el.kind === 'shape' && typeof el.fill === 'string' && el.fill.startsWith('#') ? [el.fill] : []))),
    ...THEMES.map((theme) => theme.paper),
  ]),
]

describe('the mark round a text that does not fit, against the cards it stands on (#808)', () => {
  it('reads a real sheet and real cards, so nothing below is measured against nothing', () => {
    expect(grounds.length).toBeGreaterThan(5)
    expect(grounds).toEqual(expect.arrayContaining(['#f4ead8', '#1b1d23']))
  })

  it.each(grounds)('carries its frame at 3:1 in one of its two bands on %s', (ground) => {
    expect(Math.max(contrastRatio(AMBER, ground), contrastRatio(DARK, ground))).toBeGreaterThanOrEqual(3)
  })

  it('writes the tag’s words at 4.5:1, and its warning sign at 3:1', () => {
    expect(contrastRatio(INK, CHROME)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(AMBER, CHROME)).toBeGreaterThanOrEqual(3)
  })
})
