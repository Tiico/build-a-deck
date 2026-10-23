import { useRef, useState } from 'react'
import type { Activity, Intent, Snapshot, VisibleComponentState } from '@byd/protocol'
import type { SendResult } from '../client.js'
import { dieKind } from '../components.js'
import { useFocusTrap } from '../editor/focusTrap.js'
import { DieGlyph } from '../glyphs.js'
import { useT } from '../i18n/index.js'
import { Refusal, useRefusal } from '../status/Refusal.js'
import { describeActivity, sayable } from '../table/describe.js'

// The phone's dice (K28, #1138, beställarens beslut B efter prototypen): «Tärningar · n» among the
// counters, and a sheet of tiles behind it where a press chooses a die and «Slå» throws every die
// chosen. A throw is one envelope with one `roll` per die (K3), so the table and the log say it as
// one throw, and the server decides every value (D4).

// The dice a seat reaches: those on a table every seat shares, and those in the seat's own areas.
// Another seat's dice are that seat's to throw, the way its counters are.
export function diceOf(view: Snapshot): VisibleComponentState[] {
  const reach = new Set(view.zones.filter((z) => z.owner === undefined || z.owner === view.seat).map((z) => z.id))
  return view.components.filter((c) => dieKind(c) !== null && reach.has(c.zone))
}

export function DicePill({ view, open, onOpen }: { view: Snapshot; open: boolean; onOpen(): void }) {
  const t = useT()
  const n = diceOf(view).length
  if (n === 0) return null
  return (
    <button type="button" className="byd-dice-pill" data-dice-pill aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'} onClick={onOpen}>
      <DieGlyph />
      {t('player.dice.pill', { n })}
    </button>
  )
}

export type DiceSheetProps = {
  view: Snapshot
  activity: readonly Activity[]
  send(...intents: Intent[]): Promise<SendResult>
  onClose(): void
}

export function DiceSheet({ view, activity, send, onClose }: DiceSheetProps) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  useFocusTrap(box, { onEscape: onClose })
  const dice = diceOf(view)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  // A die that left the seat's reach while it was chosen is not thrown with the rest.
  const picked = dice.filter((d) => chosen.has(d.id))
  // The lines the last throw wrote, by their seqs: what it came to is said in the very sentence the
  // log says it in (`describeActivity`), so the sheet and the feed cannot say it two ways.
  const [thrown, setThrown] = useState<readonly number[] | null>(null)
  const line = thrown === null ? undefined : sayable(activity.filter((l) => thrown.includes(l.seq)))[0]
  const said = line ? describeActivity(line, view, t) : ''
  const refusal = useRefusal('phone')
  const busy = useRef(false)
  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const all = picked.length === dice.length
  const roll = async () => {
    if (busy.current || picked.length === 0) return
    busy.current = true
    try {
      const result = await refusal.watch(send(...picked.map((d): Intent => ({ v: 'roll', component: d.id }))))
      if (result.ok) setThrown(result.seqs)
    } finally {
      busy.current = false
    }
  }
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div className="byd-sheet byd-dice-sheet" role="dialog" aria-modal="true" aria-labelledby="dice-sheet-title" data-dice-sheet onClick={(e) => e.stopPropagation()} ref={box}>
        <div className="byd-dice-head">
          <p className="byd-sheet-title" id="dice-sheet-title">
            {t('player.dice.title')}
          </p>
          <button type="button" className="byd-secondary" data-dice-all onClick={() => setChosen(all ? new Set() : new Set(dice.map((d) => d.id)))}>
            {all ? t('player.dice.none') : t('player.dice.all')}
          </button>
        </div>
        <div className="byd-dice-tiles">
          {dice.map((d) => (
            <button
              key={d.id}
              type="button"
              className="byd-dice-tile"
              data-die={d.id}
              aria-pressed={chosen.has(d.id) ? 'true' : 'false'}
              aria-label={t('player.dice.die', { kind: dieKind(d) ?? '', value: d.counter ?? 0 })}
              onClick={() => toggle(d.id)}
            >
              <span className="byd-dice-face" aria-hidden="true">
                <small>{dieKind(d)}</small>
                <b>{d.counter ?? 0}</b>
              </span>
            </button>
          ))}
        </div>
        <p className="byd-dice-said" role="status">
          {said}
        </p>
        <div className="byd-dice-actions">
          <button type="button" className="byd-primary" data-dice-roll disabled={picked.length === 0} onClick={() => void roll()} {...refusal.control}>
            {picked.length === 0 ? t('player.dice.roll.nothing') : picked.length === 1 ? t('player.dice.roll.one') : t('player.dice.roll.other', { n: picked.length })}
          </button>
          <button type="button" className="byd-secondary" onClick={onClose}>
            {t('player.dice.close')}
          </button>
        </div>
        <Refusal handle={refusal} />
      </div>
    </div>
  )
}
