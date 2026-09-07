import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, cssCustomProperties } from '../src/player/contrast.js'

// The family of states (#12, #7) is read in a hurry, across a room and under a thumb, so it is
// held to the same bar as the editor and the player (UX-KONTROLLER, UX-10).
const css = readFileSync(join(import.meta.dirname, '..', 'src/status/status.css'), 'utf8')
const tokens = cssCustomProperties(css)
const token = (name: string) => {
  const value = tokens.get(name)
  if (!value) throw new Error(`status.css declares no ${name}`)
  return value
}
const TONES = ['wait', 'gone', 'shut', 'broken', 'ok'] as const

describe('the palette each tone is drawn in', () => {
  it.each(TONES)('gives what a %s state says AA contrast on its own ground', (tone) => {
    expect(contrastRatio(token(`--byd-status-${tone}-ink`), token(`--byd-status-${tone}-bg`))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(TONES)('gives the edge of a %s panel a visible boundary', (tone) => {
    expect(contrastRatio(token(`--byd-status-${tone}-edge`), token(`--byd-status-${tone}-bg`))).toBeGreaterThanOrEqual(3)
  })
})

describe('the palette the ways out are drawn in', () => {
  it('gives a way out AA contrast against its own fill', () => {
    expect(contrastRatio(token('--byd-status-button-ink'), token('--byd-status-button-bg'))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(token('--byd-status-primary-ink'), token('--byd-status-primary-bg'))).toBeGreaterThanOrEqual(4.5)
  })

  // A quiet button is nearly the colour of the panel it sits on, so its border is the only thing
  // that says where the control is. It has to be visible against both sides of itself.
  it('gives a quiet button a border that can be seen against its own fill', () => {
    expect(contrastRatio(token('--byd-status-button-edge'), token('--byd-status-button-bg'))).toBeGreaterThanOrEqual(3)
  })

  it.each(TONES)('gives a quiet button a border that can be seen on a %s panel', (tone) => {
    expect(contrastRatio(token('--byd-status-button-edge'), token(`--byd-status-${tone}-bg`))).toBeGreaterThanOrEqual(3)
  })

  it.each(TONES)('makes the first way out stand out on a %s panel', (tone) => {
    expect(contrastRatio(token('--byd-status-primary-bg'), token(`--byd-status-${tone}-bg`))).toBeGreaterThanOrEqual(3)
  })
})

describe('the ground a state that is the whole page stands on', () => {
  it('reads at AA', () => {
    expect(contrastRatio(token('--byd-status-page-ink'), token('--byd-status-page-bg'))).toBeGreaterThanOrEqual(4.5)
  })
})
