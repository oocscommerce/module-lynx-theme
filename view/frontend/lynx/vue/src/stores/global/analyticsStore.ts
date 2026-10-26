import { defineStore } from 'pinia'

/**
 * The bus analytics events travel on
 */
export type AnalyticsTracker = (event: string, params: Record<string, unknown>) => void

/**
 * How many events of the current page are kept; every tracker added replays them
 */
const BUFFER_LIMIT = 20

/**
 * One tracker failing must stop neither the others nor the step that reported the event (placing an order)
 */
function send(tracker: AnalyticsTracker, event: string, params: Record<string, unknown>): void {
    try {
        tracker(event, params)
    } catch (error) {
        console.error(`[Lynx] analytics tracker failed on ${event}`, error)
    }
}

export const useAnalyticsStore = defineStore('analytics', {
    state: () => ({
        trackers: [] as AnalyticsTracker[],
        buffer: [] as [string, Record<string, unknown>][],
    }),
    actions: {
        track(event: string, params: Record<string, unknown> = {}): void {
            // Kept even with trackers listening, for one that mounts later; a page_view starts a new page
            if (event === 'page_view') this.buffer = []
            this.buffer.push([event, params])
            if (this.buffer.length > BUFFER_LIMIT) this.buffer.shift()
            for (const tracker of this.trackers) send(tracker, event, params)
        },

        /**
         * track(), but once per browser session for `key`
         */
        trackOnce(key: string, event: string, params: Record<string, unknown> = {}): void {
            const storageKey = 'lynx_analytics_' + key
            try {
                if (sessionStorage.getItem(storageKey)) return
                sessionStorage.setItem(storageKey, '1')
            } catch {
                // Storage unavailable: fall through and report.
            }
            this.track(event, params)
        },

        addTracker(tracker: AnalyticsTracker): void {
            this.trackers.push(tracker)
            for (const [event, params] of this.buffer) send(tracker, event, params)
        },
        removeTracker(tracker: AnalyticsTracker): void {
            this.trackers = this.trackers.filter(candidate => candidate !== tracker)
        },
    },
})
