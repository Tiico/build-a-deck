import type { ProjectDoc } from './projects.js'

// Personlig ångra i editorn (#1056, L14, D3). Ett steg tillbaka tar bara tillbaka det den egna
// redigeringen ändrade, och lämnar allt en medredigerare ändrat sedan dess — samma svar som C6 gav
// bordet. Förut var ett steg tillbaka hela dokumentet som det såg ut före ändringen, skickat som
// `restore`, och det en medredigerare hunnit skriva någon annanstans i spelet försvann tyst.
//
// Inversen räknas fram ur dokumentet, inte ur verbet. Dokumentet delas här i *delar*, i den
// upplösning två som redigerar samtidigt kan hålla isär: en cell (kort × kolumn), en egenskap hos
// ett lager eller en zon, ett block i regelboken, en post bland symbolerna, typsnitten, färgerna och
// bilderna, ett namn, en ordning. Det en redigering ändrade är de delar som skiljer dokumentet före
// den från dokumentet efter den (`changeOf`), räknat där redigeringen görs och mot det tillstånd den
// gjordes på. Att ångra den är att skriva tillbaka just de delarna (`revertOf`) — samma form som
// redigeringen, de delar den rörde och inga andra. Så har varje redigering i vokabuläret en invers,
// också en som läggs till i morgon, utan att någon behöver skriva den för hand och hålla den i takt
// med `applyEdit`.
//
// En del som någon annan har ändrat sedan är en konflikt, och då tas ingenting tillbaka: ångrandet
// vägras med det som stod i vägen, i stället för att skriva över. En del som redan är tillbaka där
// den var (någon annan gjorde samma sak) är ingen konflikt, och lämnas.
//
// Rent och utan I/O, som `applyEdit`: editorn räknar fram inversen, och aktören prövar den mot
// sanningen när den kommer (`applyRevert`), så två som hinner före varandra aldrig skriver över.

type Path = string[]

// Dokumentets form, så långt ett ångrande behöver känna den.
// `leaf` jämförs och skrivs hel. `props` är en post där varje nyckel är ett eget löv (ett lagers och
// en zons egenskaper). `record` har kända barn — det som inte nämns är ett löv, så ett fält som läggs
// till i dokumentet i morgon tas tillbaka som helhet i stället för att glömmas. `list` är poster med
// `id` i ordning, och `map` är en post vars nycklar är namn, också i ordning.
type Node =
  | { k: 'leaf' }
  | { k: 'props' }
  | { k: 'record'; of: Record<string, Node>; required: readonly string[] }
  | { k: 'list'; item: Node }
  | { k: 'map'; item: Node }

const leaf: Node = { k: 'leaf' }
const props: Node = { k: 'props' }
const record = (of: Record<string, Node>, required: readonly string[] = []): Node => ({ k: 'record', of, required })
const list = (item: Node): Node => ({ k: 'list', item })
const map = (item: Node): Node => ({ k: 'map', item })

// Upplösningen, del för del (L14). En cell och inte ett kort, så Ada och Bo kan skriva i var sin
// kolumn på samma kort. En egenskap hos ett lager och inte lagret, så den ena kan flytta det och den
// andra färga det. Ett regelblock helt, som regelboken samredigeras (D3, #1053). Kolumnernas ordning
// är en enda del: den skrivs hel av `moveField`, och två som flyttar kolumner samtidigt flyttar samma
// sak. Platsernas antal och räknarna är receptets och skrivs hela av det.
const VARIANT = record({ override: list(props), remove: leaf })
const FACE = record({ base: list(props), variants: map(VARIANT), variantBy: leaf }, ['base', 'variants'])
const DOC = record(
  {
    name: leaf,
    template: record({ faces: map(FACE) }, ['faces']),
    rows: list(record({ fields: map(leaf) }, ['fields'])),
    columns: leaf,
    icons: map(leaf),
    credits: map(leaf),
    palette: map(leaf),
    pictures: map(leaf),
    prose: map(leaf),
    fonts: map(leaf),
    rules: record({ title: leaf, blocks: list(leaf), source: leaf }, ['title', 'blocks']),
    theme: leaf,
    setup: record({ zones: list(props), seats: leaf, floor: leaf, deckZone: leaf, counters: leaf }, ['zones', 'seats', 'floor', 'deckZone']),
  },
  ['name', 'template', 'rows', 'icons', 'setup'],
)

type Part = { at: Path; from: unknown; to: unknown }
type Order = { at: Path; from: string[]; to: string[]; moved: ReadonlySet<string> }
// Vad en redigering ändrade: varje del före och efter, och ordningen i varje samling den ändrade —
// före, efter, och vilka poster den flyttade. `undefined` är en del som inte finns.
export type Change = { parts: Map<string, Part>; orders: Map<string, Order> }

// Ett steg tillbaka på tråden (D3): delarna som de är nu (`was`) och som de ska bli (`to`), en
// saknad nyckel för en del som inte finns. För ett lager, ett kort eller en zon är värdet `true`:
// att posten finns. `places` lägger en post som tagits tillbaka efter den post den stod efter,
// `null` först.
export type RevertPart = { at: string[]; was?: unknown; to?: unknown }
export type RevertPlace = { at: string[]; after: string | null }
export type Revert = { v: 'revert'; parts: RevertPart[]; places?: RevertPlace[] }

const keyOf = (at: Path): string => JSON.stringify(at)

// Vad som ändrades mellan två dokument. Det som är samma objekt hoppas över, så en redigering som
// skriver en cell kostar en promenad längs den cellens väg och inte genom hela leken.
export function changeOf(before: ProjectDoc, after: ProjectDoc): Change {
  const out: Change = { parts: new Map(), orders: new Map() }
  walk(DOC, before, after, [], false, out)
  return out
}

// Två ändringar efter varandra som ett steg (L14): ett grepp som skickar många redigeringar. Det
// första greppet säger var en del var, det sista var den hamnade, och en del som kom tillbaka dit den
// var är ingen ändring alls.
export function joined(earlier: Change, later: Change): Change {
  const parts = new Map(earlier.parts)
  for (const [key, part] of later.parts) {
    const was = parts.get(key)
    const next = was ? { at: part.at, from: was.from, to: part.to } : part
    if (same(next.from, next.to)) parts.delete(key)
    else parts.set(key, next)
  }
  const orders = new Map(earlier.orders)
  for (const [key, order] of later.orders) {
    const was = orders.get(key)
    orders.set(key, was ? { at: order.at, from: was.from, to: order.to, moved: new Set([...was.moved, ...order.moved]) } : order)
  }
  return { parts, orders }
}

// Steget tillbaka för en ändring, mot dokumentet som det är nu. `edit` är `null` när allt redan är
// tillbaka. `conflicts` är de delar någon annan har ändrat sedan, och då skrivs ingenting.
export type Reverted = { ok: true; edit: Revert | null } | { ok: false; conflicts: Path[] }
export function revertOf(change: Change, now: ProjectDoc): Reverted {
  const parts: RevertPart[] = []
  const conflicts: Path[] = []
  for (const part of change.parts.values()) {
    const here = valueAt(now, part.at)
    if (same(here, part.to)) parts.push({ at: part.at, ...(part.to === undefined ? {} : { was: part.to }), ...(part.from === undefined ? {} : { to: part.from }) })
    else if (!same(here, part.from)) conflicts.push(part.at)
  }
  // En post redigeringen skapade tas bara bort om ingen annan har lagt något i den sedan.
  const named = new Set(parts.map((p) => keyOf(p.at)))
  for (const part of parts) if (removesItem(part) && foreign(now, part.at, named)) conflicts.push(part.at)
  // En post redigeringen flyttade flyttas bara tillbaka om ingen annan har flyttat den sedan: det
  // som stod närmast före den, bland det som fanns både då och nu, står där fortfarande.
  for (const order of change.orders.values()) {
    const here = keysAt(now, order.at)
    const present = new Set(here)
    const common = new Set(order.to.filter((k) => present.has(k)))
    for (const key of order.moved) if (present.has(key) && commonBefore(order.to, key, common) !== commonBefore(here, key, common)) conflicts.push([...order.at, key])
  }
  if (conflicts.length > 0) return { ok: false, conflicts }

  const written = writeParts(now, parts)
  const places: RevertPlace[] = []
  const readded = new Set(parts.filter((p) => p.was === undefined && p.to !== undefined).map((p) => keyOf(p.at)))
  for (const order of change.orders.values()) {
    let keys = keysAt(written, order.at)
    const present = new Set(keys)
    const placing = new Set(order.from.filter((k) => (order.moved.has(k) && present.has(k)) || readded.has(keyOf([...order.at, k]))))
    const placed = new Set<string>()
    order.from.forEach((key, i) => {
      if (!placing.has(key)) return
      let after: string | null = null
      for (const k of order.from.slice(0, i).reverse()) {
        if (keys.includes(k) && (!placing.has(k) || placed.has(k))) {
          after = k
          break
        }
      }
      placed.add(key)
      const next = moved(keys, key, after)
      if (next.join('\u0000') === keys.join('\u0000')) return
      keys = next
      places.push({ at: [...order.at, key], after })
    })
  }
  if (parts.length === 0 && places.length === 0) return { ok: true, edit: null }
  return { ok: true, edit: { v: 'revert', parts, ...(places.length > 0 ? { places } : {}) } }
}

// Ett steg tillbaka tillämpat (`applyEdit`). Varje del måste vara det den var när steget räknades
// fram; en del någon hunnit ändra innan steget nådde aktören vägrar hela steget, så det aldrig
// skriver över den som hann före.
export function applyRevert(doc: ProjectDoc, edit: Revert): ProjectDoc {
  if (!Array.isArray(edit.parts)) throw new Error('a revert names the parts it writes')
  for (const part of edit.parts) {
    checkPath(part.at)
    if (!same(valueAt(doc, part.at), part.was)) throw new Error(`${part.at.join('/')} has changed since; the undo would write over it`)
  }
  const named = new Set(edit.parts.map((p) => keyOf(p.at)))
  for (const part of edit.parts) if (removesItem(part) && foreign(doc, part.at, named)) throw new Error(`${part.at.join('/')} holds what someone else wrote since; the undo would take it away`)
  let next = writeParts(doc, edit.parts)
  for (const place of edit.places ?? []) {
    checkPath(place.at)
    const at = place.at.slice(0, -1)
    const key = place.at.at(-1)
    if (key === undefined) throw new Error('a place names the post it places')
    next = updateAt(DOC, next, at, (node, cur) => {
      if (node.k !== 'list' && node.k !== 'map') throw new Error(`${at.join('/')} is not a list`)
      const keys = keysOf(node, cur)
      if (!keys.includes(key)) throw new Error(`${place.at.join('/')} is not there to place`)
      if (place.after !== null && !keys.includes(place.after)) throw new Error(`${[...at, place.after].join('/')} is gone; there is nowhere to place ${key}`)
      return reordered(node, cur, moved(keys, key, place.after))
    }) as ProjectDoc
  }
  return next
}

// ---- Promenaden -----------------------------------------------------------------------------

function walk(node: Node, a: unknown, b: unknown, at: Path, optional: boolean, out: Change): void {
  if (a === b) return
  if (node.k === 'leaf') {
    if (!same(a, b)) out.parts.set(keyOf(at), { at, from: a, to: b })
    return
  }
  if (optional && (a === undefined) !== (b === undefined)) out.parts.set(keyOf(at), { at, from: a === undefined ? undefined : true, to: b === undefined ? undefined : true })
  if (node.k === 'props') {
    const ra = (a ?? {}) as Record<string, unknown>
    const rb = (b ?? {}) as Record<string, unknown>
    for (const key of union(Object.keys(ra), Object.keys(rb))) if (key !== 'id') walk(leaf, ra[key], rb[key], [...at, key], true, out)
    return
  }
  if (node.k === 'record') {
    const ra = (a ?? {}) as Record<string, unknown>
    const rb = (b ?? {}) as Record<string, unknown>
    for (const key of union(Object.keys(node.of), Object.keys(ra), Object.keys(rb))) walk(node.of[key] ?? leaf, ra[key], rb[key], [...at, key], !node.required.includes(key), out)
    return
  }
  const ea = entriesOf(node, a)
  const eb = entriesOf(node, b)
  const ma = new Map(ea)
  const mb = new Map(eb)
  for (const key of union(ea.map(([k]) => k), eb.map(([k]) => k))) walk(node.item, ma.get(key), mb.get(key), [...at, key], true, out)
  const from = ea.map(([k]) => k)
  const to = eb.map(([k]) => k)
  if (!sameKeys(from, to)) out.orders.set(keyOf(at), { at, from, to, moved: movedIn(from, to) })
}

// Vilka poster som flyttades, inte bara fick nya grannar: de som inte ligger i den längsta följd
// som står i samma ordning före och efter.
function movedIn(from: string[], to: string[]): Set<string> {
  const inTo = new Set(to)
  const inFrom = new Set(from)
  const a = from.filter((k) => inTo.has(k))
  const b = to.filter((k) => inFrom.has(k))
  let start = 0
  while (start < a.length && a[start] === b[start]) start++
  let end = 0
  while (end < a.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
  const ma = a.slice(start, a.length - end)
  const mb = b.slice(start, b.length - end)
  if (ma.length === 0) return new Set()
  // Längsta gemensamma delföljd över mitten, där flytten ligger.
  const n = ma.length
  const m = mb.length
  // Tabellen platt, rad för rad: hur lång den gemensamma följden är från (i, j) och framåt.
  const table = new Uint32Array((n + 1) * (m + 1))
  const cell = (i: number, j: number) => table[i * (m + 1) + j] ?? 0
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i * (m + 1) + j] = ma[i] === mb[j] ? cell(i + 1, j + 1) + 1 : Math.max(cell(i + 1, j), cell(i, j + 1))
  const kept = new Set<string>()
  for (let i = 0, j = 0; i < n && j < m; ) {
    const here = ma[i]
    if (here !== undefined && here === mb[j]) {
      kept.add(here)
      i++
      j++
    } else if (cell(i + 1, j) >= cell(i, j + 1)) i++
    else j++
  }
  return new Set(ma.filter((k) => !kept.has(k)))
}

// Det som står närmast före `key` i `keys`, bland `among`.
function commonBefore(keys: readonly string[], key: string, among: ReadonlySet<string>): string | null {
  return keys.slice(0, Math.max(0, keys.indexOf(key))).findLast((k) => among.has(k)) ?? null
}

function moved(keys: readonly string[], key: string, after: string | null): string[] {
  const rest = keys.filter((k) => k !== key)
  const at = after === null ? 0 : rest.indexOf(after) + 1
  return [...rest.slice(0, at), key, ...rest.slice(at)]
}

// ---- Att läsa och skriva en del ----------------------------------------------------------------

type Found = { node: Node; item: boolean; required: boolean }
function nodeAt(at: Path): Found {
  let found: Found = { node: DOC, item: false, required: true }
  for (const key of at) {
    const { node } = found
    if (node.k === 'leaf') throw new Error(`${at.join('/')} is no part of a game`)
    if (node.k === 'props') found = { node: leaf, item: false, required: false }
    else if (node.k === 'record') found = { node: node.of[key] ?? leaf, item: false, required: node.required.includes(key) }
    else found = { node: node.item, item: true, required: false }
  }
  return found
}

// En del som den står i dokumentet: lövets värde, `true` för en post som finns, `undefined` för en
// som inte gör det.
function valueAt(doc: ProjectDoc, at: Path): unknown {
  let node: Node = DOC
  let cur: unknown = doc
  for (const key of at) {
    if (cur === undefined) return undefined
    if (node.k === 'leaf') throw new Error(`${at.join('/')} is no part of a game`)
    if (node.k === 'props' || node.k === 'record') {
      cur = Object.hasOwn(cur as object, key) ? (cur as Record<string, unknown>)[key] : undefined
      node = node.k === 'record' ? (node.of[key] ?? leaf) : leaf
    } else {
      cur = new Map(entriesOf(node, cur)).get(key)
      node = node.item
    }
  }
  if (cur === undefined) return undefined
  return node.k === 'leaf' ? cur : true
}

function keysAt(doc: ProjectDoc, at: Path): string[] {
  let node: Node = DOC
  let cur: unknown = doc
  for (const key of at) {
    if (cur === undefined) return []
    if (node.k === 'props' || node.k === 'leaf') return []
    if (node.k === 'record') {
      cur = (cur as Record<string, unknown>)[key]
      node = node.of[key] ?? leaf
    } else {
      cur = new Map(entriesOf(node, cur)).get(key)
      node = node.item
    }
  }
  return node.k === 'list' || node.k === 'map' ? keysOf(node, cur) : []
}

// En post som steget tar bort helt: ett kort, ett lager, en zon som redigeringen skapade.
const removesItem = (part: RevertPart): boolean => part.to === undefined && part.was === true && nodeAt(part.at).item && nodeAt(part.at).node.k !== 'leaf'

// Om posten bär något steget inte nämner: något någon annan har lagt dit sedan.
function foreign(doc: ProjectDoc, at: Path, named: ReadonlySet<string>): boolean {
  const out: Change = { parts: new Map(), orders: new Map() }
  walk(nodeAt(at).node, undefined, itemAt(doc, at), at, false, out)
  return [...out.parts.keys()].some((key) => !named.has(key))
}
function itemAt(doc: ProjectDoc, at: Path): unknown {
  let node: Node = DOC
  let cur: unknown = doc
  for (const key of at) {
    if (cur === undefined || node.k === 'leaf') return undefined
    if (node.k === 'props' || node.k === 'record') {
      cur = (cur as Record<string, unknown>)[key]
      node = node.k === 'record' ? (node.of[key] ?? leaf) : leaf
    } else {
      cur = new Map(entriesOf(node, cur)).get(key)
      node = node.item
    }
  }
  return cur
}

// Delarna skrivna i den ordning de går att skriva: det som skapas uppifrån, sedan löven, och det
// som tas bort nerifrån. Ett obligatoriskt barn tas aldrig bort för sig, och ett omslag — en
// valfri samling som regelboken eller prosavalen — tas bara bort när det inte bär något någon annan
// lagt dit.
function writeParts(doc: ProjectDoc, parts: readonly RevertPart[]): ProjectDoc {
  const found = parts.map((part) => ({ part, ...nodeAt(part.at) }))
  const making = found.filter((f) => f.node.k !== 'leaf' && f.part.to !== undefined).sort((x, y) => x.part.at.length - y.part.at.length)
  const leaves = found.filter((f) => f.node.k === 'leaf')
  const taking = found.filter((f) => f.node.k !== 'leaf' && f.part.to === undefined).sort((x, y) => y.part.at.length - x.part.at.length)
  let next: unknown = doc
  for (const f of making) next = updateAt(DOC, next, f.part.at, (node, cur) => cur ?? skeleton(node))
  for (const f of leaves) {
    if (f.part.to === undefined && f.required) continue
    next = updateAt(DOC, next, f.part.at, () => f.part.to)
  }
  for (const f of taking) next = updateAt(DOC, next, f.part.at, (node, cur) => (f.item || cur === undefined || empty(node, cur) ? undefined : cur))
  return next as ProjectDoc
}

function skeleton(node: Node): unknown {
  if (node.k === 'list') return []
  if (node.k === 'map' || node.k === 'props') return {}
  if (node.k === 'leaf') return ''
  return Object.fromEntries(node.required.map((key) => [key, skeleton(node.of[key] ?? leaf)]))
}

function empty(node: Node, value: unknown): boolean {
  if (node.k === 'list' || node.k === 'map') return keysOf(node, value).length === 0
  if (node.k !== 'record') return false
  return Object.entries(value as Record<string, unknown>).every(([key, v]) => {
    if (v === undefined) return true
    if (!node.required.includes(key)) return false
    const child = node.of[key] ?? leaf
    return child.k === 'leaf' || empty(child, v)
  })
}

// Dokumentet med ett värde utbytt längs en väg, utan att röra något annat: det som inte ligger på
// vägen är samma objekt efteråt.
function updateAt(node: Node, cur: unknown, at: Path, change: (node: Node, cur: unknown) => unknown): unknown {
  if (at.length === 0) return change(node, cur)
  const [key, ...rest] = at as [string, ...string[]]
  checkKey(key)
  if (node.k === 'leaf') throw new Error(`${at.join('/')} is no part of a game`)
  if (cur === undefined) throw new Error(`${key} has nothing to hold it`)
  if (node.k === 'props' || node.k === 'record') {
    const child = node.k === 'record' ? (node.of[key] ?? leaf) : leaf
    const obj = cur as Record<string, unknown>
    return withKey(obj, key, updateAt(child, obj[key], rest, change))
  }
  if (node.k === 'map') {
    const obj = cur as Record<string, unknown>
    return withKey(obj, key, updateAt(node.item, Object.hasOwn(obj, key) ? obj[key] : undefined, rest, change))
  }
  const items = cur as { id: string }[]
  const i = items.findIndex((item) => item.id === key)
  let next = updateAt(node.item, i >= 0 ? items[i] : undefined, rest, change) as { id?: string } | undefined
  if (next !== undefined && node.item.k !== 'leaf' && next.id === undefined) next = { id: key, ...next }
  if (next !== undefined && next.id !== key) throw new Error(`${key} cannot be written as ${String(next.id)}`)
  if (next === undefined) return i < 0 ? items : items.filter((_, j) => j !== i)
  return i < 0 ? [...items, next] : items.map((item, j) => (j === i ? next : item))
}

function withKey(obj: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  if (value === undefined) return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key))
  if (Object.hasOwn(obj, key)) return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, k === key ? value : v]))
  return Object.fromEntries([...Object.entries(obj), [key, value]])
}

function entriesOf(node: Node, value: unknown): [string, unknown][] {
  if (value === undefined || value === null) return []
  if (node.k === 'list') return (value as { id: string }[]).map((item) => [item.id, item])
  return Object.entries(value as Record<string, unknown>)
}
function keysOf(node: Node, value: unknown): string[] {
  return entriesOf(node, value).map(([k]) => k)
}
function reordered(node: Node, value: unknown, keys: readonly string[]): unknown {
  const byKey = new Map(entriesOf(node, value))
  if (node.k === 'list') return keys.map((k) => byKey.get(k))
  return Object.fromEntries(keys.map((k) => [k, byKey.get(k)]))
}

// En väg på tråden kommer från en webbläsare, och en nyckel som når ett objekts prototyp är ingen
// del av ett spel.
function checkKey(key: unknown): void {
  if (typeof key !== 'string' || key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error(`${String(key)} is no part of a game`)
}
function checkPath(at: unknown): void {
  if (!Array.isArray(at)) throw new Error('a part is named by its path')
  for (const key of at) checkKey(key)
}

// ---- Likhet ------------------------------------------------------------------------------------

function union(...lists: string[][]): string[] {
  return [...new Set(lists.flat())]
}
function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i])
}
// Samma värde, i vilken ordning nycklarna än skrevs. En del som inte finns är bara lik en annan som
// inte finns: en tom cell (`null`) är en cell.
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined || a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    return a.length === bb.length && a.every((v, i) => same(v, bb[i]))
  }
  const ea = Object.entries(a).filter(([, v]) => v !== undefined)
  const rb = b as Record<string, unknown>
  const nb = Object.values(rb).filter((v) => v !== undefined).length
  return ea.length === nb && ea.every(([k, v]) => Object.hasOwn(rb, k) && same(v, rb[k]))
}
