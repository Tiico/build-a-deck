import { logIn, makeProject, startTable } from '../support/api.js'
import { PHONE, SMALL_TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The owner who opens her own table without its key (#748). The address had neither the host key
// nor `owner=1`, so the screen said the table was another account's and offered «Logga in»; she
// logged in as the owner, came back to the same address and was told the same thing again. The
// server knows who she is, so her login opens the table — and each of the three people who can
// stand at a shut table is told something true about where she stands.
test.describe('a table opened without its key (#748)', () => {
  test('opens for the owner once she has signed in', async ({ open }) => {
    const owner = await open(SMALL_TV, '/')
    const email = await logIn(owner.page.request)
    const { id } = await makeProject(owner.page.request, { players: 2 })
    const table = await startTable(owner.page.request, id)
    const address = `/table?session=${encodeURIComponent(table.session)}&mode=tv`

    // Signed out: the table needs the host's link or the owner's sign-in, not «another account».
    const tv = await open(PHONE, address)
    const notice = tv.page.locator('[data-status-notice]')
    await expect(notice.getByRole('heading', { level: 1 })).toHaveText('The table needs the host’s link or the owner’s sign-in')
    await expect(notice.getByText(/another account/)).toHaveCount(0)
    await notice.getByRole('link', { name: 'Sign in' }).click()

    await tv.page.getByLabel('Email').fill(email)
    await tv.page.getByRole('button', { name: 'Send sign-in link' }).click()
    // Back at the same address, and the table is open: the room code stands on it.
    await expect(tv.page.getByText(table.code)).toBeVisible()
    expect(new URL(tv.page.url()).pathname).toBe('/table')
    await expect(tv.page.locator('[data-status-notice]')).toHaveCount(0)
  })

  test('tells another account which account it is in, and lets her switch', async ({ open }) => {
    const owner = await open(SMALL_TV, '/')
    await logIn(owner.page.request)
    const { id } = await makeProject(owner.page.request, { players: 2 })
    const table = await startTable(owner.page.request, id)

    const other = await open(SMALL_TV, '/')
    const someone = await logIn(other.page.request)
    await other.page.goto(`/table?session=${encodeURIComponent(table.session)}&mode=tv`)
    const notice = other.page.locator('[data-status-notice]')
    await expect(notice.getByRole('heading', { level: 1 })).toHaveText('The table belongs to another account')
    await expect(notice.getByText(someone)).toBeVisible()
    await expect(notice.getByRole('link', { name: 'Sign in' })).toHaveCount(0)
    await expect(notice.getByRole('link', { name: 'To my games' })).toBeVisible()

    // «Byt konto» signs her out first, so the sign-in page asks for an address instead of sending
    // her straight back here as the account she was already in.
    await notice.getByRole('button', { name: 'Switch account' }).click()
    await expect(other.page.getByLabel('Email')).toBeVisible()
    expect((await other.page.request.get('/auth/me')).status()).toBe(401)
  })
})
