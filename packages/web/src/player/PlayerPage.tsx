import { useEffect, useMemo, useState } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { useTableClient } from '../table/useTableClient.js'
import { hue } from '../table/hue.js'
import { Texture } from '../table/Texture.js'
import { HandStrip } from './HandStrip.js'
import { PlaySheet } from './PlaySheet.js'
import { TableSummary } from './TableSummary.js'
import { SessionButtons, SessionOverlays, useSessionVersion, useToast } from './SessionOverlays.js'
import { playIntents } from './play.js'
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
  const faces = url.replace(/^ws/, 'http')

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [inspect, setInspect] = useState<VisibleComponentState | null>(null)
  const [lifted, setLifted] = useState<VisibleComponentState | null>(null)
  const [sheet, setSheet] = useState<'flag' | 'end' | null>(null)
  const [toast, setToast] = useToast()
  const version = useSessionVersion(faces, sessionId, view?.ended === true)

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

  const play = (zone: string) => {
    void client.send(...playIntents(view, toPlay, zone))
    setLifted(null)
    setSelected(new Set())
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
        <SessionButtons client={client} view={view} onSheet={setSheet} />
      </header>
      <TableSummary view={view} activity={activity} />
      <HandStrip view={view} selected={selected} faces={faces} onTap={setInspect} onHold={toggle} onLift={setLifted} />
      <p className="byd-hint">
        {selected.size > 0 ? `${selected.size} valda · dra upp för att spela` : 'tryck = titta · dra upp = spela · håll = välj flera'}
      </p>
      {inspect && (
        <div className="byd-inspect" onClick={() => setInspect(null)}>
          <div data-inspect={inspect.id} data-face="front" style={{ ['--hue' as string]: hue(inspect.cardRef ?? '') }}>
            <Texture faces={faces} c={inspect} />
            <span>{inspect.cardRef}</span>
          </div>
        </div>
      )}
      {lifted && (
        <PlaySheet view={view} count={toPlay.length} label={lifted.cardRef ?? ''} onPlay={play} onClose={() => setLifted(null)} />
      )}
      <SessionOverlays client={client} view={view} seat={seat} name={me?.name ?? seat} http={faces} sessionId={sessionId} sheet={sheet} onSheet={setSheet} toast={toast} onToast={setToast} version={version} />
    </div>
  )
}
