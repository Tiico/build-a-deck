import { useId, type ReactNode } from 'react'
import { INK, LIBRARY } from './symbols.js'
import { themeFamilies, type Theme } from './themes.js'
import { useT } from '../i18n/index.js'
import './theme-tile.css'

// One ready-made theme as a tile (L57): the examples in Speltema and «Utseende» in the guided start
// draw the same one, so a theme looks the same on both doors (#633). Each room says only its own
// colours. In the guided start a tile is a choice and a button; in Speltema an example is to read
// and not to choose (L84, #1287), so a tile given nothing to do on a press is no button, and its
// name is the heading the copy under it is named by.
//
// A tile shows what a theme is without reaching Google: its meanings as the symbols they paint, on
// the paper they were chosen against, and its two families *named*. Setting the names in their own
// faces would need the catalog's sheet the moment the tile is drawn, and the catalog is reached on
// the designer's handling and never before it (L27, DRIFT §12). `children` is where a room that
// has been asked for the faces draws the card in them (beställarens val C, 2026-10-01).
//
// `mark` is a word under the name that says what the tile is without pressing it: the guided
// start's «Förval» (#687), a theme the game gets unless another is pressed. It is the tile's
// description, so it is heard with the name, and never a pressed state the designer did not make.
type Press = { pressed: boolean; busy?: boolean; waiting?: boolean; mark?: string | undefined; onPress(): void }
export function ThemeTile({ theme, children, ...press }: { theme: Theme; children?: ReactNode } & (Press | { onPress?: undefined })) {
  const t = useT()
  const marked = useId()
  const inside = (
    <>
      <span className="byd-theme-tile-paper" style={{ background: theme.paper }} aria-hidden="true">
        {theme.meanings.map((m, i) => (
          <img key={m.id} src={painted(SAMPLES[i] ?? 'mynt', m.colour)} alt="" />
        ))}
      </span>
      {children}
      {press.onPress ? <b>{t(theme.name)}</b> : <h3>{t(theme.name)}</h3>}
      {press.onPress && press.mark && (
        <span className="byd-theme-tile-mark" id={marked}>
          {press.mark}
        </span>
      )}
      <small className="byd-theme-tile-families">{themeFamilies(theme).map((f) => f.family).join(' · ')}</small>
      <small>{t(theme.about)}</small>
    </>
  )
  if (!press.onPress) return <div className="byd-theme-tile">{inside}</div>
  const { pressed, busy = false, waiting = false, mark, onPress } = press
  return (
    <button type="button" className="byd-theme-tile" aria-label={t('theme.gallery.choose', { name: t(theme.name) })} aria-pressed={pressed} aria-busy={busy} aria-disabled={waiting} {...(mark ? { 'aria-describedby': marked, 'data-marked': '' } : {})} onClick={onPress}>
      {inside}
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
