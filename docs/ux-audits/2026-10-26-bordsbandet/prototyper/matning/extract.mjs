// PROTOTYP bordsbandet 2026-10-26 — slit och släng. Plockar ut editorns huvud och bordsbandet ur
// appens riktiga stilmallar, så att «i dag» ritas med exakt de regler main har (som #1250 gjorde
// för huvudet).
//
//   POSTCSS=<sökväg till postcss> node matning/extract.mjs
//
// Skriver ../appen.css: hela buttons.css, och ur editor.css varje regel vars väljare rör huvudets
// rad, bordsbandet eller notisbandet, med sina @media kvar.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = execSync('git rev-parse --show-toplevel', { cwd: here }).toString().trim()
const sha = execSync('git rev-parse --short HEAD', { cwd: here }).toString().trim()
const postcss = createRequire(import.meta.url)(process.env.POSTCSS ?? 'postcss')

const src = (p) => readFileSync(join(root, 'packages/web/src', p), 'utf8')
const editor = postcss.parse(src('editor/editor.css'))

const keep = (sel) =>
  /^\.byd-editor\s*$/.test(sel) ||
  /\.byd-editor\s*>\s*header/.test(sel) ||
  /\.byd-editor \[role='(tab|tablist)'\]/.test(sel) ||
  /\.byd-editor-(home|name|more|rev|saved|steps|here|spacer|primary|save|split|caret)\b/.test(sel) ||
  /\.byd-editor-(table-link|table-ask|table-said|warning|rendering|room|seats|notice)/.test(sel) ||
  /\.byd-editor\s*>\s*:is\(header/.test(sel)

editor.walkRules((rule) => {
  const sels = rule.selectors.filter(keep)
  if (sels.length === 0) rule.remove()
  else rule.selectors = sels
})
editor.walkComments((c) => c.remove())
editor.walkAtRules((at) => {
  if (at.nodes && at.nodes.length === 0) at.remove()
})

const out = `/* PROTOTYP bordsbandet — genererad av matning/extract.mjs ur packages/web/src på ${sha}. Rör inte för hand. */\n`
  + src('buttons.css') + '\n/* ── editor.css, huvudets och bandets regler ── */\n' + editor.toString().replace(/\n{3,}/g, '\n\n')
writeFileSync(join(here, '..', 'appen.css'), out)
console.log('appen.css', out.length, 'tecken')
