import { useRoving } from './roving.js'
import { useT, type Key } from '../i18n/index.js'

export type Mode = 'wall' | 'template' | 'box' | 'table' | 'theme' | 'media' | 'rules' | 'tables'

// The editor's seven modes, in the order they are read (L, #19): the wall is home, the canvas is
// the template, the table is the data, and then what the cards draw from — Speltema, the game's
// typefaces, meanings and icons chosen once (L57, in Symbolers ställe), and Media for the pictures
// (#222) — before Regler, the rulebook (B7), and Bord, where the game is played from.
export const MODES: readonly (readonly [Mode, Key])[] = [
  ['wall', 'editor.tab.wall'],
  ['template', 'editor.tab.template'],
  ['table', 'editor.tab.table'],
  ['theme', 'editor.tab.theme'],
  ['media', 'editor.tab.media'],
  ['rules', 'editor.tab.rules'],
  ['tables', 'editor.tab.tables'],
]

// Lådan (#1413, L91): a tab after Mall once the deck is playable, which is when «Starta bord» can be
// used (#1406, beslut 3). Before that it is not there at all, so a designer who has just begun is
// not asked about a box (beslut 2).
export const BOX_MODE: readonly [Mode, Key] = ['box', 'editor.tab.box']
export function modesFor(playable: boolean): readonly (readonly [Mode, Key])[] {
  if (!playable) return MODES
  const at = MODES.findIndex(([m]) => m === 'template') + 1
  return [...MODES.slice(0, at), BOX_MODE, ...MODES.slice(at)]
}

// A mode on the desk and a stage on anything smaller name the same panel, because only one of
// the two shapes is ever mounted (see `room.ts`): one document, one id per panel.
export const panelId = (key: string) => `byd-editor-panel-${key}`
export const tabId = (key: string) => `byd-editor-tab-${key}`

export type EditorTabsProps = { mode: Mode; onSelect(mode: Mode): void; modes?: readonly (readonly [Mode, Key])[] }

// The mode switch as an APG tablist: one tab stop, the arrow keys move focus inside it.
export function EditorTabs({ mode, onSelect, modes = MODES }: EditorTabsProps) {
  const t = useT()
  const { itemProps } = useRoving({ ids: modes.map(([m]) => m), selected: mode, orientation: 'horizontal' })
  return (
    <nav role="tablist" aria-label={t('editor.tabs')}>
      {modes.map(([m, label]) => (
        <button key={m} id={tabId(m)} className="byd-choice" role="tab" type="button" aria-selected={mode === m ? 'true' : 'false'} aria-controls={panelId(m)} onClick={() => onSelect(m)} {...itemProps(m)}>
          {t(label)}
        </button>
      ))}
    </nav>
  )
}
