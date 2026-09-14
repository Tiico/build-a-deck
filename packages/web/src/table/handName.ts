import type { Snapshot, ZoneView } from '@byd/protocol'
import type { T } from '../i18n/index.js'

// A hand is named by whoever sits there (K19): "Adas hand", and on that seat's own phone "min
// hand" — never the designer's zone name, which would leave out the owner. Whoever is sitting
// there named themselves; only the word "hand" around it is the tool's. The address panel wants
// it as a label ("Min hand"), the log mid-sentence ("till min hand"); the catalogue holds both
// forms, so no letter changes case in code.
export function handName(view: Snapshot, z: ZoneView, t: T, form: 'label' | 'inSentence' = 'label'): string {
  const name = view.seats.find((s) => s.id === z.owner)?.name ?? z.owner ?? ''
  const mine = z.owner === view.seat
  if (form === 'label') return mine ? t('kbd.hand.my') : t('kbd.hand.other', { name })
  return mine ? t('activity.hand.my') : t('activity.hand.other', { name })
}
