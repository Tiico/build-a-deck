import type { Snapshot } from '@byd/protocol'
import { Refusal, type RefusalHandle } from '../status/Refusal.js'

export type PlaySheetProps = {
  view: Snapshot
  count: number
  label: string
  onPlay(zone: string): void
  onClose(): void
  // The answer to the last press, and which button it was an answer to (#7). A refusal stands
  // at the control that caused it, not at the top of the document.
  refusal?: RefusalHandle
  refusedZone?: string | null
}

// Where a lifted card can go (C4): every named zone that is not a hand, in the setup's order,
// and the floor last as "Bordet". Zone names are the designer's — they are the UX here (B5).
export function targetsOf(view: Snapshot) {
  const named = view.zones
    .filter((z) => z.kind !== 'hand' && z.id !== view.floor)
    .map((z) => ({ id: z.id, name: z.name, kind: z.kind, count: z.mode === 'count' ? z.count : z.order.length }))
  return [...named, { id: view.floor, name: 'Bordet', kind: 'area' as const, count: 0 }]
}

export function PlaySheet({ view, count, label, onPlay, onClose, refusal, refusedZone = null }: PlaySheetProps) {
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Spela till"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <p>
          Spela <strong>{count > 1 ? `${count} kort` : label}</strong> till
        </p>
        <div className="byd-sheet-targets">
          {targetsOf(view).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onPlay(t.id)}
              className={refusedZone === t.id ? 'byd-status-refused-control' : undefined}
              {...(refusedZone === t.id && refusal ? refusal.control : {})}
            >
              <span>{t.name}</span>
              <small>{t.kind === 'pile' ? `${t.count} kort · lägg överst` : 'lägg fritt'}</small>
            </button>
          ))}
        </div>
        {refusal && <Refusal handle={refusal} />}
      </div>
    </div>
  )
}
