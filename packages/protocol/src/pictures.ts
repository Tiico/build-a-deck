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

// What the file was called on the designer's disk (#222, L22, beslut 6). It is the second thing
// that is true of the picture itself, so it is the field the record above was built to take: a
// document written before there were names is missing a key and reads back as the document it
// always was, and the pictures already in a game go on being named by the cards drawn from them.
//
// A file name is untrusted input — it is whatever a disk happened to hold — and it is stored, so
// it is bounded and read here rather than trusted by every surface that later prints it. What is
// refused is what a name cannot be: a way to somewhere, since nothing downstream may join this to
// a path; anything but one line of readable text, since a newline breaks every label it is read
// out in and a bidi override turns `gpj.exe` into what it is not; and more than a person reads.
const PICTURE_NAME_MAX = 120
export const PictureName = z
  .string()
  .trim()
  .min(1, 'a picture’s name has to say something')
  .max(PICTURE_NAME_MAX, 'a picture’s name is a name and not a paragraph')
  .regex(/^[^/\\]+$/u, 'a picture’s name is a name and never a path')
  .regex(/^[^\p{Cc}\p{Cf}]+$/u, 'a picture’s name is one line of readable text')
export type PictureName = z.infer<typeof PictureName>

// The name a file brings from a designer's disk, made into a name a picture may carry. A browser
// hands over `File.name` alone for a file that was picked, but a folder dropped on the page hands
// over the path the file stood at — so what is kept is the last segment and nothing before it.
//
// It is made into something the schema accepts rather than offered up and refused: the designer
// chose a picture and not a name, and a file called `   ` is no reason to refuse her the picture.
// A file whose name says nothing usable therefore arrives without one, and the game has still met
// the picture. It lives here, beside the schema it has to satisfy, so the one place that decides
// what a name may be is also the one place that makes one.
export function pictureNameOf(fileName: string): string | undefined {
  const last = fileName.split(/[/\\]/).pop() ?? ''
  const name = last.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim().slice(0, PICTURE_NAME_MAX).trim()
  return name.length > 0 ? name : undefined
}

export const Picture = z.object({ crop: AssetCrop.optional(), name: PictureName.optional() })
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
