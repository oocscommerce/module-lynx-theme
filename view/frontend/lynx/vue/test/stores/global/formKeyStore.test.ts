import { useFormKeyStore } from 'OOCS_LynxTheme/stores/global/formKeyStore'
import { setStoreConfig } from 'OOCS_LynxTheme/utils/storeConfig'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('formKeyStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        setStoreConfig({})
    })

    it('takes the key from the form_key cookie', () => {
        document.cookie = 'form_key=test-form-key; path=/'
        const store = useFormKeyStore()

        expect(store.ensure()).toBe('test-form-key')
        expect(store.value).toBe('test-form-key')
    })

    it('mints a 16-character key and writes the cookie when there is none', () => {
        const store = useFormKeyStore()
        const key = store.ensure()

        expect(key).toMatch(/^[0-9a-zA-Z]{16}$/)
        expect(document.cookie).toContain('form_key=' + key)
        expect(store.ensure()).toBe(key)
    })

    it('writes the cookie with the store cookie settings', () => {
        setStoreConfig({
            cookie: { path: '/shop', domain: '.example.com', lifetime: 3600, secure: true, samesite: 'Strict' },
        })
        const written: string[] = []
        vi.spyOn(document, 'cookie', 'set').mockImplementation(value => {
            written.push(value)
        })

        useFormKeyStore().ensure()

        expect(written[0]).toMatch(
            /^form_key=\w{16}; expires=.+ GMT; path=\/shop; domain=\.example\.com; secure; samesite=Strict$/
        )
    })

    it('writes a session cookie, path / and samesite Lax by default', () => {
        const written: string[] = []
        vi.spyOn(document, 'cookie', 'set').mockImplementation(value => {
            written.push(value)
        })

        useFormKeyStore().ensure()

        expect(written[0]).toMatch(/^form_key=\w{16}; path=\/; samesite=Lax$/)
    })

    it('mints a new key on sync once the cookie has gone', () => {
        document.cookie = 'form_key=test-form-key; path=/'
        const store = useFormKeyStore()
        store.ensure()
        document.cookie = 'form_key=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'

        store.sync()

        expect(store.value).not.toBe('test-form-key')
        expect(store.value).toMatch(/^\w{16}$/)
    })
})
