import { Applied, SCHEMA_VERSION } from '@byd/protocol'

// Upcasters (DRIFT §7): the log is never rewritten; a line is lifted from the version it was
// written under to today's shape as it is read. One step per version, in order. A line from a
// newer engine than this one is refused: it may say something this engine cannot replay.
type Raw = Record<string, unknown>
const UPCASTS: ((line: Raw) => Raw)[] = [
  // 0 → 1: lines from before versioning get the field; the shape itself did not change.
  (line) => ({ ...line, schemaVersion: 1 }),
]

export function liftLine(raw: unknown): Applied {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('a log line is an object')
  let line = raw as Raw
  const given = line['schemaVersion']
  let version = typeof given === 'number' ? given : 0
  if (version > SCHEMA_VERSION) throw new Error(`schema version ${version} is newer than this engine's ${SCHEMA_VERSION}`)
  for (; version < SCHEMA_VERSION; version++) {
    const step = UPCASTS[version]
    if (!step) throw new Error(`no upcaster from schema version ${version}`)
    line = step(line)
  }
  return Applied.parse(line)
}

// Every line lifted, in order: what a store hands the engine to replay.
export function liftLog(raw: readonly unknown[]): Applied[] {
  return raw.map(liftLine)
}
