// Mätningarna ur shots/results-*.json till ../data.js, och bilderna till ../img som JPEG.
//   node mk-data.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'shots')
const IMG = join(HERE, '..', 'img')
mkdirSync(IMG, { recursive: true })
const read = (p) => (existsSync(join(SHOTS, `results-${p}.json`)) ? JSON.parse(readFileSync(join(SHOTS, `results-${p}.json`), 'utf8')) : [])
const jpg = (png) => {
  if (!png) return null
  const out = png.replace(/\.png$/, '.jpg')
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '52', join(SHOTS, png), '--out', join(IMG, out)], { stdio: 'ignore' })
  return out
}
const shifts = (list, input) => +list.filter((s) => s.input === input).reduce((n, s) => n + s.v, 0).toFixed(4)
const open = read('open').map((r) => ({
  v: r.v, w: r.w,
  opened: { fonts: r.opened.fonts, pressed: r.opened.pressed, forval: r.opened.forval, says: r.opened.says, correct: r.opened.correct, honest: r.opened.honest, google: r.opened.google, bytes: r.opened.bytes, cls: shifts(r.opened.shifts, false) },
  after: { google: r.after.google, fonts: r.after.fonts, pressed: r.after.pressed, says: r.after.says, correct: r.after.correct, honest: r.after.honest, clicks: r.after.clicks, ms: r.after.ms, bytes: r.after.bytes, clsNoInput: shifts(r.after.newShifts, false), clsInput: shifts(r.after.newShifts, true), titlePx: r.after.titlePx },
  files: { kortOpen: jpg(r.files.kortOpen), temanOpen: jpg(r.files.temanOpen), kortAfter: jpg(r.files.kortAfter), temanAfter: jpg(r.files.temanAfter) },
  refusal: r.refusal ? { ...r.refusal, file: jpg(r.refusal.file) } : null,
}))
const loading = read('loading').map((r) => ({ ...r, half: { ...r.half, file: jpg(r.half.file) }, three: { ...r.three, file: jpg(r.three.file) }, done: { fonts: r.done.fonts, ms: r.done.ms } }))
const resume = read('resume').map((r) => ({ v: r.v, fonts: r.fonts, pressed: r.pressed, forval: r.forval, says: r.says, correct: r.correct, honest: r.honest, googleAfterReload: r.googleAfterReload, file: jpg(r.file) }))
const keyboard = read('keyboard')
// The size was written over the form's name in the results (`box`), so the form is read back from the file.
const box = read('box').map((r) => ({ box: r.file.match(/^ruta-([a-z]+)/)[1], size: r.box, loggedIn: r.loggedIn, w: r.w, text: r.text, step1Top: r.step1Top, file: jpg(r.file) }))
const steps = read('steps').map((r) => ({ v: r.v, opened: { ...r.opened, file: jpg(r.opened.file) }, after: { ...r.after, file: jpg(r.after.file) } }))
writeFileSync(join(HERE, '..', 'data.js'), `// Mätt av matning/shoot.mjs på det byggda appen; genererad av matning/mk-data.mjs.\nwindow.MATT = ${JSON.stringify({ open, loading, resume, keyboard, box, steps })}\n`)
console.log('data.js', open.length, loading.length, resume.length, keyboard.length, box.length, steps.length)
