import type { ProjectCredit, ProjectDoc, ProjectFont } from '@byd/server'
import { columnOf, DEFAULT_FRAME, FRAMES, type Field } from './frames.js'
import { applyEdit, openingSetup } from '@byd/server/doc'
import { catalogStack } from '../editor/font-catalog.js'
import { symbolPreview } from '../editor/symbols.js'
import { starterIcons, THEMES, themeFamilies, themeIntent, type Theme } from '../editor/themes.js'
import { translate, type T } from '../i18n/index.js'
import { recipeWords } from '../editor/fields.js'

// `counters` (C4): what every seat keeps count of, from the start value; one score by default.
// `frame` and `theme` are «Utseende» (L57, #633): where things stand, and how the card feels.
export type WizardState = { name: string; players: number; fields: Field[]; frame: string; theme: string; rows: Record<string, string>[]; counters?: { name: string; start: number }[] }

// The theme a guided start begins from until another is pressed: the first in the gallery.
export const DEFAULT_THEME: Theme = THEMES[0] as Theme
export const themeOfState = (state: Pick<WizardState, 'theme'>): Theme => THEMES.find((th) => th.id === state.theme) ?? DEFAULT_THEME

// The theme's files as the game carries them: each family with its file (#420, B3), and the starter
// icons with theirs (E1). `buildProject` is handed them once they are the service's.
export type ThemeFiles = { fonts: Record<string, ProjectFont>; icons: Record<string, { url: string; credit?: ProjectCredit }> }

// The same theme before any file exists — what the live preview draws while the wizard is open: the
// families by their stacks alone, and the icons as the library draws them.
export function unfetched(state: Pick<WizardState, 'theme'>, t: T = swedish): ThemeFiles {
  const theme = themeOfState(state)
  return {
    fonts: Object.fromEntries(themeFamilies(theme).map((f) => [f.family, { stack: catalogStack(f.family, f.category) }])),
    icons: Object.fromEntries(starterIcons({ icons: {} }, theme, t).map(({ name, symbol }) => [name, { url: symbolPreview(symbol), credit: { licence: symbol.licence, by: symbol.by, source: symbol.id } }])),
  }
}
// The counter every seat starts with is a word the designer reads and renames, so it is written
// in the language the game is being built in (A4) — like the field names the wizard suggests.
export const defaultCounters = (t: T): { name: string; start: number }[] => [{ name: t('counter.score'), start: 0 }]
// Without a language given, the tool speaks Swedish — the catalogue's own language.
const swedish: T = (key, params) => translate('sv', key, params)

// The wizard's whole output (L6): exactly the document the editor edits — E3's condition.
// The table is the recipe's (B5): seats around a felt as large as that many people need (K18),
// each with a hand that returns to the draw pile, an area in front of it and its counters; the
// editor turns the same knobs afterwards.
// The theme is laid over the frame by the very edit Speltema sends (`setTheme`, L57): the headings
// in its heading family, the prose in its body family, its meanings painted and its starter icons
// given — so a game begun here is the game that choosing the theme in the editor would have made,
// and the rule for which text gets which family is written once, in that edit.
// `files` are the theme's families and icons as the game carries them (#420, B3); without them the
// document is the preview's, set in stacks with nothing behind them.
export function buildProject(state: WizardState, t: T = swedish, files: ThemeFiles = unfetched(state, t)): ProjectDoc {
  const frame = FRAMES.find((f) => f.id === state.frame) ?? DEFAULT_FRAME
  const ids = new Set<string>()
  const rows = state.rows.map((row, i) => {
    const base = slug(row['title'] ?? '') || `kort-${i + 1}`
    let id = base
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`
    ids.add(id)
    return { id, fields: typedFields(row, state.fields) }
  })
  const framed: ProjectDoc = {
    name: state.name.trim(),
    template: { faces: { front: frame.front(state.fields, t), back: frame.back(t) } },
    rows,
    icons: {},
    setup: tableOf(state, t),
  }
  return applyEdit(framed, themeIntent(framed, themeOfState(state), files.fonts, t, files.icons))
}

// A game made without the guided start (L42): the name and the seats are the whole of what the
// designer has said, so the document holds those and the table every game has, and nothing the
// wizard's other steps would have suggested — two empty faces, no fields, no cards. All of that
// is made in the editor, by the same edits any game gets; the editor cannot tell which door a
// game came in by (E3).
export function buildBlankProject(state: Pick<WizardState, 'name' | 'players' | 'counters'>, t: T = swedish): ProjectDoc {
  return {
    name: state.name.trim(),
    template: { faces: { front: { base: [], variants: {} }, back: { base: [], variants: {} } } },
    rows: [],
    icons: {},
    setup: tableOf(state, t),
  }
}

// The table a new game starts with, whichever door it came in by: the recipe's seats around a
// felt as large as that many people need (K18), each with a hand that returns to the draw pile,
// an area in front of it and its counters (C4); the editor turns the same knobs afterwards (B5).
// It is named in the designer's language from the first moment (A4).
function tableOf(state: Pick<WizardState, 'players' | 'counters'>, t: T): ProjectDoc['setup'] {
  const words = recipeWords(t)
  return openingSetup({ players: state.players, counters: state.counters ?? defaultCounters(t) }, words)
}

// Numbers become numbers, antal defaults to 1, everything else stays text — each under the column
// its field was named (#476). The live card is handed the same, so it reads what the game will.
export function typedFields(row: Record<string, string>, fields: Field[]): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  // Each field is written under the column it was named (#476), and nothing else of the wizard's
  // own bookkeeping — the key a field was held by in the form — reaches the document.
  const held = new Set(fields.map((f) => f.key))
  for (const f of fields) {
    const v = row[f.key] ?? ''
    out[columnOf(f)] = f.kind === 'number' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v
  }
  for (const [k, v] of Object.entries(row)) if (!held.has(k) && !(k in out) && k !== 'antal') out[k] = v
  const antal = Number(row['antal'] ?? '')
  out['antal'] = Number.isFinite(antal) && antal > 0 ? Math.floor(antal) : 1
  return out
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
