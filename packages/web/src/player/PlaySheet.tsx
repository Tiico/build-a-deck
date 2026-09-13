import type { Snapshot } from '@byd/protocol'
import { isCounter } from '../components.js'
import { Refusal, type RefusalHandle } from '../status/Refusal.js'
import { translate, useT, type Key, type T } from '../i18n/index.js'

// Without a language given, the catalogue's own: `targetsOf` is a plain function and is read
// outside React too, where the tool speaks Swedish like every unprovided surface does.
const swedish: T = (key, params) => translate('sv', key, params)

export type Placement = 'top' | 'bottom'
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
// and the floor last as the table itself. Zone names and shortcuts are the designer's — they are
// the UX here (B5) and are never translated.
export function targetsOf(view: Snapshot, t: T = swedish) {
  // Another seat's own area is not a place to play to, and a zone that only holds counters
  // (C4) is not a place for cards at all.
  const byZone = new Map<string, Snapshot['components']>()
  for (const c of view.components) byZone.set(c.zone, [...(byZone.get(c.zone) ?? []), c])
  const playable = view.zones.filter((z) => {
    if (z.owner !== undefined && z.owner !== view.seat) return false
    const inside = byZone.get(z.id) ?? []
    return !(inside.length > 0 && inside.every(isCounter))
  })
  const named = shortcutsOf(playable, view.floor).map((z) => ({ id: z.id, name: z.name, label: z.label, at: z.at, kind: z.kind, count: z.mode === 'count' ? z.count : z.order.length }))
  const table = t('play.table')
  return [...named, { id: view.floor, name: table, label: table, at: 'top' as Placement, kind: 'area' as const, count: 0 }]
}

export function PlaySheet({ view, count, label, onPlay, onClose, refusal, refusedZone = null }: PlaySheetProps) {
  const t = useT()
  return (
    // The backdrop closes on the next touch rather than on click: the sheet opens under a finger
    // that is still down, and a click is what the browser sends when that finger lets go (UX-30).
    <div className="byd-sheet-backdrop" onPointerDown={onClose}>
      <div
        className="byd-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('play.sheet.title')}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <p>
          {t('play.sheet.verb')} <strong>{count > 1 ? t('play.cards.other', { n: count }) : label}</strong> {t('play.sheet.into')}
        </p>
        <div className="byd-sheet-targets">
          {targetsOf(view, t).map((target, i) => (
            <button
              key={target.id}
              type="button"
              // The sheet takes focus when it opens, on the target a thumb would land on first:
              // a modal without focus is one Escape and Tab cannot reach.
              autoFocus={i === 0}
              onClick={() => onPlay(target.id, target.at)}
              className={refusedZone === target.id ? 'byd-status-refused-control' : undefined}
              {...(refusedZone === target.id && refusal ? refusal.control : {})}
            >
              <span>{target.label}</span>
              <small>{target.kind === 'pile' ? t(placeKey(target.at, target.count), { n: target.count, zone: target.name }) : t('play.target.free')}</small>
            </button>
          ))}
        </div>
        {refusal && <Refusal handle={refusal} />}
      </div>
    </div>
  )
}

// Where a card lands in a pile, and how many lie there already.
const placeKey = (at: Placement, count: number): Key =>
  at === 'bottom' ? (count === 1 ? 'play.target.bottom.one' : 'play.target.bottom.other') : count === 1 ? 'play.target.top.one' : 'play.target.top.other'
