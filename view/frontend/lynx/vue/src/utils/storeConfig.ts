/**
 * Store-scope configuration rendered into the page by OOCS\LynxTheme\Block\Html\StoreConfig as the #lynx-store-config
 */

export type ConfigMap = Record<string, unknown>

/** Set per render by the SSR entry; null in a browser, which reads the JSON block. */
let payload: ConfigMap | null = null

/** Browser cache: the JSON block is parsed once, on first read. */
let parsed: ConfigMap | null = null

/**
 * Hand the renderer the payload PHP sent with the page (src/ssr.ts)
 */
export function setStoreConfig(value: ConfigMap): void {
    payload = value
}

/** The whole payload, empty when the page was rendered without the block. */
export function storeConfig(): ConfigMap {
    // The renderer has no document and gets it from setStoreConfig() above
    if (payload) return payload
    if (parsed) return parsed
    if (typeof document === 'undefined') return {}

    try {
        parsed = JSON.parse(document.getElementById('lynx-store-config')?.textContent || '{}') as ConfigMap
    } catch {
        // A malformed block reads as an absent one: consumers fall back per key.
        parsed = {}
    }
    return parsed
}

/**
 * One config value, typed and defaulted by its consumer
 */
export function config<T>(key: string, fallback: T): T {
    const value = storeConfig()[key]

    return value === undefined || value === null ? fallback : (value as T)
}
