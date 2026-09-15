import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { Intent, Snapshot, ZoneAction } from '@byd/protocol'
import { compileAction, type Asked } from './actions.js'
import { useT, type Key, type T } from '../i18n/index.js'

// The game's own actions for a pile, hanging under the ring (K14, extended).
//
// The ring keeps the physical verbs and does not move: four circles a finger reaches in one
// slide, in the compass directions, with labels the tool wrote. What a designer hangs on a zone
// is not that — it is a whole sentence in their own words, and a sentence in a 66-pixel circle
// is a wrapped blob. So the designer's own hang beneath the ring as a named list with room to
// read: one row an action, the zone's name above them so it is clear whose list it is.
//
// A pile with no actions of its own opens no sheet at all. K14 already says a ring with no verbs
// does not open; an empty sheet is the same mistake with a different shape.
//
// An action that asks for a number asks here rather than guessing: the row turns into a field,
// which is `CounterEntry`'s behaviour applied to a list — it takes focus, answers on Escape, and
// gives focus back to the row that opened it.
export type ActionSheetProps = {
  view: Snapshot
  pile: string
  name: string
  actions: readonly ZoneAction[]
  x: number
  y: number
  onAct(intents: Intent[]): void
  onClose(): void
}

export function ActionSheet({ view, pile, name, actions, x, y, onAct, onClose }: ActionSheetProps) {
  const t = useT()
  const [asking, setAsking] = useState<{ action: ZoneAction; key: string } | null>(null)
  const field = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    field.current?.focus()
  }, [asking])

  const run = (action: ZoneAction, asked: Asked = {}) => {
    const made = compileAction(view, pile, action, asked)
    if (made.ok) {
      onAct(made.intents)
      onClose()
      return
    }
    if ('asks' in made) setAsking({ action, key: made.asks })
  }

  return (
    <div className="byd-action-sheet" role="group" aria-label={name} style={{ left: x, top: y }} onPointerUp={(e: RPointerEvent) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <h3>{name}</h3>
      {asking ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const n = Number(field.current?.value ?? '')
            if (Number.isInteger(n) && n > 0) run(asking.action, { [asking.key]: n })
          }}
        >
          <label>
            {t('ring.action.howMany', { name: asking.action.label })}
            <input ref={field} type="number" min="1" step="1" defaultValue="1" onKeyDown={(e) => e.key === 'Escape' && setAsking(null)} />
          </label>
          <button type="submit">{t('ring.action.go')}</button>
        </form>
      ) : (
        actions.map((a) => (
          <Row key={a.id} view={view} pile={pile} action={a} t={t} onRun={() => run(a)} />
        ))
      )}
    </div>
  )
}

// Whether the table can be asked for this at all right now, which is the same question the ring
// asks of a verb before it offers it: an action whose target has left the table, or whose count
// comes out at nothing, is offered switched off rather than silently doing nothing.
//
// And it says why, in words. A disc in the ring says nothing when it is out of play, and it does
// not need to — "Blanda" on a pile of one explains itself. A designer's own sentence does not:
// "Ge alla en starthand" greyed out at a table nobody has sat down at looks broken until the
// reason is said out loud.
function Row({ view, pile, action, t, onRun }: { view: Snapshot; pile: string; action: ZoneAction; t: T; onRun(): void }) {
  const made = compileAction(view, pile, action, {})
  const why = made.ok || 'asks' in made ? null : t(`ring.action.why.${made.why}` as Key)
  return (
    <button type="button" disabled={why !== null} onClick={why === null ? onRun : undefined} onPointerUp={why === null ? onRun : undefined}>
      {action.label}
      {why !== null && <i>{why}</i>}
    </button>
  )
}
