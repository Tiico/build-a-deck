import { useEffect, useMemo, useState } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { useTableClient } from '../table/useTableClient.js'
import { hue } from '../table/hue.js'
import { Texture } from '../table/Texture.js'
import { HandStrip } from './HandStrip.js'
import { CountersRow, MineStrip } from './SeatExtras.js'
import { PlaySheet } from './PlaySheet.js'
import { TableSummary } from './TableSummary.js'
import { SessionButtons, SessionOverlays, refusedText, useSessionVersion, useToast } from './SessionOverlays.js'
import { RuleDrawer } from '../rules/RuleDrawer.js'
import { claimUrl } from '../account/api.js'
import { playIntents } from './play.js'
import './player.css'

// /play?session=…&seat=A&name=Ada&token=…&server=ws://…
// The `player` role: one seat, its hand and private zones, and the zone shortcuts to play to.
// The token was bought with the room code on the join page (DRIFT §9).
export function PlayerPage() {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const seat = params.get('seat')
  const name = params.get('name')
  const token = params.get('token') ?? undefined
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const { client, view, status, activity, refused } = useTableClient(sessionId && seat ? { url, sessionId, seat, ...(token ? { token } : {}) } : null)
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
  if (refused) return <p role="alert" data-refused={refused}>{refusedText(refused)}</p>
  if (!view || !client) return <p data-status={status}>Ansluter…</p>

  const me = view.seats.find((s) => s.id === seat)
  const hand = view.components.filter((c) => c.zone === `hand:${seat}`)
  // A lifted card is played alone unless it is one of the selected hand cards (K3).
  const toPlay = lifted ? (selected.has(lifted.id) ? hand.filter((c) => selected.has(c.id)) : [lifted]) : []

  const play = (zone: string, at: 'top' | 'bottom') => {
    void client.send(...playIntents(view, toPlay, zone, undefined, at))
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
        {/* The rules this table plays by (B7), one press away beside the session's own buttons. */}
        {sessionId && <RuleDrawer http={faces} sessionId={sessionId} placement="phone" />}
      </header>
      <CountersRow view={view} onSet={(c, value) => void client.send({ v: 'setCounter', component: c.id, value })} />
      <TableSummary view={view} activity={activity} />
      <MineStrip
        view={view}
        faces={faces}
        onFlip={(c) => void client.send({ v: 'flip', component: c.id, face: c.face === 'front' ? 'back' : 'front' })}
        onTake={(c) => void client.send({ v: 'move', component: c.id, to: `hand:${seat}` })}
        onPlay={setLifted}
      />
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
      <SessionOverlays client={client} view={view} seat={seat} name={me?.name ?? seat} http={faces} sessionId={sessionId} sheet={sheet} onSheet={setSheet} toast={toast} onToast={setToast} version={version} saveUrl={token ? claimUrl(token, params.get('server')) : null} />
    </div>
  )
}
