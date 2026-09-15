import { z } from 'zod'
import { FaceId, ZoneId } from './ids.js'
import { CardQuery } from './query.js'

// What a designer can hang on a zone: named things a player may ask for when they click it
// (K14). The tool ships none of them and knows none of them — an action is a name and an ordered
// list of steps, and a step is one verb out of the closed physical vocabulary with its
// parameters filled in (B5). Nothing here is a rule: the table still never validates, never
// prevents and never corrects. It only saves the designer from doing four motions by hand every
// turn, which is what a hand at a real table does too.

// How many. A number is a source and never a formula: the tool does no arithmetic on the
// designer's behalf, it only reads something the table already knows.
export const ActionAmount = z.discriminatedUnion('of', [
  z.object({ of: z.literal('number'), n: z.number().int().positive() }),
  // As many as there are seats with somebody sitting in them.
  z.object({ of: z.literal('seats') }),
  // As many as lie in a zone right now.
  z.object({ of: z.literal('zone'), zone: ZoneId }),
  // However many the one who asked says, entered at the table.
  z.object({ of: z.literal('ask') }),
])
export type ActionAmount = z.infer<typeof ActionAmount>

// Where the cards go. `beside` is the pile's own left side, where a split already lands (#87);
// `hands` is every seated hand; `mine` is the hand of whoever asked, and is nothing at a screen
// that sits nowhere (C3).
export const ActionTarget = z.discriminatedUnion('at', [
  z.object({ at: z.literal('zone'), zone: ZoneId }),
  z.object({ at: z.literal('beside') }),
  z.object({ at: z.literal('hands') }),
  z.object({ at: z.literal('mine') }),
])
export type ActionTarget = z.infer<typeof ActionTarget>

// Which side the cards land on, or the side the top is turned to. `keep` and `toggle` are not
// faces — they are what the verb does when no face is named, said out loud so the designer can
// choose it rather than discover it.
const Lands = z.union([FaceId, z.literal('keep')])

// A step is an intent with `this pile` left as the address. That relativity is the point: it is
// what lets a zone be copied with its actions intact, and what keeps an action from naming a
// zone that may not exist any more.
export const ActionStep = z.discriminatedUnion('v', [
  z.object({ v: z.literal('split'), count: ActionAmount, to: ActionTarget, face: Lands }),
  z.object({ v: z.literal('deal'), each: ActionAmount, to: ActionTarget, face: Lands }),
  z.object({ v: z.literal('take'), which: CardQuery, to: ActionTarget, face: Lands }),
  z.object({ v: z.literal('shuffle') }),
  z.object({ v: z.literal('flipTop'), face: z.union([FaceId, z.literal('toggle')]) }),
  z.object({ v: z.literal('movePile'), to: ActionTarget }),
])
export type ActionStep = z.infer<typeof ActionStep>

export const ZoneAction = z.object({
  id: z.string().min(1),
  // The designer's own word for it, which is what the table shows and never translates (B5, A4).
  label: z.string().min(1).max(40),
  steps: z.array(ActionStep).min(1),
})
export type ZoneAction = z.infer<typeof ZoneAction>
