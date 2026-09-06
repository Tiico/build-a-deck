// CSV as spreadsheets export it: a header line, then rows; commas or tabs; RFC-style quotes
// with doubled quotes inside; CRLF tolerated. Values stay strings — the row builder types them.
export type Parsed = { headers: string[]; rows: Record<string, string>[] }

export function parseCsv(text: string): Parsed {
  const sep = text.includes('\t') ? '\t' : ','
  const records = split(text, sep).filter((r) => r.some((c) => c.trim().length > 0))
  const [head, ...rest] = records
  if (!head) return { headers: [], rows: [] }
  const headers = head.map((h) => h.trim())
  const rows = rest.map((cells) => {
    const row: Record<string, string> = {}
    headers.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()))
    return row
  })
  return { headers, rows }
}

function split(text: string, sep: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      out.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    out.push(row)
  }
  return out
}
