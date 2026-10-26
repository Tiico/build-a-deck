import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useFocusTrap } from '../editor/focusTrap.js'
import { Refusal, type RefusalHandle } from '../status/Refusal.js'
import { useT } from '../i18n/index.js'
import type { VisibleComponentState } from '@byd/protocol'
import { Texture } from '../table/Texture.js'
import { cardName } from '../table/keyboard.js'
import { CheckGlyph, CloseGlyph } from '../glyphs.js'

// Flagging a moment (G3, prototype A): a sheet with an optional note. Sends at once.
//
// Or a card (#1142, beställarens val B): the sheet asks first whether the flag is about the moment
// or a card, and «Ett kort…» hands the screen over to pointing one out (`FlagFlow`). The sheet comes
// back with the card in it, and the note is the flow's, so it is still there when it does.
export type FlagSheetCard = { card: VisibleComponentState; faces: string | undefined; onDrop(): void }

export function FlagSheet({ onFlag, onClose, refusal, note: kept, onNote, about, onPoint }: {
  onFlag(note: string | undefined): void
  onClose(): void
  refusal?: RefusalHandle | undefined
  note?: string | undefined
  onNote?: ((note: string) => void) | undefined
  about?: FlagSheetCard | null | undefined
  onPoint?: (() => void) | undefined
}) {
  const t = useT()
  const box = useSheet(onClose)
  const [own, setOwn] = useState('')
  const note = kept ?? own
  const setNote = onNote ?? setOwn
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet byd-session-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-sheet-title"
        onClick={(e) => e.stopPropagation()}
        ref={box}
      >
        <p className="byd-sheet-title" id="flag-sheet-title">{t(about ? 'flag.sheet.title.card' : 'flag.sheet.title')}</p>
        {!about && <p>{t('flag.sheet.body')}</p>}
        {about ? (
          <div className="byd-flag-about">
            <span className="byd-flag-about-card">
              <Texture faces={about.faces} c={about.card} />
            </span>
            <span className="byd-flag-about-words">
              <b>{cardName(about.card, t)}</b>
              {t('flag.sheet.card.seen')}
            </span>
            <button type="button" className="byd-flag-about-drop" onClick={about.onDrop} aria-label={t('flag.sheet.card.drop')} title={t('flag.sheet.card.drop')}>
              <CloseGlyph />
            </button>
          </div>
        ) : (
          onPoint && (
            <div className="byd-flag-what">
              <button type="button" aria-pressed="true">
                {t('flag.sheet.moment')}
                <small>{t('flag.sheet.moment.sub')}</small>
              </button>
              <button type="button" onClick={onPoint}>
                {t('flag.sheet.card')}
                <small>{t('flag.sheet.card.sub')}</small>
              </button>
            </div>
          )
        )}
        <textarea placeholder={t('flag.sheet.note')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} data-first />
        <div className="byd-sheet-actions">
          <button type="button" data-kind="flag" onClick={() => onFlag(note.trim() || undefined)} className={refusal?.notice ? 'byd-status-refused-control' : undefined} {...(refusal?.control ?? {})}>
            {t('flag.sheet.flag')}
          </button>
          <button type="button" data-kind="quiet" onClick={onClose}>
            {t('flag.sheet.cancel')}
          </button>
        </div>
        {refusal && <Refusal handle={refusal} />}
      </div>
    </div>
  )
}

// The way out (#31, prototype variant C). The phone's control row is full at 375 px, so the exit
// is not a fourth control beside the red one — it replaces it, and the sheet behind it asks which
// Ångra after a move that is not this seat's own (#747, beställarens beslut A). It is a proposal
// to the table, which the others decide, and it used to go on the press without a word: the sheet
// says whose move it is, where the table would go back to and who decides, and opens on «Avbryt»,
// so the reflex that answers without reading sends nothing.
export function ProposeSheet({ where, who, onPropose, onClose }: { where: string; who: string; onPropose(): void; onClose(): void }) {
  const t = useT()
  const box = useSheet(onClose)
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet byd-session-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="propose-sheet-title"
        onClick={(e) => e.stopPropagation()}
        ref={box}
      >
        <p className="byd-sheet-title" id="propose-sheet-title">{t('rewind.propose.ask.title')}</p>
        <p>{t('rewind.propose.ask.body', { where, who })}</p>
        <div className="byd-sheet-actions">
          <button type="button" data-kind="quiet" onClick={onClose} data-first>
            {t('rewind.propose.ask.no')}
          </button>
          <button type="button" className="byd-primary" onClick={onPropose}>
            {t('rewind.propose.ask.yes')}
          </button>
        </div>
      </div>
    </div>
  )
}

// way out is meant. The two are told apart by what they cost, written under each of them: your
// seat, or everyone's table. Ending still asks its own question afterwards, so it is one press
// further away than it was rather than one nearer.
// `pile` is where the hand goes back to, by its own name (#714); null says «leken». `stay` is the
// owner's third way (#1217, L80): to the game's editor with the seat kept, first because it is the
// one that gives nothing up.
//
// `onForget` is a guest's way to leave and have her name removed (#1281, G6; beställarens val C med
// en ändring 2026-10-25): offered under both ways out, after the sentence on why keeping it helps,
// as a quieter button than either. Keeping the name is the first choice; removing it is visible and
// reachable, and never dressed as an equal one. Absent without a guest's token.
//
// `panel`: the desk's form (#1376, beställarens beslut A), the same ways out in the same order in
// the panel at the window's right rather than in a sheet over the hand.
export function ExitSheet({ pile, onLeave, onEnd, onClose, refusal, stay, onForget, panel = false }: { pile: string | null; onLeave(): void; onEnd(): void; onClose(): void; refusal?: RefusalHandle; stay?: ReactNode; onForget?: () => void; panel?: boolean }) {
  const t = useT()
  const Shell = panel ? SessionPanel : SessionSheet
  return (
    <Shell
      title={t('exit.sheet.title')}
      className="byd-exit-sheet"
      onClose={onClose}
      hint={
        <>
          <kbd>Esc</kbd> {t('desk.panel.esc')}
        </>
      }
      actions={
        <button type="button" data-kind="quiet" onClick={onClose} data-first>
          {t('exit.sheet.stay')}
        </button>
      }
      refusal={refusal}
    >
      {/* Taking it brings the editor's tab out, and the sheet is not left standing behind. */}
      {stay && (
        <div className="byd-exit-choice" onClick={(e) => (e.target as HTMLElement).closest('a') && onClose()}>
          {stay}
        </div>
      )}
      <div className="byd-exit-choice">
        <button type="button" data-kind="leave" onClick={onLeave} className={refusal?.notice ? 'byd-status-refused-control' : undefined} {...(refusal?.control ?? {})}>
          {t('exit.sheet.leave')}
        </button>
        <p>{pile ? t('exit.sheet.leave.body', { pile }) : t('exit.sheet.leave.body.any')}</p>
      </div>
      <div className="byd-exit-choice">
        <button type="button" data-kind="no" onClick={onEnd}>
          {t('exit.sheet.end')}
        </button>
        <p>{t('exit.sheet.end.body')}</p>
      </div>
      {onForget && (
        <div className="byd-forget-way">
          <p>{t('forget.why')}</p>
          <button type="button" data-kind="forget" onClick={onForget}>
            {t('forget.leave')}
          </button>
        </div>
      )}
    </Shell>
  )
}

// The question before a guest's name is removed (#1281, L9's manners): what goes, what stays, that
// it cannot be undone, with the focus on the answer that changes nothing. `leaving` is the way out's
// («Lämna och ta bort ditt namn?»), and otherwise it is the thanks' («Ta bort ditt namn och dina
// svar?»), which takes the answers too. `watched`: she watched rather than sat.
// `panel`: the desk's form (#1376), in the panel at the window's right; `wide` is the survey's
// width, for the question asked under the thanks.
export function ForgetSheet({ name, leaving, watched = false, onYes, onClose, refusal, busy = false, panel = false, wide = false }: { name: string; leaving: boolean; watched?: boolean; onYes(): void; onClose(): void; refusal?: RefusalHandle; busy?: boolean; panel?: boolean; wide?: boolean }) {
  const t = useT()
  const Shell = panel ? SessionPanel : SessionSheet
  return (
    <Shell
      title={t(leaving ? 'forget.leave.title' : 'forget.thanks.title')}
      role="alertdialog"
      className="byd-forget-sheet"
      wide={wide}
      onClose={onClose}
      actions={
        <>
          <button type="button" data-kind="quiet" onClick={onClose} data-first>
            {t('forget.cancel')}
          </button>
          <button type="button" data-kind="no" onClick={onYes} disabled={busy} className={refusal?.notice ? 'byd-status-refused-control' : undefined} {...(refusal?.control ?? {})}>
            {t(leaving ? 'forget.leave.yes' : 'forget.thanks.yes')}
          </button>
        </>
      }
      refusal={refusal}
    >
      <p>{t('forget.list')}</p>
      <ul>
        <li>{t(watched ? 'forget.list.watched' : 'forget.list.name', { name })}</li>
        <li>{t('forget.list.words')}</li>
        {!leaving && <li>{t('forget.list.answers')}</li>}
      </ul>
      <p>{t('forget.kept', { masked: t('masked.name') })}</p>
    </Shell>
  )
}

// Where a guest who left and had her name removed lands (#1281): it is done, what stayed, and when
// the backups forget it. A page of its own and not the seat picker, which would offer her the seat
// she just gave up under a name that is no longer there.
export function ForgottenPage({ home }: { home: string }) {
  const t = useT()
  const here = useRef<HTMLHeadingElement>(null)
  useEffect(() => here.current?.focus(), [])
  return (
    <main className="byd-forgotten" data-page="forgotten">
      <CheckGlyph />
      <h1 ref={here} tabIndex={-1}>
        {t('forget.left.title')}
      </h1>
      <p>{t('forget.left.body', { masked: t('masked.name') })}</p>
      <p>{t('forget.backups')}</p>
      <a href={home}>{t('forget.home')}</a>
    </main>
  )
}

// Ending the session (C9): says what it means, then does it for everyone. The sentence says where
// the survey comes, which is where each player holds the hand, a phone or a computer (#1376).
// In the desk's panel the question is an alert, and «Avbryt» stands before the red answer, where
// the panel's foot reads from (#1376, prototype A); the phone's sheet keeps its order.
export function EndSheet({ version, onEnd, onClose, refusal, panel = false }: { version: string; onEnd(): void; onClose(): void; refusal?: RefusalHandle; panel?: boolean }) {
  const t = useT()
  const end = (
    <button key="end" type="button" data-kind="no" onClick={onEnd} className={refusal?.notice ? 'byd-status-refused-control' : undefined} {...(refusal?.control ?? {})}>
      {t('end.sheet.end')}
    </button>
  )
  const not = (
    <button key="not" type="button" data-kind="quiet" onClick={onClose} data-first>
      {t('end.sheet.not')}
    </button>
  )
  const Shell = panel ? SessionPanel : SessionSheet
  return (
    <Shell title={t('end.sheet.title')} role={panel ? 'alertdialog' : 'dialog'} onClose={onClose} actions={panel ? [not, end] : [end, not]} refusal={refusal}>
      <p>{t('end.sheet.body', { version })}</p>
    </Shell>
  )
}

// The two forms a session question takes. Both are modal windows (#485, fynd 6): the focus goes in
// — on the control marked `data-first`, the one a person most likely wants — Tab stays in, Escape
// answers from wherever the focus is, and the focus goes back to what opened it when it closes.
type ShellProps = {
  title: string
  role?: 'dialog' | 'alertdialog'
  className?: string
  onClose(): void
  // The answers, at the sheet's foot or in the panel's.
  actions: ReactNode
  refusal?: RefusalHandle | undefined
  // What the keyboard does here, said in the panel's foot (the desk has one, the phone has not).
  hint?: ReactNode
  // The survey's width, for a question asked where the survey stands.
  wide?: boolean
  children: ReactNode
}

// The phone's: a sheet over the hand, with the page dimmed behind it.
function SessionSheet({ title, role = 'dialog', className, onClose, actions, refusal, children }: ShellProps) {
  const id = useId()
  const box = useSheet(onClose)
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div className={`byd-sheet byd-session-sheet${className ? ` ${className}` : ''}`} role={role} aria-modal="true" aria-labelledby={`${id}-title`} onClick={(e) => e.stopPropagation()} ref={box}>
        <p className="byd-sheet-title" id={`${id}-title`}>
          {title}
        </p>
        {children}
        <div className="byd-sheet-actions">{actions}</div>
        {refusal && <Refusal handle={refusal} />}
      </div>
    </div>
  )
}

// The desk's (#1376, beställarens beslut 2026-10-26: variant A): a panel at the window's right, from
// the head down to the foot, beside the targets and the hand rather than over them; the flag stands
// in the same place (#1255). A question that cannot be undone holds the focus the way the sheet does,
// and the surface takes what stands beside it out of reach while it does. Its sheet is the desk's,
// fetched with it (`desk-panel.css`).
export function SessionPanel({ title, role = 'dialog', className, onClose, actions, refusal, hint, wide = false, children }: ShellProps) {
  const t = useT()
  const id = useId()
  const box = useSheet<HTMLElement>(onClose)
  return (
    <aside className={`byd-desk-panel${className ? ` ${className}` : ''}`} data-wide={wide ? '' : undefined} role={role} aria-modal="true" aria-labelledby={`${id}-title`} ref={box}>
      <header className="byd-desk-panel-head">
        <h2 id={`${id}-title`}>{title}</h2>
        <button type="button" className="byd-desk-panel-x" onClick={onClose} aria-label={t('desk.panel.close')} title={t('desk.panel.close')}>
          <CloseGlyph />
        </button>
      </header>
      <div className="byd-desk-panel-body">
        {children}
        {refusal && <Refusal handle={refusal} />}
      </div>
      <footer className="byd-desk-panel-foot">
        <small aria-hidden="true">{hint}</small>
        {actions}
      </footer>
    </aside>
  )
}

function useSheet<E extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const box = useRef<E>(null)
  useFocusTrap(box, { onEscape: onClose, initial: () => box.current?.querySelector<HTMLElement>('[data-first]') ?? null })
  return box
}
