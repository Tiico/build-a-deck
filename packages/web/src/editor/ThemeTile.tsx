import type { ReactNode } from 'react'
import { INK, LIBRARY } from './symbols.js'
import { themeFamilies, type Theme } from './themes.js'
import { useT } from '../i18n/index.js'
import './theme-tile.css'

// One ready-made theme as a tile (L57): the gallery in Speltema and «Utseende» in the guided start
// draw the same one, so a theme looks the same on both doors (#633). Each room says only its own
// colours.
//
// A tile shows what a theme is without reaching Google: its meanings as the symbols they paint, on
// the paper they were chosen against, and its two families *named*. Setting the names in their own
// faces would need the catalog's sheet the moment the tile is drawn, and the catalog is reached on
// the designer's handling and never before it (L27, DRIFT §12). `children` is where a room that
// has been asked for the faces draws the card in them (beställarens val C, 2026-10-01).
export function ThemeTile({ theme, pressed, busy = false, waiting = false, onPress, children }: { theme: Theme; pressed: boolean; busy?: boolean; waiting?: boolean; onPress(): void; children?: ReactNode }) {
  const t = useT()
  return (
    <button type="button" className="byd-theme-tile" aria-label={t('theme.gallery.choose', { name: t(theme.name) })} aria-pressed={pressed} aria-busy={busy} aria-disabled={waiting} onClick={onPress}>
      <span className="byd-theme-tile-paper" style={{ background: theme.paper }} aria-hidden="true">
        {theme.meanings.map((m, i) => (
          <img key={m.id} src={painted(SAMPLES[i] ?? 'mynt', m.colour)} alt="" />
        ))}
      </span>
      {children}
      <b>{t(theme.name)}</b>
      <small className="byd-theme-tile-families">{themeFamilies(theme).map((f) => f.family).join(' · ')}</small>
      <small>{t(theme.about)}</small>
    </button>
  )
}

// The symbols a tile paints its meanings with, in the order the meanings stand.
const SAMPLES = ['mynt', 'skold', 'svard', 'hjarta'] as const

// A library symbol in one colour, as a picture the tile can show. The symbol is drawn in the one
// ink (E4), so painting it is that ink swapped for the meaning's.
function painted(id: string, colour: string): string {
  const svg = LIBRARY.find((s) => s.id === id)?.svg ?? ''
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.replaceAll(`fill="${INK}"`, `fill="${colour}"`))}`
}
