import type { ReactNode } from 'react'
import { panelId, tabId, type Mode } from './EditorTabs.js'
import { useRoving } from './roving.js'
import { useT, type Key } from '../i18n/index.js'
import type { Room } from '../room.js'

// Below the desk the editor is a flat list of named stages, one at a time (L10, prototype C).
// The four panels of the template mode become four stages beside the three modes, so there is one
// tablist and never a tablist inside a tablist.
export type Stage = 'wall' | 'tools' | 'layers' | 'canvas' | 'props' | 'table' | 'symbols' | 'rules' | 'tables'

// The stages of the template mode — the ones that are not offered at all on a phone.
export type CanvasStage = 'tools' | 'layers' | 'canvas' | 'props'
export const CANVAS_STAGES: readonly CanvasStage[] = ['tools', 'layers', 'canvas', 'props']
export const isCanvasStage = (stage: Stage): stage is CanvasStage => (CANVAS_STAGES as readonly string[]).includes(stage)

// A stage is named by a key and not by a word, the same way the modes above the desk are: what
// the strip reads is looked up where the reader is (A4).
export const STAGES: Record<Exclude<Room, 'desk'>, readonly (readonly [Stage, Key])[]> = {
  // A phone gets the deck, the data, the library, the rulebook and the tables. Only laying a
  // card out needs a wider screen, and the editor says that where the stages are rather than
  // leaving a gap in the list.
  phone: [
    ['wall', 'editor.tab.wall'],
    ['table', 'editor.tab.table'],
    ['symbols', 'editor.tab.symbols'],
    ['rules', 'editor.tab.rules'],
    ['tables', 'editor.tab.tables'],
  ],
  tablet: [
    ['wall', 'editor.tab.wall'],
    ['tools', 'editor.stage.tools'],
    ['layers', 'editor.stage.layers'],
    ['canvas', 'editor.stage.canvas'],
    ['props', 'editor.stage.props'],
    ['table', 'editor.tab.table'],
    ['symbols', 'editor.tab.symbols'],
    ['rules', 'editor.tab.rules'],
    ['tables', 'editor.tab.tables'],
  ],
}

// Which mode a stage belongs to: the four template stages are the template mode seen closely,
// and the rest are a mode each.
export function modeOf(stage: Stage): Mode {
  return isCanvasStage(stage) ? 'template' : stage
}

export type EditorStagesProps = {
  stages: readonly (readonly [Stage, Key])[]
  stage: Stage
  onSelect(stage: Stage): void
  // The two things that must never scroll away: saving, and what reaches the table. They are
  // pinned to the end of the bar, outside the strip that scrolls.
  children: ReactNode
}

// The stage strip: the same APG tablist with a roving tabindex the modes already are (#11), only
// flat and in thumb's reach at the bottom of the screen.
export function EditorStages({ stages, stage, onSelect, children }: EditorStagesProps) {
  const t = useT()
  const { itemProps } = useRoving({ ids: stages.map(([s]) => s), selected: stage, orientation: 'horizontal' })
  return (
    <div className="byd-editor-stagebar">
      <div role="tablist" aria-label={t('editor.stages')}>
        {stages.map(([s, label]) => {
          const roving = itemProps(s)
          return (
            <button
              key={s}
              id={tabId(s)}
              role="tab"
              type="button"
              aria-selected={stage === s ? 'true' : 'false'}
              aria-controls={panelId(s)}
              onClick={() => onSelect(s)}
              {...roving}
              // The strip scrolls sideways on a phone, so a tab the arrows moved to has to be
              // brought into view — otherwise the roving tabindex puts the focus somewhere
              // nobody can see.
              onFocus={(event) => {
                roving.onFocus()
                event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
              }}
            >
              {t(label)}
            </button>
          )
        })}
      </div>
      <div className="byd-editor-stagebar-actions">{children}</div>
    </div>
  )
}
