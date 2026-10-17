import { useCallback, useState } from 'react'
import type { FitReport, Overset } from '@byd/template'
import type { Lang, T } from '../i18n/index.js'

// What the mark round a text that does not fit says (#808, beställarens beslut A, «Kanten och
// brickan»): the tag that hangs under the box, in a long form and a short one for a box too narrow
// to carry it, and the whole sentence — which column, at what size, how much of it is lost — that
// the card's own name carries, because the mark is for the eye. The words are the tool's and never
// the card's: nothing here reaches the compiler (E2).
export type OversetWords = { long: string; short: string; sentence: string }

export function oversetWords(o: Pick<Overset, 'field' | 'sizePt' | 'hidden' | 'fit'>, t: T, lang: Lang): OversetWords {
  const pt = new Intl.NumberFormat(lang === 'sv' ? 'sv-SE' : 'en-GB', { maximumFractionDigits: 1 }).format(o.sizePt)
  const one = o.hidden === 1
  const shrinks = o.fit === 'shrink'
  if (o.hidden === 0) {
    const said = t('overset.tag.plain')
    return { long: said, short: said, sentence: t(shrinks ? 'overset.sentence.shrink.plain' : 'overset.sentence.fixed.plain', { field: o.field, pt }) }
  }
  const n = { n: o.hidden }
  return {
    long: t(one ? 'overset.tag.long.one' : 'overset.tag.long.other', n),
    short: t(one ? 'overset.tag.short.one' : 'overset.tag.short.other', n),
    sentence: t(shrinks ? (one ? 'overset.sentence.shrink.one' : 'overset.sentence.shrink.other') : one ? 'overset.sentence.fixed.one' : 'overset.sentence.fixed.other', { field: o.field, pt, n: o.hidden }),
  }
}

// Below this width on the screen a box wears the short form (#808): the prototype's line, where the
// long tag stopped fitting under a box on the wall's small cards.
export const SHORT_BELOW_PX = 160

// What a card's fitting could not fit (#808), held for as long as it says the same: a surface hands
// `onMeasured` to its `CardPreview` and draws the marks from `cut`. Kept only when it changes, as
// the fitting runs again on every face that lands.
export function overflowing(fitted: readonly FitReport[]): FitReport[] {
  return fitted.filter((r) => r.overflow && !r.empty)
}

export function useCut(): [FitReport[], (fitted: FitReport[]) => void] {
  const [cut, setCut] = useState<FitReport[]>([])
  const onMeasured = useCallback((fitted: FitReport[]) => {
    const over = overflowing(fitted)
    setCut((had) => (JSON.stringify(had) === JSON.stringify(over) ? had : over))
  }, [])
  return [cut, onMeasured]
}
