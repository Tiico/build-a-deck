import { useState } from 'react'
import type { ProjectDoc } from './types.js'
import type { ProjectClient } from './ProjectClient.js'
import { INK, LIBRARY } from './symbols.js'
import { THEMES, departures, sayDeparture, themeFamilies, themeOf, type Theme } from './themes.js'
import { useLang, useT } from '../i18n/index.js'
import { useSay } from '../status/StatusLive.js'

// The ready-made themes, first in Speltema (L57, #632), and the line under them that says what the
// game has made of the one it started from.
//
// A tile shows what a theme is without reaching Google: its meanings as the symbols they paint, on
// the paper they were chosen against, and its two families *named*. Setting the names in their own
// faces would need the catalog's sheet the moment the tab opened, and the catalog is reached on the
// designer's handling and never before it (L27, DRIFT §12) — the same line the guided start draws
// for its frames (#476). The press is the handling: it brings the families home and the cards on the
// wall show them.
export function ThemeGallery({ doc, client }: { doc: ProjectDoc; client: ProjectClient }) {
  const t = useT()
  const { lang } = useLang()
  const [busy, setBusy] = useState<Theme | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Said to the reader once the theme is laid over the game; the line below already shows it, so
  // it is not written on the screen a second time.
  const say = useSay()
  const from = themeOf(doc)
  // One theme at a time: a press while one is on its way is not a second theme, and the status line
  // already says which one is coming, so the press is told to wait rather than ignored unseen.
  const choose = (theme: Theme) => {
    if (busy) return
    setBusy(theme)
    setError(null)
    void client
      .useTheme(theme, t)
      .then(() => say?.('polite', t('theme.gallery.chosen', { name: t(theme.name) })))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(null))
  }
  return (
    <section className="byd-theme-gallery" aria-label={t('theme.gallery')}>
      {client.mayEdit && (
        <div className="byd-theme-tiles" role="group" aria-label={t('theme.gallery')}>
          {THEMES.map((theme) => (
            <button key={theme.id} type="button" className="byd-theme-tile" aria-label={t('theme.gallery.choose', { name: t(theme.name) })} aria-pressed={from?.id === theme.id} aria-busy={busy === theme} aria-disabled={busy !== null} onClick={() => choose(theme)}>
              <span className="byd-theme-tile-paper" style={{ background: theme.paper }} aria-hidden="true">
                {theme.meanings.map((m, i) => (
                  <img key={m.id} src={painted(SAMPLES[i] ?? 'mynt', m.colour)} alt="" />
                ))}
              </span>
              <b>{t(theme.name)}</b>
              <small className="byd-theme-tile-families">{themeFamilies(theme).map((f) => f.family).join(' · ')}</small>
              <small>{t(theme.about)}</small>
            </button>
          ))}
        </div>
      )}
      <div className="byd-theme-gallery-line">
        <Departures doc={doc} client={client} lang={lang} busy={busy !== null} onReset={choose} />
        <p className="byd-theme-gallery-said" role="status">
          {busy ? t('theme.gallery.busy', { name: t(busy.name) }) : ''}
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

// The one line (L57): unchanged, or how many changes and which, with the way back to the theme as
// it was. «Återställ» is choosing the theme again, so it takes back exactly what the line names.
function Departures({ doc, client, lang, busy, onReset }: { doc: ProjectDoc; client: ProjectClient; lang: ReturnType<typeof useLang>['lang']; busy: boolean; onReset(theme: Theme): void }) {
  const t = useT()
  const theme = themeOf(doc)
  if (!theme) return <p className="byd-theme-departs" data-testid="theme-departs">{t('theme.departs.none')}</p>
  const away = departures(doc)
  const name = t(theme.name)
  if (away.length === 0)
    return (
      <p className="byd-theme-departs" data-testid="theme-departs">
        {t('theme.departs.same', { name })}
      </p>
    )
  return (
    <p className="byd-theme-departs" data-testid="theme-departs" data-away="true">
      <b>{t(away.length === 1 ? 'theme.departs.one' : 'theme.departs.other', { name, n: away.length })}</b> {away.map((d) => sayDeparture(d, lang)).join(', ')}.
      {client.mayEdit && (
        <>
          {' '}
          <button type="button" className="byd-theme-reset" aria-label={t('theme.departs.reset.name', { name })} aria-disabled={busy} onClick={() => onReset(theme)}>
            {t('theme.departs.reset')}
          </button>
        </>
      )}
    </p>
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
