import type { ProjectDoc } from '@byd/server'
import { DEFAULT_FRAME, FRAMES, type Field } from './frames.js'
import { applyRecipe, emptySetup } from '@byd/server/doc'
import { translate, type T } from '../i18n/index.js'
import { recipeWords } from '../editor/fields.js'

// `counters` (C4): what every seat keeps count of, from the start value; one score by default.
export type WizardState = { name: string; players: number; fields: Field[]; frame: string; rows: Record<string, string>[]; counters?: { name: string; start: number }[] }
// The counter every seat starts with is a word the designer reads and renames, so it is written
// in the language the game is being built in (A4) — like the field names the wizard suggests.
export const defaultCounters = (t: T): { name: string; start: number }[] => [{ name: t('counter.score'), start: 0 }]

// The wizard's whole output (L6): exactly the document the editor edits — E3's condition.
// The table is the recipe's (B5): seats around a 1200 × 800 mm table, each with a hand that
// returns to the draw pile, an area in front of it and its counters; the editor turns the same
// knobs afterwards.
export function buildProject(state: WizardState, t: T = (key, params) => translate('sv', key, params)): ProjectDoc {
  const frame = FRAMES.find((f) => f.id === state.frame) ?? DEFAULT_FRAME
  // The table a new game starts with is named in the designer's language from the first moment.
  const words = recipeWords(t)
  const ids = new Set<string>()
  const rows = state.rows.map((row, i) => {
    const base = slug(row['title'] ?? '') || `kort-${i + 1}`
    let id = base
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`
    ids.add(id)
    return { id, fields: typedFields(row, state.fields) }
  })
  return {
    name: state.name.trim(),
    template: { faces: { front: frame.front(state.fields), back: frame.back } },
    rows,
    icons: {},
    setup: applyRecipe(emptySetup(words), { players: state.players, mine: true, discard: true, market: false, counters: state.counters ?? defaultCounters(t) }, words),
  }
}

// Numbers become numbers, antal defaults to 1, everything else stays text.
function typedFields(row: Record<string, string>, fields: Field[]): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const f of fields) {
    const v = row[f.key] ?? ''
    out[f.key] = f.kind === 'number' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v
  }
  for (const [k, v] of Object.entries(row)) if (!(k in out) && k !== 'antal') out[k] = v
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
