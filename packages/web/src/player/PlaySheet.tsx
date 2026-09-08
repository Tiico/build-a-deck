import type { Snapshot } from '@byd/protocol'
import { Refusal, type RefusalHandle } from '../status/Refusal.js'

export type Placement = 'top' | 'bottom'
// The counter token's type id (engine's TOKEN_COUNTER), which the phone treats as a count, not a card.
export const COUNTER_TYPE = 'token.counter'
export type PlaySheetProps = {
  view: Snapshot
  count: number
  label: string
  onPlay(zone: string, at: Placement): void
  onClose(): void
  // The answer to the last press, and which button it was an answer to (#7). A refusal stands
  // at the control that caused it, not at the top of the document.
  refusal?: RefusalHandle
  refusedZone?: string | null
}

// What a zone offers the phone (C4): the shortcut's verb, or the zone's name when the designer
// gave none; and for a pile, whether a card played there goes on top or underneath. The same
// rule for the sheet and for the editor's preview of it.
export type ZoneLike = { id: string; kind: 'pile' | 'area' | 'hand'; name: string; shortcut?: { label: string; at: Placement } | undefined }
export function shortcutsOf<Z extends ZoneLike>(zones: readonly Z[], floor: string): (Z & { label: string; at: Placement })[] {
  return zones.filter((z) => z.kind !== 'hand' && z.id !== floor).map((z) => ({ ...z, label: z.shortcut?.label ?? z.name, at: z.shortcut?.at ?? 'top' }))
}

// Where a lifted card can go (C4): every named zone that is not a hand, in the setup's order,
// and the floor last as "Bordet". Zone names and shortcuts are the designer's — they are the UX
// here (B5).
export function targetsOf(view: Snapshot) {
  // Another seat's own area is not a place to play to, and a zone that only holds counters
  // (C4) is not a place for cards at all.
  const byZone = new Map<string, Snapshot['components']>()
  for (const c of view.components) byZone.set(c.zone, [...(byZone.get(c.zone) ?? []), c])
  const playable = view.zones.filter((z) => {
    if (z.owner !== undefined && z.owner !== view.seat) return false
    const inside = byZone.get(z.id) ?? []
    return !(inside.length > 0 && inside.every((c) => c.type.id === COUNTER_TYPE))
  })
  const named = shortcutsOf(playable, view.floor).map((z) => ({ id: z.id, name: z.name, label: z.label, at: z.at, kind: z.kind, count: z.mode === 'count' ? z.count : z.order.length }))
  return [...named, { id: view.floor, name: 'Bordet', label: 'Bordet', at: 'top' as Placement, kind: 'area' as const, count: 0 }]
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
              onClick={() => onPlay(t.id, t.at)}
              className={refusedZone === t.id ? 'byd-status-refused-control' : undefined}
              {...(refusedZone === t.id && refusal ? refusal.control : {})}
            >
              <span>{t.label}</span>
              <small>{t.kind === 'pile' ? `${t.count} kort · ${t.at === 'bottom' ? 'underst' : 'överst'} i ${t.name}` : 'lägg fritt'}</small>
            </button>
          ))}
        </div>
        {refusal && <Refusal handle={refusal} />}
      </div>
    </div>
  )
}
