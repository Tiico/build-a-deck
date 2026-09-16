import { useEffect, useRef } from 'react'

// Every way out of something that is open right now, and the order between them (#152).
//
// A surface that opens something over the work — a panel, a library, a drag the hand has not let
// go of — owes the keyboard a way back out of it, and the key is always Escape. The press has to
// be heard on the document: it arrives wherever the focus happens to be standing, and during a
// drag that is nowhere near the edge or the box the pointer took hold of. So every door listens
// in the same place, and two doors open at once hear the same press.
//
// The order between them used to be the order the browser had registered them in, which is the
// order they mounted in, which is the order the designer happened to do things in: a panel opened
// before a drag began and one press did both, the drag going back and the panel closing behind it
// (#152). `preventDefault` and a guard on `defaultPrevented` looked like a rule and were not one —
// they only ever say "not after me", and which door is after which was never anybody's decision.
//
// So the order lives here instead, once, and a door is a door by saying what stands behind it and
// nothing else. No door names another door; none of them counts what else is open. The next one
// written inherits the order by being written at all, which is the only way a rule between three
// things survives being written by three people.
//
// It sits at the root of the app rather than beside the two doors that use it today, for the same
// reason `room.ts` does: what it is about is the document, and the document is the whole app.
// Both of today's users happen to be in the editor, but nothing in the mechanism is the editor's,
// and a felt or a phone that grows a door would otherwise reach across into the editor's folder
// for it — which is how a second copy gets written instead.

// What stands behind a door, which is the whole of the order between them.
//
//   held      something the hand has hold of at this moment: a drag, a pull, a grab. The hand is
//             still down, and a press that arrives while it is down is about what is under it.
//   standing  something that stands over the work until it is closed: a panel, a library. It was
//             opened and then left there, and the work under it went on.
//
// A hand in the middle of a drag is asking about the drag; a panel over the work is not what it
// reached for Escape to close. That is the whole reason held comes before standing, and it is a
// fact about hands rather than about these two doors — which is why it is a word a door says
// about itself and not a number it has to pick.
export type Doorway = 'held' | 'standing'

type Door = { doorway: Doorway; answer(): void }

// Open right now, in the order they opened.
const open: Door[] = []

// Whose press it is: the nearest to the hand, and among equals the last opened. Nothing else is
// consulted, so the answer does not move when the same two doors open the other way round.
function answering(): Door | undefined {
  for (let i = open.length - 1; i >= 0; i--) {
    const door = open[i]
    if (door && door.doorway === 'held') return door
  }
  return open[open.length - 1]
}

// One listener for all of them, hung while there is a door to answer with and taken down again
// after the last one closes. A press nobody has a way out of is left exactly as it was found:
// refusing it would take Escape away from whatever else the browser or the page does with it.
function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  const door = answering()
  if (!door) return
  // Refused once it has really been answered, so nothing further up answers the same press. The
  // doors below this one are already ruled out by the order above; this is for everything that
  // is not a door at all.
  event.preventDefault()
  door.answer()
}

// The way out of whatever the surface has open, for as long as it is open. A surface renders it
// while the thing is there and not otherwise — a door that is not there cannot be walked through
// — so there is no open-shaped state to ask about here.
export function useDoor(doorway: Doorway, onEscape: () => void): void {
  // What to do is read at the press and not at the opening: a surface hands this a fresh closure
  // every render, and a drag that has moved since is still the same drag.
  const latest = useRef(onEscape)
  latest.current = onEscape
  useEffect(() => {
    const door: Door = { doorway, answer: () => latest.current() }
    open.push(door)
    if (open.length === 1) document.addEventListener('keydown', onKeyDown)
    return () => {
      open.splice(open.indexOf(door), 1)
      if (open.length === 0) document.removeEventListener('keydown', onKeyDown)
    }
    // A door that becomes held — or stops being — opens again where it now belongs.
  }, [doorway])
}
