import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Every icon in the app in one hand (#1083, beställarens beslut A 2026-10-22).
//
// A character is drawn by the machine's font: × and ▾ were a hairline on a Mac and something else
// on Linux, at that font's weight and on its baseline, so a row of controls was as many hands as
// it had characters. And the SVGs that replaced some of them were each drawn on a grid of their
// own — 12, 14, 20 and 24, a stroke of 1.2 beside one of 2 — so the drawn ones disagreed too.
// `src/glyphs.tsx` is the one hand: a 16 grid and a round 1.6 stroke in the control's own ink.
// This holds the rest of `src` to it, because a character typed into a button looks like a small
// thing in a diff and is exactly what review let through twenty times.
//
// What is read is what a page can show: string literals, template parts and JSX text in the
// TypeScript, and everything but comments in the stylesheets. A comment that talks about «the ×»
// is prose and stays.
const SRC = join(import.meta.dirname, '..', 'src')
const READS = /\.(tsx?|css)$/

// The characters that stood in for one of the twenty drawings (and for the two directions of the
// chevron and the arrow the table draws one of): close, done, unfold and fold, flag, the whole and
// the cropped picture, saving, the grip, erase, the sort and the four arrows, edit, more, the
// chevrons, undo and redo, and minus.
const ICONS = [...'×✓▾▸◂▴⚑▢▣⟳⠿⌫↑↓↕←→✎⋯‹›↶↷−']

// The dev-only prototypes are left out: they are behind `import.meta.env.DEV`, never in a build,
// and they are drawn in whatever the question they ask is about — which is sometimes this one.
const SKIPS = new Set(['prototype'])

function sourcesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPS.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourcesUnder(path))
    else if (READS.test(entry.name)) out.push(path)
  }
  return out
}

const at = (path: string) => relative(join(SRC, '..'), path).split(sep).join('/')

// A numeric entity in JSX text is the character all the same (`&#x2212;` was the stepper's minus).
const ENTITIES: Record<string, string> = { times: '×', check: '✓', larr: '←', rarr: '→', uarr: '↑', darr: '↓', minus: '−', hellip: '…' }
const decoded = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) =>
    code[0] === '#' ? String.fromCodePoint(code[1]!.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))) : (ENTITIES[code] ?? whole),
  )

type Shown = { file: string; line: number; text: string }

// What a TypeScript file can put on a page, with comments never visited: the parser hands over
// the literals and the JSX text, and a comment is neither.
function shownIn(path: string, source: string): { shown: Shown[]; svgs: number } {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const shown: Shown[] = []
  let svgs = 0
  const line = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      shown.push({ file: at(path), line: line(node), text: node.text })
      if (node.text.includes('<svg')) svgs++
    } else if (ts.isJsxText(node)) {
      shown.push({ file: at(path), line: line(node), text: decoded(node.text) })
    } else if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === 'svg') {
      svgs++
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return { shown, svgs }
}

// A stylesheet has only block comments; what is left is what it draws, `content:` included. A
// picture inlined as a data URL is counted as a drawing, since that is what it is.
function shownInSheet(path: string, source: string): { shown: Shown[]; svgs: number } {
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
  const shown = bare.split('\n').map((text, i) => ({ file: at(path), line: i + 1, text }))
  return { shown, svgs: (bare.match(/data:image\/svg\+xml/g) ?? []).length }
}

const files = sourcesUnder(SRC).map((path) => {
  const source = readFileSync(path, 'utf8')
  return { path: at(path), ...(path.endsWith('.css') ? shownInSheet(path, source) : shownIn(path, source)) }
})

// Where one of the characters is text, read in a sentence or a figure, and so not an icon. Each
// entry names the file, the character and a piece of the literal it stands in, and says why.
// Named rather than counted, and an entry that no longer matches anything fails, so the list
// cannot outlive what it excuses.
type Allowed = { file: string; char: string; in: string; why: string }
const FIGURE = 'a figure, read as a word between numbers'
const SIZE = 'a size, «63 × 88 mm», read as «by»'
const CHANGE = 'a change written as old → new, read as «becomes»'
// The arrows and chevrons inside a translated button's words are part of what the control is
// called: they are in the accessible name, said by a screen reader and pinned by the tests that
// press them. Drawing them means taking them out of the name, which is a change of what the
// control is called and not of how it is drawn — not this issue's to make (#1083).
const NAMED = 'inside a translated name: drawing it would change what the control is called'
const ALLOWED: Allowed[] = [
  { file: 'src/table/TableRenderer.tsx', char: '→', in: ' → ', why: `the hand's count while cards are taken, «2 → 3»: ${CHANGE}` },
  { file: 'src/editor/PlaytestResults.tsx', char: '→', in: ' → ', why: `the mean before and after: ${CHANGE}` },
  { file: 'src/editor/DeckWall.tsx', char: '×', in: '×', why: `«×2» on a card with two copies: ${FIGURE}` },
  { file: 'src/editor/SetupEditor.tsx', char: '×', in: ' × ', why: SIZE },
  { file: 'src/editor/TableTree.tsx', char: '×', in: ' × ', why: SIZE },
  { file: 'src/editor/TemplateCanvas.tsx', char: '×', in: ' × ', why: SIZE },
  { file: 'src/editor/playtestReading.ts', char: '−', in: '−', why: `the sign of a difference: ${FIGURE}` },
  { file: 'src/table/keyboard.ts', char: '−', in: '−', why: 'the name of a key, as it is printed on the keyboard' },
  { file: 'src/table/CounterEntry.tsx', char: '−', in: '−', why: 'the keypad’s sign key: it types the minus into the number, as the digits beside it type theirs' },
  ...['sv', 'en'].flatMap((lang) => [
    { file: `src/i18n/${lang}.editor.ts`, char: '→', in: '{from} → {to}', why: CHANGE },
    { file: `src/i18n/${lang}.editor.ts`, char: '×', in: '{w} × {h} mm', why: SIZE },
    { file: `src/i18n/${lang}.editor.ts`, char: '×', in: '{n}×', why: `how many of an icon a cell holds: ${FIGURE}` },
    { file: `src/i18n/${lang}.editor.ts`, char: '×', in: '{count} × d{faces}', why: `how many dice a line lays, «2 × d6» (#1403): ${FIGURE}` },
    { file: `src/i18n/${lang}.editor.ts`, char: '×', in: '{w} × {h}', why: `a face of the box and the box itself (#1413): ${SIZE}` },
    { file: `src/i18n/${lang}.editor.ts`, char: '×', in: '2 × {air}', why: `the box's measure worked out, «kortet 63 + 2 × 1 luft», read as «times» (#1413): ${FIGURE}` },
    { file: `src/i18n/${lang}.editor.ts`, char: '×', in: '× {t}', why: `the deck's thickness worked out, «108 × 0,3», read as «times» (#1413): ${FIGURE}` },
    { file: `src/i18n/${lang}.play.ts`, char: '−', in: '−1', why: `a step down on a counter: ${FIGURE}` },
    { file: `src/i18n/${lang}.account.ts`, char: '→', in: ' 4 → 5', why: `the landing page's example of a change: ${CHANGE}` },
    { file: `src/i18n/${lang}.account.ts`, char: '×', in: '{w} × {h} mm', why: `the print package's card and file (#1208): ${SIZE}` },
    { file: `src/i18n/${lang}.account.ts`, char: '×', in: '{w} × {h} px', why: `a printer's raster (#1208): ${SIZE}` },
    { file: `src/i18n/${lang}.account.ts`, char: '×', in: '× {n}', why: `a card's copies in the print package, «× 2»: ${FIGURE}` },
    { file: `src/i18n/${lang}.account.ts`, char: '×', in: '{n} × {kind}', why: `how many dice the printer packs, «2 × sexsidig»: ${FIGURE}` },
    { file: `src/i18n/${lang}.account.ts`, char: '×', in: '{h} × {d} mm', why: `the box's measure in the print package (#1418): ${SIZE}` },
  ]),
  ...(
    [
      ['src/i18n/sv.editor.ts', ['typsnittet i Speltema ›', 'i Tabell ›', '({n}) ›', 'biblioteket ›', '‹ Spelets', 'finns i Speltema ›', 'tryckpaketet ›']],
      ['src/i18n/en.editor.ts', ['font under Theme ›', 'in Data ›', '({n}) ›', 'library ›', '‹ The game', 'are under Theme ›', 'print package ›']],
      ['src/i18n/sv.account.ts', ['i editorn ›', 'lådan ›']],
      ['src/i18n/en.account.ts', ['in the editor ›', 'the box ›']],
    ] as const
  ).flatMap(([file, names]) => names.map((name) => ({ file, char: [...name].find((c) => ICONS.includes(c))!, in: name, why: NAMED }))),
  // Icons that are not among the twenty the table drew, and so have no drawing in the hand yet.
  // They are icons all the same; each is a follow-up, not text.
  { file: 'src/editor/canvas.ts', char: '▣', in: '▣', why: 'the tool rail’s five marks (T ▣ ● ●● ◻) are one set, and the table drew none of them' },
  { file: 'src/editor/TemplateCanvas.tsx', char: '↕', in: '↕', why: 'a scrub’s mark, one of a family of seven (↔ ↕ ◌ ◐ ◜ ✧ ▬) the table drew none of; ↕ here is the shadow’s height, not a sort' },
]

const allowed = (hit: Shown, char: string) => ALLOWED.find((a) => a.file === hit.file && a.char === char && hit.text.includes(a.in))

// The drawings outside `glyphs.tsx` that are not controls' icons, by file and how many. A card is
// drawn by the card's own means, and the mark is the brand's; neither is an icon in a button.
const DRAWINGS: Record<string, { count: number; why: string }> = {
  'src/brand/mark.ts': { count: 4, why: 'the brand mark, as the files the favicon, the app icons and the share image are made of (A6, #1084)' },
  'src/brand/DecksterMark.tsx': { count: 1, why: 'the brand mark on the page, the fan of cards the product is named by' },
  'src/table/Die.tsx': { count: 3, why: 'a die on the felt, its kind’s outline seen from above with the side that is up (#1137, K28), and while it whips round the after-images of that outline and the ring in the seat’s colour that closes round it (#1288)' },
  'src/editor/DeckWall.tsx': { count: 2, why: 'the colour-vision filters the eyes box looks at cards through, which draw nothing; and the small box in the foot (#1415), a sign for its measures as deep as the deck, which draws none of its faces (E2)' },
  'src/editor/symbols.ts': { count: 1, why: 'the symbol library: card art, drawn on cards by the card renderer' },
  'src/editor/icon-catalog.ts': { count: 1, why: 'the icon catalogue: card art, drawn on cards by the card renderer' },
  'src/editor/svg-clean.ts': { count: 1, why: 'the words of a refusal, naming the root element a designer’s own SVG lacked' },
  'src/account/PrintPackagePage.tsx': { count: 1, why: 'the knife: the bleed, the trim and the safe margin drawn over a card in its own millimetres (#1208)' },
  'src/editor/box-net.tsx': { count: 1, why: 'the box net’s flaps, cut and folds (#1413), in the net’s own millimetres, in the Låda tab and the print package (#1418); they are folded in and never printed, and the faces are the renderer’s' },
  'src/editor/TemplateCanvas.tsx': { count: 2, why: 'a shape’s and a pattern’s picture in the gallery, drawn by the path generator and tile the card is drawn by' },
}

describe('the icons in src', () => {
  it('are found at all, so this guard cannot pass by reading nothing', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files.some((f) => f.path === 'src/glyphs.tsx')).toBe(true)
  })

  it('would notice a character typed as an icon, in a literal, in JSX text and as an entity, but not in a comment', () => {
    const read = (source: string) => shownIn('probe.tsx', source).shown.map((s) => s.text.trim()).filter(Boolean)
    expect(read(`const a = <button>×</button> // the ×\nconst b = '▾'\nconst c = <i>&#x2212;</i>\n/* ⋯ */`)).toEqual(['×', '▾', '−'])
    expect(shownInSheet('probe.css', `/* ✓ */ a::before { content: '✓'; }`).shown[0]!.text.trim()).toBe(`a::before { content: '✓'; }`)
  })

  it('are drawn and not typed: no character stands in for an icon (#1083)', () => {
    const typed = files.flatMap((f) =>
      f.shown.flatMap((hit) => ICONS.filter((char) => hit.text.includes(char) && !allowed(hit, char)).map((char) => `${hit.file}:${hit.line} ${char} in ${JSON.stringify(hit.text.trim().slice(0, 80))}`)),
    )
    expect(typed, 'draw it with a glyph from src/glyphs.tsx, or name it in ALLOWED with why it is text').toEqual([])
  })

  it('excuses nothing that is no longer there', () => {
    const stale = ALLOWED.filter((a) => !files.some((f) => f.path === a.file && f.shown.some((hit) => hit.text.includes(a.char) && hit.text.includes(a.in))))
    expect(stale.map((a) => `${a.file} ${a.char} ${a.in}`)).toEqual([])
  })

  it('come from glyphs.tsx: every other SVG is a card or the brand, and says so', () => {
    const drawn = Object.fromEntries(files.filter((f) => f.svgs > 0 && f.path !== 'src/glyphs.tsx').map((f) => [f.path, f.svgs]))
    expect(drawn).toEqual(Object.fromEntries(Object.entries(DRAWINGS).map(([file, { count }]) => [file, count])))
  })
})

// The hand itself, read off the module: one grid and one stroke. A glyph added at 1.4 or on a
// 24 grid is the drift this issue was about, arriving through the one door meant to stop it.
describe('the hand in glyphs.tsx', () => {
  const source = readFileSync(join(SRC, 'glyphs.tsx'), 'utf8')
  const file = ts.createSourceFile('glyphs.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const elements: Record<string, string>[] = []
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attrs: Record<string, string> = { tag: node.tagName.getText(file) }
      for (const a of node.attributes.properties) if (ts.isJsxAttribute(a) && a.initializer && ts.isStringLiteral(a.initializer)) attrs[a.name.getText(file)] = a.initializer.text
      elements.push(attrs)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)

  it('draws on a 16 grid, hidden from the name and out of the tab order', () => {
    const svgs = elements.filter((e) => e.tag === 'svg')
    expect(svgs.length).toBeGreaterThan(0)
    for (const svg of svgs) expect(svg).toMatchObject({ className: 'byd-glyph', viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' })
  })

  it('strokes with a round 1.6 line in the control’s ink', () => {
    const stroked = elements.filter((e) => 'stroke' in e)
    expect(stroked.length).toBeGreaterThan(0)
    for (const e of stroked) expect(e).toMatchObject({ stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' })
    expect(elements.filter((e) => 'strokeWidth' in e && !('stroke' in e))).toEqual([])
  })
})
