import { useEffect, useState } from 'react'

// From where a laptop is the screen being joined from (#675, beslut 3): there, playing on this
// screen is the suggestion, and the phone's way stays as the second button. Where there is no
// window to ask, the page is the phone's, which is who opens it nearly always. The start page's
// «Tillbaka till bordet» asks the same question of the same screen (#690).
const WIDE = '(min-width: 1024px)'
export function useWide(): boolean {
  const ask = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches
  const [wide, setWide] = useState(ask)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(WIDE)
    const answer = () => setWide(query.matches)
    query.addEventListener('change', answer)
    answer()
    return () => query.removeEventListener('change', answer)
  }, [])
  return wide
}
