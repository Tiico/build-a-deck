import { DEFAULT_THEME, type WizardState } from './build.js'

// The wizard's draft, kept for the life of the tab (#476): a reload, a step back or a login round
// gives it back as it was.
//
// The words of the draft live in the tab's `sessionStorage`, and its pictures do not (#686): one
// chosen picture as a data URL is megabytes of text, the tab's storage holds about five, and every
// save after the picture was refused — so a reload gave back the draft from before it. The
// pictures are kept in IndexedDB instead, each written once, and the draft carries a reference to
// each in its place. When the browser refuses even that, the draft says so (`keepDraft` answers
// `false`) instead of a later reload saying it by giving back something older.

const PENDING_KEY = 'byd.pending-wizard'
const DB = 'byd-wizard-draft'
const STORE = 'images'
// What stands in an image field of the stored draft instead of the picture.
const REF = 'byd-draft-image:'
// A tab closed with a draft in it leaves its pictures behind, since nothing runs when a tab
// closes; they are swept by the next draft kept after this long.
const STALE_MS = 30 * 24 * 60 * 60 * 1000

export type Draft = { state: WizardState; server: string | null; blank?: boolean }
type Stored = Draft & { id?: string }
type Image = { key: string; dataUrl: string; at: number }

// The draft's own name, so two tabs drafting at once keep apart the pictures each of them holds.
let draftId: string | null = null
// Which pictures are already in the store, by their data URL, so a keystroke does not write a
// picture a second time.
const written = new Map<string, string>()

function newId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * The draft kept for `server`, as it was stored: its pictures are still references, and
 * `restoreImages` gives them back. Read synchronously so the page starts on the draft.
 */
export function readDraft(server: string | null): Draft | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<Stored>
    const state = value.state
    if (
      value.server !== server ||
      !state ||
      typeof state.name !== 'string' ||
      typeof state.players !== 'number' ||
      typeof state.frame !== 'string' ||
      !Array.isArray(state.fields) ||
      !Array.isArray(state.rows)
    ) return null
    if (typeof value.id === 'string') draftId = value.id
    // A draft begun before «Utseende» (#633) has no theme, and starts from the first one.
    const draft: Draft = { state: { ...state, theme: typeof state.theme === 'string' ? state.theme : DEFAULT_THEME.id }, server: value.server ?? null }
    if (value.blank !== undefined) draft.blank = value.blank
    return draft
  } catch {
    return null
  }
}

/** Whether a field's value is a picture still to be fetched back from the store. */
export const isImageRef = (value: string | undefined): boolean => !!value?.startsWith(REF)

/**
 * The state with every picture reference replaced by the picture, or by nothing when the store no
 * longer has it; `lost` counts those.
 */
export async function restoreImages(state: WizardState): Promise<{ state: WizardState; lost: number }> {
  const refs = state.rows.flatMap((row) => Object.values(row).filter(isImageRef))
  if (refs.length === 0) return { state, lost: 0 }
  const found = new Map<string, string>()
  try {
    const db = await open()
    try {
      for (const ref of new Set(refs)) {
        const key = ref.slice(REF.length)
        const image = await request<Image | undefined>(db.transaction(STORE).objectStore(STORE).get(key))
        if (image) {
          found.set(ref, image.dataUrl)
          written.set(image.dataUrl, key)
        }
      }
    } finally {
      db.close()
    }
  } catch {
    // The store is out of reach: every picture is lost, and said to be.
  }
  let lost = 0
  const rows = state.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (!isImageRef(value)) return [key, value]
    const dataUrl = found.get(value)
    if (dataUrl === undefined) lost++
    return [key, dataUrl ?? '']
  })))
  return { state: { ...state, rows }, lost }
}

// The words are kept the moment they are written, so a reload straight after a keystroke finds
// them. A picture not yet in its store is written first, in line behind any write before it, and
// the draft is kept once the picture is; a newer draft kept meanwhile is not overwritten by it.
let line: Promise<unknown> = Promise.resolve()
let latest = 0
let waiting: { draft: Draft; at: number; answers: ((kept: boolean) => void)[] } | null = null

const picturesOf = (draft: Draft): Set<string> =>
  new Set(draft.state.rows.flatMap((row) => Object.values(row).filter((value) => value.startsWith('data:'))))

/**
 * Keeps the draft for the tab. Answers whether it was kept as it stands — `false` means a reload
 * now would not give it back.
 */
export function keepDraft(draft: Draft): Promise<boolean> {
  draftId ??= newId()
  const id = draftId
  const at = ++latest
  const pictures = picturesOf(draft)
  const keys = new Map<string, string>()
  for (const dataUrl of pictures) {
    const known = written.get(dataUrl)
    if (known?.startsWith(`${id}/`)) keys.set(dataUrl, known)
  }
  if (keys.size === pictures.size) {
    const kept = store(draft, id, keys)
    // The pictures taken out of the draft leave the store with it.
    const keep = new Set(keys.values())
    if (kept && [...written.values()].some((key) => key.startsWith(`${id}/`) && !keep.has(key))) inLine(() => sweepAll(id, keep))
    return Promise.resolve(kept)
  }
  return new Promise((resolve) => {
    if (waiting) {
      waiting.draft = draft
      waiting.at = at
      waiting.answers.push(resolve)
      return
    }
    waiting = { draft, at, answers: [resolve] }
    inLine(async () => {
      const next = waiting
      waiting = null
      if (!next) return
      const kept = await writePictures(next.draft, id, next.at)
      for (const answer of next.answers) answer(kept)
    })
  })
}

function inLine(work: () => Promise<unknown>): void {
  line = line.then(work).catch(() => undefined)
}

async function writePictures(draft: Draft, id: string, at: number): Promise<boolean> {
  const keys = new Map<string, string>()
  try {
    const db = await open()
    try {
      for (const dataUrl of picturesOf(draft)) {
        const known = written.get(dataUrl)
        if (known?.startsWith(`${id}/`)) {
          keys.set(dataUrl, known)
          continue
        }
        const key = `${id}/${newId()}`
        await done(put(db, { key, dataUrl, at: Date.now() }))
        written.set(dataUrl, key)
        keys.set(dataUrl, key)
      }
      await sweep(db, id, new Set(keys.values()))
    } finally {
      db.close()
    }
  } catch {
    // No store for pictures: the draft goes into the tab's storage whole, which holds small
    // pictures and says so when it cannot.
    keys.clear()
  }
  // A draft kept since this one was asked for stands, and this one is not put back over it.
  if (at !== latest) return true
  return store(draft, id, keys)
}

// The draft into the tab's storage, each picture in `keys` as its reference.
function store(draft: Draft, id: string, keys: ReadonlyMap<string, string>): boolean {
  const rows = draft.state.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    const ref = keys.get(value)
    return [key, ref === undefined ? value : `${REF}${ref}`]
  })))
  const stored: Stored = { ...draft, state: { ...draft.state, rows }, id }
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(stored))
    return true
  } catch {
    // The older draft is not left standing to come back in this one's place.
    forgetStored()
    return false
  }
}

/** Throws the draft away, pictures and all. */
export function forgetDraft(): void {
  // A picture still being written would put the draft back after it was forgotten.
  latest++
  if (waiting) {
    for (const answer of waiting.answers) answer(false)
    waiting = null
  }
  forgetStored()
  const id = draftId
  if (id && [...written.values()].some((key) => key.startsWith(`${id}/`))) inLine(() => sweepAll(id, new Set()))
}

function forgetStored(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // Nothing else depends on cleanup succeeding.
  }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no IndexedDB'))
      return
    }
    const opening = indexedDB.open(DB, 1)
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE, { keyPath: 'key' })
    opening.onsuccess = () => resolve(opening.result)
    opening.onerror = () => reject(opening.error ?? new Error('IndexedDB refused'))
    opening.onblocked = () => reject(new Error('IndexedDB blocked'))
  })
}

function request<V>(asked: IDBRequest): Promise<V> {
  return new Promise((resolve, reject) => {
    asked.onsuccess = () => resolve(asked.result as V)
    asked.onerror = () => reject(asked.error ?? new Error('IndexedDB refused'))
  })
}

function put(db: IDBDatabase, image: Image): IDBTransaction {
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(image)
  return tx
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB refused'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB aborted'))
  })
}

// Every picture of this draft no longer in it goes, and every picture of any draft left alone
// longer than `STALE_MS`.
async function sweep(db: IDBDatabase, id: string, keep: ReadonlySet<string>): Promise<void> {
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const images = await request<Image[]>(store.getAll())
  const now = Date.now()
  for (const image of images) {
    const ours = image.key.startsWith(`${id}/`)
    if ((ours && !keep.has(image.key)) || (!ours && now - image.at > STALE_MS)) {
      store.delete(image.key)
      written.delete(image.dataUrl)
    }
  }
  await done(tx)
}

async function sweepAll(id: string, keep: ReadonlySet<string>): Promise<void> {
  try {
    const db = await open()
    try {
      await sweep(db, id, keep)
    } finally {
      db.close()
    }
  } catch {
    // A picture left behind is swept by a later draft.
  }
}
