// PROTOTYP — kastas (#940). En förfrågans liv, gemensamt för A, B och C: strömmen, förslaget,
// valet av delar, godta/kasta/förfina/avbryt, och ett lokalt «godtaget» som bara är React-state.
// Ingenting här skriver till projektet; den riktiga vägen är en atomisk redigering (PRD modul 5).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FaceTemplate } from '@byd/template'
import type { ProjectDoc, ProjectRow } from '../../types.js'
import { applied, partsOf, script, summarize, type Ask, type Change, type Failure, type Outcome, type Proposal, type Provider } from './fake.js'

export type TurnState = 'tänker' | 'skriver' | 'klar' | 'avbruten' | 'fel'
export type Turn = {
  id: number
  said: string
  ask: Ask
  text: string
  state: TurnState
  partial: { newRows: ProjectRow[]; changes: Change[]; face?: FaceTemplate }
  proposal: Proposal | null
  failure: Failure | null
  verdict: null | { kind: 'godtaget'; parts: number; total: number } | { kind: 'kastat' }
}

export type Session = ReturnType<typeof useAiSession>
export type AiView = { doc: ProjectDoc; compare?: { rev: number; label: string; doc: ProjectDoc } }

export function useAiSession({ base, outcome, provider }: { base: ProjectDoc; outcome: Outcome; provider: Provider }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [accepted, setAccepted] = useState<ProjectDoc>(base)
  const [past, setPast] = useState<{ doc: ProjectDoc; what: string }[]>([])
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const timers = useRef<number[]>([])
  const serial = useRef(0)
  // Basen byts när skalan byts; då börjar prototypen om.
  useEffect(() => {
    setAccepted(base)
    setPast([])
    setTurns([])
  }, [base])
  const stopTimers = () => {
    for (const t of timers.current) clearTimeout(t)
    timers.current = []
  }
  useEffect(() => stopTimers, [])

  const patch = (id: number, change: (turn: Turn) => Turn) => setTurns((all) => all.map((t) => (t.id === id ? change(t) : t)))

  const ask = useCallback(
    (said: string, a: Ask) => {
      stopTimers()
      const id = ++serial.current
      // En fråga som ställs medan ett förslag står öppet lämnar det: det står kvar i samtalet som
      // «lämnat», men det är inte längre det som visas på väggen.
      setTurns((all) => [
        ...all.map((t) => (t.state === 'tänker' || t.state === 'skriver' ? { ...t, state: 'avbruten' as const } : t)),
        { id, said, ask: a, text: '', state: 'tänker', partial: { newRows: [], changes: [] }, proposal: null, failure: null, verdict: null },
      ])
      for (const beat of script(accepted, a, outcome, provider)) {
        timers.current.push(
          window.setTimeout(() => {
            if ('text' in beat) patch(id, (t) => ({ ...t, state: 'skriver', text: t.text + beat.text }))
            else if ('row' in beat) patch(id, (t) => ({ ...t, state: 'skriver', partial: { ...t.partial, newRows: [...t.partial.newRows, beat.row] } }))
            else if ('change' in beat) patch(id, (t) => ({ ...t, state: 'skriver', partial: { ...t.partial, changes: [...t.partial.changes, beat.change] } }))
            else if ('face' in beat) patch(id, (t) => ({ ...t, state: 'skriver', partial: { ...t.partial, face: beat.face } }))
            else if ('fail' in beat) patch(id, (t) => ({ ...t, state: 'fel', failure: beat.fail, partial: { newRows: [], changes: [] } }))
            else if ('done' in beat) {
              patch(id, (t) => ({ ...t, state: 'klar', proposal: beat.done }))
              setPicked(new Set(beat.done ? partsOf(beat.done) : []))
            }
          }, beat.at),
        )
      }
    },
    [accepted, outcome, provider],
  )

  const current = turns.at(-1) ?? null
  // Det förslag som står öppet: färdigt och inte avgjort, eller på väg.
  const open = current && !current.verdict && current.state === 'klar' ? current.proposal : null
  const streaming = current !== null && (current.state === 'tänker' || current.state === 'skriver')
  // Hålls per delvis svar och inte per ritning: ett nytt objekt varje gång vore ett nytt dokument
  // till editorn varje gång, och editorn ritar om när det kommer.
  const partial = current?.partial
  const partialProposal: Proposal | null = useMemo(
    () =>
      streaming && current && partial && (partial.newRows.length || partial.changes.length || partial.face)
        ? { id: `delvis-${current.id}`, version: 0, from: current.ask.kind, newFields: partial.face ? ['kostnad'] : [], ...partial, summary: summarize({ newFields: [], ...partial }) }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streaming, current?.id, partial],
  )
  // Det som ritas på riktiga kort just nu: det öppna förslaget, eller det som hunnit komma.
  const showing = open ?? partialProposal

  const cancel = useCallback(() => {
    stopTimers()
    setTurns((all) => all.map((t, i) => (i === all.length - 1 && (t.state === 'tänker' || t.state === 'skriver') ? { ...t, state: 'avbruten', partial: { newRows: [], changes: [] } } : t)))
  }, [])

  const accept = useCallback(
    (only: 'alla' | 'valda') => {
      if (!current?.proposal) return
      const p = current.proposal
      const parts = partsOf(p)
      const chosen = only === 'alla' ? new Set(parts) : picked
      if (chosen.size === 0) return
      setPast((all) => [...all, { doc: accepted, what: p.summary }])
      setAccepted(applied(accepted, p, chosen))
      patch(current.id, (t) => ({ ...t, verdict: { kind: 'godtaget', parts: chosen.size, total: parts.length } }))
    },
    [current, picked, accepted],
  )
  const discard = useCallback(() => {
    if (!current) return
    stopTimers()
    patch(current.id, (t) => ({ ...t, verdict: { kind: 'kastat' }, ...(t.state === 'tänker' || t.state === 'skriver' ? { state: 'avbruten' as const } : {}) }))
  }, [current])
  const refine = useCallback(
    (said: string) => {
      if (!current?.proposal) return
      ask(said, { kind: 'förfina', prompt: said, previous: current.proposal })
    },
    [current, ask],
  )
  const undo = useCallback(() => {
    const last = past.at(-1)
    if (!last) return
    setAccepted(last.doc)
    setPast(past.slice(0, -1))
  }, [past])
  const toggle = useCallback((part: string) => {
    setPicked((now) => {
      const next = new Set(now)
      if (!next.delete(part)) next.add(part)
      return next
    })
  }, [])
  const reset = useCallback(() => {
    stopTimers()
    setTurns([])
    setAccepted(base)
    setPast([])
  }, [base])

  // Vad editorn ska rita: förslaget lagt på en kopia, och vad det jämförs med (tabellens riktiga
  // jämförelse ritar gammalt → nytt). `preview` avgör om förslaget ligger på väggen alls.
  const view = useCallback(
    (preview: boolean, rev: number): AiView | null => {
      if (preview && showing) return { doc: applied(accepted, showing, null), compare: { rev, label: 'AI-förslaget', doc: accepted } }
      return accepted === base ? null : { doc: accepted }
    },
    [showing, accepted, base],
  )
  const marks = useMemo(() => {
    if (!showing) return null
    return { added: showing.newRows.map((r) => r.id), changed: [...new Set(showing.changes.map((c) => c.id))], face: showing.face !== undefined, left: open ? partsOf(open).filter((p) => !picked.has(p)) : [] }
  }, [showing, open, picked])

  return { turns, current, open, streaming, showing, picked, accepted, past, ask, cancel, accept, discard, refine, undo, toggle, reset, view, marks }
}
