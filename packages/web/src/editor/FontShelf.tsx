import { useState, type Ref } from 'react'
import type { ProjectCredit } from '@byd/server'
import type { ProjectDoc } from './types.js'
import { familiesInUse } from './fonts.js'
import { useT } from '../i18n/index.js'

// The fonts the game carries (B3). They stood in Mall's panel while no layer was chosen (#478),
// and stand in Speltema since L57 (#630): a typeface is the game's and not a layer's. Each one says whether it travels to the printer, and under what licence it is
// borrowed — a typeface is borrowed exactly as a symbol is (E4), and the print order carries
// both. A family no element is set in can go; one in use has no button, so a card is never
// left pointing at a family the game no longer has.
export type FontShelfProps = {
  doc: ProjectDoc
  // Uploading is the client's work — the file becomes one of the project's assets — so the shelf
  // asks for it and is told what the family came to be called. What a typeface is licensed under
  // is not in the file: only the designer knows it.
  onFontFile(file: File): Promise<string>
  onFontLicence(family: string, licence: ProjectCredit | null): void
  onRemoveFont(family: string): void
  onOpenCatalog(): void
  // The catalog's button, so the sheet it opens can hand the focus back to it.
  catalogRef?: Ref<HTMLButtonElement> | undefined
}

export function FontShelf({ doc, onFontFile, onFontLicence, onRemoveFont, onOpenCatalog, catalogRef }: FontShelfProps) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A file is over the control. The same word the table's picture cells use for the same moment
  // (#222), so the mark is one mark in one language wherever a file is let go in the tool.
  const [over, setOver] = useState(false)
  const families = Object.entries(doc.fonts ?? {})
  const used = familiesInUse(doc)
  const take = (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    void onFontFile(file)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }
  return (
    <section className="byd-fonts">
      {families.length === 0 ? (
        <p className="byd-canvas-affects">{t('fonts.none')}</p>
      ) : (
        <ul aria-label={t('fonts.title')}>
          {families.map(([family, font]) => (
            <li key={family} data-font={family}>
              {/* The name and, where there is one, where the family came from (#329, L27): one
                  cell, so the way out of the game stays on the same line as the name it is
                  about rather than being pushed under it. The badge is the lesser half of the
                  difference a catalog entry makes; the greater one is under it, in the licence. */}
              <span className="byd-fonts-head">
                <span className="byd-fonts-name" style={{ fontFamily: font.stack }}>
                  {family}
                </span>
                {font.source === 'catalog' && <span className="byd-fonts-badge">{t('fonts.catalog.badge')}</span>}
              </span>
              {!used.includes(family) && (
                <button type="button" onClick={() => onRemoveFont(family)}>
                  {t('fonts.remove')}
                </button>
              )}
              <small>{t(font.asset ? 'fonts.travels' : 'fonts.staysBehind')}</small>
              <Licence family={family} licence={font.licence} settled={font.source === 'catalog'} onFontLicence={onFontLicence} />
            </li>
          ))}
        </ul>
      )}
      {/* The way into Google Fonts (#329, L27). It stands above the upload because it is the
          answer for nearly everyone: the whole catalog is free, and a catalog entry arrives
          knowing its licence, which is the one thing an uploaded file can never say.

          Second and not first, for all that: the primary fill belongs to the one action that
          puts the work on the table, and a view with two of them has none (#44). */}
      <button type="button" ref={catalogRef} className="byd-fonts-catalog byd-secondary" onClick={onOpenCatalog}>
        {t('fonts.catalog.open')}
      </button>
      {/* The control is the receiver (#294, #291 variant B): a typeface is dropped on the button
          that takes one, not on a second box beside it and not on the whole canvas. Both halves
          of the drag are cancelled, because a file let go anywhere the page does not catch it is
          a browser leaving the editor to open the typeface as a page of its own. */}
      <label
        className="byd-fonts-upload byd-secondary"
        data-over={over ? 'true' : undefined}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          // Closed while a file is already travelling, exactly as the picker is: two typefaces
          // out of one gesture is two families, and the second to land would say the first was
          // done.
          if (busy) return
          const dropped = [...(e.dataTransfer.files ?? [])]
          // Two files is a question this control cannot answer. Taking the first of them would
          // have thrown the rest away without a word, which is the one thing a drop must never
          // do: the family is named after the file, so the wrong first file is a wrong family.
          if (dropped.length > 1) {
            setError(t('fonts.upload.one'))
            return
          }
          take(dropped[0])
        }}
      >
        {t('fonts.upload')}
        <input className="byd-offscreen" type="file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" disabled={busy} onChange={(e) => take(e.target.files?.[0])} />
      </label>
      {/* While the bytes travel, said where the control is. `disabled` on an input that stands
          off the screen is a state only the keyboard can find, and a control that goes quiet is
          read as a control that did nothing. */}
      {busy && <p role="status">{t('fonts.upload.busy')}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

// What a typeface is borrowed under. Both halves are needed before anything is written: a
// licence with no holder credits no one, and a holder with no licence says nothing about what
// may be printed. Emptying either takes the credit away again.
//
// A family out of the catalog is `settled`: it arrived knowing both halves, so the boxes state
// the answer and are not open to being answered again (L27). Two boxes a designer is expected to
// be able to fill in about a typeface she did not make is the friction the catalog exists to
// take away, and leaving them editable here would put it back — the answer is the catalog's and
// changing it would only make the print order wrong.
function Licence({ family, licence, settled, onFontLicence }: { family: string; licence: ProjectCredit | undefined; settled?: boolean; onFontLicence: FontShelfProps['onFontLicence'] }) {
  const t = useT()
  const [what, setWhat] = useState(licence?.licence ?? '')
  const [by, setBy] = useState(licence?.by ?? '')
  const write = (nextWhat: string, nextBy: string) => {
    const stated = nextWhat.trim() !== '' && nextBy.trim() !== ''
    if (stated) {
      if (nextWhat.trim() === licence?.licence && nextBy.trim() === licence.by) return
      onFontLicence(family, { licence: nextWhat.trim(), by: nextBy.trim() })
      return
    }
    if (licence) onFontLicence(family, null)
  }
  if (settled)
    return (
      <span className="byd-fonts-licence" data-settled="true">
        <input aria-label={t('fonts.licence.of', { family })} value={licence?.licence ?? ''} title={licence?.licence} readOnly />
        <input aria-label={t('fonts.by.of', { family })} value={licence?.by ?? ''} title={licence?.by} readOnly />
      </span>
    )
  return (
    <span className="byd-fonts-licence">
      <input aria-label={t('fonts.licence.of', { family })} placeholder={t('fonts.licence')} value={what} onChange={(e) => setWhat(e.target.value)} onBlur={() => write(what, by)} />
      <input aria-label={t('fonts.by.of', { family })} placeholder={t('fonts.by')} value={by} onChange={(e) => setBy(e.target.value)} onBlur={() => write(what, by)} />
    </span>
  )
}
