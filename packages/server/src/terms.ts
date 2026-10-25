// The terms' versions (#1270, F4, #1268): which ones there are, which one is in force, and where an
// account stands against it. The text and the step that asks for the acceptance are #1272's; this
// is only what they stand on, and what every later change of the terms stands on.
//
// A version is named by the day it comes into force, `YYYY-MM-DD`, and says whether the change is
// material. The one in force is the newest whose day has come, so a version can be written into the
// register before its day, while the one before it still applies — which is what mailing a material
// change thirty days ahead (#1268, section 14) needs. An empty register means no terms apply, which
// is today, and then nothing changes for anyone.

export type TermsVersion = { version: string; material: boolean }
export type TermsRegister = readonly TermsVersion[]

// The register the box runs with, oldest first. Empty until the terms are written (#1272).
export const TERMS: TermsRegister = []

const DAY = /^\d{4}-\d{2}-\d{2}$/
const isDay = (s: string): boolean => DAY.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s

// Throws, saying why, unless every version is a real day and each comes after the one before it.
export function checkRegister(register: TermsRegister): void {
  register.forEach(({ version }, i) => {
    if (!isDay(version)) throw new Error(`terms version ${JSON.stringify(version)} is not a day (YYYY-MM-DD)`)
    const before = register[i - 1]?.version
    if (before !== undefined && before >= version) throw new Error(`terms version ${version} does not come after ${before}`)
  })
}

// The day `now` is, as the versions are named: in UTC, like every other clock on the box.
const dayOf = (now: Date): string => now.toISOString().slice(0, 10)

// The version in force on `now`, or null when there is none yet.
export function termsInForce(register: TermsRegister, now: Date): TermsVersion | null {
  const today = dayOf(now)
  return register.findLast((v) => v.version <= today) ?? null
}

// Where an account stands (#1270): the version in force, the newest one it accepted, and whether it
// has to accept now. An account that accepted a version has to accept again only when a later one in
// force is material; an editorial change asks nothing. The first terms there are ask everyone,
// whatever they say about themselves, since nobody has accepted anything before them.
export type TermsStanding = { current: string | null; accepted: string | null; due: boolean }
export function termsStanding(register: TermsRegister, accepted: readonly string[], now: Date): TermsStanding {
  const current = termsInForce(register, now)?.version ?? null
  const newest = [...accepted].sort().at(-1) ?? null
  if (current === null) return { current, accepted: newest, due: false }
  const inForce = register.filter((v) => v.version <= current)
  const needed = inForce.findLast((v) => v.material)?.version ?? inForce[0]?.version ?? current
  return { current, accepted: newest, due: !accepted.some((v) => v >= needed && v <= current) }
}
