import { useEffect, useId, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react'
import type { Activity, Intent, Snapshot } from '@byd/protocol'
import type { SendResult } from '../client.js'
import { Question } from '../editor/Question.js'
import { Refusal, useRefusal } from '../status/Refusal.js'
import { describeActivity, sayable } from './describe.js'
import { useT } from '../i18n/index.js'
import { MoreGlyph } from '../glyphs.js'

// «⋯» in the corner of the felt's own screen, between «Starta om» and «?» (#682, beställarens beslut
// 2026-10-17: C). A group that plays straight on the felt (K14) had no way to take back a wrong
// move or to end the table without someone going to the editor — and a table nobody ends stands
// open (C9).
//
// The table takes back only its own moves (K13 stands): the same `undo.self` a phone sends, for
// seat null, and the view says what it means (`undo`), so nothing here counts the log. What it
// takes back is written under it before it is pressed; a phone's move is never offered, and the
// table never proposes a rewind. «Avsluta bordet…» asks first, in the phone's own words, and the
// question opens on «Inte än».
export function TableMenu({ view, activity, version, send }: { view: Snapshot; activity: readonly Activity[]; version: string; send(...intents: Intent[]): Promise<SendResult> }) {
  const t = useT()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const more = useRef<HTMLButtonElement | null>(null)
  const menu = useRef<HTMLDivElement | null>(null)
  const undone = useRefusal('table')
  const ended = useRefusal('table')
  // The move a press on «Ångra senaste draget» is taking back, while it is on its way (#1390). The
  // table's new state arrives before the answer that closes the menu, and in between the item read
  // «Bordet har inte gjort något drag än» and went dead under the focus; it says what it is doing
  // until the menu closes, and a second press cannot send a second undo.
  const [taking, setTaking] = useState<string | null>(null)
  const close = (focus = true) => {
    setOpen(false)
    setTaking(null)
    undone.clear()
    if (focus) requestAnimationFrame(() => more.current?.focus())
  }
  // The menu takes the focus when it opens, on its first item; a press anywhere else puts it away.
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const away = (e: PointerEvent) => {
      const at = e.target instanceof Node ? e.target : null
      if (at && (menu.current?.contains(at) || more.current?.contains(at))) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open])

  // Which move undo takes back: the first line of the batch it returns to before, in the words
  // the corner and the live region say it in.
  const undo = view.undo
  const can = undo !== null && !undo.contested
  const first = undo ? activity.find((l) => l.seq === undo.toSeq + 1) : undefined
  const move = first ? sayable(activity.filter((l) => l.batch === first.batch))[0] : undefined
  const why = taking ?? (undo === null ? t('table.undo.none') : undo.contested ? t('table.undo.phone') : move ? describeActivity(move, view, t) : '')

  const keys = (e: RKeyboardEvent) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => {
      e.preventDefault()
      items[(i + items.length) % items.length]?.focus()
    }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(items.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div className="byd-table-more">
      <button
        type="button"
        ref={more}
        className="byd-table-more-open"
        aria-label={t('table.more')}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <MoreGlyph />
      </button>
      {open && (
        <div className="byd-table-more-menu" role="menu" id={id} aria-label={t('table.more')} ref={menu} onKeyDown={keys}>
          <button
            type="button"
            role="menuitem"
            aria-disabled={can || taking !== null ? undefined : 'true'}
            {...undone.control}
            onClick={() => {
              if (!can || taking !== null) return
              setTaking(why)
              void undone.watch(send({ v: 'undo.self' })).then((r) => (r.ok ? close() : setTaking(null)))
            }}
          >
            {t('table.undo')}
            {why && <small>{why}</small>}
            <Refusal handle={undone} />
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close(false)
              setAsking(true)
            }}
          >
            {t('table.end')}
            <small>{t('table.end.hint')}</small>
          </button>
        </div>
      )}
      {asking && (
        // Over the middle of the felt, as «Starta om spelet?» is (#452).
        <Question
          className="byd-table-start-ask byd-table-end-ask"
          label={t('end.sheet.title')}
          confirm={t('end.sheet.end')}
          cancel={t('end.sheet.not')}
          onConfirm={() => void ended.watch(send({ v: 'session.end' }))}
          onCancel={() => {
            setAsking(false)
            ended.clear()
            requestAnimationFrame(() => more.current?.focus())
          }}
        >
          <strong>{t('end.sheet.title')}</strong>
          {t('end.sheet.body', { version })}
          {ended.notice && <Refusal handle={ended} />}
        </Question>
      )}
    </div>
  )
}
