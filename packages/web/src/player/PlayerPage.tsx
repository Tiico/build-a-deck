import { useEffect, useMemo, useState } from 'react'
import type { Intent, VisibleComponentState } from '@byd/protocol'
import { useTableClient } from '../table/useTableClient.js'
import { hue } from '../table/hue.js'
import { HandStrip } from './HandStrip.js'
import { PlaySheet } from './PlaySheet.js'
import { TableSummary } from './TableSummary.js'
import { whoDecides } from '../table/rewind.js'
import './player.css'

// /play?session=…&seat=A&name=Ada&server=ws://…
// The `player` role: one seat, its hand and private zones, and the zone shortcuts to play to.
export function PlayerPage() {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const seat = params.get('seat')
  const name = params.get('name')
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const { client, view, status, activity } = useTableClient(sessionId && seat ? { url, sessionId, seat } : null)

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [inspect, setInspect] = useState<VisibleComponentState | null>(null)
  const [lifted, setLifted] = useState<VisibleComponentState | null>(null)

  // Sit down on first contact: claim the seat with the name from the link, if it is still free.
  const seatFree = view?.seats.find((s) => s.id === seat)?.name === null
  useEffect(() => {
    if (client && view && seat && name && seatFree) void client.send({ v: 'seat.claim', seat, name })
  }, [client, view === null, seat, name, seatFree])

  if (!sessionId || !seat) return <p>Ingen session eller plats angiven.</p>
  if (!view || !client) return <p data-status={status}>Ansluter…</p>

  const me = view.seats.find((s) => s.id === seat)
  const hand = view.components.filter((c) => c.zone === `hand:${seat}`)
  const toPlay = lifted ? (selected.has(lifted.id) ? hand.filter((c) => selected.has(c.id)) : [lifted]) : []

  // Playing to a public zone turns the card face-up, as a hand would (K11); a hidden pile keeps it down.
  const play = (zone: string) => {
    const isPublic = view.zones.find((z) => z.id === zone)?.mode === 'order'
    const intents: Intent[] = toPlay.flatMap((c): Intent[] =>
      isPublic
        ? [{ v: 'move', component: c.id, to: zone }, { v: 'flip', component: c.id, face: 'front' }]
        : [{ v: 'move', component: c.id, to: zone }],
    )
    void client.send(...intents)
    setLifted(null)
    setSelected(new Set())
  }
  // Undo (B, C): one tap. Uncontested, it takes back this seat's last act; once someone else
  // has acted it proposes a rewind to the same point, which the others settle on their phones.
  const proposal = view.rewind
  const tapUndo = () => {
    if (!view.undo) return
    void client.send(view.undo.contested ? { v: 'rewind.propose', toSeq: view.undo.toSeq } : { v: 'undo.self' })
  }
  const settle = (v: 'rewind.confirm' | 'rewind.reject') => {
    if (proposal) void client.send({ v, proposal: proposal.id })
  }
  const toggle = (card: VisibleComponentState) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(card.id)) next.delete(card.id)
      else next.add(card.id)
      return next
    })

  return (
    <div className="byd-player" data-page="player" data-status={status}>
      <header>
        <strong>{me?.name ?? seat}</strong>
        <span>{hand.length} kort</span>
        <button className="byd-undo" disabled={!view.undo || !!proposal} onClick={tapUndo}>
          ↶ Ångra
        </button>
      </header>
      <TableSummary view={view} activity={activity} />
      <HandStrip view={view} selected={selected} onTap={setInspect} onHold={toggle} onLift={setLifted} />
      <p className="byd-hint">
        {selected.size > 0 ? `${selected.size} valda · dra upp för att spela` : 'tryck = titta · dra upp = spela · håll = välj flera'}
      </p>
      {inspect && (
        <div className="byd-inspect" onClick={() => setInspect(null)}>
          <div data-inspect={inspect.id} data-face="front" style={{ ['--hue' as string]: hue(inspect.cardRef ?? '') }}>
            {inspect.cardRef}
          </div>
        </div>
      )}
      {lifted && (
        <PlaySheet view={view} count={toPlay.length} label={lifted.cardRef ?? ''} onPlay={play} onClose={() => setLifted(null)} />
      )}
      {proposal && proposal.by === seat && (
        <div className="byd-rewind-mine" data-rewind-mine>
          <span>Du föreslår att spola tillbaka. Bordet visar hur det såg ut; {whoDecides(view, proposal)} avgör.</span>
          <button onClick={() => settle('rewind.reject')}>Dra tillbaka förslaget</button>
        </div>
      )}
      {proposal && proposal.by !== seat && (
        <div className="byd-rewind-ask" data-rewind-ask>
          <h1>{view.seats.find((s) => s.id === proposal.by)?.name ?? 'Bordet'} vill spola tillbaka</h1>
          <p>Bordet visar hur det såg ut. Draghögen blandas om.</p>
          <button data-kind="ok" onClick={() => settle('rewind.confirm')}>
            Godkänn
          </button>
          <button data-kind="no" onClick={() => settle('rewind.reject')}>
            Neka
          </button>
        </div>
      )}
    </div>
  )
}
