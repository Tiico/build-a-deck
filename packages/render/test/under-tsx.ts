// Run by `under-tsx.test.ts` through tsx, as the worker runs on the box (Dockerfile.render): draws a
// picture for screening, svg and raster, and fits a card, and prints what came out as one JSON line.
import { Renderer } from '../src/renderer.js'

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40"><rect width="100%" height="100%" fill="#e01010"/></svg>').toString('base64')
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP4z8DwH4QZYAwAR8oH+WdZbrcAAAAASUVORK5CYII='
const renderer = await Renderer.launch()
try {
  const drawn = []
  for (const src of [`data:image/svg+xml;base64,${svg}`, `data:image/png;base64,${png}`]) {
    const p = await renderer.renderPicture({ html: `<img data-screen src="${src}">`, css: '' }, { maxPx: 512 })
    drawn.push({ width: p.width, height: p.height })
  }
  const fit = await renderer.fit({ html: '<div class="card" style="width:63mm;height:88mm"><p data-fit style="font-size:9pt">Ord</p></div>', css: '' })
  console.log(JSON.stringify({ drawn, fitted: Array.isArray(fit) }))
} finally {
  await renderer.close()
}
