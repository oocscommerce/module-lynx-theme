import { beforeEach, describe, expect, it, vi } from 'vitest'

// The module caches what it read: a fresh copy per test
const load = () => import('OOCS_LynxTheme/utils/storeConfig')

describe('storeConfig', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    it('reads the #lynx-store-config block once', async () => {
        document.body.innerHTML =
            '<script type="application/json" id="lynx-store-config">{"currencyCode":"USD"}</script>'
        const { config, storeConfig } = await load()

        expect(config('currencyCode', '')).toBe('USD')
        document.getElementById('lynx-store-config')!.textContent = '{"currencyCode":"EUR"}'
        expect(storeConfig()).toEqual({ currencyCode: 'USD' })
    })

    it('takes what the renderer handed it over the block', async () => {
        document.body.innerHTML =
            '<script type="application/json" id="lynx-store-config">{"currencyCode":"USD"}</script>'
        const { config, setStoreConfig } = await load()

        setStoreConfig({ currencyCode: 'EUR' })

        expect(config('currencyCode', '')).toBe('EUR')
    })

    it('falls back for a missing or null key, a missing block and a malformed one', async () => {
        document.body.innerHTML = '<script type="application/json" id="lynx-store-config">{"locale":null}</script>'
        expect((await load()).config('locale', 'en_US')).toBe('en_US')
        expect((await load()).config('absent', 0)).toBe(0)

        vi.resetModules()
        document.body.innerHTML = ''
        expect((await load()).storeConfig()).toEqual({})

        vi.resetModules()
        document.body.innerHTML = '<script type="application/json" id="lynx-store-config">{oops</script>'
        expect((await load()).storeConfig()).toEqual({})
    })
})
