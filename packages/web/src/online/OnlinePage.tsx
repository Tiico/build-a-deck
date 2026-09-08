import { useEffect, useMemo, useRef, useState } from 'react'
import type { Intent } from '@byd/protocol'
import '../table/table.css'
import '../player/player.css'
import './online.css'
import { TableRenderer, type TableHandle } from '../table/TableRenderer.js'
import { useTableClient } from '../table/useTableClient.js'
import { usePresence, useRecent } from '../table/usePresence.js'
import { previewOf } from '../table/rewind.js'
import { seatColor } from '../table/seatColor.js'
import { zoneAt } from '../zones.js'
import { CARD_MM } from '../table/drop.js'
import { playIntents } from '../player/play.js'
import { SessionButtons, SessionOverlays, useSessionVersion, useToast, refusedText } from '../player/SessionOverlays.js'
import { claimUrl } from '../account/api.js'
import { SeatLine } from './SeatLine.js'
import { HandFan } from './HandFan.js'
import { seatRotation, withoutHand } from './seat.js'
import { useT } from '../i18n/index.js'

// /online?session=…&seat=A&name=Ada&server=ws://…
// Fully online (C2): both roles in one window. The table, turned so this seat's edge is at the
// bottom, playable as the table screen is; the seat's hand as a fan on the felt (prototype B);
// the phone's controls in the corner.
export function OnlinePage() {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const seat = params.get('seat')
  const name = params.get('name')
  const token = params.get('token') ?? undefined
  const owner = params.get('owner') === '1'
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const http = url.replace(/^ws/, 'http')
  const { client, view, status, activity, observers, refused } = useTableClient(sessionId && seat ? { url, sessionId, seat, ...(token ? { token } : {}), ...(owner ? { owner: true } : {}) } : null)
  const presence = usePresence(client, view)
  const recent = useRecent(activity)
  const table = useRef<TableHandle>(null)
  const [sheet, setSheet] = useState<'flag' | 'end' | null>(null)
  const [toast, setToast] = useToast()
  const version = useSessionVersion(http, sessionId, view?.ended === true)

  const seatFree = view?.seats.find((s) => s.id === seat)?.name === null
  useEffect(() => {
    if (client && view && seat && name && seatFree) void client.send({ v: 'seat.claim', seat, name })
  }, [client, view === null, seat, name, seatFree])

  if (!sessionId || !seat) return <p>{t('play.session.seat.missing')}</p>
  if (refused) return <p role="alert" data-refused={refused}>{refusedText(refused, t)}</p>
  if (!view || !client) return <p data-status={status}>{status === 'connecting' ? t('play.connecting') : status}</p>

  const me = view.seats.find((s) => s.id === seat)
  const hand = view.components.filter((c) => c.zone === `hand:${seat}`)
  const shown = withoutHand(previewOf(view), seat)
  const playable = !view.rewind && !view.ended
  const onAct = (intents: Intent[]) => void client.send(...intents)
  // A card out of the fan lands where it is dropped, centred on the pointer (K2, K11).
  const play = (card: (typeof hand)[number], clientX: number, clientY: number) => {
    const p = table.current?.toTable(clientX, clientY)
    if (!p || !playable) return
    const dest = zoneAt(view.zones, view.floor, p.x - CARD_MM.w / 2, p.y - CARD_MM.h / 2)
    if (dest.zone === `hand:${seat}`) return
    void client.send(...playIntents(view, [card], dest.zone, { x: dest.x, y: dest.y }))
  }

  return (
    <div data-page="online" data-status={status} className="byd-fit byd-online" style={{ ['--seat' as string]: seatColor(Math.max(0, view.seats.findIndex((s) => s.id === seat))) }}>
      <TableRenderer
        ref={table}
        view={shown}
        mode="table"
        rotate={seatRotation(view, seat)}
        faces={http}
        onAct={playable ? onAct : undefined}
        peers={Object.values(presence.peers)}
        pulses={presence.pulses}
        recent={recent}
        onPresence={(p) => client.sendPresence(p)}
      />
      {/* One row along the bottom: who you are at one end, what you can do at the other. They
          are laid out together so neither can grow across the other, whatever the name is or
          how long the words are in the language being read (A4). */}
      <div className="byd-online-bar">
        <SeatLine name={me?.name ?? seat} hand={hand.length} observers={observers.map((o) => o.name)} t={t} />
        <div className="byd-online-tools">
          <SessionButtons client={client} view={view} onSheet={setSheet} />
        </div>
      </div>
      <HandFan cards={hand} faces={http} onPlay={play} />
      <SessionOverlays client={client} view={view} seat={seat} name={me?.name ?? seat} http={http} sessionId={sessionId} sheet={sheet} onSheet={setSheet} toast={toast} onToast={setToast} version={version} saveUrl={token ? claimUrl(token, params.get('server')) : null} />
    </div>
  )
}
