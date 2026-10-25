import type { ReactNode } from 'react'
import { OPERATOR } from './operator.js'

// A sentence of the terms as it is written in `beta.ts`: the operator's details put in from the one
// place they are kept, `**…**` as bold, and `[…](#villkor)` / `[…](#integritet)` as a link to the
// other half of the page, and `[…](#anmal)` as a link to the report page (#1274). Nothing else is read
// as markup, so a sentence is never HTML.
const TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(#(villkor|integritet|anmal)\)/g

export function fill(text: string): string {
  return text.replace(/\{(name|address|contact|processors|transfer)\}/g, (_, key: keyof typeof OPERATOR) => OPERATOR[key])
}

export type Part = 'villkor' | 'integritet' | 'anmal'
export function Inline({ text, href }: { text: string; href(part: Part): string }) {
  const filled = fill(text)
  const out: ReactNode[] = []
  let at = 0
  for (const m of filled.matchAll(TOKEN)) {
    if (m.index > at) out.push(filled.slice(at, m.index))
    if (m[1] !== undefined) out.push(<b key={m.index}>{m[1]}</b>)
    else out.push(<a key={m.index} href={href(m[3] as Part)}>{m[2]}</a>)
    at = m.index + m[0].length
  }
  if (at < filled.length) out.push(filled.slice(at))
  return <>{out}</>
}
