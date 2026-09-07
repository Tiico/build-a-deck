import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, cssCustomProperties } from '../src/player/contrast.js'

// The row under the editor header is a green "the table is up" banner. When an update is blocked
// because a card could not be rendered (#10) it says the opposite, so it is drawn in the same
// colours a lost card carries on the table — one look for one fact — and held to the same bar.
const css = readFileSync(join(import.meta.dirname, '..', 'src/editor/editor.css'), 'utf8')
const tokens = cssCustomProperties(css)
const token = (name: string) => {
  const value = tokens.get(name)
  if (!value) throw new Error(`editor.css declares no ${name}`)
  return value
}

describe('the palette a blocked table update is drawn in', () => {
  it.each([
    { what: 'the sentence that says what happened', ink: '--byd-editor-lost-ink', on: '--byd-editor-lost-bg' },
    { what: 'the version line beside it', ink: '--byd-editor-lost-quiet', on: '--byd-editor-lost-bg' },
    { what: 'the retry label', ink: '--byd-editor-lost-ink', on: '--byd-editor-lost-button-bg' },
    { what: 'a warning on the green banner', ink: '--byd-editor-lost-ink', on: '--byd-editor-table-bg' },
  ])('gives $what AA contrast', ({ ink, on }) => {
    expect(contrastRatio(token(ink), token(on))).toBeGreaterThanOrEqual(4.5)
  })
})
