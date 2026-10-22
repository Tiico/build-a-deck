import type { Locator } from '@playwright/test'

/**
 * A file let go over a slot, as a hand would let it go: a real `drop` with the file in the
 * transfer, which is the path a picture takes into a card's cell without the library window
 * (#291, L75). The bytes travel as base64 because the transfer is built inside the page.
 */
export async function dropOn(slot: Locator, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  const transfer = await slot.evaluateHandle(
    (_, f) => {
      const dt = new DataTransfer()
      dt.items.add(new File([Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))], f.name, { type: f.mimeType }))
      return dt
    },
    { name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64') },
  )
  await slot.dispatchEvent('drop', { dataTransfer: transfer })
}
