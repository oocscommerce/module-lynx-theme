import { createInertiaApp } from '@inertiajs/vue3'
import { createPinia } from 'pinia'
import { createSSRApp, h, type App as VueApp, type Component, type DefineComponent } from 'vue'
import { renderToString } from 'vue/server-renderer'
import DefaultLayout from 'OOCS_LynxTheme/Layouts/Default.vue'
import pages from 'virtual:lynx-pages'
import { setStoreConfig, type ConfigMap } from 'OOCS_LynxTheme/utils/storeConfig'

/**
 * Server-side rendering, the part that is the same wherever it runs
 */

// Inertia page component augmented with an optional layout property.
type InertiaPage = DefineComponent & { layout?: Component }

/**
 * What a render receives: the page object, plus the store-scope config the components read through utils/storeConfig
 */
export type Envelope = Record<string, unknown> & { storeConfig?: ConfigMap }

export type Rendered = { head: string[]; body: string }

/**
 * Renders run one at a time
 */
let queue: Promise<unknown> = Promise.resolve()

function serialize<T>(task: () => Promise<T>): Promise<T> {
    // Same task on both paths: a rejected predecessor must not skip this render.
    const result = queue.then(task, task)
    // Keep the chain alive after a rejection, and hold no value once it settles.
    queue = result.then(
        () => undefined,
        () => undefined
    )

    return result
}

/**
 * What createInertiaApp answers with where there is no window and no page was handed to it
 */
type RenderPage = (page: Record<string, unknown>, renderToString: (app: VueApp) => Promise<string>) => Promise<Rendered>

/**
 * Built once, called per request: the page map, the layout and the module graph are the same for every visitor
 */
const render = (await createInertiaApp({
    id: 'lynx',

    // Same map and default layout as main.ts, so a component name resolves to the same page on both sides
    resolve: async (name: string) => {
        const loader = pages[name]
        if (!loader) {
            throw new Error(`[Lynx] Page not found: ${name}`)
        }
        const { default: page } = await loader()
        const inertiaPage = page as InertiaPage
        inertiaPage.layout ??= DefaultLayout
        return inertiaPage
    },

    setup({ App, props, plugin }) {
        // A pinia per render, not one for the process: a single instance would carry one visitor's stores into the next
        return createSSRApp({ render: () => h(App, props) })
            .use(plugin)
            .use(createPinia())
    },
})) as unknown as RenderPage

if (typeof render !== 'function') {
    throw new Error('[Lynx] createInertiaApp did not return a render function')
}

/** One page, from the envelope PHP posted. */
export function renderEnvelope(envelope: Envelope): Promise<Rendered> {
    return serialize(async () => {
        const { storeConfig, ...page } = envelope

        setStoreConfig(storeConfig ?? {})

        return render(page, renderToString)
    })
}
