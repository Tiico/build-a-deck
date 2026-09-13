/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // PORT lets a preview pick a free port when 5173 is taken; the default stays 5173.
  server: { port: Number(process.env['PORT'] ?? 5173), strictPort: true },
  // A licence is not a comment to be tidied away. The felt's face is baked into the stylesheet as
  // bytes, which makes that stylesheet a copy of the font software, and OFL 1.1 asks every copy to
  // carry the copyright notice and the licence — so the `/*! … */` above it has to survive the
  // minifier. esbuild drops legal comments by default; this is what keeps them (K20, E4).
  esbuild: { legalComments: 'inline' },
  build: {
    // The felt's face travels inside the stylesheet instead of in a round trip of its own (#95).
    // A face that arrives later is not a flash to look at: the felt lays every name out in the
    // fallback's measurements first and again when the face lands — 88.6 px against 75.5 for
    // `Räknare A` — and for that stretch the table stands in the state `felt-names.test.tsx`
    // fells. The default limit is 4 kB, which no useful subset of a face fits under, so the
    // question is asked by name rather than by size. `test/felt-font.test.ts` checks the answer
    // in the built files.
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? true : undefined),
  },
  test: { setupFiles: ['./test/setup.ts'] },
})
