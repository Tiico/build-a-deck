// What the asset store takes in (E1, DRIFT §4).
//
// It stands in a file of its own, and not beside the route that enforces it, because the editor
// has to say the same thing before it uploads: a rulebook's import tells a designer *why* a
// picture did not come in, with the limit written out (#173), and a second copy of these numbers
// in the browser would be a message that drifts away from the gate it describes.
export const ASSET_IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
export const ASSET_FONT_TYPES: readonly string[] = ['font/woff2', 'font/woff', 'font/ttf', 'font/otf']
// Eight megabytes is what one picture may weigh. It is a print-resolution photograph with room to
// spare, and it is the number the upload route answers 413 with.
export const ASSET_MAX_BYTES = 8 * 1024 * 1024
