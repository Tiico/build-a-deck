import { useLayoutEffect, useMemo, useState } from 'react'
import { applyEdit } from '@byd/server/doc'
import type { ProjectDoc } from './types.js'
import { CardPreview } from './CardPreview.js'
import { proseFieldsOf } from './body.js'
import { CARD_TOP, cropOf, proseBoxOf } from './theme-crop.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { catalogFaceSource } from './font-catalog.js'
import type { ProjectClient } from './ProjectClient.js'
import { ThemeTile } from './ThemeTile.js'
import { THEMES, departures, sayDeparture, themeFamilies, themeIntent, themeOf, type Theme } from './themes.js'
import { useLang, useT } from '../i18n/index.js'
import { Said, saidOr } from '../i18n/said.js'
import { useSay } from '../status/StatusLive.js'

// The ready-made themes, first in Speltema (L57, #632), and the line under them that says what the
// game has made of the one it started from.
//
// A tile (`ThemeTile`) shows what a theme is without reaching Google — the same line the guided
// start draws for its themes (#476, #633). Choosing a theme is one handling; «Visa temana i sina typsnitt» is the
// other (beställarens val C, 2026-10-01): it asks the catalog for each family's sheet and draws the
// game's own first card on every tile, in the theme's faces, without choosing anything.
export function ThemeGallery({ doc, client, assetBase }: { doc: ProjectDoc; client: ProjectClient; assetBase: string }) {
  const t = useT()
  const { lang } = useLang()
  const [busy, setBusy] = useState<Theme | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Said to the reader once the theme is laid over the game; the line below already shows it, so
  // it is not written on the screen a second time.
  const say = useSay()
  const from = themeOf(doc)
  // Where each family's face is drawn from once the faces are asked for; null until then.
  const [faces, setFaces] = useState<Record<string, { stack: string; src?: string }> | null>(null)
  const [looking, setLooking] = useState(false)
  const show = () => {
    if (looking) return
    setLooking(true)
    setError(null)
    const carried = previewFonts(doc, assetBase)
    const wanted = [...new Map(THEMES.flatMap(themeFamilies).map((f) => [f.family, f])).values()]
    void Promise.all(wanted.map(async (family) => [family.family, carried[family.family]?.src ? carried[family.family] : await catalogFaceSource(family)] as const))
      .then((found) => {
        if (found.some(([, face]) => !face)) throw new Said(t('fonts.catalog.silent'))
        setFaces(Object.fromEntries(found) as Record<string, { stack: string; src?: string }>)
      })
      .catch((err: unknown) => setError(saidOr(err, t('fonts.catalog.silent'))))
      .finally(() => setLooking(false))
  }
  // One theme at a time: a press while one is on its way is not a second theme, and the status line
  // already says which one is coming, so the press is told to wait rather than ignored unseen.
  const choose = (theme: Theme) => {
    if (busy) return
    setBusy(theme)
    setError(null)
    void client
      .useTheme(theme, t)
      .then(() => say?.('polite', t('theme.gallery.chosen', { name: t(theme.name) })))
      .catch((err: unknown) => setError(saidOr(err, t('theme.gallery.failed', { name: t(theme.name) }))))
      .finally(() => setBusy(null))
  }
  return (
    <section className="byd-theme-gallery" aria-label={t('theme.gallery')}>
      {client.mayEdit && (
        <div className="byd-theme-tiles" role="group" aria-label={t('theme.gallery')}>
          {THEMES.map((theme) => (
            <ThemeTile key={theme.id} theme={theme} pressed={from?.id === theme.id} busy={busy === theme} waiting={busy !== null} onPress={() => choose(theme)}>
              {faces && <ThemeCard doc={doc} theme={theme} faces={faces} assetBase={assetBase} />}
            </ThemeTile>
          ))}
        </div>
      )}
      {client.mayEdit && !faces && (
        <button type="button" className="byd-theme-show byd-secondary" aria-busy={looking} onClick={show}>
          {t(looking ? 'theme.gallery.show.busy' : 'theme.gallery.show')}
        </button>
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

// The game's own first card as the theme would set it: the theme laid over a copy of the document
// by the very edit that choosing it sends, so the tile cannot show what the choice would not do.
//
// The tile draws a crop of it (#741, beställarens val A 2026-10-04): the title band and the first
// lines of the prose, at the size the prose can be read at, centred on the prose box. The card is
// still the one renderer's whole card (E2); the crop only clips it.
function ThemeCard({ doc, theme, faces, assetBase }: { doc: ProjectDoc; theme: Theme; faces: Record<string, { stack: string; src?: string }>; assetBase: string }) {
  const t = useT()
  const themed = useMemo(() => {
    const stacks = Object.fromEntries(themeFamilies(theme).map((f) => [f.family, { stack: faces[f.family]?.stack ?? f.family }]))
    return applyEdit(doc, themeIntent(doc, theme, stacks, t))
  }, [doc, theme, faces, t])
  const icons = useMemo(() => previewIcons(themed, assetBase), [themed, assetBase])
  const fonts = useMemo(() => ({ ...previewFonts(themed, assetBase), ...Object.fromEntries(themeFamilies(theme).flatMap((f) => { const face = faces[f.family]; return face ? [[f.family, face] as const] : [] })) }), [themed, theme, faces, assetBase])
  const front = themed.template.faces['front']
  const row = themed.rows[0]
  const box = useMemo(() => (front && row ? proseBoxOf(front, row.fields, proseFieldsOf(themed)) : null) ?? CARD_TOP, [front, row, themed])
  // The size the prose was fitted to (E6), which is the size the reader sees: the template's own
  // until the card has been fitted.
  const [fitted, setFitted] = useState<{ element: string; sizePt: number } | null>(null)
  const room = useWidth()
  if (!front || !row) return null
  const crop = cropOf(box, fitted?.element === box.element ? fitted.sizePt : box.sizePt, room.width)
  return (
    <span ref={room.ref} className="byd-theme-card" data-theme-card data-prose={box.element} aria-hidden="true">
      <span className="byd-theme-crop" style={{ width: crop.width, height: crop.height, ['--byd-theme-fade' as string]: `${crop.fade}px` }}>
        <span className="byd-theme-card-at" style={{ left: crop.left }}>
          <CardPreview
            id={`theme-${theme.id}`}
            face={front}
            row={row.fields}
            icons={icons}
            fonts={fonts}
            assetBase={assetBase}
            palette={themed.palette}
            scale={crop.zoom}
            onFitted={(sizes) => {
              const found = sizes.find((s) => s.element === box.element)
              if (found) setFitted({ element: found.element, sizePt: found.sizePt })
            }}
          />
        </span>
      </span>
    </span>
  )
}

// How wide an element is: measured once it is drawn, and again whenever its width changes.
function useWidth(): { ref: (el: HTMLElement | null) => void; width: number } {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => setWidth(el.clientWidth))
    watch.observe(el)
    return () => watch.disconnect()
  }, [el])
  return { ref: setEl, width }
}
