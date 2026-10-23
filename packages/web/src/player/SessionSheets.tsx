import { useRef, useState, type ReactNode } from 'react'
import { useFocusTrap } from '../editor/focusTrap.js'
import { Refusal, type RefusalHandle } from '../status/Refusal.js'
import { useT } from '../i18n/index.js'
import type { VisibleComponentState } from '@byd/protocol'
import { Texture } from '../table/Texture.js'
import { cardName } from '../table/keyboard.js'
import { CloseGlyph } from '../glyphs.js'

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
// owner's third way (#1217, L79): to the game's editor with the seat kept, first because it is the
// one that gives nothing up.
export function ExitSheet({ pile, onLeave, onEnd, onClose, refusal, stay }: { pile: string | null; onLeave(): void; onEnd(): void; onClose(): void; refusal?: RefusalHandle; stay?: ReactNode }) {
  const t = useT()
  const box = useSheet(onClose)
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet byd-session-sheet byd-exit-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-sheet-title"
        onClick={(e) => e.stopPropagation()}
        ref={box}
      >
        <p className="byd-sheet-title" id="exit-sheet-title">{t('exit.sheet.title')}</p>
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
        <div className="byd-sheet-actions">
          <button type="button" data-kind="quiet" onClick={onClose} data-first>
            {t('exit.sheet.stay')}
          </button>
        </div>
        {refusal && <Refusal handle={refusal} />}
      </div>
    </div>
  )
}

// Ending the session (C9): says what it means, then does it for everyone.
export function EndSheet({ version, onEnd, onClose, refusal }: { version: string; onEnd(): void; onClose(): void; refusal?: RefusalHandle }) {
  const t = useT()
  const box = useSheet(onClose)
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet byd-session-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-sheet-title"
        onClick={(e) => e.stopPropagation()}
        ref={box}
      >
        <p className="byd-sheet-title" id="end-sheet-title">{t('end.sheet.title')}</p>
        <p>{t('end.sheet.body', { version })}</p>
        <div className="byd-sheet-actions">
          <button type="button" data-kind="no" onClick={onEnd} className={refusal?.notice ? 'byd-status-refused-control' : undefined} {...(refusal?.control ?? {})}>
            {t('end.sheet.end')}
          </button>
          <button type="button" data-kind="quiet" onClick={onClose} data-first>
            {t('end.sheet.not')}
          </button>
        </div>
        {refusal && <Refusal handle={refusal} />}
      </div>
    </div>
  )
}

// A session sheet is a modal window (#485, fynd 6): the focus goes in — on the control marked
// `data-first`, the one a person most likely wants — Tab stays in, Escape answers from wherever
// the focus is, and the focus goes back to what opened the sheet when it closes.
function useSheet(onClose: () => void) {
  const box = useRef<HTMLDivElement>(null)
  useFocusTrap(box, { onEscape: onClose, initial: () => box.current?.querySelector<HTMLElement>('[data-first]') ?? null })
  return box
}
