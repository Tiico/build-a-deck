import { PERSONAL_FIELDS, REDACTED, type Applied } from '@byd/protocol'

// A line with its personal fields masked (#1276, #1269): every field `PERSONAL_FIELDS` names that
// the line carries says `REDACTED` instead, and nothing else changes. A field that is there stays
// there, so a seat stays taken, a flag stays an observer's and a note still says something, which
// is all the engine ever asks of them: the masked line decides and applies as the line did.
//
// Pure and without I/O: the store masks its lines with this when an erasure asks it to (G6, #1279).
// A line without a personal field comes back as the same object, and masking twice is masking once.
export function redactLine(line: Applied): Applied {
  const intent = line.intent as Record<string, unknown>
  let masked: Record<string, unknown> | null = null
  for (const { v, field } of PERSONAL_FIELDS) {
    if (intent['v'] !== v || typeof intent[field] !== 'string' || intent[field] === REDACTED) continue
    masked ??= { ...intent }
    masked[field] = REDACTED
  }
  return masked ? { ...line, intent: masked as Applied['intent'] } : line
}

// A log with every line masked but those `keep` says to leave as they are.
export function redactLog(log: readonly Applied[], keep: (line: Applied) => boolean = () => false): Applied[] {
  return log.map((line) => (keep(line) ? line : redactLine(line)))
}
