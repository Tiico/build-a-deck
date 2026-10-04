import { useEffect, useId, useRef } from 'react'
import type { Intent, Snapshot, VisibleComponentState } from '@byd/protocol'
import { isLoose, placesFor, verbsFor, type Place, type Thing } from './keyboard.js'
import { useT } from '../i18n/index.js'
import './keyboard.css'

// The address panel (#1, #2, variant C). Enter on anything on the felt or in the hand opens it:
// **Gör** — the verbs the pointer's ring already has — and **Flytta till** — every place that has
// a name at all. A point on the felt has no name, so the panel says so in its own row rather than
// pretending it can be reached; that honesty is the whole cost of this model.
//
// Its manners are `Question.tsx`'s, settled in #17 and #19 and applied here to a list of verbs
// and places instead of an answer: it takes the focus so it is answered where it is read, it
// answers Escape, it hands the focus back to whatever opened it, and it traps nothing — a person
// who tabs past it simply leaves it standing.
export type ActionPanelProps = {
  view: Snapshot
  thing: Thing
  // The cards this panel acts on when several are marked in the hand (K3); empty means the thing.
  cards: readonly string[]
  onClose(): void
  // Runs one envelope and says where the focus should stand once the table has answered. What
  // went through is announced by the activity feed, in `describeActivity`'s own words.
  onRun(intents: Intent[], landedOn?: string): void
  onLook(c: VisibleComponentState): void
  // "Sätt värde…" on a chip (#67): opens the value entry on this screen; nothing is sent until a
  // number has been said there.
  onSet(c: VisibleComponentState): void
  // `as`: what is being moved, when it is not the thing the panel is about — the top card of a pile,
  // whose moves stand in the pile's own panel (#572).
  intentsFor(place: Place, moving: readonly string[], as?: Thing): Intent[]
  landedKey(place: Place, as?: Thing): string
  // A route whose touch surface offers its own places for a card in the hand — the phone's play
  // sheet (#483, beslut A efter prototyp 33). The panel then offers exactly those, in the sheet's
  // words and with the sheet's placement, and of its own verbs only looking: what a thumb is not
  // offered, a keyboard is not offered either.
  sheet?: HandSheet | undefined
}

export type HandSheet = {
  places: readonly { key: string; label: string; hint: string; zone: string }[]
  intentsFor(zone: string, moving: readonly string[]): Intent[]
}

export function ActionPanel({ view, thing, cards, onClose, onRun, onLook, onSet, intentsFor, landedKey, sheet }: ActionPanelProps) {
  const t = useT()
  const moving = cards.length > 0 ? [...cards] : isLoose(thing) ? [thing.id] : []
  // A thing is never offered the place it already is: a card or a chip its own zone, a pile
  // itself — the table refuses "cannot split a pile onto itself", so the panel does not ask.
  const places: Place[] = sheet
    ? sheet.places.map((p) => ({ key: p.key, label: p.label, hint: p.hint, zone: p.zone, kind: 'area' }))
    : placesFor(view, new Set(moving), isLoose(thing) ? thing.zone : thing.pile, t)
  // Where the thing can be moved to, in one group per way of moving it. A pile is one stop since
  // #572, and it moves two ways: the whole pile, and — when there is one — the card on top of it.
  // Each group is named by its heading, so the same place said twice is said under what it does.
  const pileZone = thing.kind === 'pile' ? view.zones.find((z) => z.id === thing.pile) : undefined
  const topCount = pileZone ? (pileZone.mode === 'count' ? pileZone.count : pileZone.order.length) : 0
  // An empty pile has nothing on top to turn, nothing to shuffle, draw or halve, and nothing to
  // move (#761): the panel shows what can be done with it, which is the game's own actions — each
  // of them says why it cannot run, when it cannot (K14) — and none of the tool's verbs switched
  // off in a row.
  const empty = pileZone !== undefined && topCount === 0
  const verbs = (sheet ? verbsFor(view, thing, t).filter((a) => a.look !== undefined) : verbsFor(view, thing, t)).filter(
    (a) => !empty || a.intents !== null || a.key.startsWith('action:'),
  )
  const groups: { heading: string; as?: Thing }[] =
    empty
      ? []
      : thing.kind === 'pile' && !sheet
      ? [
          { heading: t('kbd.panel.movePile') },
          ...(topCount > 0 ? [{ heading: t('kbd.panel.moveTop'), as: { key: thing.key, kind: 'pileTop' as const, pile: thing.pile, name: thing.name } }] : []),
        ]
      : [{ heading: t('kbd.panel.moveTo') }]
  const groupId = useId()
  // The panel is answered where it is read, so it takes the focus on the way in: on its first row
  // that can be pressed — the first verb, or the first place when the verbs are switched off or
  // there are none — and on «Stäng» when nothing else can be. A switched-off row cannot hold the
  // focus, and a panel that tried to give it one left the reader standing out on the felt (#761).
  const box = useRef<HTMLDivElement | null>(null)
  useEffect(() => box.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(), [])
  // Several marked cards are counted; a single thing is called what it is called, which for a
  // card and a zone is the designer's word (B5).
  const what = cards.length > 1 ? t('play.cards.other', { n: cards.length }) : thing.name

  // A click closes the panel only when its press began on the backdrop (#484). A tap on a card in the
  // hand opens the panel on its release, and the click the browser then makes of the touch lands
  // where the finger was — on this backdrop, where the panel has just arrived — and took it away
  // again. The ring had the same fault (`RadialMenu`).
  const pressed = useRef(false)
  return (
    <div className="byd-kbd-backdrop" onPointerDown={(e) => (pressed.current = e.target === e.currentTarget)} onClick={() => pressed.current && onClose()}>
      <div
        className="byd-kbd-panel"
        ref={box}
        role="dialog"
        // Not modal: the felt behind it is what the answer is about, and it must stay readable
        // and reachable. Nothing here takes the keyboard hostage.
        aria-modal="false"
        aria-label={t('kbd.panel.label', { what })}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          onClose()
        }}
      >
        <h2>
          {what}
          {/* Whose chip it is (#67): a shared table has to say it, where a phone never does. */}
          {thing.kind === 'counter' && thing.owner !== null && (
            <>
              {/* Kept apart from the name, in the line and to a reader: «GuldC:s räknare» read as one word (#714). */}
              {' · '}
              <small>{t('ring.counter.whose', { name: thing.owner })}</small>
            </>
          )}
        </h2>
        {verbs.length > 0 && <h3>{t('kbd.panel.do')}</h3>}
        {empty && verbs.length === 0 && <p className="byd-kbd-empty">{t('kbd.panel.empty')}</p>}
        <div className="byd-kbd-list">
          {verbs.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={a.intents === null}
              onClick={() => {
                if (a.look !== undefined) {
                  const c = typeof a.look === 'string' ? view.components.find((x) => x.id === a.look) : a.look
                  if (c) onLook(c)
                  return
                }
                if (a.set !== undefined) {
                  const c = view.components.find((x) => x.id === a.set)
                  if (c) onSet(c)
                  return
                }
                if (a.intents) onRun(a.intents)
              }}
            >
              <span>{a.label}</span>
              {a.hint !== undefined && <small>{a.hint}</small>}
            </button>
          ))}
        </div>
        {groups.map((group, g) => (
          <div key={group.heading} role="group" aria-labelledby={`${groupId}-${g}`}>
            <h3 id={`${groupId}-${g}`}>{group.heading}</h3>
            <div className="byd-kbd-list">
              {places.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => (sheet ? onRun(sheet.intentsFor(p.zone, moving)) : onRun(intentsFor(p, moving, group.as), landedKey(p, group.as)))}
                >
                  <span>{p.label}</span>
                  <small>{p.hint}</small>
                </button>
              ))}
              {/* The one address a keyboard cannot say. It is a row and not a silence, and it is said
                  once, after the last group. The sheet has no such row, because the sheet's table is
                  a place of its own. */}
              {!sheet && g === groups.length - 1 && (
                <button type="button" disabled className="byd-kbd-no">
                  <span>{t('kbd.panel.free')}</span>
                  <small>{t('kbd.panel.free.hint')}</small>
                </button>
              )}
            </div>
          </div>
        ))}
        <button type="button" className="byd-kbd-close" onClick={onClose}>
          {t('kbd.panel.close')}
        </button>
      </div>
    </div>
  )
}
