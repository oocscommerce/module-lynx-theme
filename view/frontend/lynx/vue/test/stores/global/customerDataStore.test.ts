import { useCustomerDataStore } from 'OOCS_LynxTheme/stores/global/customerDataStore'
import { useMessagesStore } from 'OOCS_LynxTheme/stores/global/messagesStore'
import { setStoreConfig } from 'OOCS_LynxTheme/utils/storeConfig'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const now = () => Math.floor(Date.now() / 1000)

/** fetch answering the section endpoint with this body; the URLs asked for are in .mock.calls */
const stubFetch = (body: unknown, ok = true) => {
    const fetch = vi.fn(async () => ({ ok, json: async () => body }))
    vi.stubGlobal('fetch', fetch)
    return fetch
}

const requested = (fetch: ReturnType<typeof stubFetch>) => new URL(String(fetch.mock.calls[0][0]))

describe('customerDataStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        setStoreConfig({ sections: { url: '/customer/section/load', lifetime: 3600, clientSide: ['directory-data'] } })
    })

    it('reads login, cart and customer from state', () => {
        const store = useCustomerDataStore()
        store.setAuth({ isLoggedIn: true })
        store.sections = { cart: { summary_count: 3 }, customer: { firstname: 'Ann' }, wishlist: { count: 2 } }

        expect(store.isLoggedIn).toBe(true)
        expect(store.cartCount).toBe(3)
        expect(store.wishlistCount).toBe(2)
        expect(store.displayName).toBe('Ann')
        expect(store.section('missing')).toBeNull()
    })

    it('starts a new cache session when the session cookie is gone', async () => {
        await useCustomerDataStore().hydrate()

        expect(document.cookie).toContain('mage-cache-sessid=true')
    })

    it('asks a first-time guest for nothing', async () => {
        const fetch = stubFetch({})

        await useCustomerDataStore().load()

        expect(fetch).not.toHaveBeenCalled()
    })

    it('loads every section when nothing is cached, and publishes their versions', async () => {
        const fetch = stubFetch({ cart: { summary_count: 1, data_id: 100 }, customer: { data_id: 100 } })
        const store = useCustomerDataStore()
        store.setAuth({ isLoggedIn: true })

        await store.load()

        expect(requested(fetch).pathname).toBe('/customer/section/load')
        expect(requested(fetch).searchParams.has('sections')).toBe(false)
        expect(store.cartCount).toBe(1)
        expect(decodeURIComponent(document.cookie)).toContain('section_data_ids={"cart":100,"customer":100}')
    })

    it('asks only for stale sections, never client-side or one-shot ones', async () => {
        const fetch = stubFetch({})
        const store = useCustomerDataStore()
        store.setAuth({ isLoggedIn: true })
        store.sections = {
            cart: { data_id: now() },
            customer: { data_id: now() - 7200 },
            wishlist: {},
            'directory-data': {},
            messages: {},
        }

        expect(store.staleSections().sort()).toEqual(['customer', 'wishlist'])
        await store.load()

        expect(requested(fetch).searchParams.get('sections')).toBe('customer,wishlist')
    })

    it('asks nothing when every section is fresh', async () => {
        const fetch = stubFetch({})
        const store = useCustomerDataStore()
        store.setAuth({ isLoggedIn: true })
        store.sections = { cart: { data_id: now() } }

        await store.load()

        expect(fetch).not.toHaveBeenCalled()
    })

    it('treats an invalidated section as stale until a newer copy arrives', async () => {
        const store = useCustomerDataStore()
        store.sections = { cart: { data_id: now() } }

        await store.invalidate(['cart'])
        expect(store.staleSections()).toEqual(['cart'])

        store.sections = { cart: { data_id: now() + 1 } }
        expect(store.staleSections()).toEqual([])
    })

    it('reloads the named sections with a new timestamp', async () => {
        const fetch = stubFetch({ cart: { summary_count: 2, data_id: now() } })
        const store = useCustomerDataStore()

        await store.reload(['cart'])

        const url = requested(fetch)
        expect(url.searchParams.get('sections')).toBe('cart')
        expect(url.searchParams.get('force_new_section_timestamp')).toBe('true')
        expect(store.cartCount).toBe(2)
    })

    it('leaves sections a reload is fetching to it', async () => {
        const fetch = stubFetch({ cart: { summary_count: 2, data_id: now() + 1 } })
        const store = useCustomerDataStore()
        store.setAuth({ isLoggedIn: true })
        store.sections = { cart: { data_id: now() } }

        const reloading = store.reload(['cart'])
        await store.load()
        await reloading

        expect(fetch).toHaveBeenCalledOnce()
        expect(requested(fetch).searchParams.get('force_new_section_timestamp')).toBe('true')
        expect(store.reloading).toEqual([])
    })

    it('keeps parameters the section URL already has', async () => {
        setStoreConfig({ sections: { url: '/customer/section/load?___store=fr' } })
        const fetch = stubFetch({})

        await useCustomerDataStore().reload(['*'])

        expect(requested(fetch).searchParams.get('___store')).toBe('fr')
        expect(requested(fetch).searchParams.has('sections')).toBe(false)
    })

    it('hands the messages section to the messages store instead of keeping it', async () => {
        stubFetch({ messages: { messages: [{ type: 'success', text: 'Saved' }] }, cart: { data_id: now() } })
        const store = useCustomerDataStore()

        await store.reload(['messages', 'cart'])

        expect(useMessagesStore().items.map(m => m.text)).toEqual(['Saved'])
        expect(store.section('messages')).toBeNull()
    })

    it('keeps what it has when the request fails', async () => {
        stubFetch({}, false)
        const store = useCustomerDataStore()
        store.sections = { cart: { summary_count: 4 } }

        await store.reload(['cart'])

        expect(store.cartCount).toBe(4)
    })
})
