import type { Snapshot } from '@byd/protocol'
import { translate, useT, type Key, type T } from '../i18n/index.js'

// Without a language given, the catalogue's own: `targetsOf` is a plain function and is read
// outside React too, where the tool speaks Swedish like every unprovided surface does.
const swedish: T = (key, params) => translate('sv', key, params)

export type Placement = 'top' | 'bottom'
// The counter token's type id (engine's TOKEN_COUNTER), which the phone treats as a count, not a card.
export const COUNTER_TYPE = 'token.counter'
export type PlaySheetProps = { view: Snapshot; count: number; label: string; onPlay(zone: string, at: Placement): void; onClose(): void }

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
    return !(inside.length > 0 && inside.every((c) => c.type.id === COUNTER_TYPE))
  })
  const named = shortcutsOf(playable, view.floor).map((z) => ({ id: z.id, name: z.name, label: z.label, at: z.at, kind: z.kind, count: z.mode === 'count' ? z.count : z.order.length }))
  const table = t('play.table')
  return [...named, { id: view.floor, name: table, label: table, at: 'top' as Placement, kind: 'area' as const, count: 0 }]
}

export function PlaySheet({ view, count, label, onPlay, onClose }: PlaySheetProps) {
  const t = useT()
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('play.sheet.title')}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <p>
          {t('play.sheet.verb')} <strong>{count > 1 ? t('play.cards.other', { n: count }) : label}</strong> {t('play.sheet.into')}
        </p>
        <div className="byd-sheet-targets">
          {targetsOf(view, t).map((target) => (
            <button key={target.id} type="button" onClick={() => onPlay(target.id, target.at)}>
              <span>{target.label}</span>
              <small>{target.kind === 'pile' ? t(placeKey(target.at, target.count), { n: target.count, zone: target.name }) : t('play.target.free')}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Where a card lands in a pile, and how many lie there already.
const placeKey = (at: Placement, count: number): Key =>
  at === 'bottom' ? (count === 1 ? 'play.target.bottom.one' : 'play.target.bottom.other') : count === 1 ? 'play.target.top.one' : 'play.target.top.other'
