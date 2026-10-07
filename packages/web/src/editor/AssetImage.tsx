import { createContext, useContext, type ImgHTMLAttributes } from 'react'
import { assetUrl } from './assets.js'

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
export function AssetImage({ base, hash, ...rest }: { base: string; hash: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const early = useArriving(hash)
  return <img {...rest} {...(early ? { 'data-arriving': 'true' } : { src: assetUrl(base, hash) })} />
}
