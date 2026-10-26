import { useAnalyticsStore } from 'OOCS_LynxTheme/stores/global/analyticsStore'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('analyticsStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        sessionStorage.clear()
    })

    it('replays the events of the page to a tracker added later', () => {
        const store = useAnalyticsStore()
        store.track('page_view', { page: '/' })
        store.track('add_to_cart', { sku: 'shirt' })

        const tracker = vi.fn()
        store.addTracker(tracker)

        expect(tracker.mock.calls).toEqual([
            ['page_view', { page: '/' }],
            ['add_to_cart', { sku: 'shirt' }],
        ])
    })

    it('starts a new page on page_view', () => {
        const store = useAnalyticsStore()
        store.track('add_to_cart')
        store.track('page_view')

        const tracker = vi.fn()
        store.addTracker(tracker)

        expect(tracker.mock.calls).toEqual([['page_view', {}]])
    })

    it('keeps the last 20 events', () => {
        const store = useAnalyticsStore()
        for (let i = 1; i <= 25; i++) store.track('event_' + i)

        const tracker = vi.fn()
        store.addTracker(tracker)

        expect(tracker).toHaveBeenCalledTimes(20)
        expect(tracker.mock.calls[0][0]).toBe('event_6')
    })

    it('sends to every tracker when one fails', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        const store = useAnalyticsStore()
        const tracker = vi.fn()
        store.addTracker(() => {
            throw new Error('down')
        })
        store.addTracker(tracker)

        store.track('purchase', { value: 10 })

        expect(tracker).toHaveBeenCalledWith('purchase', { value: 10 })
        expect(error).toHaveBeenCalledOnce()
        error.mockRestore()
    })

    it('tracks once per session for a key', () => {
        const store = useAnalyticsStore()
        const tracker = vi.fn()
        store.addTracker(tracker)

        store.trackOnce('order_1', 'purchase')
        store.trackOnce('order_1', 'purchase')

        expect(tracker).toHaveBeenCalledOnce()
    })

    it('stops sending to a removed tracker', () => {
        const store = useAnalyticsStore()
        const tracker = vi.fn()
        store.addTracker(tracker)
        store.removeTracker(tracker)

        store.track('page_view')

        expect(tracker).not.toHaveBeenCalled()
    })
})
