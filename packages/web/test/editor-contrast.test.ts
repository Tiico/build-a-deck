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

// The two strips the small screens add (L10): the sentence about what a phone does not hold, and
// the strip of stages with the two actions pinned to it. Both are read in passing, so both are
// held to the same bar as everything else the editor says.
describe('the palette the small screens are drawn in', () => {
  it.each([
    { what: 'what a phone does not offer', ink: '--byd-editor-narrow-ink', on: '--byd-editor-narrow-bg' },
    { what: 'a stage that is not open', ink: '--byd-editor-stage-ink', on: '--byd-editor-stage-bg' },
    { what: 'the stage that is open', ink: '--byd-editor-stage-on-ink', on: '--byd-editor-stage-on-bg' },
    { what: 'the actions pinned beside them', ink: '--byd-editor-stage-action-ink', on: '--byd-editor-stage-action-bg' },
  ])('gives $what AA contrast', ({ ink, on }) => {
    expect(contrastRatio(token(ink), token(on))).toBeGreaterThanOrEqual(4.5)
  })
})

// The table's filter row (#16) is read at a glance while the eye is really on the rows: the
// count, the search field, and a chip pressed or not are all held to the same bar.
describe('the palette the table filter is drawn in', () => {
  it.each([
    { what: 'the count of shown cards', ink: '--byd-editor-count-ink', on: '--byd-editor-table-panel-bg' },
    { what: 'the sentence when nothing matches', ink: '--byd-editor-count-ink', on: '--byd-editor-table-panel-bg' },
    { what: 'the placeholder in the search field', ink: '--byd-editor-filter-quiet', on: '--byd-editor-filter-bg' },
    { what: 'what has been searched for', ink: '--byd-editor-filter-ink', on: '--byd-editor-filter-bg' },
    { what: 'a chip that is not pressed', ink: '--byd-editor-filter-ink', on: '--byd-editor-filter-bg' },
    { what: 'a chip that is pressed', ink: '--byd-editor-chip-on-ink', on: '--byd-editor-chip-on-bg' },
    { what: 'the note that a new card is shown anyway', ink: '--byd-editor-filter-quiet', on: '--byd-editor-table-panel-bg' },
  ])('gives $what AA contrast', ({ ink, on }) => {
    expect(contrastRatio(token(ink), token(on))).toBeGreaterThanOrEqual(4.5)
  })
})

// The action row over the table (#17) shows up the moment a card is marked and carries the only
// destructive button in the editor. It is read in a hurry, so it is held to the same bar.
describe('the palette the table action row is drawn in', () => {
  it.each([
    { what: 'what an action does', ink: '--byd-editor-bulk-ink', on: '--byd-editor-bulk-bg' },
    { what: 'the way back out of a marking', ink: '--byd-editor-bulk-quiet', on: '--byd-editor-bulk-bg' },
    { what: 'the delete button', ink: '--byd-editor-bulk-danger-ink', on: '--byd-editor-bulk-danger-bg' },
    { what: 'the question a delete asks first', ink: '--byd-editor-bulk-ask-ink', on: '--byd-editor-bulk-ask-bg' },
    { what: 'the value to be written', ink: '--byd-editor-filter-ink', on: '--byd-editor-filter-bg' },
    { what: 'the id of a marked card', ink: '--byd-editor-marked-ink', on: '--byd-editor-marked-bg' },
  ])('gives $what AA contrast', ({ ink, on }) => {
    expect(contrastRatio(token(ink), token(on))).toBeGreaterThanOrEqual(4.5)
  })
})

// The template canvas got a tool rail and a line telling how the layer order is changed (#18).
// Both are read beside a card that is meant to hold the eye, so they are held to the same bar as
// everything else the editor says.
describe('the palette the template canvas is drawn in', () => {
  it.each([
    { what: 'the name under a tool', ink: '--byd-editor-tool-ink', on: '--byd-editor-tool-bg' },
    { what: 'the note on how the layers are ordered', ink: '--byd-editor-hint-ink', on: '--byd-editor-canvas-bg' },
    { what: 'the heading over each panel', ink: '--byd-editor-hint-ink', on: '--byd-editor-canvas-bg' },
  ])('gives $what AA contrast', ({ ink, on }) => {
    expect(contrastRatio(token(ink), token(on))).toBeGreaterThanOrEqual(4.5)
  })
})

// The strip over the card (#13) says which group and which side of the card is being edited, and
// the layer list says per layer whether it is the base's or the group's. All of it is read while
// the eye is on the card, so it is held to the same bar as the rest of the editor.
describe('the palette the group strip is drawn in', () => {
  it.each([
    { what: 'a group that is not open', ink: '--byd-editor-strip-ink', on: '--byd-editor-strip-bg' },
    { what: 'the group that is open', ink: '--byd-editor-strip-on-ink', on: '--byd-editor-strip-on-bg' },
    { what: 'the label over the grouping column', ink: '--byd-editor-hint-ink', on: '--byd-editor-strip-bg' },
    { what: 'what a layer belongs to', ink: '--byd-editor-source-ink', on: '--byd-editor-canvas-bg' },
  ])('gives $what AA contrast', ({ ink, on }) => {
    expect(contrastRatio(token(ink), token(on))).toBeGreaterThanOrEqual(4.5)
  })
})

// The Bord tab (#19) is a list of running games read across the room from the screen: which
// version a table runs, whether the project has left it behind, who is at it, and the ways in.
// Every one of those words is held to the same bar as the rest of the editor.
describe('the palette the Bord tab is drawn in', () => {
  it.each([
    { what: 'the version a table runs', ink: '--byd-tables-ink', on: '--byd-tables-bg' },
    { what: 'who is seated and when it last moved', ink: '--byd-tables-quiet', on: '--byd-tables-bg' },
    { what: 'the mark that the project has left the table behind (C7)', ink: '--byd-tables-stale-ink', on: '--byd-tables-bg' },
    { what: 'a way into the table', ink: '--byd-tables-way-ink', on: '--byd-tables-way-bg' },
    { what: 'the question an ending asks first (C9)', ink: '--byd-tables-ask-ink', on: '--byd-tables-ask-bg' },
  ])('gives $what AA contrast', ({ ink, on }) => {
    expect(contrastRatio(token(ink), token(on))).toBeGreaterThanOrEqual(4.5)
  })
})

// Whether the work is saved, and the question asked before the editor is left with work that is
// not (#8). Both are read in a hurry, on the way out of the room, so they carry the same bar.
describe('the palette unsaved work is drawn in', () => {
  it.each([
    { what: 'the word for work that is saved', ink: '--byd-editor-saved-ink', on: '--byd-editor-chrome-bg' },
    { what: 'the word for work that is not saved', ink: '--byd-editor-unsaved-ink', on: '--byd-editor-chrome-bg' },
    { what: 'the way back to the games', ink: '--byd-editor-home-ink', on: '--byd-editor-chrome-bg' },
    { what: 'the question asked before leaving', ink: '--byd-editor-leave-ink', on: '--byd-editor-leave-bg' },
    { what: 'saving on the way out', ink: '--byd-editor-leave-save-ink', on: '--byd-editor-leave-save-bg' },
    { what: 'leaving the work behind', ink: '--byd-editor-leave-danger-ink', on: '--byd-editor-leave-danger-bg' },
  ])('gives $what AA contrast', ({ ink, on }) => {
    expect(contrastRatio(token(ink), token(on))).toBeGreaterThanOrEqual(4.5)
  })
})

// The blue the editor's first action is painted in (#22). `#3c8ce7` carried white text at 3.44:1
// and did not clear AA, so the fill a label sits on is one token with one definition and is
// measured here rather than judged by eye.
describe('the palette the editor primary is drawn in', () => {
  it('gives the label on a primary button AA contrast', () => {
    expect(contrastRatio(token('--byd-editor-primary-ink'), token('--byd-editor-primary-bg'))).toBeGreaterThanOrEqual(4.5)
  })
})

// The other half of the same blue (#22): the mark on a marked row, the outline round the card
// being looked at, the ring the table's own controls draw, and the edge of a drag handle. None of
// them is text, so the bar is 3:1 — but it is 3:1 against the surface each one actually lands on,
// and those surfaces are not the same shade.
describe('the marks and edges built on the editor primary', () => {
  it.each([
    { what: 'the outline round the card being looked at', on: '--byd-editor-chrome-bg' },
    { what: 'the edge of the group that is open', on: '--byd-editor-strip-on-bg' },
    { what: 'the edge a tool takes under the pointer', on: '--byd-editor-tool-bg' },
    { what: 'the mark down the side of a marked row', on: '--byd-editor-marked-bg' },
    { what: "the ring round the table's own controls", on: '--byd-editor-table-panel-bg' },
    { what: 'the ring inside the filter row', on: '--byd-editor-filter-bg' },
    { what: 'the edge of a drag handle', on: '--byd-editor-handle-bg' },
  ])('lets $what be seen', ({ on }) => {
    expect(contrastRatio(token('--byd-editor-primary-mark'), token(on))).toBeGreaterThanOrEqual(3)
  })
})

// One definition each, so changing the editor's blue is one line and the tests above measure what
// actually ships. Everything that wears either blue — including the outline the canvas draws
// round the element being edited, which lives in a compiled `<style>` and not in the stylesheet —
// reaches for the token instead of repeating the hex.
const preview = readFileSync(join(import.meta.dirname, '..', 'src/editor/CardPreview.tsx'), 'utf8')
// A comment may name a colour it is telling the story of; only declarations count as definitions.
const declarations = (source: string) => source.replaceAll(/\/\*[\s\S]*?\*\//g, '')
describe('the editor primary as one definition', () => {
  it.each(['#1f6fd0', '#3c8ce7'])('declares %s exactly once in the whole editor', (hex) => {
    expect([...declarations(`${css}${preview}`).matchAll(new RegExp(hex, 'gi'))]).toHaveLength(1)
  })

  it('keeps no rgb() copy of it in the grid over the card', () => {
    expect(declarations(css)).not.toMatch(/rgba?\(\s*60[\s,]+140[\s,]+231/)
  })
})
