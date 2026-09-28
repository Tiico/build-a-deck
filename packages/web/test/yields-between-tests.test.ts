import { describe, expect, it } from 'vitest'

// The event loop gets a turn between tests (#543). A file of synchronous tests used to run from
// its first test to its last without one: vitest awaits its own promises between tests, which are
// microtasks, and a timer or a message is a macrotask. The worker's answer to its own RPC is such
// a message, so a file whose synchronous tests added up to more than a minute — `deck-wall-groups`
// took 22 s alone and 112 s under load — made vitest end a green run with «Timeout calling
// onTaskUpdate». `test/setup.ts` hands the loop a turn after every test; this is what says it does.
describe('a turn of the event loop between tests (#543)', () => {
  let ran = false
  it('asks for a timer and does not wait for it', () => {
    setTimeout(() => {
      ran = true
    }, 0)
    expect(ran).toBe(false)
  })

  it('finds that the timer ran before it began', () => {
    expect(ran).toBe(true)
  })
})
