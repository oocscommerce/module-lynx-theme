import { useMessagesStore } from 'OOCS_LynxTheme/stores/global/messagesStore'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

const setMessagesCookie = (value: unknown) => {
    document.cookie = `mage-messages=${encodeURIComponent(JSON.stringify(value))}; path=/`
}

describe('messagesStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    it('adds, removes and clears messages', () => {
        const store = useMessagesStore()
        store.add('success', 'Saved')
        store.add('error', 'Failed')

        store.remove(store.items[0].id)
        expect(store.items.map(m => m.text)).toEqual(['Failed'])

        store.clear()
        expect(store.items).toEqual([])
    })

    it('takes the server messages from the cookie once, and clears it', () => {
        setMessagesCookie([
            { type: 'success', text: 'Added to cart' },
            { type: 'error', text: 'Out of stock' },
        ])
        const store = useMessagesStore()

        expect(store.sync()).toBe(true)
        expect(store.items.map(({ type, text }) => [type, text])).toEqual([
            ['success', 'Added to cart'],
            ['error', 'Out of stock'],
        ])
        expect(document.cookie).not.toContain('Added')

        expect(store.sync()).toBe(false)
        expect(store.items).toHaveLength(2)
    })

    it('reports no error when the cookie has none', () => {
        setMessagesCookie([{ type: 'success', text: 'Saved' }])

        expect(useMessagesStore().sync()).toBe(false)
    })

    it('shows an unknown type as a notice and skips empty text', () => {
        const store = useMessagesStore()
        store.syncFromSection([{ type: 'info', text: 'Heads up' }, { type: 'error', text: '' }, { type: 'error' }])

        expect(store.items.map(({ type, text }) => [type, text])).toEqual([['notice', 'Heads up']])
    })

    it('reads a malformed cookie as no messages and clears it', () => {
        document.cookie = 'mage-messages=%7Bnot-json; path=/'
        const store = useMessagesStore()

        expect(store.sync()).toBe(false)
        expect(store.items).toEqual([])
        expect(document.cookie).not.toContain('not-json')
    })
})
