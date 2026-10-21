import { useLayoutEffect, useRef } from 'react'
import { useT } from '../i18n/index.js'

/**
 * What could not happen, in a band first under the header (#1073, beställarens val B 2026-10-21).
 *
 * The notice stood in the header's row, which has no room to spare below 1440: it took its room
 * from the game's name, cut to «S…», and broke over four to twenty lines in what was left. The band
 * speaks the reading band's language (#489) — amber ground, a warning sign, light words — on one
 * line across the whole window.
 *
 * The sentence is a live region as before (`role="alert"`): it says itself when it arrives, and the
 * × stands outside it so that it is not read out as part of the sentence. The band stands until it
 * stops being true (#996), or until the designer closes it.
 */
export function NoticeBand({ text, onClose }: { text: string; onClose(): void }) {
  const t = useT()
  const band = useRef<HTMLDivElement>(null)
  // A band that goes while focus is on its × hands it to the work and never to nothing: the open
  // tab's panel. A layout effect's cleanup runs before the band leaves the document, so where focus
  // stood can still be seen.
  useLayoutEffect(() => {
    const here = band.current
    return () => {
      if (!here?.contains(document.activeElement)) return
      here.closest('.byd-editor')?.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')?.focus()
    }
  }, [])
  return (
    <div ref={band} className="byd-editor-notice-band">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 2 21h20L12 3z" />
        <path d="M12 10v5" />
        <path d="M12 18h.01" />
      </svg>
      <span role="alert" className="byd-editor-notice">
        {text}
      </span>
      <button type="button" className="byd-editor-notice-close" aria-label={t('editor.notice.close')} onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}
