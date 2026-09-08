import { useRoving } from './roving.js'
import { useT, type Key } from '../i18n/index.js'

export type Mode = 'wall' | 'template' | 'table' | 'symbols' | 'rules' | 'tables'

// The editor's six modes, in the order they are read (L, #19): the wall is home, the canvas is
// the template, the table is the data, Symboler is the library the cards draw from (E4), and
// Regler is the rulebook (B7), and Bord is where the game is played from.
export const MODES: readonly (readonly [Mode, Key])[] = [
  ['wall', 'editor.tab.wall'],
  ['template', 'editor.tab.template'],
  ['table', 'editor.tab.table'],
  ['symbols', 'editor.tab.symbols'],
  ['rules', 'editor.tab.rules'],
  ['tables', 'editor.tab.tables'],
]

export const panelId = (mode: Mode) => `byd-editor-panel-${mode}`
export const tabId = (mode: Mode) => `byd-editor-tab-${mode}`

export type EditorTabsProps = { mode: Mode; onSelect(mode: Mode): void }

// The mode switch as an APG tablist: one tab stop, the arrow keys move focus inside it.
export function EditorTabs({ mode, onSelect }: EditorTabsProps) {
  const t = useT()
  const { itemProps } = useRoving({ ids: MODES.map(([m]) => m), selected: mode, orientation: 'horizontal' })
  return (
    <nav role="tablist" aria-label={t('editor.tabs')}>
      {MODES.map(([m, label]) => (
        <button key={m} id={tabId(m)} role="tab" type="button" aria-selected={mode === m ? 'true' : 'false'} aria-controls={panelId(m)} onClick={() => onSelect(m)} {...itemProps(m)}>
          {t(label)}
        </button>
      ))}
    </nav>
  )
}
