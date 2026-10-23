import { useEffect, useId, useRef, useState } from 'react'
import type { Intent, Snapshot } from '@byd/protocol'
import { StartButton, startOf, type StartWait } from '../table/StartButton.js'
import { roomAddress } from '../table/roomAddress.js'
import { seatColor } from '../table/seatColor.js'
import { useT } from '../i18n/index.js'
import { CheckGlyph, CloseGlyph, CopyGlyph } from '../glyphs.js'

// Distansvyn börjar i ett väntrum (L77, #1130, prototyp B steg 3). Tills något har hänt vid bordet
// ligger det över filten: hur många platser som är tagna, rummets adress som `värd/KOD` med en
// kopieringsknapp, platserna med vem som sitter var — de fylls medan man tittar — och «Starta
// spelet». Knappen är filtens egen start (K25), inte en andra: samma kuvert, samma väntan på korten.
//
// Det är en region och inte en dialog: filten under den är inte stängd, och ett kort som spelas
// före starten är något som hänt vid bordet, så väntrummet går då av sig självt.

type Props = {
  view: Snapshot
  seat: string
  // The room's code, or null while it is not known: the address is then not shown at all.
  code: string | null
  server: string | null
  startWait: StartWait
  onStart(intents: Intent[], hadFocus: boolean): void
  // A game with no start action has nothing to start: its button only puts the room away. The ×
  // does the same in any game, for whoever wants the piles under it before the start: the start
  // is then the felt's own tile, which is the same start (K25).
  onBegin(): void
}

const COPIED_MS = 2000

export function WaitingRoom({ view, seat, code, server, startWait, onStart, onBegin }: Props) {
  const t = useT()
  const heading = useId()
  const taken = view.seats.filter((s) => s.name !== null).length
  const address = code ? roomAddress(code, server) : null
  const shown = useRef<HTMLElement>(null)
  // What became of the last copy, and of which code. A new code («Ny kod») is a new address: what
  // was copied before is not what stands here now, so it is said only while that code stands. Read
  // off the code rather than reset by an effect on it (#1221): such an effect also runs when the
  // room is first drawn, and a press that came before it was undone by it unseen.
  const [copied, setCopied] = useState<{ said: 'copied' | 'failed'; code: string } | null>(null)
  const copy = copied !== null && copied.code === code ? copied.said : 'idle'
  useEffect(() => {
    if (copy !== 'copied') return
    const back = setTimeout(() => setCopied(null), COPIED_MS)
    return () => clearTimeout(back)
  }, [copy, copied])
  const copyLink = async () => {
    if (!address || !code) return
    try {
      await navigator.clipboard.writeText(address.url)
      setCopied({ said: 'copied', code })
    } catch {
      // A browser that refuses the clipboard still lets the reader copy it: the address is selected.
      const range = document.createRange()
      if (shown.current) range.selectNodeContents(shown.current)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      setCopied({ said: 'failed', code })
    }
  }
  return (
    <section className="byd-waiting" aria-labelledby={heading} data-waiting-room="">
      <div className="byd-waiting-head">
        <h2 id={heading}>{t('online.wait.heading', { n: taken, of: view.seats.length })}</h2>
        <button type="button" className="byd-waiting-hide" aria-label={t('online.wait.hide')} title={t('online.wait.hide')} onClick={onBegin}>
          <CloseGlyph />
        </button>
      </div>
      <p>{t('online.wait.text')}</p>
      {address && code && (
        <div className="byd-waiting-address">
          <code ref={shown} data-address="" aria-label={t('online.wait.address')}>
            {address.site}/<b>{code}</b>
          </code>
          <button type="button" className="byd-waiting-copy" data-copied={copy === 'copied' ? '' : undefined} onClick={() => void copyLink()}>
            {copy === 'copied' ? <CheckGlyph /> : <CopyGlyph />}
            {t(copy === 'copied' ? 'online.wait.copied' : 'online.wait.copy')}
          </button>
        </div>
      )}
      <p className="byd-waiting-said" role="status">
        {copy === 'failed' ? t('online.wait.copy.failed') : copy === 'copied' ? <span className="byd-offscreen">{t('online.wait.copied')}</span> : null}
      </p>
      <ul className="byd-waiting-seats" aria-label={t('online.wait.seats')}>
        {view.seats.map((s, i) => (
          <li key={s.id} data-seat={s.id} {...(s.name === null ? { 'data-free': '' } : {})}>
            <span className="byd-waiting-badge" style={{ ['--seat' as string]: seatColor(i) }} aria-hidden="true">
              {s.id}
            </span>
            {s.name === null ? <i>{t('online.wait.free')}</i> : s.id === seat ? t('online.wait.me', { name: s.name }) : s.name}
          </li>
        ))}
      </ul>
      {startOf(view) ? (
        <StartButton view={view} startWait={startWait} className="byd-table-start byd-waiting-start" onStart={onStart} />
      ) : (
        <button type="button" className="byd-table-start byd-waiting-start" onClick={onBegin}>
          {t('online.wait.begin')}
        </button>
      )}
    </section>
  )
}
