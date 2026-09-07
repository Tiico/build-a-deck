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

// A mode on the desk and a stage on anything smaller name the same panel, because only one of
// the two shapes is ever mounted (see `room.ts`): one document, one id per panel.
export const panelId = (key: string) => `byd-editor-panel-${key}`
export const tabId = (key: string) => `byd-editor-tab-${key}`

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
