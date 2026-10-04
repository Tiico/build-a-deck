import type { Snapshot, ZoneView } from '@byd/protocol'
import type { T } from '../i18n/index.js'

// A hand is named by whoever sits there (K19): "Adas hand", and on that seat's own phone "Min
// hand" in the address panel and "din hand" in the log, which speaks to its reader (#714) — never
// the designer's zone name, which would leave out the owner. Whoever is sitting there named
// themselves; only the word "hand" around it is the tool's. The catalogue holds both forms, so no
// letter changes case in code.
export function handName(view: Snapshot, z: ZoneView, t: T, form: 'label' | 'inSentence' = 'label'): string {
  const name = view.seats.find((s) => s.id === z.owner)?.name ?? z.owner ?? ''
  const mine = z.owner === view.seat
  if (form === 'label') return mine ? t('kbd.hand.my') : t('kbd.hand.other', { name })
  return mine ? t('activity.hand.my') : t('activity.hand.other', { name })
}

// The pile a hand goes back to (C4), by the name its designer gave it (B5, #714): the seat's own
// hand's, or — for a reader with no hand — the one pile every hand goes back to. Null when there is
// no such pile to name, and the sentence then says «leken».
export function returnPile(view: Snapshot, seat: string | null): string | null {
  const hands = view.zones.filter((z) => z.kind === 'hand' && z.returnTo !== undefined)
  const own = seat === null ? undefined : hands.find((z) => z.owner === seat)
  const targets = new Set((own ? [own] : hands).map((z) => z.returnTo))
  if (targets.size !== 1) return null
  const [id] = [...targets]
  return view.zones.find((z) => z.id === id)?.name ?? null
}
