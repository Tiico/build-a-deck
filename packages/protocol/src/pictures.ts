import { z } from 'zod'

// What the game knows about one of its own pictures (#222, L22).
//
// A picture in this tool has no name and no row anywhere: it is bytes, and the only thing it
// answers to is the hash of those bytes. Everything the deck has ever said about a picture it has
// therefore said about a *use* of it — which cell it sits in, what one card asks of it. The crop
// is the first thing that is true of the picture itself, whoever draws from it, so it needs a
// place of its own to be said in.
//
// That place is a record and not a field. A crop is what there is to say today; a picture will
// have more to answer for — what the file was called, who drew it, what licence it came under —
// and each of those is a property of the same picture. Keeping them in one record keyed by the
// hash means the next one is a field added here, which every document already written reads back
// unchanged, rather than a second map beside this one and a second migration to fill it.
//
// Declared here because both sides of the tool have to agree about it and neither may own it:
// the editor writes a crop, the compiler draws through it, and the document stores it. One schema,
// so the type the editor writes against and the validation the document is held to are the same
// thing.

// A share of the picture, measured on the picture's own edges: 0 is its left or top edge and 1 is
// its right or bottom one. Shares rather than pixels, because the crop belongs to the picture and
// not to any one encoding of it — a file re-exported at half the size is still cropped where the
// designer cropped it.
const Share = z.number().gte(0).lte(1)
// Adding two shares rarely lands exactly on 1 in binary, so a window drawn flush against the far
// edge is allowed to overshoot by less than any screen could show.
const ROUNDING = 1e-9

export const AssetCrop = z
  .object({ x: Share, y: Share, w: z.number().gt(0).lte(1), h: z.number().gt(0).lte(1) })
  // A window that reaches outside the file is a window nothing can cut. It is refused here rather
  // than clamped where it is drawn: a stored crop decides what every card drawn from this picture
  // shows from now on, and silently moving it would mean the deck shows something the designer
  // never framed.
  .refine((crop) => crop.x + crop.w <= 1 + ROUNDING && crop.y + crop.h <= 1 + ROUNDING, 'a crop has to lie inside the picture')
export type AssetCrop = z.infer<typeof AssetCrop>

export const Picture = z.object({ crop: AssetCrop.optional() })
export type Picture = z.infer<typeof Picture>

// The whole picture, which is what a file that has never been cropped is drawn as.
export const WHOLE_PICTURE: AssetCrop = { x: 0, y: 0, w: 1, h: 1 }

// Whether a window says anything at all. A window dragged back out to the file's own edges is
// the designer saying "show all of it", which is what an uncropped picture already says — so it
// is not stored and not drawn through. The difference matters: an uncropped picture is still
// trimmed of the air a machine measured off it where the template asks for that, and a picture
// carrying a window that happens to be the whole file would have lost the air with nobody meaning
// to give it up.
export const showsWholePicture = (crop: AssetCrop): boolean => crop.x === 0 && crop.y === 0 && crop.w === 1 && crop.h === 1
