// PROTOTYPE — illustrations in the editor (E1, DRIFT §4): the project's images as content-
// addressed assets, and rows that point at them.
import type { ProjectDoc } from '@byd/server'
import { buildProject } from '../../wizard/build.js'
import { DEFAULT_FIELDS } from '../../wizard/frames.js'
import { slug } from '../../wizard/build.js'

export type Asset = { hash: string; name: string; url: string; bytes: number }
export const ASSET_PREFIX = 'asset:'

export function sampleDoc(): ProjectDoc {
  return buildProject({
    name: 'Skogens herrar',
    players: 2,
    fields: DEFAULT_FIELDS,
    frame: 'classic',
    rows: [
      { title: 'Drake', cost: '5', body: 'Flygande.', antal: '2' },
      { title: 'Riddare', cost: '3', body: 'Sköld 1.' },
      { title: 'Trollkarl', cost: '4', body: 'Dra ett kort.' },
      { title: 'Bonde', cost: '1', body: '' },
      { title: 'Skogsande', cost: '2', body: 'Vaknar i skymningen.' },
      { title: 'Torn', cost: '6', body: 'Står kvar.' },
    ],
  })
}

// Pretend images: an SVG with a colour and a word, as a data URL. A real asset is bytes in R2.
export function sampleAssets(): Asset[] {
  const make = (name: string, hue: number, glyph: string): Asset => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 140"><rect width="220" height="140" fill="hsl(${hue} 45% 55%)"/><circle cx="110" cy="62" r="38" fill="hsl(${hue} 60% 30%)"/><text x="110" y="122" text-anchor="middle" font-family="system-ui" font-size="22" font-weight="700" fill="#fff">${glyph}</text></svg>`
    const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
    return { hash: fakeHash(name), name, url, bytes: svg.length }
  }
  return [make('drake.png', 10, 'Drake'), make('riddare.png', 210, 'Riddare'), make('torn.jpg', 40, 'Torn'), make('skog-bakgrund.jpg', 120, 'Skog')]
}

export function fakeHash(seed: string): string {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return h.toString(16).padStart(8, '0').repeat(8).slice(0, 64)
}

export async function assetFromFile(file: File): Promise<Asset> {
  const url = await new Promise<string>((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.readAsDataURL(file)
  })
  return { hash: fakeHash(url.slice(0, 4000) + file.size), name: file.name, url, bytes: file.size }
}

// A row as the compiler sees it: every asset reference swapped for a URL the browser can draw.
export function resolveRow(row: Record<string, string | number | boolean | null>, assets: readonly Asset[]): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && v.startsWith(ASSET_PREFIX)) out[k] = assets.find((a) => a.hash === v.slice(ASSET_PREFIX.length))?.url ?? ''
    else out[k] = v
  }
  return out
}

// A file called drake.png belongs on the card called Drake.
export function matchByName(name: string, rows: ProjectDoc['rows']): string | null {
  const base = slug(name.replace(/\.[a-z0-9]+$/i, ''))
  return rows.find((r) => slug(String(r.fields['title'] ?? '')) === base)?.id ?? null
}
