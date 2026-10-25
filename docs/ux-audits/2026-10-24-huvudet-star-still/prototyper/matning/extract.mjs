// PROTOTYP #1250 — slit och släng. Plockar ut editorns huvud ur appens riktiga stilmallar, så att
// prototypen ritar huvudet med exakt de regler main har (inte avskrivna för hand som i #668).
//
//   POSTCSS=<sökväg till postcss> node matning/extract.mjs
//
// Skriver ../huvudet.css: hela buttons.css, och ur editor.css varje regel vars väljare rör
// huvudets rad, med sina @media kvar. Prototypen visar huvudet i en <iframe> per fönsterbredd, så
// att @media gäller som i appen.
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

// Huvudets rad och det som står i den. `.byd-history header` och `.byd-share header` är panelernas
// egna huvuden och hör inte hit.
const keep = (sel) =>
  /^\.byd-editor\s*$/.test(sel) ||
  /\.byd-editor\s*>\s*header/.test(sel) ||
  /\.byd-editor \[role='(tab|tablist)'\]/.test(sel) ||
  /\.byd-editor-(home|name|more|rev|saved|steps|here|spacer|primary|save|split|caret)\b/.test(sel)

editor.walkRules((rule) => {
  const sels = rule.selectors.filter(keep)
  if (sels.length === 0) rule.remove()
  else rule.selectors = sels
})
editor.walkComments((c) => c.remove())
editor.walkAtRules((at) => {
  if (at.nodes && at.nodes.length === 0) at.remove()
})

const out = `/* PROTOTYP #1250 — genererad av matning/extract.mjs ur packages/web/src på ${sha}. Rör inte för hand. */\n`
  + src('buttons.css') + '\n/* ── editor.css, huvudets regler ── */\n' + editor.toString().replace(/\n{3,}/g, '\n\n')
writeFileSync(join(here, '..', 'huvudet.css'), out)
console.log('huvudet.css', out.length, 'tecken')
