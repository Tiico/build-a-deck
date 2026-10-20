import { Fragment, type ReactNode } from 'react'

// A sentence stays one sentence in the catalogue even when part of it is the reader's own — a
// game, a person, a room code. The catalogue holds the whole message; only the parts it names
// are handed over as nodes, so no language has to be glued together from halves. «Mina spel» and
// the editor ask the same question about taking a game away (#738), so it lives with neither.
export function marked(message: string, parts: Record<string, ReactNode>): ReactNode[] {
  return message.split(/(\{\w+\})/).map((piece, i) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1]
    return name && name in parts ? <Fragment key={i}>{parts[name]}</Fragment> : piece
  })
}
