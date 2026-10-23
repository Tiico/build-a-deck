import { nextTurn } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import { useT } from '../i18n/index.js'
import { seatColor } from '../table/seatColor.js'

// Whose turn it is, on the phone (K29): «Din tur» and «Klar → Cy» for the one who has it, and whose
// it is for everyone else. A row of its own under the phone's chrome, which has no room for it.
// Nothing at all for a game without turns, or while nobody has the turn.
export function TurnBadge({ view, seat, onGive }: { view: Snapshot; seat: string | null; onGive(seat: string): void }) {
  const t = useT()
  const holder = view.turn?.seat ?? null
  if (holder === null) return null
  const name = (id: string) => view.seats.find((s) => s.id === id)?.name ?? id
  const next = nextTurn(view)
  const mine = holder === seat
  return (
    <div className="byd-turn-row" {...(mine ? { 'data-mine': '' } : {})} style={{ ['--seat' as string]: seatColor(Math.max(0, view.seats.findIndex((s) => s.id === holder))) }}>
      <span className="byd-turn-badge">{mine ? t('turn.mine') : t('turn.of', { name: name(holder) })}</span>
      {mine && next !== null && !view.ended && (
        <button type="button" className="byd-turn-done" onClick={() => onGive(next)}>
          {t('turn.done', { name: name(next) })}
        </button>
      )}
    </div>
  )
}
