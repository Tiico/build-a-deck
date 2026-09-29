import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import type { TableClient } from '../client.js'
import { useT } from '../i18n/index.js'

// How long the button says what it did before it offers itself again.
const SAID_MS = 3000

// «Visa för alla» (#518, #508 beslut B): the phone holds a card the table sees up on the room's
// screen, over the felt, at the size the sofa reads (K8, K26). It is presence and not a move — it
// names the card and changes nothing on the table — so it is offered only where the caller has
// found the card to be the room's (`forTheRoom`). The press is said where it was made: a control
// whose answer is on another screen would otherwise read as one that did nothing.
export function ShowForAll({ card, client }: { card: VisibleComponentState; client: TableClient }) {
  const t = useT()
  const [said, setSaid] = useState<string | null>(null)
  useEffect(() => {
    if (!said) return
    const done = setTimeout(() => setSaid(null), SAID_MS)
    return () => clearTimeout(done)
  }, [said])
  // The reader puts the card down on the next touch (UX-30), so the press is kept out of it.
  const keep = (e: ReactPointerEvent) => e.stopPropagation()
  return (
    <button
      type="button"
      className="byd-show-all"
      data-show-all
      onPointerDown={keep}
      onClick={() => {
        client.sendPresence({ kind: 'show', component: card.id })
        setSaid(card.id)
      }}
    >
      <span aria-live="polite">{said === card.id ? t('player.show.said') : t('player.show')}</span>
    </button>
  )
}
