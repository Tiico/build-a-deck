import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { WHOLE_PICTURE, pictureNameOf, showsWholePicture, type AssetCrop } from '@byd/protocol'
import { croppedMotif, type Motif } from '@byd/template'
import { titleOfRow } from '@byd/server/doc'
import type { ProjectDoc } from './types.js'
import { assetUrl, mediaInGame, previewIcons } from './assets.js'
import { DropSays, dropSurface } from './dropping.js'
import { Crop } from './Crop.js'
import { Question } from './Question.js'
import { previewFonts } from './fonts.js'
import { CardPreview } from './CardPreview.js'
import { FaceSwitch } from './TemplateCanvas.js'
import { facesDrawing, faceOrder } from './media-faces.js'
import { useFocusTrap } from './focusTrap.js'
import type { Key } from '../i18n/index.js'
import { useT } from '../i18n/index.js'

// The media library (#222, L22, prototype A · egen flik). Every picture the game holds, in one
// place, so that finding one and tidying one are the same errand. The card table shows the
// pictures that are in use and nothing else; a library that only listed those would have nothing
// to tidy.
//
// A picture is called what its file was called (beslut 6), because that is the one thing about a
// content-addressed picture that only the moment of upload knows. The pictures a game already held
// have no name, and they go on being named by the cards drawn from them — the same sentence the
// card table's own strip uses — while a picture no card uses says exactly that instead.
//
// A picture is brought into the game from here (beslut 5), and the one that has just arrived is
// the one in the crop window — which is what makes «beskärning både vid uppladdning och i
// biblioteket» true in one place rather than two. This reverses what steg 1 decided out loud
// («ingenting laddas upp härifrån»), deliberately and on the requester's own say-so: since the
// crop follows the picture (beslut 2), cropping at upload and cropping in the library are the
// same act on the same thing, and a second surface for it could only disagree with this one.
//
// None of which loosens what steg 1 was defending. A picture already in the game is a hash, and
// putting it on ninety more cards writes that hash into ninety cells: the same bytes, stored once,
// however many cards are drawn from them (E1). That is the whole answer to "samma fil laddas upp
// igen så fort någon glömmer att den redan finns" — the same file handed over twice is one
// picture, because a picture is its bytes.
//
// The crop is cut here (beslut 2): a picture is cropped once and every card drawn from it shows
// that window, which is what makes a library worth having rather than a hundred and fifty-four
// drags. Beside the window stands the card itself, through the compiler the table and the printer
// use — so what is judged is the card and not a drawing of one.
export type MediaPanelProps = {
  doc: ProjectDoc
  assetBase: string
  // What is drawn inside each of the deck's pictures (E1), keyed by the URL a resolved row
  // carries. The card beside the crop needs them for the same reason every other preview does,
  // and the file's own size is what turns a window in shares into one in pixels.
  motifs?: Record<string, Motif> | undefined
  // The window this picture is looked at through, for every card drawn from it. `null` is the
  // picture going back to whole.
  onCrop?: ((hash: string, crop: AssetCrop | null) => void) | undefined
  // A picture brought in from the designer's own disk (beslut 5). It answers with the hash the
  // bytes were filed under, which is the picture the window then opens on.
  onAdd?: ((file: File) => Promise<string>) | undefined
  // A picture taken out of the game (#318): the project's reference to it, and every picture
  // cell that held it, in one step.
  onRemove?: ((hash: string) => void) | undefined
  // The pictures whose crop is on its way to the actor and not yet echoed back (#297, L33). The
  // status may not say the server has a window it has not confirmed, and this is the only
  // truthful word on that: the client holds every edit until the echo lands.
  saving?: readonly string[] | undefined
}

// How many cards the question names before it counts the rest: enough to recognise what is
// about to lose its picture, and few enough that the sentence is still one sentence.
export const NAMED_CARDS = 5

// Vad en fil i en batch blev: en bild i spelet, eller ett skäl till att den inte blev det (#291).
type Named = { name: string; named: boolean }
type Result = (Named & { hash: string }) | (Named & { why: string })

export function MediaPanel({ doc, assetBase, motifs, onCrop, onAdd, onRemove, saving = [] }: MediaPanelProps) {
  const t = useT()
  const said = useId()
  const media = mediaInGame(doc)
  // The picture about to leave the game (#318), while the question about it stands. A picture no
  // card uses goes without a question; one that cards use is asked about, with the cards named,
  // and the focus goes back to the control that asked when the question closes either way.
  const [leaving, setLeaving] = useState<string | null>(null)
  const removeRefs = useRef(new Map<string, HTMLButtonElement>())
  const [refocus, setRefocus] = useState<string | null>(null)
  useEffect(() => {
    if (refocus === null) return
    removeRefs.current.get(refocus)?.focus()
    setRefocus(null)
  }, [refocus])
  // The template is a user too (#320): a picture it carries by itself is asked about as one on
  // cards is, and the question names the template among what loses it.
  const remove = (hash: string, cards: readonly string[], template: boolean) => {
    if (cards.length === 0 && !template) onRemove?.(hash)
    else setLeaving(hash)
  }
  const asked = leaving === null ? undefined : media.find((m) => m.hash === leaving)
  // The picture in hand: the one whose crop is open as a sheet over the library (#297, L33). A
  // library opens on nothing — the sheet is opened from a tile, or by the picture that has just
  // arrived — and a picture that leaves the game takes the sheet with it.
  const [picked, setPicked] = useState<string | null>(null)
  // Utom efter en batch (#291, flerfilsbeslutet). Då är biblioteksöversikten det som visas och
  // ingen bild är öppnad: fem filer har ingen bild som är *den* bilden, och att välja åt
  // formgivaren efter nätverkets färdigordning vore det mest godtyckliga valet av alla. Så länge
  // översikten står är ingenting i handen, och det första hon rör vid avslutar den.
  const [overview, setOverview] = useState(false)
  const inHand = overview || picked === null ? undefined : media.find((m) => m.hash === picked)
  const chosen = inHand?.hash ?? null
  // Vad den senaste batchen blev, fil för fil, och vilka bilder som är nyss tillagda. Båda är
  // tillfällig återkoppling om en handling och inget dokumentet bär: en märkning som överlevde
  // omladdningen vore en påstådd egenskap hos bilden, och «nyss» är ingen egenskap hos en bild.
  const [batch, setBatch] = useState<Result[] | null>(null)
  const [fresh, setFresh] = useState<readonly string[]>([])
  // Om ett drag står över bibliotekets bildyta just nu.
  const [over, setOver] = useState(false)
  // Handen läggs på översikten, av samma skäl som den läggs på beskärningsrutan efter en enda
  // bild: det som visas måste kunna nås av den som inte ser skärmen.
  const overviewRef = useRef<HTMLElement | null>(null)
  // Raised before the batch is put into state and lowered by the first commit that has the
  // overview on the page: a commit may land between the two (#297 found one), and a flag that
  // was spent on it would leave the hand where it was.
  const landing = useRef(false)
  useEffect(() => {
    if (!landing.current || !overviewRef.current) return
    landing.current = false
    overviewRef.current.focus()
  })
  // Att öppna en bild avslutar översikten och dess återkoppling: formgivaren har gått vidare, och
  // en märkning som står kvar efter det säger något om biblioteket i stället för om handlingen.
  const open = (hash: string) => {
    setPicked(hash)
    setOverview(false)
    setBatch(null)
    setFresh([])
  }
  // The window being cut, which is not the same thing as the window that is stored: a drag is
  // hundreds of positions and one edit, and the card beside has to follow every one of them.
  // Held by the picture it belongs to, so choosing another picture shows that one's own window.
  const [drafted, setDrafted] = useState<{ hash: string; crop: AssetCrop } | null>(null)
  const stored = chosen === null ? undefined : doc.pictures?.[chosen]?.crop
  const window_ = drafted?.hash === chosen ? drafted.crop : (stored ?? WHOLE_PICTURE)
  // What a picture is called (beslut 6): the file it came from, where that was kept, and
  // otherwise what has always been the only truthful thing to say about a content-addressed
  // picture — which cards are drawn from it, or that none is. A deck made before names therefore
  // reads exactly as it did.
  const nameOf = (hash: string, cards: readonly string[]): string =>
    doc.pictures?.[hash]?.name ?? (cards.length === 0 ? t('media.picture.unused') : t('table.image.alt', { cards: cards.join(', ') }))
  const cut = (crop: AssetCrop, settled: boolean) => {
    if (chosen === null) return
    setDrafted({ hash: chosen, crop })
    if (settled) onCrop?.(chosen, crop)
  }
  // A picture on its way in, and what the library says about how it went. The word is said in a
  // live region because an upload takes as long as a network takes: a designer who cannot see the
  // grid has nothing else to tell her that the picture arrived — or that it did not.
  const [note, setNote] = useState<string | null>(null)
  // The window the arriving picture opens in. A hand is put on it rather than merely a highlight,
  // because "opens in the crop window" has to be true for a keyboard too; the picture chosen is
  // not yet drawn when the upload answers, so the focus is taken on the render after it.
  const handle = useRef<HTMLDivElement | null>(null)
  const opening = useRef(false)
  useEffect(() => {
    if (!opening.current) return
    opening.current = false
    handle.current?.focus()
  })
  const take = async (files: readonly File[], input?: HTMLInputElement): Promise<void> => {
    // Cleared at once, so that choosing the same file again is a choice and not a silence: an
    // input that still holds it fires nothing the second time.
    if (input) input.value = ''
    if (files.length === 0 || !onAdd) return
    setNote(null)
    // En fil i taget, färdig innan nästa börjar (#291, #339). En fil som faller bort hindrar
    // ingen annan, och ordningen är den formgivaren lämnade dem i — aldrig den ordning nätverket
    // råkade bli klart i.
    //
    // Ordningsföljden var en gång också det som höll dokumentet rent: sedan #339 läggs bilden in
    // med en gest av sitt eget innan bytena reser, och `callOff` tar bara tillbaka den gest som
    // fortfarande är öppen, så två uppladdningar som överlappade upphävde varandras ångerväg och
    // bilden som aldrig kom fram blev kvar. Det felet är lagat i klienten (#344, L37): en
    // uppladdning som faller bort tas ur dokumentet vems gest som än är öppen. Sekventialiteten
    // står kvar av sina egna skäl — ordningen i listan, och en fil som redan finns i dokumentet
    // som annars kunde se en bild vars byte ännu inte rest och rapporteras som tillagd fast
    // tjänsten sade nej.
    const landed: Result[] = []
    for (const file of files) {
      // Vad filen heter, med bibliotekets egen regel om vad ett filnamn är (beslut 6) — och
      // filens råa namn kvar, för en fil vars namn inte blev något är ändå en rad i listan.
      const name = pictureNameOf(file.name)
      const said = { name: name ?? file.name, named: name !== undefined }
      try {
        landed.push({ ...said, hash: await onAdd(file) })
      } catch (err) {
        // A picture that did not arrive is said in the same place the arrival is, and it is
        // said rather than thrown: an upload can fail on a dropped line or a file the gate
        // refuses, and an unhandled rejection is not a way to tell a designer that her picture
        // is too big.
        landed.push({ ...said, why: err instanceof Error ? err.message : String(err) })
      }
    }
    // En enda fil behåller sitt beteende: den öppnas i beskärningsrutan, för det är den bilden
    // formgivaren just bad om. Det avgörs av hur många filer hon lämnade och inte av hur många
    // uppladdningar som råkade lyckas.
    const only = files.length === 1 ? landed[0] : undefined
    if (only) {
      if ('hash' in only) {
        setPicked(only.hash)
        setOverview(false)
            setDrafted(null)
        opening.current = true
        setNote(only.named ? t('media.add.done', { name: only.name }) : t('media.add.done.unnamed'))
      } else setNote(only.why)
      return
    }
    const arrived = landed.filter((one) => 'hash' in one)
    landing.current = true
    setBatch(landed)
    setNote(t('media.add.batch', { ok: arrived.length, n: landed.length }))
    // Ingen enda kom fram: då finns ingen översikt att visa, och den vy formgivaren stod i står
    // kvar med filfelen bredvid sig.
    if (arrived.length === 0) return
    setFresh(arrived.map((one) => one.hash))
    setOverview(true)
    setDrafted(null)
  }
  return (
    <div className="byd-media" data-media-panel>
      {/* The library, and nothing of it reachable while the sheet lies over it (L33): a Tab that
          walked out of the sheet into a tile would be a Tab into a surface the sheet has
          covered. */}
      <section className="byd-media-library" inert={chosen !== null}>
        <div className="byd-media-head">
          <h2>{t('media.title')}</h2>
          {/* The way in (beslut 5). A label around an off-screen input, which is how every other
              file is chosen in this tool: a tab stop with a name, so the picture can be brought in
              without a pointer. */}
          {onAdd && (
            <label className="byd-secondary byd-media-add">
              {t('media.add')}
              <input className="byd-offscreen" type="file" accept="image/*" multiple aria-label={t('media.add')} onChange={(event) => void take([...(event.target.files ?? [])], event.target)} />
            </label>
          )}
        </div>
        {onAdd && (
          <p className="byd-media-said" role="status">
            {note ?? ''}
          </p>
        )}
        {/* Resultatet per fil (#291). En lyckad rad är en väg till sin bild och inte bara ett
            kvitto: i ett bibliotek med trehundra bilder är «den är tillagd» inget svar på var
            den hamnade. Ingen av dem öppnas av sig själv; det är formgivaren som väljer. */}
        {batch && (
          <section
            className="byd-media-batch"
            role="group"
            aria-label={t('media.add.results')}
            tabIndex={-1}
            ref={(el) => {
              overviewRef.current = el
            }}
          >
            <ul>
              {batch.map((one, at) => (
                <li key={`${one.name}-${at}`} data-result={'hash' in one ? 'ok' : 'failed'}>
                  {'hash' in one ? (
                    <button type="button" onClick={() => open(one.hash)}>
                      {t('media.add.result.ok', { name: one.name })}
                    </button>
                  ) : (
                    // Beskedet är hela raden. Sedan #344 namnger det självt bilden som togs bort
                    // igen (L37), så ett filnamn före det hade sagt samma namn två gånger.
                    one.why
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {asked && onRemove && (
          <Question
            className="byd-media-question"
            label={t('media.remove.of', { name: nameOf(asked.hash, asked.cards) })}
            confirm={t('media.remove.yes')}
            cancel={t('editor.cancel')}
            onConfirm={() => {
              onRemove(asked.hash)
              setLeaving(null)
              // The control that asked goes with the picture, so the hand is put on the nearest
              // one still standing rather than dropped on the page.
              setRefocus(media.find((m) => m.hash !== asked.hash)?.hash ?? null)
            }}
            onCancel={() => {
              setLeaving(null)
              setRefocus(asked.hash)
            }}
          >
            {t(removeQuestion(asked), {
              name: nameOf(asked.hash, asked.cards),
              n: asked.cards.length,
              cards: namedCards(asked.cards, t),
            })}
          </Question>
        )}
        {/* Hela bibliotekets bildyta tar emot bildfiler (#291, variant B). Ingen egen släppruta
            vid sidan av rutnätet: den skulle vara en andra plats att sikta på för en handling som
            redan har en, och ett tomt bibliotek skulle då ha två tomma rutor. Rutnätet håller sin
            golvhöjd och sin kant även när det är tomt, så det finns alltid en yta att träffa —
            och filvalsknappen står kvar i krönet, för tangentbordets skull. */}
        <ul
          aria-label={t('media.title')}
          {...dropSurface({
            className: 'byd-media-grid',
            over,
            onOver: setOver,
            onFiles: (files) => void take(files),
          })}
        >
          {over && (
            <li className="byd-media-empty">
              <DropSays many />
            </li>
          )}
          {media.length === 0 && !over && <li className="byd-media-empty">{t('media.empty')}</li>}
          {media.map(({ hash, cards, template }) => {
            const spare = cards.length === 0 && !template
            // What is stored, not what is being dragged: the tile says how the picture stands in
            // the game, and the window on its way somewhere is shown where it is being cut.
            const cropped = doc.pictures?.[hash]?.crop
            return (
              <li key={hash} data-asset={hash} {...(spare ? { 'data-unused': 'true' } : {})} {...(fresh.includes(hash) ? { 'data-new': 'true' } : {})}>
                <button
                  type="button"
                  className="byd-media-tile byd-choice"
                  aria-haspopup="dialog"
                  aria-describedby={`${said}-${hash}${cropped || saving.includes(hash) ? ` ${said}-${hash}-mark` : ''}`}
                  onClick={() => open(hash)}
                >
                  {/* The library is the editor's densest surface: a game of real size brings
                      three hundred pictures to it, and fetching them all the moment the tab
                      opens is three hundred requests in one breath. The ones below the fold
                      wait until they are to be seen. */}
                  <span className="byd-media-tile-shot">
                    <img loading="lazy" src={assetUrl(assetBase, hash)} alt={nameOf(hash, cards)} />
                    {/* A cropped picture says so where it is looked over, rather than only where
                        it is opened: what has been done to a picture is half of what a library
                        is for. An uncropped one wears nothing, so the mark means something. */}
                    {cropped && (
                      <u data-window style={{ left: `${cropped.x * 100}%`, top: `${cropped.y * 100}%`, width: `${cropped.w * 100}%`, height: `${cropped.h * 100}%` }} />
                    )}
                  </span>
                </button>
                {/* The mark (L33): a cropped picture says so on the tile, in words and not only
                    in the lit window, because the tile is all there is of the picture once the
                    sheet is closed — and it says «sparas» rather than «beskuren» while the actor
                    has not yet confirmed the window. */}
                {(cropped || saving.includes(hash)) && (
                  <small id={`${said}-${hash}-mark`} className="byd-media-mark" data-state={saving.includes(hash) ? 'saving' : 'saved'}>
                    {saving.includes(hash) ? t('media.crop.mark.saving') : t('media.crop.mark')}
                  </small>
                )}
                {/* Marked, never purged (L22, beslut 4): an older version of the deck may still
                    be drawn from these bytes, so the library says nobody uses it and leaves it
                    where it is. */}
                <small id={`${said}-${hash}`}>{spare ? t('media.unused') : cards.length === 0 ? t('media.byTemplate') : t(cards.length === 1 ? 'wall.cards.one' : 'wall.cards.other', { n: cards.length })}</small>
                {/* And the template, where it is a user beside the cards (#320). */}
                {template && cards.length > 0 && <small className="byd-media-template">{t('media.byTemplate')}</small>}
                {/* Nyss tillagd, i ord och inte bara i färg: uppladdning, klart och fel ska gå
                    att skilja åt utan att se skillnad på två toner (L13). */}
                {fresh.includes(hash) && <small className="byd-media-new">{t('media.new')}</small>}
                {onRemove && (
                  <button
                    type="button"
                    className="byd-media-remove"
                    ref={(el) => {
                      if (el) removeRefs.current.set(hash, el)
                      else removeRefs.current.delete(hash)
                    }}
                    aria-label={t('media.remove.of', { name: nameOf(hash, cards) })}
                    onClick={() => remove(hash, cards, template)}
                  >
                    {t('media.remove')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
      {/* The picture in hand, as a sheet over the library (L33): the window being cut, the card
          it lands on, and «Klart» back to the library. */}
      {chosen !== null && inHand && onCrop && (
        <Cropping
          doc={doc}
          assetBase={assetBase}
          motifs={motifs}
          hash={chosen}
          name={nameOf(chosen, inHand.cards)}
          cards={inHand.cards}
          template={inHand.template}
          crop={window_}
          stored={stored}
          saving={saving.includes(chosen)}
          handle={handle}
          onCut={cut}
          onWhole={() => {
            setDrafted(null)
            onCrop(chosen, null)
          }}
          onDone={() => {
            setPicked(null)
            setDrafted(null)
          }}
        />
      )}
    </div>
  )
}

// Which question is asked when a picture goes (#318, #320): the cards that lose it, the template
// that loses it, or both — each said as a sentence rather than as a count of things.
function removeQuestion(asked: { cards: readonly string[]; template: boolean }): 'media.remove.question' | 'media.remove.question.one' | 'media.remove.question.template' | 'media.remove.question.template.one' | 'media.remove.question.template.cards' {
  if (asked.template) return asked.cards.length === 0 ? 'media.remove.question.template' : asked.cards.length === 1 ? 'media.remove.question.template.one' : 'media.remove.question.template.cards'
  return asked.cards.length === 1 ? 'media.remove.question.one' : 'media.remove.question'
}

// The cards a question names: the first few by name, and the rest counted. A game of real size
// puts a picture on ninety cards, and ninety names are not a sentence anyone reads before
// answering.
function namedCards(cards: readonly string[], t: ReturnType<typeof useT>): string {
  const named = cards.slice(0, NAMED_CARDS).join(', ')
  return cards.length > NAMED_CARDS ? t('media.remove.more', { cards: named, n: cards.length - NAMED_CARDS }) : named
}

// What each state of the crop is marked with, beside its words (L33).
const STATUS_MARK = { whole: '▢', saving: '⟳', saved: '✓' } as const
const sameCrop = (a: AssetCrop, b: AssetCrop): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

// The sides in the words that fit beside one large card (#295): the same control the template's
// crown uses, said short.
const FACE_SHORT: Record<string, Key> = { front: 'media.face.front', back: 'media.face.back' }

// The picture in hand, and what the deck sees of it: a sheet over the library (#297, L33). The
// window on the left is the whole file with the crop lit over it; the card beside it is that crop
// arriving where it is going; «Klart» is the way back. The sheet is a window in the keyboard's
// sense too — the focus goes in on open, is held there, and goes back to the opener on close — by
// the one trap the editor has (#296), and Escape closes it as «Klart» does: the change was applied
// when the handle was released, so there is nothing a close could discard.
//
// The card is a real compile and not a drawing of a card (E2): the same `compile` the table's
// textures and the print PDF come out of, handed the very window the designer is dragging. A
// second way of showing "what lands on the card" is a second way of being wrong about it.
function Cropping({
  doc,
  assetBase,
  motifs,
  hash,
  name,
  cards,
  template,
  crop,
  stored,
  saving,
  handle,
  onCut,
  onWhole,
  onDone,
}: {
  doc: ProjectDoc
  assetBase: string
  motifs: Record<string, Motif> | undefined
  hash: string
  name: string
  // The cards drawn from the picture, in deck order — the library's own count of them — and
  // whether the template carries the picture by itself (#320).
  cards: readonly string[]
  template: boolean
  crop: AssetCrop
  stored: AssetCrop | undefined
  // Whether the actor has yet to echo this picture's crop.
  saving: boolean
  handle: RefObject<HTMLDivElement | null>
  onCut(crop: AssetCrop, settled: boolean): void
  onWhole(): void
  onDone(): void
}) {
  const t = useT()
  const id = useId()
  const box = useRef<HTMLElement | null>(null)
  // Where the crop stands (L33): the whole picture and nothing stored; changed — on its way
  // under the pointer, or sent and not yet echoed; or stored and confirmed, with the share of the
  // picture it shows. The middle one is the point: it must never look like the last.
  const state: 'whole' | 'saving' | 'saved' = saving || !sameCrop(crop, stored ?? WHOLE_PICTURE) ? 'saving' : stored === undefined ? 'whole' : 'saved'
  // The hand lands on the window itself: that is what the sheet was opened to move.
  useFocusTrap(box, { onEscape: onDone, initial: () => handle.current })
  const url = assetUrl(assetBase, hash)
  // The type the game is pinned to (B3), so the card beside the window is set the way it prints.
  const fonts = useMemo(() => previewFonts(doc, assetBase), [doc, assetBase])
  // A picture nothing has measured has no size here either, and the window is then laid over a
  // box of the commonest shape rather than over a claim about the file.
  const file = motifs?.[url]
  // The card the picture is judged on (#295): one of the cards drawn from it, the first in deck
  // order until the designer picks another. Her pick is held by the picture it was made for, so
  // opening another picture starts from that picture's own first card — and a pick that no
  // longer uses the picture falls back the same way. Picking changes what is looked at and
  // nothing else: no cell, no marking in Data, no document.
  //
  // A picture the template carries by itself is on every card, so the deck's first card stands
  // for it. A picture nothing uses gets no card and no example template (beslut 2026-09-20): a
  // card invented to show it would be a claim about where it goes, and it goes nowhere yet.
  const [picked, setPicked] = useState<{ hash: string; card: string } | null>(null)
  const using = doc.rows.filter((row) => cards.includes(row.id))
  const on = (picked?.hash === hash ? using.find((row) => row.id === picked.card) : undefined) ?? using[0] ?? (template ? doc.rows[0] : undefined)
  const row = on?.fields
  // Found by name (#295): the deck's own title, and the row's id where the title is empty or
  // shared, so two «Skog» can be told apart. Ninety cards are a list to search, not to scroll.
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const titled = using.map((r) => ({ row: r, title: titleOfRow(r) }))
  const ambiguous = (r: ProjectDoc['rows'][number], title: string): boolean => title === r.id || titled.some((o) => o.row.id !== r.id && o.title === title)
  const found = needle === '' ? titled : titled.filter(({ row: r, title }) => title.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle))
  // Which side the card is shown from (#295, variant A). The side that draws the picture on this
  // very card — the front when both do — unless the designer has turned it over herself; her
  // turn holds while she keeps cropping this picture on this card, and another picture or card
  // starts over from where that one is drawn.
  const faces = faceOrder(doc)
  const drawnOn = on ? facesDrawing(doc, on, hash) : []
  // A card whose data points at the picture but whose template draws it on no side is not a use
  // of it, and is said to be that rather than drawn as one: the card would show no picture, and
  // a preview of that is a preview of nothing.
  const undrawn = on !== undefined && drawnOn.length === 0
  const [turned, setTurned] = useState<{ hash: string; card: string | undefined; face: string } | null>(null)
  const shown = turned && turned.hash === hash && turned.card === on?.id ? turned.face : (drawnOn[0] ?? faces[0] ?? null)
  const face = shown === null || undrawn ? undefined : doc.template.faces[shown]
  return (
    <section ref={box} className="byd-media-crop byd-media-sheet" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <header className="byd-media-sheet-head">
        <h2 id={`${id}-title`}>{t('media.crop')}</h2>
        <span className="byd-media-sheet-name">{name}</span>
        <button type="button" className="byd-secondary byd-media-sheet-done" onClick={onDone}>
          {t('media.crop.done')}
        </button>
      </header>
      {/* Beslut 2 said where the crop belongs; this is that decision said out loud, where the
          designer is about to act on it. Without it the window looks like something done to this
          one card, which is the very thing the library exists to stop being true. */}
      <p className="byd-media-crop-lead">{t('media.crop.lead')}</p>
      <div className="byd-media-sheet-work">
        <Crop
          url={url}
          ratio={file && file.h > 0 ? file.w / file.h : 3 / 2}
          crop={crop}
          onChange={onCut}
          handle={handle}
          status={
            <div className="byd-media-crop-row">
              <p role="status" className="byd-crop-status" data-state={state}>
                <i aria-hidden="true">{STATUS_MARK[state]}</i> {state === 'saved' ? t('media.crop.status.saved', { p: Math.round(crop.w * crop.h * 100) }) : t(state === 'saving' ? 'media.crop.status.saving' : 'media.crop.status.whole')}
              </p>
              <button type="button" className="byd-secondary" disabled={stored === undefined} onClick={onWhole}>
                {t('media.crop.whole')}
              </button>
            </div>
          }
        />
        <div className="byd-media-sheet-card">
          {on === undefined && <p className="byd-media-crop-note">{t('media.crop.unused')}</p>}
          {/* Which card, before which side (variant A): only where there is a choice to make; a lone
              card is named and not chosen. */}
          {titled.length === 1 && <p className="byd-media-crop-on">{titled[0]?.title}</p>}
          {using.length > 1 && (
            <div className="byd-media-cards" role="group" aria-label={t('media.crop.cards')}>
              <input type="search" aria-label={t('media.crop.cards.search')} placeholder={t('media.crop.cards.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
              {found.length === 0 ? (
                <p className="byd-media-cards-none">{t('media.crop.cards.none')}</p>
              ) : (
                <ul>
                  {found.map(({ row: r, title }) => (
                    <li key={r.id}>
                      <button type="button" className="byd-choice" aria-pressed={r.id === on?.id} onClick={() => setPicked({ hash, card: r.id })}>
                        {title}
                        {ambiguous(r, title) && title !== r.id && <small>{r.id}</small>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {undrawn && <p className="byd-media-crop-note">{t('media.crop.notDrawn')}</p>}
          {face && row && shown !== null && faces.length > 1 && <FaceSwitch faces={faces} face={shown} names={FACE_SHORT} onSelect={(f) => setTurned({ hash, card: on?.id, face: f })} />}
          {face && row && (
            <figure className="byd-media-crop-card">
              <CardPreview
                id="byd-crop-card"
                fonts={fonts}
                face={face}
                row={row}
                icons={previewIcons(doc, assetBase)}
                assetBase={assetBase}
                // A window that shows all of the picture is not a crop, here either: the card then
                // gets the measurement untouched, air and all, exactly as it will when it is printed.
                motifs={file && !showsWholePicture(crop) ? { ...motifs, [url]: croppedMotif(file, crop) } : motifs}
                palette={doc.palette}
                // One large card (variant A): the card column is 240–320 px and the card at its own
                // size is 238, so the judgement is made on a card and not on a thumbnail of one.
                scale={1}
              />
              <figcaption>{t('media.crop.card')}</figcaption>
            </figure>
          )}
        </div>
      </div>
    </section>
  )
}
