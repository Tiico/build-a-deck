// A failure already put in the reader's own words (A4, #812).
//
// What a server, a document verb or the network throws is the developer's: English, often a status
// number, never a sentence a designer can act on. So a surface never shows an error's message as
// it is. It shows a sentence of its own for the thing that was tried — unless the one who threw
// already knew the reason and said it in the reader's language, which is what this class marks.
// `invite` knows the address already has the game; the panel only knows the invitation failed.
export class Said extends Error {
  override name = 'Said'
}

// The reason, when one was said for the reader, and otherwise the surface's own sentence for what
// did not work. The one way an error's text reaches the screen.
export function saidOr(err: unknown, otherwise: string): string {
  return err instanceof Said ? err.message : otherwise
}
