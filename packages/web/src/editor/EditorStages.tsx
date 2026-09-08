import type { ReactNode } from 'react'
import { panelId, tabId, type Mode } from './EditorTabs.js'
import { useRoving } from './roving.js'
import type { Room } from '../room.js'

// Below the desk the editor is a flat list of named stages, one at a time (L10, prototype C).
// The four panels of the template mode become four stages beside the three modes, so there is one
// tablist and never a tablist inside a tablist.
export type Stage = 'wall' | 'tools' | 'layers' | 'canvas' | 'props' | 'table' | 'symbols' | 'rules' | 'tables'

// The stages of the template mode — the ones that are not offered at all on a phone.
export type CanvasStage = 'tools' | 'layers' | 'canvas' | 'props'
export const CANVAS_STAGES: readonly CanvasStage[] = ['tools', 'layers', 'canvas', 'props']
export const isCanvasStage = (stage: Stage): stage is CanvasStage => (CANVAS_STAGES as readonly string[]).includes(stage)

export const STAGES: Record<Exclude<Room, 'desk'>, readonly (readonly [Stage, string])[]> = {
  // A phone gets the deck, the data, the library, the rulebook and the tables. Only laying a
  // card out needs a wider screen, and the editor says that where the stages are rather than
  // leaving a gap in the list.
  phone: [
    ['wall', 'Kortvägg'],
    ['table', 'Tabell'],
    ['symbols', 'Symboler'],
    ['rules', 'Regler'],
    ['tables', 'Bord'],
  ],
  tablet: [
    ['wall', 'Kortvägg'],
    ['tools', 'Verktyg'],
    ['layers', 'Lager'],
    ['canvas', 'Duk'],
    ['props', 'Egenskaper'],
    ['table', 'Tabell'],
    ['symbols', 'Symboler'],
    ['rules', 'Regler'],
    ['tables', 'Bord'],
  ],
}

// Which mode a stage belongs to: the four template stages are the template mode seen closely,
// and the rest are a mode each.
export function modeOf(stage: Stage): Mode {
  return isCanvasStage(stage) ? 'template' : stage
}

export type EditorStagesProps = {
  stages: readonly (readonly [Stage, string])[]
  stage: Stage
  onSelect(stage: Stage): void
  // The two things that must never scroll away: saving, and what reaches the table. They are
  // pinned to the end of the bar, outside the strip that scrolls.
  children: ReactNode
}

// The stage strip: the same APG tablist with a roving tabindex the modes already are (#11), only
// flat and in thumb's reach at the bottom of the screen.
export function EditorStages({ stages, stage, onSelect, children }: EditorStagesProps) {
  const { itemProps } = useRoving({ ids: stages.map(([s]) => s), selected: stage, orientation: 'horizontal' })
  return (
    <div className="byd-editor-stagebar">
      <div role="tablist" aria-label="Editorns etapper">
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
              {label}
            </button>
          )
        })}
      </div>
      <div className="byd-editor-stagebar-actions">{children}</div>
    </div>
  )
}
