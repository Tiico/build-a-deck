import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { applyEdit } from '@byd/server/doc'
import type { ProjectDoc } from './types.js'
import { CardPreview } from './CardPreview.js'
import { proseFieldsOf } from './body.js'
import { CARD_TOP, bandEndOf, cropOf, linesIn, proseBoxOf } from './theme-crop.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { catalogFaceSource } from './font-catalog.js'
import type { ProjectClient } from './ProjectClient.js'
import { ThemeTile } from './ThemeTile.js'
import { THEMES, copyChanges, themeFamilies, themeIntent, type CopyChange, type Theme } from './themes.js'
import { useT } from '../i18n/index.js'
import { Said, saidOr } from '../i18n/said.js'
import { useSay } from '../status/StatusLive.js'

// The examples to start from (L84, #1287): the ready-made themes in a sheet beside Speltema, to
// read and not to choose. The game's theme is its own, so an example is never pressed here; it is
// copied, and the copy says first what it replaces, line by line, and is made only on the second
// press — the same `setTheme` the guided start sends, and one step back (B4).
//
// A tile (`ThemeTile`) shows what an example is without reaching Google — the same line the guided
// start draws for its themes (#476, #633), and opening the sheet asks for nothing. «Visa temana i
// sina typsnitt» is the handling that does (beställarens val C, 2026-10-01): it asks the catalog
// for each family's sheet and draws the game's own first card on every tile, in the example's
// faces, without copying anything.
export function ThemeExamples({ doc, client, assetBase, onClose }: { doc: ProjectDoc; client: ProjectClient; assetBase: string; onClose(): void }) {
  const t = useT()
  const [asking, setAsking] = useState<Theme | null>(null)
  const [busy, setBusy] = useState<Theme | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Said to the reader once the copy is the game's; the sheet folds away, so it is not written.
  const say = useSay()
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
  // One copy at a time: a press while one is on its way is not a second copy.
  const copy = (theme: Theme) => {
    if (busy) return
    setBusy(theme)
    setError(null)
    void client
      .useTheme(theme, t)
      .then(() => {
        say?.('polite', t('theme.examples.copied', { name: t(theme.name) }))
        onClose()
      })
      .catch((err: unknown) => setError(saidOr(err, t('theme.examples.failed', { name: t(theme.name) }))))
      .finally(() => setBusy(null))
  }
  return (
    <section
      className="byd-theme-sheet byd-theme-examples"
      aria-label={t('theme.examples')}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        // A question open on a copy is the nearer thing Escape takes back.
        if (asking) setAsking(null)
        else onClose()
      }}
    >
      <header>
        <h2>{t('theme.examples')}</h2>
        <button type="button" className="byd-theme-sheet-done" onClick={onClose}>
          {t('theme.library.done')}
        </button>
      </header>
      <p className="byd-theme-examples-lead">{t('theme.examples.lead')}</p>
      <div className="byd-theme-sheet-scroll">
        <ul className="byd-theme-examples-list">
          {THEMES.map((theme) => (
            <li key={theme.id}>
              <ThemeTile theme={theme}>{faces && <ThemeCard doc={doc} theme={theme} faces={faces} assetBase={assetBase} />}</ThemeTile>
              {asking === theme ? (
                <CopyQuestion doc={doc} theme={theme} busy={busy === theme} onCopy={() => copy(theme)} onCancel={() => setAsking(null)} />
              ) : (
                <button type="button" className="byd-theme-copy byd-secondary" aria-label={t('theme.examples.copy.name', { name: t(theme.name) })} onClick={() => setAsking(theme)}>
                  {t('theme.examples.copy')}
                </button>
              )}
            </li>
          ))}
        </ul>
        {!faces && (
          <button type="button" className="byd-theme-show byd-secondary" aria-busy={looking} onClick={show}>
            {t(looking ? 'theme.gallery.show.busy' : 'theme.gallery.show')}
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  )
}

// What a copy replaces, said before it is made, with the press that makes it. The hand lands on
// that press, so the question is answered from where it was asked. Both presses are secondary:
// the primary fill is the table's alone.
function CopyQuestion({ doc, theme, busy, onCopy, onCancel }: { doc: ProjectDoc; theme: Theme; busy: boolean; onCopy(): void; onCancel(): void }) {
  const t = useT()
  const changes = useMemo(() => copyChanges(doc, theme, t), [doc, theme, t])
  const go = useRef<HTMLButtonElement>(null)
  useEffect(() => go.current?.focus(), [])
  return (
    <div className="byd-theme-question" role="group" aria-label={t('theme.examples.replaces', { name: t(theme.name) })}>
      {changes.length === 0 ? (
        <p>{t('theme.examples.same')}</p>
      ) : (
        <ul>
          {changes.map((c, i) => (
            <li key={i}>
              {sayChange(c, t)}
              {'colour' in c && <i className="byd-theme-question-ink" style={{ background: c.colour }} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
      <span className="byd-theme-question-acts">
        <button ref={go} type="button" className="byd-secondary" aria-busy={busy} aria-disabled={busy} onClick={onCopy}>
          {t('theme.examples.copy.go')}
        </button>
        <button type="button" className="byd-secondary" onClick={onCancel}>
          {t('theme.examples.cancel')}
        </button>
      </span>
    </div>
  )
}

function sayChange(c: CopyChange, t: ReturnType<typeof useT>): string {
  switch (c.kind) {
    case 'heading':
      return t('theme.examples.heading', { from: c.from, to: c.to })
    case 'body':
      return t('theme.examples.body', { from: c.from, to: c.to })
    case 'colour':
      return t('theme.examples.colour', { meaning: c.meaning })
    case 'meaning':
      return t('theme.examples.meaning', { meaning: c.meaning })
    case 'icons':
      return t(c.names.length === 1 ? 'theme.examples.icons.one' : 'theme.examples.icons.other', { n: c.names.length, names: c.names.join(', ') })
  }
}

// The game's own first card as the example would set it: the example laid over a copy of the
// document by the very edit that copying it sends, so the tile cannot show what the choice would not do.
//
// The tile draws a crop of it (#741, beställarens val A 2026-10-04): the title band and the first
// lines of the prose, at the size the prose can be read at, centred on the prose box. The card is
// still the one renderer's whole card (E2); the crop only clips it. Where the template leaves a gap
// of paper between the band and the prose, the gap is cut away and a dashed line stands where it
// was (#830, beställarens val C 2026-10-04).
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
  // And how many lines the prose is set in once it is fitted (#830), counted from the rendered text
  // as E6 measures it: the prose's piece is as tall as that, up to three.
  const [lines, setLines] = useState<{ element: string; lines: number } | null>(null)
  const prose = useRef<HTMLSpanElement | null>(null)
  const bandEnd = useMemo(() => (front && row && box !== CARD_TOP ? bandEndOf(front, row.fields, box) : undefined), [front, row, box])
  const room = useWidth()
  if (!front || !row) return null
  const counted = lines?.element === box.element ? lines.lines : undefined
  const crop = cropOf(box, fitted?.element === box.element ? fitted.sizePt : box.sizePt, room.width, { lines: counted, bandEnd })
  // The pieces are clips of the one renderer's card (E2), each the whole card drawn by the same
  // CardPreview and shown from its own height; the last is the prose's.
  const last = crop.pieces.length - 1
  return (
    <span ref={room.ref} className="byd-theme-card" data-theme-card data-prose={box.element} data-lines={counted} aria-hidden="true">
      <span className="byd-theme-crop" data-fade={crop.fade > 0 ? '' : undefined} style={{ width: crop.width, height: crop.height, ['--byd-theme-fade' as string]: `${crop.fade}px` }}>
        {crop.pieces.map((piece, i) => (
          <span key={i === last ? 'body' : 'band'} ref={i === last ? prose : undefined} className="byd-theme-piece" data-theme-piece={i === last ? 'body' : 'band'} style={{ height: piece.height }}>
            <span className="byd-theme-card-at" style={{ left: crop.left, top: -piece.from }}>
              <CardPreview
                id={`theme-${theme.id}${i === last ? '' : '-band'}`}
                face={front}
                row={row.fields}
                icons={icons}
                fonts={fonts}
                assetBase={assetBase}
                palette={themed.palette}
                scale={crop.zoom}
                {...(i === last
                  ? {
                      onFitted: (sizes: { element: string; sizePt: number }[]) => {
                        const found = sizes.find((s) => s.element === box.element)
                        if (found) setFitted({ element: found.element, sizePt: found.sizePt })
                        const text = [...(prose.current?.querySelectorAll<HTMLElement>('[data-element]') ?? [])].find((el) => el.dataset['element'] === box.element)
                        const n = text ? linesIn(text) : 0
                        if (n > 0) setLines({ element: box.element, lines: n })
                      },
                    }
                  : {})}
              />
            </span>
          </span>
        ))}
        {crop.cut !== null && <i className="byd-theme-cut" style={{ top: crop.cut, ['--byd-theme-ink' as string]: box.color }} />}
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
