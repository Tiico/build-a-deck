import { useMemo } from 'react'
import { useLang } from '../i18n/index.js'

// A measure as the reader writes it: «34,5» in Swedish, «34.5» in English (#1413, #1414).
export function useMm(): (n: number) => string {
  const { lang } = useLang()
  return useMemo(() => {
    const format = new Intl.NumberFormat(lang === 'sv' ? 'sv-SE' : 'en-GB', { maximumFractionDigits: 2 })
    return (n: number) => format.format(n)
  }, [lang])
}
