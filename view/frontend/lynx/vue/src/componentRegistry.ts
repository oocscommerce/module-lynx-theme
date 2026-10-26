import { defineAsyncComponent, type Component, type DefineComponent } from 'vue'
import modules from 'virtual:lynx-components'

/**
 * Resolves a layout area component by source key (e.g
 */
const cache = new Map<string, Component>()

/**
 * The chunk import for a path, started once and shared by everyone asking for it
 */
const imports = new Map<string, Promise<{ default: DefineComponent }>>()

/** Chunks that are in, by path. */
const ready = new Map<string, { default: DefineComponent }>()

function importComponent(path: string) {
    let started = imports.get(path)
    if (!started) {
        started = modules[path]()
        imports.set(path, started)
        // A failed import is forgotten, so the next node needing this component tries the network again rather than
        started.then(
            loaded => {
                ready.set(path, loaded)
            },
            () => {
                imports.delete(path)
            }
        )
    }
    return started
}

/**
 * Reveal window: chunks that land within it show together instead of one by one
 */
const FALLBACK_THROTTLE_MS = 300

/** How long a whole tree's batch may hold the window: until every chunk is in, unless one hangs */
const TREE_HOLD_MS = 2000

let pending = 0
let window_: { opened: Promise<void>; open: () => void; timer: ReturnType<typeof setTimeout> } | null = null

function openWindow(ms = FALLBACK_THROTTLE_MS) {
    let open!: () => void
    const opened = new Promise<void>(resolve => {
        open = resolve
    })
    window_ = { opened, open, timer: setTimeout(closeWindow, ms) }
}

function closeWindow() {
    if (!window_) return
    clearTimeout(window_.timer)
    const { open } = window_
    window_ = null
    open()
}

let throttled: boolean | undefined

export function shouldThrottle(): boolean {
    if (throttled === undefined) {
        throttled = typeof document !== 'undefined' && !document.querySelector('[data-server-rendered]')
    }
    return throttled
}

/** Resolves once no reveal window holds the chunks back */
export async function whenRevealed(): Promise<void> {
    while (window_) await window_.opened
}

/** The component behind a path, released through the reveal window. */
async function load(path: string) {
    // Already loaded
    const known = ready.get(path)
    if (known) return known

    if (!shouldThrottle()) return importComponent(path)

    if (!window_) openWindow()
    pending++
    let loaded: { default: DefineComponent }
    try {
        loaded = await importComponent(path)
    } finally {
        // A microtask later: the arrival that just completed may be a parent whose children's chunks get requested in this
        if (--pending === 0)
            queueMicrotask(() => {
                if (pending === 0) closeWindow()
            })
    }
    if (pending > 0 && !window_) openWindow()
    if (window_) await window_.opened
    return loaded
}

/**
 * Start every chunk a zone's tree needs at once, so the reveal window holds until the deepest node is in
 */
export function preloadTree(items: LayoutItem[]): void {
    const paths = new Set<string>()
    const walk = (nodes: LayoutItem[]) => {
        for (const node of nodes) {
            if (node.visible === false) continue
            paths.add(node.component)
            for (const children of Object.values(node.slots ?? {})) walk(children)
        }
    }
    walk(items)

    // Chunks requested together on a slow network can take longer than the throttle: the batch holds the window
    if (shouldThrottle() && [...paths].some(path => modules[path] && !ready.has(path))) {
        if (window_) {
            clearTimeout(window_.timer)
            window_.timer = setTimeout(closeWindow, TREE_HOLD_MS)
        } else {
            openWindow(TREE_HOLD_MS)
        }
    }
    for (const path of paths) if (modules[path]) load(path).catch(() => {})
}

export function resolveComponent(path: string): Component | null {
    if (cache.has(path)) return cache.get(path)!

    if (!modules[path]) {
        console.warn(`[Lynx] component not found: "${path}"`)
        return null
    }

    const component = defineAsyncComponent(() => load(path))
    cache.set(path, component)
    return component
}
