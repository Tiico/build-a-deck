// Creates a demo project on a running server from the seed deck. Usage: tsx seed-project.ts http://localhost:8081 demo
const base = process.argv[2] ?? 'http://localhost:8080'
const id = process.argv[3] ?? 'demo'
const NAMES = ['Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa', 'Bard', 'Jätte', 'Vargar', 'Fälla', 'Eldstorm', 'Helande', 'Skugga', 'Gruva', 'Torn', 'Marknad', 'Skog', 'Hamn', 'Kung', 'Drottning', 'Narr', 'Spion', 'Lejon', 'Örn', 'Orm', 'Björn', 'Räv', 'Uggla']
const BODIES = ['När detta kort spelas: dra ett kort.', 'Sköld 1. Kostar 1 mindre om du kontrollerar ett **Torn**.', 'Gör {2}{eld} skada på valfri varelse.', 'Hela 3 liv. Om du har färre än 5 liv: hela 5 i stället.']
const TYPES = ['varelse', 'varelse', 'besvärjelse', 'land']
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })
const svg = (color: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4.5" fill="${color}"/></svg>`)}`
const frame = (fill: string, stroke: string) => ({ kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill, stroke, strokeMm: 0.6, radiusMm: 3 })
const doc = {
  name: 'Skogens herrar',
  template: {
    faces: {
      front: {
        variantBy: 'typ',
        base: [
          frame('#f4ead8', '#3a2a1a'),
          { kind: 'shape', id: 'art', x: 4, y: 4, w: 55, h: 36, shape: 'rect', fill: '#c9b8a0', radiusMm: 2 },
          { kind: 'text', id: 'title', x: 5, y: 42, w: 53, h: 9, bind: { field: 'title' }, font: { family: 'Georgia, serif', sizePt: 13, weight: 800 }, color: '#1c1c1c' },
          { kind: 'text', id: 'typ', x: 5, y: 50, w: 53, h: 5, bind: { field: 'typ' }, font: { family: 'system-ui', sizePt: 7 }, color: '#7a6a55', fit: 'fixed' },
          { kind: 'text', id: 'body', x: 5, y: 56, w: 53, h: 27, bind: { field: 'body' }, font: { family: 'system-ui', sizePt: 8.5 }, color: '#333' },
          { kind: 'shape', id: 'costbg', x: 49, y: 4.5, w: 9, h: 9, shape: 'circle', fill: '#8b2e2e' },
          { kind: 'text', id: 'cost', x: 48, y: 5.5, w: 11, h: 8, bind: { field: 'cost' }, font: { family: 'system-ui', sizePt: 14, weight: 800, align: 'center' }, color: '#fff', fit: 'fixed' },
        ],
        variants: {
          besvärjelse: { override: [frame('#e6ecf7', '#2f4068')] },
          land: { override: [frame('#e4efdc', '#2e5a2e')], remove: ['costbg', 'cost'] },
        },
      },
      back: { base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' }, { kind: 'shape', id: 'inner', x: 4, y: 4, w: 55, h: 80, shape: 'rect', fill: '#3a4d7a', stroke: '#1f2b4a', strokeMm: 0.8, radiusMm: 3 }], variants: {} },
    },
  },
  rows: NAMES.map((n, i) => ({ id: n.toLowerCase(), fields: { title: n, typ: TYPES[i % 4], cost: 1 + (i % 5), body: BODIES[i % 4], antal: 1 + (i % 3) } })),
  icons: { eld: svg('#d9542b'), skog: svg('#3a8a3a') },
  setup: {
    seats: ['N', 'E', 'S', 'W'],
    floor: 'table',
    deckZone: 'draw',
    zones: [
      { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-600, -400, 1200, 800) },
      { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-140, 0) },
      { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(140, 0) },
      { id: 'market', kind: 'area', name: 'Marknad', visibility: 'all', geometry: rect(-330, -330, 660, 120) },
      { id: 'hand:N', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'N', returnTo: 'draw', geometry: rect(-250, -400, 500, 60) },
      { id: 'hand:E', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'E', returnTo: 'draw', geometry: rect(540, -250, 60, 500) },
      { id: 'hand:S', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'S', returnTo: 'draw', geometry: rect(-250, 340, 500, 60) },
      { id: 'hand:W', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'W', returnTo: 'draw', geometry: rect(-600, -250, 60, 500) },
    ],
  },
}
const res = await fetch(`${base}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...doc }) })
console.log(res.status, await res.text())
console.log(`  editor: http://localhost:5173/editor?project=${id}&server=${encodeURIComponent(base)}`)
