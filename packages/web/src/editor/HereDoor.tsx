import type { Presence } from '@byd/server'
import { colourOf, initialOf } from '../account/api.js'

// The door to who has the game (L63, reviderat 2026-10-24, #1250 variant B). The door is the
// designer's own face and «Dela», whoever else is here, so the header is exactly as wide in company
// as alone and nothing in it moves when someone comes in. The others are drawn as a stack on the
// header's lower edge, under the door: it takes no width from the row and no height from the work.
// From four others the last of three is «+N», and the door's name says how many are here.

// How many of the others the stack draws before the last one says the rest.
const DRAWN = 3

export type DoorFaces = { you: Presence | undefined; shown: Presence[]; more: number }

// Which of the people here is this editor, and which of the others are drawn. An account with the
// game open in two tabs is here once, as its first tab (D3), so the second tab finds itself by its
// address and not by its connection.
export function doorFaces(here: readonly Presence[], self: Pick<Presence, 'id' | 'email'> | null): DoorFaces {
  const you = here.find((p) => p.id === self?.id) ?? (self?.email !== undefined ? here.find((p) => p.email === self.email) : undefined) ?? here[0]
  const others = here.filter((p) => p !== you)
  if (others.length <= DRAWN) return { you, shown: others, more: 0 }
  return { you, shown: others.slice(0, DRAWN - 1), more: others.length - (DRAWN - 1) }
}

// One person's face: the name's letter, the whole name on the pointer, in the colour of the
// address, so the face stays the same when the name changes (#1254).
function Face({ who }: { who: Presence }) {
  return (
    <i title={who.name} style={{ ['--who' as string]: colourOf(who.email ?? who.name) }}>
      {initialOf(who.name)}
    </i>
  )
}

// What the door holds: the designer's face, the word, and the others hanging from the header's edge.
// The stack is part of the door, so a press on it opens the list, and it is hidden from a reader:
// the door's name says the count.
export function HereFaces({ here, self, word }: { here: readonly Presence[]; self: Pick<Presence, 'id' | 'email'> | null; word: string }) {
  const { you, shown, more } = doorFaces(here, self)
  return (
    <>
      {you && <Face who={you} />}
      <span className="byd-editor-here-word" aria-hidden="true">
        {word}
      </span>
      {shown.length > 0 && (
        <span className="byd-editor-here-others" aria-hidden="true">
          {shown.map((p) => (
            <Face key={p.id} who={p} />
          ))}
          {more > 0 && <i className="byd-editor-here-more">+{more}</i>}
        </span>
      )}
    </>
  )
}
