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
import { useT } from '../i18n/index.js'
import './player.css'
import { DEFAULT_TIMING, type StatusTiming } from '../status/connection.js'
import { useLiveStatus } from '../status/useLiveStatus.js'
import { RouteStatus } from '../status/RouteStatus.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { statusLinks } from '../status/links.js'
import { noticeFor } from '../status/notice.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { useRefusal } from '../status/Refusal.js'
import { useFeltKeyboard } from '../table/useFeltKeyboard.js'
import { useActivityLive } from '../table/useActivityLive.js'

// /play?session=…&seat=A&name=Ada&token=…&server=ws://…
// The `player` role: one seat, its hand and private zones, and the zone shortcuts to play to.
// The token was bought with the room code on the join page (DRIFT §9).
export type PlayerPageProps = { timing?: StatusTiming }

export function PlayerPage({ timing = DEFAULT_TIMING }: PlayerPageProps = {}) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const seat = params.get('seat')
  const name = params.get('name')
  const token = params.get('token') ?? undefined
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const conn = useTableClient(sessionId && seat ? { url, sessionId, seat, ...(token ? { token } : {}), connectTimeoutMs: timing.connectTimeoutMs, retryPlanMs: timing.retryPlanMs } : null)
  const { client, view, status, activity, refused } = conn
  const live = useLiveStatus(conn, 'phone', timing)
  const links = statusLinks({ server: params.get('server'), code: params.get('code') })
  usePageTitle({ state: sessionId && seat ? (refused ? 'forbidden' : live.state) : 'missing', room: params.get('code') ?? sessionId })
  const faces = url.replace(/^ws/, 'http')

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [inspect, setInspect] = useState<VisibleComponentState | null>(null)
  const [lifted, setLifted] = useState<VisibleComponentState | null>(null)
  const [sheet, setSheet] = useState<'flag' | 'end' | null>(null)
  // Which target the table said no to, and why.
  const refusal = useRefusal('phone')
  const [refusedZone, setRefusedZone] = useState<string | null>(null)
  const [toast, setToast] = useToast()
  const version = useSessionVersion(faces, sessionId, view?.ended === true)
  // The phone has no felt, so the keyboard here is the hand and the address panel it opens (#1).
  const kbd = useFeltKeyboard(view, false, {
    act: (intents) => (client ? client.send(...intents) : Promise.resolve({ ok: false as const, reason: 'not connected' })),
    onPlayed: () => setSelected(new Set()),
    faces,
  })
  useActivityLive(activity, view, seat)

  // Sit down on first contact: claim the seat with the name from the link, if it is still free.
  const seatFree = view?.seats.find((s) => s.id === seat)?.name === null
  useEffect(() => {
    if (client && view && seat && name && seatFree) void client.send({ v: 'seat.claim', seat, name })
  }, [client, view === null, seat, name, seatFree])

  if (!sessionId || !seat) return <StatusNotice notice={noticeFor('missing', 'phone')} surface="page" links={links} />
  // Not admitted, or kicked (DRIFT §9). The door is shut, so it is the `forbidden` state — said
  // in the model's form, with the server's own reason for the sentence.
  if (refused) return <StatusNotice notice={{ ...noticeFor('forbidden', 'phone'), text: refusedText(refused, t) }} surface="page" links={links} />
  if (!view || !client) return <RouteStatus status={live} over="sheet" links={links} onRetry={conn.retry} />

  const me = view.seats.find((s) => s.id === seat)
  const hand = view.components.filter((c) => c.zone === `hand:${seat}`)
  // A lifted card is played alone unless it is one of the selected hand cards (K3).
  const toPlay = lifted ? (selected.has(lifted.id) ? hand.filter((c) => selected.has(c.id)) : [lifted]) : []

  // A play the table refuses leaves the sheet open with the answer beside the button that was
  // pressed: the cards stay in the hand and nothing is quietly lost.
  const play = (zone: string, at: 'top' | 'bottom') => {
    setRefusedZone(zone)
    void refusal.watch(client.send(...playIntents(view, toPlay, zone, undefined, at))).then((result) => {
      if (!result.ok) return
      setRefusedZone(null)
      setLifted(null)
      setSelected(new Set())
    })
  }
  const toggle = (card: VisibleComponentState) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(card.id)) next.delete(card.id)
      else next.add(card.id)
      return next
    })

  return (
    <>
      <div className={`byd-player${live.stale ? ' byd-status-stale' : ''}`} data-page="player" data-status={status} {...(live.stale ? { inert: true } : {})}>
      <header>
        <strong>{me?.name ?? seat}</strong>
        <span>{t(hand.length === 1 ? 'play.cards.one' : 'play.cards.other', { n: hand.length })}</span>
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
      <HandStrip view={view} selected={selected} faces={faces} onTap={setInspect} onHold={toggle} onLift={setLifted} onOpen={(c) => kbd.openHand(c, [...selected])} />
      <p className="byd-hint">
        {selected.size > 0
          ? t(selected.size === 1 ? 'player.hint.selected.one' : 'player.hint.selected.other', { n: selected.size })
          : t('player.hint')}
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
        <PlaySheet
          view={view}
          count={toPlay.length}
          label={lifted.cardRef ?? ''}
          onPlay={play}
          onClose={() => {
            refusal.clear()
            setRefusedZone(null)
            setLifted(null)
          }}
          refusal={refusal}
          refusedZone={refusedZone}
        />
      )}
      {kbd.panel}
      <SessionOverlays client={client} view={view} seat={seat} name={me?.name ?? seat} http={faces} sessionId={sessionId} sheet={sheet} onSheet={setSheet} toast={toast} onToast={setToast} version={version} saveUrl={token ? claimUrl(token, params.get('server')) : null} />
      </div>
      <RouteStatus status={live} over="sheet" links={links} onRetry={conn.retry} />
    </>
  )
}
