import type { TypeRef } from '@byd/protocol'
import type { Country, Destination, OrderStatus, PreparedOrder, PrintManifest, PrintRequirements, ProviderId, ProviderOrderRef, Quote } from './schema.js'

// Where `submit` gets the drawn files from, by the names `prepare` gave them: the bytes for a
// partner that takes uploads, a URL for one that fetches. The platform injects it, so the
// contract does no I/O of its own and never draws anything (E2).
export type FileSource = {
  bytes(name: string): Promise<Uint8Array>
  url(name: string): Promise<string>
}

// The third contract surface (TUNN-SKIVA §4, F2). One adapter per partner; nothing else in the
// platform knows which partner it is talking to, and every adapter passes the same contract suite
// (`@byd/print/contract`).
export type PrintProvider = {
  readonly id: ProviderId
  readonly label: string
  // Where the partner makes what it sends. The EU rule routes on this (F2).
  readonly manufacturesIn: readonly Country[]

  supports(type: TypeRef): boolean
  // What the partner wants for the type, as data. Throws for a type `supports` says no to.
  requirements(type: TypeRef): PrintRequirements
  // The partner's files and order as data, with no side effect on the partner. Deterministic.
  // Throws for a card of a type it does not print; hardware it does not pack is `omitted`.
  prepare(manifest: PrintManifest): PreparedOrder
  // Asked at checkout (F3), for one copy of the game sent to `dest`.
  quote(manifest: PrintManifest, dest: Destination): Promise<Quote>
  // Takes the partner's steps out of what `prepare` made, with the files from `files`. Refuses
  // an order another provider prepared. No server route calls it yet (F2, #1199).
  submit(order: PreparedOrder, files: FileSource): Promise<ProviderOrderRef>
  // Throws for an order it never took.
  track(ref: ProviderOrderRef): Promise<OrderStatus>
}
