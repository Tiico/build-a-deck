import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { NOTE_MAX, type Activity, type Intent, type NoteView, type Snapshot } from '@byd/protocol'
import type { SendResult } from '../client.js'
import { CloseGlyph, PencilGlyph } from '../glyphs.js'
import { useT, type T } from '../i18n/index.js'
import { seatColor } from '../table/seatColor.js'

// The table's notepad on /online (#1131, beställarens beslut B · Spalten, prototyp
// `docs/ux-audits/2026-10-22-anteckningsblocket`): a column at the felt's inline start with the
// rows everyone at the table writes, each in the colour of the seat that wrote it, to be ticked,
// rewritten where it stands, or struck. It folds to a rail, and the rail says when somebody else
// has written since this seat last looked.
//
// Rows rather than one shared text, because two people writing at once then never write over each
// other (D3): a row is rewritten whole, and the last rewrite to land is the row.
const STORE = 'byd.online.notes'

export type NotesColumnProps = {
  view: Snapshot
  activity: readonly Activity[]
  seat: string
  send(...intents: Intent[]): Promise<SendResult>
  // Whether the column starts open when this browser has never been told (#1131): the window's
  // shape decides it, because the felt pays for the column only where it is bound by its width.
  defaultOpen?: boolean
}

export function NotesColumn({ view, activity, seat, send, defaultOpen = true }: NotesColumnProps) {
  const t = useT()
  const [open, setOpen] = useState(() => remembered() ?? defaultOpen)
  // The line this seat has seen the notepad up to: while it is open, everything; once it is folded,
  // what stood when it was folded.
  const [seen, setSeen] = useState(view.seq)
  useEffect(() => {
    if (open) setSeen(view.seq)
  }, [open, view.seq])
  const unseen = !open && activity.some((l) => l.intent.v.startsWith('note.') && l.by !== seat && l.seq > seen)
  const [said, say] = useSaid()
  const sent = (intent: Intent) =>
    send(intent).then((result) => {
      if (!result.ok) say(refused(result.reason, t))
      return result.ok
    })

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (!next) setSeen(view.seq)
    remember(next)
  }

  return (
    <aside className="byd-notes" data-open={open || undefined} aria-label={t('notes.title')}>
      <header className="byd-notes-head">
        <button type="button" className="byd-notes-toggle" aria-expanded={open} aria-label={unseen ? t('notes.unseen') : t('notes.title')} title={t('notes.title')} data-unseen={unseen || undefined} onClick={toggle}>
          <PencilGlyph />
        </button>
        {open && <h2>{t('notes.title')}</h2>}
      </header>
      {open && (
        <>
          {view.notes.length === 0 ? (
            <p className="byd-notes-empty">{t('notes.empty')}</p>
          ) : (
            <ul className="byd-notes-list" aria-label={t('notes.title')}>
              {view.notes.map((note) => (
                <NoteRow key={note.id} note={note} view={view} t={t} send={sent} />
              ))}
            </ul>
          )}
          <NewNote t={t} send={sent} />
        </>
      )}
      {said && (
        <p className="byd-notes-said" role="status">
          {said}
        </p>
      )}
    </aside>
  )
}

function NoteRow({ note, view, t, send }: { note: NoteView; view: Snapshot; t: T; send(intent: Intent): Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null)
  // A tick as it was clicked, until the table has answered: the client resolves only once its own
  // patch has landed, so after that the row itself says it — or, refused, says it was never so.
  const [ticked, setTicked] = useState<boolean | null>(null)
  const tick = (done: boolean) => {
    setTicked(done)
    void send({ v: 'note.check', note: note.id, done }).then(() => setTicked(null))
  }
  const done = ticked ?? note.done
  const edit = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const back = useRef(false)
  const editing = draft !== null
  useEffect(() => {
    if (editing) box.current?.focus()
    else if (back.current) {
      back.current = false
      edit.current?.focus()
    }
  }, [editing])
  const index = note.by === null ? -1 : view.seats.findIndex((s) => s.id === note.by)
  const by = note.by === null ? t('play.table') : (view.seats[index]?.name ?? note.by)
  const close = () => {
    back.current = true
    setDraft(null)
  }
  const commit = () => {
    // A row already closed — by Enter, or by Escape — is not committed again by the blur that
    // follows it out of the page.
    if (draft === null || back.current) return
    const text = draft.trim()
    close()
    if (text.length > 0 && text !== note.text) void send({ v: 'note.edit', note: note.id, text })
  }
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }
  return (
    <li className="byd-note" data-done={done || undefined} style={{ ['--note-seat' as string]: index < 0 ? 'var(--byd-notes-table)' : seatColor(index) }}>
      <input type="checkbox" checked={done} aria-label={t('notes.done', { text: note.text })} onChange={(e) => tick(e.currentTarget.checked)} />
      <div className="byd-note-body">
        {draft === null ? (
          <button type="button" ref={edit} className="byd-note-text" aria-label={t('notes.edit', { text: note.text })} onClick={() => setDraft(note.text)}>
            {note.text}
          </button>
        ) : (
          <textarea ref={box} className="byd-note-text" aria-label={t('notes.edit', { text: note.text })} value={draft} maxLength={NOTE_MAX} rows={2} onChange={(e) => setDraft(e.currentTarget.value)} onKeyDown={keys} onBlur={commit} />
        )}
        <span className="byd-note-by" data-note-by>
          {by}
        </span>
      </div>
      <button type="button" className="byd-note-remove" aria-label={t('notes.remove', { text: note.text })} title={t('notes.remove.title')} onClick={() => void send({ v: 'note.remove', note: note.id })}>
        <CloseGlyph />
      </button>
    </li>
  )
}

function NewNote({ t, send }: { t: T; send(intent: Intent): Promise<boolean> }) {
  const [text, setText] = useState('')
  const id = useId()
  const submit = (event: { preventDefault(): void }) => {
    event.preventDefault()
    const said = text.trim()
    if (said.length === 0) return
    // The field is emptied only once the table has the row, so a refused row is not lost.
    void send({ v: 'note.add', text: said }).then((ok) => {
      if (ok) setText((now) => (now === text ? '' : now))
    })
  }
  return (
    <form className="byd-notes-new" onSubmit={submit}>
      <label htmlFor={id} className="byd-offscreen">
        {t('notes.new')}
      </label>
      <input id={id} value={text} maxLength={NOTE_MAX} placeholder={t('notes.new.placeholder')} autoComplete="off" onChange={(e) => setText(e.currentTarget.value)} />
    </form>
  )
}

// What the table said no to, in the column's own words; it stands for four seconds, as the felt's
// refusals do.
function useSaid(): [string | null, (text: string) => void] {
  const [said, setSaid] = useState<string | null>(null)
  useEffect(() => {
    if (!said) return
    const timer = setTimeout(() => setSaid(null), 4000)
    return () => clearTimeout(timer)
  }, [said])
  return [said, setSaid]
}

function refused(reason: string, t: T): string {
  if (/at most \d+ notes/.test(reason)) return t('notes.refused.full')
  if (/^unknown note/.test(reason)) return t('notes.refused.gone')
  return t('notes.refused.other')
}

// Whether this browser was last told to keep the column open: a viewer's own convenience, so it
// lives in the browser, and a browser that keeps nothing simply starts from the window's shape.
function remembered(): boolean | null {
  try {
    const value = localStorage.getItem(STORE)
    return value === 'open' ? true : value === 'closed' ? false : null
  } catch {
    return null
  }
}

function remember(open: boolean): void {
  try {
    localStorage.setItem(STORE, open ? 'open' : 'closed')
  } catch {
    // Nothing kept; the column still opens and closes.
  }
}
