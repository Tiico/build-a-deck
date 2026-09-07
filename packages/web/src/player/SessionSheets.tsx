import { useState } from 'react'
import { Refusal, type RefusalHandle } from '../status/Refusal.js'

// Flagging a moment (G3, prototype A): a sheet with an optional note. Sends at once.
export function FlagSheet({ onFlag, onClose, refusal }: { onFlag(note: string | undefined): void; onClose(): void; refusal?: RefusalHandle }) {
  const [note, setNote] = useState('')
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet byd-session-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-sheet-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <p className="byd-sheet-title" id="flag-sheet-title">Flagga det här ögonblicket</p>
        <p>Tidsstämplas mot loggen. En kommentar är frivillig.</p>
        <textarea placeholder="Vad hände? (frivilligt)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} autoFocus />
        <div className="byd-sheet-actions">
          <button type="button" data-kind="flag" onClick={() => onFlag(note.trim() || undefined)} className={refusal?.notice ? 'byd-status-refused-control' : undefined} {...(refusal?.control ?? {})}>
            Flagga
          </button>
          <button type="button" data-kind="quiet" onClick={onClose}>
            Avbryt
          </button>
        </div>
        {refusal && <Refusal handle={refusal} />}
      </div>
    </div>
  )
}

// Ending the session (C9): says what it means, then does it for everyone.
export function EndSheet({ version, onEnd, onClose, refusal }: { version: string; onEnd(): void; onClose(): void; refusal?: RefusalHandle }) {
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet byd-session-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-sheet-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <p className="byd-sheet-title" id="end-sheet-title">Avsluta sessionen?</p>
        <p>Loggen låses på {version}, bordet kan inte spelas vidare, och alla får enkäten på sin telefon. Att bara lägga ifrån sig telefonen avslutar inget: bordet väntar.</p>
        <div className="byd-sheet-actions">
          <button type="button" data-kind="no" onClick={onEnd} className={refusal?.notice ? 'byd-status-refused-control' : undefined} {...(refusal?.control ?? {})}>
            Avsluta för alla
          </button>
          <button type="button" data-kind="quiet" onClick={onClose} autoFocus>
            Inte än
          </button>
        </div>
        {refusal && <Refusal handle={refusal} />}
      </div>
    </div>
  )
}
