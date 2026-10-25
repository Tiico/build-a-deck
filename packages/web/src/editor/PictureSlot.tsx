import { useState, type KeyboardEvent } from 'react'
import { useT } from '../i18n/index.js'
import { AssetImage } from './AssetImage.js'
import { DropSays, dropSurface } from './dropping.js'
import { useWithheld } from './withheld.js'

// Bildrutan (L75): the one way a card's picture is shown and changed in Tabell. The cell and the
// marked cards' field used to build the same thing by hand twice — a thumbnail, a drop surface,
// «Välj», «Ladda upp» and a × — and the prototype in `docs/ux-audits/2026-10-22-bildrutan.md`
// chose the form where the tile is the whole control (variant A).
//
// The tile is one button. A press opens the library (#296), which already takes a file in its
// crown (L22) and clears the card from its foot; so the cell holds nothing but the picture, and a
// row of three hundred cards is three hundred tab stops in this column and not nine hundred.
// Backspace and Delete on a tile that holds a picture clear it, as they clear any field.
//
// What the slot takes is what the surface it stands on took before (#291): a picture dragged out
// of the strip above the table, by its hash and without a new upload (E1), and a file off the
// disk, which the owner uploads — and says the outcome of where it says every upload's outcome.
// The slot owns its own answer to whether a drag stands over it, so a drop can never change
// another target.
//
// A reader's table (#489) draws the picture and nothing that can change it: no button, no drop.
//
// A picture blocked after a report (#1274, beslut 1) is drawn as the word «Spärrad» on a hatched
// ground, never as an empty tile that reads as a picture that failed to load; and a press asks the
// table to say why (`onWithheld`) rather than opening the library, where the reasons and «Byt bilden»
// stand together.
export type PictureSlotProps = {
  // What the group is called: «Bild för knight».
  label: string
  // What a press does, which is the tile's name: choose while it is empty, replace while it holds
  // a picture.
  choose: string
  replace: string
  // The picture's own name, as every other thumbnail of it is named.
  alt: string
  base: string
  // The hash the field holds, or nothing.
  value: string | null
  // Text from when the column was text (#1085): not a picture and not drawn as one, but not gone.
  kept?: string | undefined
  onChoose(): void
  // A picture the game already has, dropped on the slot.
  onPick(hash: string): void
  // Files dropped on the slot. The owner decides what one slot takes of several (#291).
  onFiles(files: File[]): void
  onClear(): void
  reading?: boolean | undefined
  // Out of the tab order in a row the hand is not standing in (#575).
  tabIndex?: number | undefined
  // Which card the slot belongs to, for the surfaces that find a cell by its card.
  cellRef?: string | undefined
  // A press on a blocked picture (#1274): where the table says why. Without it a press opens the
  // library as for any picture.
  onWithheld?: (() => void) | undefined
  // Whether the table is saying why right now, for the tile to say it is open.
  explaining?: boolean | undefined
}

export function PictureSlot({ label, choose, replace, alt, base, value, kept, onChoose, onPick, onFiles, onClear, reading = false, tabIndex, cellRef, onWithheld, explaining = false }: PictureSlotProps) {
  const t = useT()
  const [over, setOver] = useState(false)
  const has = value !== null
  const withheld = useWithheld(value) !== undefined
  const inner = withheld ? <span className="byd-picture-withheld">{t('picture.blocked')}</span> : has ? <AssetImage base={base} hash={value} alt={alt} /> : kept !== undefined ? <s className="byd-data-kept">{kept}</s> : <span aria-hidden="true">+</span>
  const asks = withheld && onWithheld !== undefined
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!has || (event.key !== 'Backspace' && event.key !== 'Delete')) return
    event.preventDefault()
    onClear()
  }
  return (
    <div
      role="group"
      aria-label={label}
      {...(cellRef !== undefined ? { 'data-image-cell': cellRef } : {})}
      {...(reading ? { className: 'byd-picture-slot' } : dropSurface({ className: 'byd-picture-slot', over, onOver: setOver, onFiles, onLibrary: onPick }))}
    >
      {reading ? (
        <span className="byd-picture-tile" {...(has ? { 'data-has': 'true' } : {})} {...(withheld ? { 'data-withheld': 'true' } : {})}>
          {inner}
        </span>
      ) : (
        <button
          type="button"
          className="byd-picture-tile"
          {...(has ? { 'data-has': 'true' } : {})}
          {...(withheld ? { 'data-withheld': 'true' } : {})}
          aria-label={asks ? t('picture.blocked.label') : has ? replace : choose}
          {...(asks ? { 'aria-expanded': explaining } : { 'aria-haspopup': 'dialog' as const })}
          {...(tabIndex !== undefined ? { tabIndex } : {})}
          onClick={asks ? onWithheld : onChoose}
          onKeyDown={onKeyDown}
        >
          {inner}
        </button>
      )}
      {over && <DropSays />}
    </div>
  )
}
