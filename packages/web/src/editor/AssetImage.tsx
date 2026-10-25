import { createContext, useContext, type ImgHTMLAttributes } from 'react'
import { useT } from '../i18n/index.js'
import { assetUrl } from './assets.js'
import { useWithheld } from './withheld.js'

// The assets whose bytes are still on their way to the service, by hash (#907): the client's
// `assetsArriving`, handed down by the editor. A picture is in the document before its bytes are
// (#339), and a surface that asks for them early gets a 404 and keeps it — a broken picture that
// stays broken after the bytes came. Outside an editor nothing is ever on its way.
export const Arriving = createContext<ReadonlySet<string>>(new Set())

// Whether the bytes behind a hash are still on their way.
export function useArriving(hash: string): boolean {
  return useContext(Arriving).has(hash)
}

// One of the project's pictures, asked of the service only once it holds the bytes (#907). Until
// then the image has no source and draws nothing — not the browser's broken-picture glyph — but
// keeps its `alt`, so whatever it names is named the same while it waits; and the moment the
// bytes land it asks once, and gets them.
//
// A picture blocked after a report (#1274) is never asked for either: where a thumbnail of it stands
// — the strip over the table, Media, the history — the word «Spärrad» stands in its place, named as
// the picture is, so it never reads as a picture that failed to load.
export function AssetImage({ base, hash, ...rest }: { base: string; hash: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const t = useT()
  const early = useArriving(hash)
  if (useWithheld(hash)) return <span className="byd-picture-withheld" role="img" aria-label={rest.alt ?? t('picture.blocked')} data-withheld="true">{t('picture.blocked')}</span>
  return <img {...rest} {...(early ? { 'data-arriving': 'true' } : { src: assetUrl(base, hash) })} />
}

// A thumbnail of one of the project's pictures (#1257): the whole picture, fitted inside a box the
// surface sizes, on the ground every thumbnail stands on.
export function Thumb(props: Parameters<typeof AssetImage>[0]) {
  return (
    <span className="byd-thumb">
      <AssetImage {...props} />
    </span>
  )
}
