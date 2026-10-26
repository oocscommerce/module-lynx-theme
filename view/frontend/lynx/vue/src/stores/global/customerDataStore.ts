import { defineStore } from 'pinia'
import { useMessagesStore } from 'OOCS_LynxTheme/stores/global/messagesStore'
import { config } from 'OOCS_LynxTheme/utils/storeConfig'

/**
 * Section endpoint and its rules, from lynxStoreConfig
 */
type SectionsConfig = { url?: string; lifetime?: number; clientSide?: string[]; serverSide?: string[] }

/**
 * Whether the server can answer for this section name
 */
function isServable(name: string, { clientSide = [], serverSide = [] }: SectionsConfig): boolean {
    return serverSide.length ? serverSide.includes(name) : !clientSide.includes(name)
}

const sectionsConfig = () => config<SectionsConfig>('sections', {})

/**
 * Customer-data sections store
 */

type SectionData = Record<string, unknown> & { data_id?: number }

const SESSID_COOKIE = 'mage-cache-sessid'

/**
 * IndexedDB behind this store, in place of the two localStorage keys core customer-data uses
 */
/**
 * One database per feature, the way LynxPageBuilderAi names `lynx_pagebuilder_ai`
 */
const DB_NAME = 'lynx_customer_data'
const DB_VERSION = 1
const OBJECT_STORE = 'sections'

/**
 * One record per bucket, at `mage-cache-storage:<storeCode>:<currencyCode>`
 */
const BUCKET_PREFIX = 'mage-cache-storage:'

/** Section names marked dirty. Domain-wide, not per bucket — see above. */
const INVALIDATION_RECORD = 'mage-cache-storage-section-invalidation'

type Bucket = Record<string, SectionData>

/**
 * Opened once per page
 */
let connection: Promise<IDBDatabase | null> | null = null

function openDatabase(): Promise<IDBDatabase | null> {
    if (connection) return connection

    connection = new Promise(resolve => {
        // No indexedDB at all: the SSR runtime, or a browser with storage disabled.
        if (typeof indexedDB === 'undefined') {
            resolve(null)
            return
        }

        let request: IDBOpenDBRequest
        try {
            request = indexedDB.open(DB_NAME, DB_VERSION)
        } catch {
            // Firefox throws here rather than erroring the request when storage is blocked.
            resolve(null)
            return
        }

        // Only ever fires on a browser that has no such database yet, version being 1
        request.onupgradeneeded = () => {
            request.result.createObjectStore(OBJECT_STORE)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(null)
        // A version change from another tab leaves this connection unusable
        request.onblocked = () => resolve(null)
    })

    return connection
}

/**
 * Run one transaction and resolve with what `work` asked for
 */
async function transact<T>(
    mode: IDBTransactionMode,
    fallback: T,
    work: (store: IDBObjectStore, resolve: (value: T) => void) => void
): Promise<T> {
    const db = await openDatabase()
    if (!db) return fallback

    return new Promise<T>(resolve => {
        let settled = false
        const done = (value: T) => {
            if (!settled) {
                settled = true
                resolve(value)
            }
        }

        try {
            const tx = db.transaction(OBJECT_STORE, mode)
            tx.onabort = () => done(fallback)
            tx.onerror = () => done(fallback)
            // Writers resolve on complete so the caller knows the data is durable
            tx.oncomplete = () => done(fallback)
            work(tx.objectStore(OBJECT_STORE), done)
        } catch {
            done(fallback)
        }
    })
}

function readRecord<T>(key: string, fallback: T): Promise<T> {
    return transact<T>('readonly', fallback, (store, resolve) => {
        const request = store.get(key)
        request.onsuccess = () => resolve((request.result as T) ?? fallback)
    })
}

/** One bucket, by the key bucketKey() builds. */
function readBucket(key: string): Promise<Bucket> {
    return readRecord<Bucket>(BUCKET_PREFIX + key, {})
}

/**
 * A plain-object copy, taken on the way into IndexedDB
 */
function snapshot<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Store one bucket
 */
function writeBucket(key: string, bucket: Bucket): Promise<void> {
    return transact<void>('readwrite', undefined, store => {
        store.put(bucket, BUCKET_PREFIX + key)
    })
}

/**
 * Per section, the newest data_id the client has seen for a copy that is now known stale
 */
function readInvalidatedAt(): Promise<Record<string, number>> {
    return readRecord<Record<string, number>>(INVALIDATION_RECORD, {})
}

function writeInvalidatedAt(marks: Record<string, number>): Promise<void> {
    return transact<void>('readwrite', undefined, store => {
        store.put(snapshot(marks), INVALIDATION_RECORD)
    })
}

/**
 * Everything, every bucket
 */
function clearStorage(): Promise<void> {
    return transact<void>('readwrite', undefined, store => {
        // Every bucket and the invalidation record with them
        store.clear()
    })
}

/**
 * Which bucket of the IndexedDB record above this page reads and writes
 */
function bucketKey(): string {
    return `${config('storeCode', '')}:${config('currencyCode', '')}`
}

/**
 * Sections that are consumed once and never stored, so they can never look "fresh" and would be re-requested on every
 */
const ONE_SHOT_SECTIONS = ['messages']
const VERSIONS_COOKIE = 'section_data_ids'

function readCookie(name: string): string | null {
    const cookiePrefix = name + '='
    for (let cookie of document.cookie.split(';')) {
        cookie = cookie.trimStart()
        if (cookie.startsWith(cookiePrefix)) return cookie.slice(cookiePrefix.length)
    }
    return null
}

/** Per-section versions, written by the client after every fetch. */
function readVersions(): Record<string, number> {
    const raw = readCookie(VERSIONS_COOKIE)
    if (!raw) return {}
    try {
        return JSON.parse(decodeURIComponent(raw))
    } catch {
        return {}
    }
}

/**
 * Publish each section's data_id to the version cookie, the way core customer-data does in buffer.update()
 */
function writeVersions(sections: Record<string, SectionData>) {
    const versions: Record<string, number> = {}
    for (const [name, data] of Object.entries(sections)) {
        if (data?.data_id) versions[name] = Number(data.data_id)
    }

    const secure = location.protocol === 'https:' ? '; secure' : ''
    document.cookie = `${VERSIONS_COOKIE}=${encodeURIComponent(JSON.stringify(versions))}; path=/${secure}; samesite=lax`
}

export const useCustomerDataStore = defineStore('customerData', {
    state: () => ({
        loggedIn: false,
        sections: {} as Record<string, SectionData>,
        // Per section, the newest data_id known to be stale. See readInvalidatedAt().
        invalidatedAt: {} as Record<string, number>,
        // Sections a reload() is fetching: load() leaves them to it, or both would ask for them
        reloading: [] as string[],
    }),

    getters: {
        isLoggedIn: s => s.loggedIn,
        section:
            s =>
            (name: string): SectionData | null =>
                s.sections[name] ?? null,
        customer: s => s.sections.customer ?? null,
        cart: s => s.sections.cart ?? null,
        cartCount: s => Number(s.sections.cart?.summary_count ?? 0),
        // `count` comes from LynxTheme's plugin on the wishlist section
        wishlistCount: s => Number(s.sections.wishlist?.count ?? 0),
        displayName: s => {
            const name = s.sections.customer?.firstname
            return typeof name === 'string' ? name : ''
        },
    },

    actions: {
        /** Sync login state from the `auth` shared Inertia prop (server truth). */
        setAuth(auth?: { isLoggedIn?: boolean }) {
            this.loggedIn = !!auth?.isLoggedIn
        },

        /**
         * Restore this bucket's cached sections; discard everything when the session marker is gone
         */
        async hydrate() {
            if (!readCookie(SESSID_COOKIE)) {
                await clearStorage()
                const secure = location.protocol === 'https:' ? '; secure' : ''
                document.cookie = `${SESSID_COOKIE}=true; path=/${secure}; samesite=lax`
                return
            }

            const [sections, invalidatedAt] = await Promise.all([readBucket(bucketKey()), readInvalidatedAt()])
            this.sections = sections
            this.invalidatedAt = invalidatedAt
        },

        /**
         * Write this bucket, leaving every other one as it was
         */
        async persist() {
            // snapshot() because pinia state is a reactive proxy and IndexedDB stores through structured clone
            await writeBucket(bucketKey(), snapshot(this.sections))
        },

        /**
         * Mark sections dirty and drop their cached copies from every bucket
         */
        async invalidate(names: string[]) {
            let targets = names
            if (names.includes('*')) {
                const { serverSide = [] } = sectionsConfig()
                if (!serverSide.length) {
                    this.sections = {}
                    this.invalidatedAt = {}
                    await clearStorage()
                    return
                }
                targets = serverSide
            }

            // Mark each name with the newest data_id the client has seen for it
            const versions = readVersions()
            const marks = { ...this.invalidatedAt }
            for (const name of targets) {
                marks[name] = Number(versions[name] ?? this.sections[name]?.data_id ?? 0)
            }
            this.invalidatedAt = marks

            await writeInvalidatedAt(this.invalidatedAt)
        },

        /**
         * Sections that need a refetch: marked dirty, past their lifetime
         */
        staleSections(): string[] {
            if (this.reloading.includes('*')) return []
            const versions = readVersions()
            const config = sectionsConfig()
            const { lifetime = 3600 } = config
            const now = Math.floor(Date.now() / 1000)
            // The dirty list is a source of names in its own right, not just a flag to check against the other two
            const names = new Set([
                ...Object.keys(this.sections),
                ...Object.keys(versions),
                ...Object.keys(this.invalidatedAt),
            ])

            return [...names].filter(name => {
                // The version cookie is shared with any other Magento store on this domain (a Luma storefront writes its own
                if (!isServable(name, config) || ONE_SHOT_SECTIONS.includes(name)) return false
                if (this.reloading.includes(name)) return false
                // Stale unless this bucket's own copy is newer than the one marked
                const dataId = Number(this.sections[name]?.data_id ?? 0)
                if (!dataId) return true
                if (dataId <= (this.invalidatedAt[name] ?? 0)) return true
                // No comparison against the version cookie
                return dataId + lifetime < now
            })
        },

        /**
         * Refresh section data
         */
        async load(force = false) {
            // First-time guests have nothing private to fetch
            if (!this.loggedIn && !readCookie(VERSIONS_COOKIE)) return

            let query = ''
            if (!force) {
                const hasData = Object.keys(this.sections).length > 0
                if (hasData) {
                    const stale = this.staleSections()
                    if (!stale.length) return
                    query = `?sections=${encodeURIComponent(stale.join(','))}`
                }
                // Empty storage: no query param — the server returns every section.
            }

            await this.fetchSections(query)
        },

        /**
         * Refresh the sections a just-completed action invalidated
         */
        async reload(names: string[]) {
            if (!names?.length) return

            // "*" means every section, which the endpoint returns when asked for none.
            const params = new URLSearchParams({ force_new_section_timestamp: 'true' })
            if (!names.includes('*')) {
                params.set('sections', names.join(','))
            }

            this.reloading = [...this.reloading, ...names]
            try {
                await this.invalidate(names)
                await this.fetchSections(`?${params}`)
            } finally {
                // One entry per name: another reload of the same section may still be out
                const left = [...this.reloading]
                for (const name of names) left.splice(left.indexOf(name), 1)
                this.reloading = left
            }
        },

        /**
         * GET the section endpoint and merge the result into storage
         */
        async fetchSections(query: string) {
            try {
                // The configured URL can already carry parameters (store code, for one)
                const url = new URL(sectionsConfig().url || '/customer/section/load', window.location.origin)
                new URLSearchParams(query.replace(/^\?/, '')).forEach((value, key) => {
                    url.searchParams.set(key, value)
                })

                // Sections the server cannot answer for (client-side ones
                const requested = url.searchParams.get('sections')
                if (requested !== null) {
                    const config = sectionsConfig()
                    const names = requested.split(',').filter(name => name && isServable(name, config))
                    if (!names.length) return
                    url.searchParams.set('sections', names.join(','))
                }

                // Cache buster, the name jQuery's `cache: false` uses
                url.searchParams.set('_', String(Date.now()))

                const response = await fetch(url.toString(), {
                    credentials: 'same-origin',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                })
                if (!response.ok) return

                const data: Record<string, SectionData> = await response.json()

                // The `messages` section carries server flash messages from endpoints whose Json result never reaches
                const flash = (data.messages?.messages ?? []) as { type?: string; text?: string }[]
                delete data.messages
                if (flash.length) useMessagesStore().syncFromSection(flash)

                for (const [name, value] of Object.entries(data)) {
                    if (!name.startsWith('_')) this.sections[name] = value
                }
                await this.persist()
                writeVersions(this.sections)
            } catch {
                // Network failure: keep whatever is cached, retry on the next visit.
            }
        },
    },
})
