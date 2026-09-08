import type { Activity, RewindProposal, Snapshot } from '@byd/protocol'
import { describeActivity } from './describe.js'
import type { T } from '../i18n/index.js'

// Who can settle a proposal: everyone else who sits at the table. The table screen itself
// has no buttons (C), so with nobody else seated the proposer can only withdraw.
export function whoDecides(view: Snapshot, proposal: RewindProposal, t: T): string {
  const others = view.seats.filter((s) => s.id !== proposal.by && s.name !== null).map((s) => s.name ?? s.id)
  const last = others.at(-1)
  if (last === undefined) return t('rewind.someone')
  return others.length === 1 ? last : t('rewind.deciders', { others: others.slice(0, -1).join(', '), last })
}

// Where the proposal would take the table, in words: before the first act that would be
// taken back, when this view has seen it; otherwise by number.
export function whereTo(view: Snapshot, proposal: RewindProposal, activity: readonly Activity[], t: T): string {
  const first = activity.find((l) => l.seq > proposal.toSeq && !l.intent.v.startsWith('rewind.'))
  return first ? t('rewind.before', { what: describeActivity(first, view, t) }) : t('rewind.atSeq', { n: proposal.toSeq })
}

// The view with the proposal's table in place of the present one.
export function previewOf(view: Snapshot): Snapshot {
  const preview = view.rewind?.preview
  return preview ? { ...view, zones: preview.zones, components: preview.components } : view
}
