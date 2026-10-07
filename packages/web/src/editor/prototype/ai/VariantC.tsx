// PROTOTYP — kastas (#940). Variant C — Spöken på väggen: förslaget läggs direkt i den riktiga
// kortväggen och tabellen — nya kort som spöken med streckad kant, ändrade celler med gammalt → nytt
// i tabellens egen jämförelse — och en fast granskningsrad längst ner styr det. Instruktionen
// skrivs i samma rad.
import { useEffect, useRef, useState } from 'react'
import { contextOf, type Ask } from './fake.js'
import { Context, FailureNote, Stream, Verdict } from './parts.js'
import type { Shared } from './AiPrototype.js'
import { partsOf } from './fake.js'

function classify(text: string, chosen: string[]): Ask {
  if (/mall/i.test(text)) return { kind: 'mall', prompt: text }
  if (chosen.length && /markerade|valda|dessa|kortet|korten/i.test(text) && !/nya/i.test(text)) return { kind: 'urval', prompt: text, ids: chosen }
  const column = /fyll (?:kolumnen )?(\w+)/i.exec(text)?.[1]
  if (column) return { kind: 'kolumn', prompt: text, field: column }
  return { kind: 'kort', prompt: text }
}

export function VariantC(p: Shared) {
  const { s, saved } = p
  const [text, setText] = useState('Sju nya fällkort för saloonen, och mildra de tre hårdaste')
  const [refining, setRefining] = useState(false)
  const [refineText, setRefineText] = useState('')
  const [next, setNext] = useState(0)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const refineRef = useRef<HTMLInputElement>(null)
  const chosen = [...new Set([...(p.row ? [p.row] : []), ...p.marked])]
  const turn = s.current
  useEffect(() => {
    if (refining) refineRef.current?.focus()
  }, [refining])
  useEffect(() => setRefining(false), [s.open])
  // En mall ses på duken; kort ses på väggen eller i tabellen.
  useEffect(() => {
    if (s.showing && p.mode !== 'wall' && p.mode !== 'table' && p.mode !== 'template') p.onStage('wall')
  }, [s.showing !== null, s.showing?.face !== undefined])

  const go = () => {
    const ids = s.marks ? [...s.marks.added, ...s.marks.changed] : []
    if (!ids.length) return
    if (p.mode !== 'wall') p.onStage('wall')
    const id = ids[next % ids.length]!
    setNext(next + 1)
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`.byd-wall-card[data-card-ref="${CSS.escape(id)}"]`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el?.focus({ preventScroll: true })
    })
  }

  if (!saved) {
    return (
      <div className="ux-ai-bar" data-state="ingen-nyckel" role="region" aria-label="AI-förslag">
        <span className="ux-ai-spark" aria-hidden="true">
          ✦
        </span>
        <span className="ux-ai-bar-text">Förslag direkt på väggen — nya kort, ändringar och mallar — med din egen AI-nyckel.</span>
        <button type="button" className="byd-secondary" onClick={p.openKey}>
          Lägg in nyckel…
        </button>
      </div>
    )
  }

  const pending = s.open
  const parts = pending ? partsOf(pending) : []
  const some = s.picked.size
  return (
    <div className="ux-ai-bar" data-state={s.streaming ? 'strömmar' : pending ? 'förslag' : turn?.failure ? 'fel' : 'vilar'} role="region" aria-label="AI-förslag">
      <span className="ux-ai-spark" aria-hidden="true">
        ✦
      </span>
      {s.streaming && turn && (
        <>
          <div className="ux-ai-bar-text">
            <Stream turn={turn} compact />
          </div>
          <span className="ux-ai-count" role="status">
            {s.showing ? s.showing.summary : 'Läser spelet…'}
          </span>
          <button type="button" className="byd-secondary" onClick={s.cancel}>
            Avbryt
          </button>
        </>
      )}
      {!s.streaming && pending && (
        <>
          <div className="ux-ai-bar-text">
            <strong>{pending.summary}</strong>
            {pending.version > 1 && <span className="ux-ai-quiet"> · förfinat {pending.version - 1} gång{pending.version > 2 ? 'er' : ''}</span>}
            {!pending.face && (
              <button type="button" className="ux-ai-link" onClick={go}>
                Gå till nästa ↓
              </button>
            )}
          </div>
          {refining ? (
            <form
              className="ux-ai-refine"
              onSubmit={(e) => {
                e.preventDefault()
                if (!refineText.trim()) return
                s.refine(refineText.trim())
                setRefineText('')
              }}
              onKeyDown={(e) => e.key === 'Escape' && setRefining(false)}
            >
              <input ref={refineRef} aria-label="Förfina förslaget" placeholder="«gör dem mildare», «färre kort»…" value={refineText} onChange={(e) => setRefineText(e.target.value)} />
              <button type="submit" className="byd-secondary">
                Förfina
              </button>
            </form>
          ) : (
            <>
              <button type="button" className="byd-primary" onClick={() => s.accept('alla')}>
                Godta alla{parts.length > 1 ? ` (${parts.length})` : ''}
              </button>
              {parts.length > 1 && (
                <button type="button" className="byd-secondary" aria-disabled={some === 0 || some === parts.length} onClick={() => some > 0 && some < parts.length && s.accept('valda')}>
                  Godta markerade ({some})
                </button>
              )}
              <button type="button" className="byd-secondary" onClick={s.discard}>
                Kasta
              </button>
              <button type="button" className="byd-secondary" onClick={() => setRefining(true)}>
                Förfina…
              </button>
            </>
          )}
        </>
      )}
      {!s.streaming && !pending && turn?.failure && dismissed !== turn.id && (
        <>
          <div className="ux-ai-bar-text">
            <FailureNote failure={turn.failure} />
          </div>
          {turn.failure.action === 'byt-nyckel' ? (
            <button type="button" className="byd-secondary" onClick={p.openKey}>
              Byt nyckel…
            </button>
          ) : (
            <button type="button" className="byd-secondary" onClick={() => s.ask(turn.said, turn.ask)}>
              Försök igen
            </button>
          )}
          <button type="button" className="byd-secondary" onClick={() => setDismissed(turn.id)}>
            Ändra frågan
          </button>
        </>
      )}
      {!s.streaming && !pending && !(turn?.failure && dismissed !== turn.id) && (
        <form
          className="ux-ai-ask"
          onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim()) return
            s.ask(text.trim(), classify(text.trim(), chosen))
          }}
        >
          {turn?.failure ? null : turn?.verdict || turn?.state === 'avbruten' || (turn && turn.state === 'klar' && !turn.proposal) ? (
            <div className="ux-ai-bar-last">{turn.verdict ? <Verdict turn={turn} session={s} /> : <Stream turn={turn} compact />}</div>
          ) : null}
          <input aria-label="Be om ett förslag" placeholder="Be om förslag som läggs på väggen — «sju nya fällkort», «fyll antal»…" value={text} onChange={(e) => setText(e.target.value)} />
          <Context parts={contextOf(p.doc, { kind: 'kort', ids: chosen })} />
          <button type="submit" className="byd-secondary">
            Föreslå
          </button>
        </form>
      )}
    </div>
  )
}
