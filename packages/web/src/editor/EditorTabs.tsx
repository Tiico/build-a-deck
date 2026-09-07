import { useRoving } from './roving.js'

export type Mode = 'wall' | 'template' | 'table' | 'tables'

// The editor's four modes, in the order they are read (L, #19): the wall is home, the canvas is
// the template, the table is the data, and Bord is where the game is played from.
export const MODES: readonly (readonly [Mode, string])[] = [
  ['wall', 'Kortvägg'],
  ['template', 'Mall'],
  ['table', 'Tabell'],
  ['tables', 'Bord'],
]

export const panelId = (mode: Mode) => `byd-editor-panel-${mode}`
export const tabId = (mode: Mode) => `byd-editor-tab-${mode}`

export type EditorTabsProps = { mode: Mode; onSelect(mode: Mode): void }

// The mode switch as an APG tablist: one tab stop, the arrow keys move focus inside it.
export function EditorTabs({ mode, onSelect }: EditorTabsProps) {
  const { itemProps } = useRoving({ ids: MODES.map(([m]) => m), selected: mode, orientation: 'horizontal' })
  return (
    <nav role="tablist" aria-label="Editorlägen">
      {MODES.map(([m, label]) => (
        <button key={m} id={tabId(m)} role="tab" type="button" aria-selected={mode === m ? 'true' : 'false'} aria-controls={panelId(m)} onClick={() => onSelect(m)} {...itemProps(m)}>
          {label}
        </button>
      ))}
    </nav>
  )
}
