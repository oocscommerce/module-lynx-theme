// What a test imports from '@oocs/module-lynx-theme/test': a component mounted the way a page mounts it, its SSR markup,
// and the hydration of that markup. Never part of a bundle.
import { App as InertiaApp } from '@inertiajs/vue3'
import { mount } from '@vue/test-utils'
import globals from 'globals'
import { setStoreConfig } from 'OOCS_LynxTheme/utils/storeConfig'
import { createPinia, setActivePinia } from 'pinia'
import { createSSRApp, defineComponent, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'

// Apps the helpers mounted: Inertia keeps the page in module state, so one left mounted re-renders the next test's node
const mounted = new Set()

/** Unmount every app the helpers mounted; test-setup.js calls it after each test. */
export function unmountAll() {
    // An app the test already unmounted has no instance left
    for (const app of mounted) if (app._instance) app.unmount()
    mounted.clear()
}

// Globals a browser has and Node does not; Node 22, the oldest SSR runtime, has no Web Storage either
const BROWSER_ONLY = [
    ...Object.keys(globals.browser).filter(name => !(name in globals.nodeBuiltin) && !(name in globals.builtin)),
    'localStorage',
    'sessionStorage',
]

/**
 * The Inertia page a node renders in: shared props merged over defaults, plus the store config
 *
 * @param {object} component
 * @param {{props?: object, slots?: object, page?: object, config?: object}} options
 */
function app(component, { props = {}, slots, page = {}, config = {} } = {}) {
    setStoreConfig(config)
    const pinia = createPinia()
    setActivePinia(pinia)

    const node = defineComponent({ inheritAttrs: false, render: () => h(component, props, slots) })
    const initialPage = {
        component: 'Test',
        props: { errors: {}, ...page },
        url: '/',
        version: '',
        encryptHistory: false,
        clearHistory: false,
    }

    return { pinia, root: { initialPage, initialComponent: node, resolveComponent: () => node } }
}

/**
 * Mount a component with page props and store config, as DynamicNode renders it
 *
 * @param {object} component
 * @param {{props?: object, slots?: object, page?: object, config?: object, attachTo?: Element}} [options]
 */
export function mountNode(component, options = {}) {
    const { pinia, root } = app(component, options)

    const wrapper = mount(InertiaApp, { props: root, global: { plugins: [pinia] }, attachTo: options.attachTo })
    mounted.add(wrapper.vm.$.appContext.app)

    return wrapper
}

/**
 * Server markup of a component, rendered with the browser globals gone as in the SSR renderer
 *
 * @param {object} component
 * @param {{props?: object, slots?: object, page?: object, config?: object}} [options]
 * @returns {Promise<string>}
 */
export async function renderSsr(component, options = {}) {
    const { pinia, root } = app(component, options)
    const hidden = []
    for (const name of BROWSER_ONLY) {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
        if (!descriptor?.configurable) continue
        hidden.push([name, descriptor])
        delete globalThis[name]
    }

    try {
        return await renderToString(createSSRApp(InertiaApp, root).use(pinia))
    } finally {
        for (const [name, descriptor] of hidden) Object.defineProperty(globalThis, name, descriptor)
    }
}

/**
 * Hydrate the server markup in the browser; returns every warning and error logged on the way, mismatches included
 *
 * @param {object} component
 * @param {{props?: object, slots?: object, page?: object, config?: object}} [options]
 * @returns {Promise<{html: string, el: HTMLElement, warnings: string[]}>}
 */
export async function hydrate(component, options = {}) {
    const html = await renderSsr(component, options)
    const el = document.createElement('div')
    // As the SSR markup marks its mount point
    el.setAttribute('data-server-rendered', '')
    el.innerHTML = html
    document.body.append(el)

    const warnings = []
    const collect = (...args) => warnings.push(args.map(String).join(' '))
    const { warn, error } = console
    console.warn = collect
    console.error = collect
    try {
        const { pinia, root } = app(component, options)
        const hydrated = createSSRApp(InertiaApp, root).use(pinia)
        hydrated.mount(el)
        mounted.add(hydrated)
        await nextTick()
    } finally {
        console.warn = warn
        console.error = error
    }

    return { html, el, warnings }
}
