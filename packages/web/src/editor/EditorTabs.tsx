import { useRoving } from './roving.js'
import { useT, type Key } from '../i18n/index.js'

export type Mode = 'wall' | 'template' | 'table' | 'symbols' | 'media' | 'rules' | 'tables'

// The editor's seven modes, in the order they are read (L, #19): the wall is home, the canvas is
// the template, the table is the data, and then the two libraries the cards draw from — Symboler
// for the meanings (E4) and Media for the pictures (#222) — before Regler, the rulebook (B7), and
// Bord, where the game is played from. The pictures stand beside the symbols because they are the
// same kind of thing to the hand that is looking for one: a library of the deck's own material,
// with one place to find it and one place to tidy it.
export const MODES: readonly (readonly [Mode, Key])[] = [
  ['wall', 'editor.tab.wall'],
  ['template', 'editor.tab.template'],
  ['table', 'editor.tab.table'],
  ['symbols', 'editor.tab.symbols'],
  ['media', 'editor.tab.media'],
  ['rules', 'editor.tab.rules'],
  ['tables', 'editor.tab.tables'],
]

// A mode on the desk and a stage on anything smaller name the same panel, because only one of
// the two shapes is ever mounted (see `room.ts`): one document, one id per panel.
export const panelId = (key: string) => `byd-editor-panel-${key}`
export const tabId = (key: string) => `byd-editor-tab-${key}`

export type EditorTabsProps = { mode: Mode; onSelect(mode: Mode): void }

// The mode switch as an APG tablist: one tab stop, the arrow keys move focus inside it.
export function EditorTabs({ mode, onSelect }: EditorTabsProps) {
  const t = useT()
  const { itemProps } = useRoving({ ids: MODES.map(([m]) => m), selected: mode, orientation: 'horizontal' })
  return (
    <nav role="tablist" aria-label={t('editor.tabs')}>
      {MODES.map(([m, label]) => (
        <button key={m} id={tabId(m)} className="byd-choice" role="tab" type="button" aria-selected={mode === m ? 'true' : 'false'} aria-controls={panelId(m)} onClick={() => onSelect(m)} {...itemProps(m)}>
          {t(label)}
        </button>
      ))}
    </nav>
  )
}
