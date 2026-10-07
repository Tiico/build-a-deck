// PROTOTYP — kastas (#940). Variant A — Samtalspanel: en dockad panel bredvid arbetsytan, med ett
// fritt samtal som känner spelet. Ett svar som bär ett förslag visar det som ett kompakt kort i
// samtalet, med «Visa på väggen», «Godta» och «Kasta».
import { useEffect, useRef, useState } from 'react'
import type { Ask } from './fake.js'
import { contextOf } from './fake.js'
import { modelName, KeyBox } from './KeyBox.js'
import { Context, Decide, FailureNote, ProposalCards, Stream, Verdict } from './parts.js'
import type { Shared } from './AiPrototype.js'
import type { Turn } from './session.js'

const SUGGESTIONS = ['Sju nya fällkort för saloonen, och mildra de tre hårdaste', 'Föreslå en mall med kostnad uppe till vänster, namn, bildyta och effekttext', 'Vilka kort nämner tärningen?']

function classify(text: string, chosen: string[]): Ask {
  if (/mall/i.test(text)) return { kind: 'mall', prompt: text }
  if (/\?\s*$/.test(text) || /^(vilka|finns|hur|vad|varför)\b/i.test(text)) return { kind: 'fråga', prompt: text }
  if (chosen.length && /markerade|valda|urval|dessa|kortet|korten/i.test(text) && !/nya/i.test(text)) return { kind: 'urval', prompt: text, ids: chosen }
  const column = /fyll (?:kolumnen )?(\w+)/i.exec(text)?.[1]
  if (column) return { kind: 'kolumn', prompt: text, field: column }
  return { kind: 'kort', prompt: text }
}

export function VariantA(p: Shared) {
  const { s, saved } = p
  const [open, setOpen] = useState(saved !== null)
  const [text, setText] = useState('')
  const [choosing, setChoosing] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const chosen = [...new Set([...(p.row ? [p.row] : []), ...p.marked])]
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [s.turns])
  useEffect(() => setChoosing(false), [s.open])

  const send = (said: string) => {
    if (!said.trim() || s.streaming) return
    const ask = classify(said.trim(), chosen)
    if (s.open && ask.kind !== 'fråga') s.refine(said.trim())
    else s.ask(said.trim(), ask)
    setText('')
  }
  if (!open) {
    return (
      <button type="button" className="ux-ai-rail" aria-expanded={false} aria-controls="ux-ai-dock" onClick={() => setOpen(true)}>
        <span aria-hidden="true">✦</span> AI-hjälp
      </button>
    )
  }
  const context = contextOf(p.doc, { kind: 'kort', ids: chosen })
  return (
    <aside className="ux-ai-dock" id="ux-ai-dock" aria-labelledby="ux-ai-dock-h">
      <header className="ux-ai-dock-head">
        <h2 id="ux-ai-dock-h">
          <span aria-hidden="true">✦</span> AI-hjälp
        </h2>
        {saved && (
          <button type="button" className="ux-ai-who" onClick={p.openKey} title="AI-nyckel och modell">
            {saved.provider} · {modelName(saved)}
          </button>
        )}
        <button type="button" className="ux-ai-icon" aria-label="Stäng AI-hjälpen" aria-expanded={true} aria-controls="ux-ai-dock" onClick={() => setOpen(false)}>
          ⟩
        </button>
      </header>
      <div className="ux-ai-log" ref={log} role="log" aria-label="Samtal med AI">
        {!saved && (
          <div className="ux-ai-empty">
            <KeyBox saved={saved} onSave={p.setSaved} onRemove={() => p.setSaved(null)} heading="h3" compact />
          </div>
        )}
        {saved && s.turns.length === 0 && (
          <div className="ux-ai-empty">
            <p>Fråga om spelet eller be om mallar, fält och kort. AI:n ser hela spelet; allt den föreslår visas här och på väggen innan något ändras.</p>
            <ul className="ux-ai-suggest">
              {SUGGESTIONS.map((q) => (
                <li key={q}>
                  <button type="button" className="byd-secondary" onClick={() => send(q)}>
                    {q}
                  </button>
                </li>
              ))}
              {chosen.length > 0 && (
                <li>
                  <button type="button" className="byd-secondary" onClick={() => send(`Gör ${chosen.length === 1 ? 'kortet' : `de ${chosen.length} markerade korten`} mildare`)}>
                    Gör {chosen.length === 1 ? `${chosen[0]}` : `de ${chosen.length} markerade korten`} mildare
                  </button>
                </li>
              )}
            </ul>
          </div>
        )}
        {s.turns.map((turn) => (
          <TurnView key={turn.id} turn={turn} p={p} latest={turn === s.current} choosing={choosing} setChoosing={setChoosing} />
        ))}
      </div>
      {saved && (
        <form
          className="ux-ai-compose"
          onSubmit={(e) => {
            e.preventDefault()
            send(text)
          }}
        >
          <Context parts={s.open ? ['förslaget', ...context] : context} provider={saved.provider} />
          <textarea
            ref={input}
            rows={2}
            aria-label={s.open ? 'Förfina förslaget eller fråga något nytt' : 'Fråga AI:n'}
            placeholder={s.open ? 'Förfina förslaget — «gör dem mildare», «färre kort»…' : 'Fråga om spelet eller be om kort, fält eller en mall…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(text)
              }
              if (e.key === 'Escape' && s.streaming) {
                e.preventDefault()
                s.cancel()
              }
            }}
          />
          <div className="ux-ai-row ux-ai-row-end">
            {s.streaming ? (
              <button type="button" className="byd-secondary" onClick={s.cancel}>
                Avbryt
              </button>
            ) : (
              <button type="submit" className={s.open ? 'byd-secondary' : 'byd-primary'} aria-disabled={!text.trim()}>
                {s.open ? 'Förfina' : 'Skicka'}
              </button>
            )}
          </div>
        </form>
      )}
    </aside>
  )
}

function TurnView({ turn, p, latest, choosing, setChoosing }: { turn: Turn; p: Shared; latest: boolean; choosing: boolean; setChoosing(on: boolean): void }) {
  const { s } = p
  const shown = turn.proposal ?? (latest && s.streaming ? s.showing : null)
  return (
    <div className="ux-ai-turn">
      <p className="ux-ai-said">{turn.said}</p>
      <div className="ux-ai-answer">
        <Stream turn={turn} />
        {turn.failure && <FailureNote failure={turn.failure} onKey={p.openKey} onAgain={() => s.ask(turn.said, turn.ask)} />}
        {shown && turn.state !== 'avbruten' && (
          <div className="ux-ai-proposal" data-done={turn.verdict ? turn.verdict.kind : undefined}>
            <p className="ux-ai-proposal-head">
              <strong>{turn.proposal ? `Förslag${turn.proposal.version > 1 ? ` v${turn.proposal.version}` : ''}` : 'Förslag på väg'}</strong> · {shown.summary}
            </p>
            {!turn.verdict && (latest || !turn.proposal) && <ProposalCards doc={p.doc} http={p.http} proposal={shown} session={s} choose={choosing && latest && turn.proposal !== null} width={choosing ? 92 : 76} {...(choosing ? {} : { limit: 4 })} />}
            {latest && turn.proposal && !turn.verdict && (
              <>
                <div className="ux-ai-row">
                  <button
                    type="button"
                    className="byd-secondary"
                    aria-pressed={p.preview}
                    onClick={() => {
                      p.setPreview(!p.preview)
                      if (!p.preview && p.mode !== 'table' && p.mode !== 'template') p.onStage('wall')
                    }}
                  >
                    {p.preview ? (p.mode === 'table' ? 'Visas i tabellen' : p.mode === 'template' ? 'Visas på duken' : 'Visas på väggen') : 'Visa på väggen'}
                  </button>
                  {!choosing && (
                    <button type="button" className="ux-ai-link" onClick={() => setChoosing(true)}>
                      Välj delar…
                    </button>
                  )}
                </div>
                <Decide session={s} proposal={turn.proposal} choosing={choosing} />
              </>
            )}
            {!latest && turn.proposal && !turn.verdict && <p className="ux-ai-quiet">Ersatt av ett senare förslag.</p>}
          </div>
        )}
        <Verdict turn={turn} session={s} />
      </div>
    </div>
  )
}
