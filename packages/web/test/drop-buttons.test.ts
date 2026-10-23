import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// A button that opens a menu under it says so while the menu stands (#1144, beställarens val B
// 2026-10-22): its chevron turns up and the button is drawn pressed. Eight of them pointed down
// whether the menu was open or not, so nothing said that a second press would close it.
//
// The look is one rule in `editor.css`, keyed on `data-drop` and `aria-expanded`, so a button is
// a dropdown button by carrying the attribute. This holds every chevron that points down for good
// — `<ChevronGlyph to="down" />`, the drawing of a box that unfolds under its button — to sitting
// in a button that does. A chevron that turns with its own state (`to={open ? 'down' : 'right'}`)
// is a disclosure and draws the state itself, so it is not read.
const SRC = join(import.meta.dirname, '..', 'src')
const SKIPS = new Set(['prototype'])

function sourcesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPS.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourcesUnder(path))
    else if (entry.name.endsWith('.tsx')) out.push(path)
  }
  return out
}

const at = (path: string) => relative(join(SRC, '..'), path).split(sep).join('/')

const attribute = (attributes: ts.JsxAttributes, name: string) =>
  attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name)

type Chevron = { where: string; button: string | null; drop: boolean; expanded: boolean }

function downChevronsIn(path: string): Chevron[] {
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: Chevron[] = []
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === 'ChevronGlyph') {
      const to = attribute(node.attributes, 'to')?.initializer
      if (to && ts.isStringLiteral(to) && to.text === 'down') {
        let up: ts.Node | undefined = node.parent
        while (up && !(ts.isJsxElement(up) && up.openingElement.tagName.getText() === 'button')) up = up.parent
        const opening = up && ts.isJsxElement(up) ? up.openingElement : null
        found.push({
          where: `${at(path)}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`,
          button: opening ? opening.getText(file).slice(0, 80) : null,
          drop: opening ? attribute(opening.attributes, 'data-drop') !== undefined : false,
          expanded: opening ? attribute(opening.attributes, 'aria-expanded') !== undefined : false,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

describe('dropdown buttons (#1144)', () => {
  const chevrons = sourcesUnder(SRC).flatMap(downChevronsIn)

  it('reads the eight it was written for, so a renamed glyph cannot make it pass by reading nothing', () => {
    expect(chevrons.length).toBeGreaterThanOrEqual(8)
  })

  it('puts every chevron that points down for good in a button that says it drops and whether it is open', () => {
    expect(chevrons.filter((c) => !c.drop || !c.expanded)).toEqual([])
  })
})
