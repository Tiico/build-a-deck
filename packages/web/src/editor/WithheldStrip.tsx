import { useLayoutEffect, useRef } from 'react'
import { useLang, useT } from '../i18n/index.js'
import { RefreshGlyph } from '../glyphs.js'
import { dayWord } from './when.js'
import type { Block } from './withheld.js'

// Why a picture is blocked (#1274, beslut 1): the L9 strip in Tabell's foot, where a row's × asks
// (L58), opened by a press on the tile that says «Spärrad». It says who reported and when a person
// decided, what the block means and how to object, which is to reply to the mail; and it has the one
// thing to do about it, «Byt bilden», which opens the library for the card as the tile does for any
// other picture. Nothing in it can be lost, so it opens on «Byt bilden» and Escape closes it.
export function WithheldStrip({ block, onSwap, onClose }: { block: Block; onSwap(): void; onClose(): void }) {
  const t = useT()
  const { lang } = useLang()
  const first = useRef<HTMLButtonElement | null>(null)
  useLayoutEffect(() => first.current?.focus(), [])
  const why = t(`picture.blocked.${block.reason}`, { date: dayWord(block.at, Date.now(), lang, t) })
  return (
    <div
      className="byd-data-bulk"
      data-withheld=""
      role="dialog"
      aria-label={t('picture.blocked.title')}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onClose()
      }}
    >
      <p>
        {t('picture.blocked.title')}
        <small>
          {why} {t('picture.blocked.what')}
        </small>
      </p>
      <button ref={first} type="button" onClick={onSwap}>
        <RefreshGlyph />
        {t('picture.blocked.swap')}
      </button>
      <button type="button" onClick={onClose}>
        {t('picture.blocked.close')}
      </button>
    </div>
  )
}
