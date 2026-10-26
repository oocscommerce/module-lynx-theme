import { useCustomerDataStore } from 'OOCS_LynxTheme/stores/global/customerDataStore'
import { useFormKeyStore } from 'OOCS_LynxTheme/stores/global/formKeyStore'
import { useMessagesStore } from 'OOCS_LynxTheme/stores/global/messagesStore'
import { useAnalyticsStore } from 'OOCS_LynxTheme/stores/global/analyticsStore'
import { createApp, createSSRApp, h, type Component, type DefineComponent } from 'vue'
import { createInertiaApp, router } from '@inertiajs/vue3'
import { createPinia } from 'pinia'
import DefaultLayout from 'OOCS_LynxTheme/Layouts/Default.vue'
import { preloadTree } from 'OOCS_LynxTheme/componentRegistry'
import { config } from 'OOCS_LynxTheme/utils/storeConfig'
import pages from 'virtual:lynx-pages'

// Inertia page component augmented with an optional layout property.
type InertiaPage = DefineComponent & { layout?: Component }

type SharedProps = {
    auth?: { isLoggedIn?: boolean }
    /** Document title of the page an Inertia response is for; a full-page load has it in <title>. */
    title?: string
    /** The <body> page-type class for this page; reapplied on visit so #html-body follows navigation. */
    bodyClass?: string
}

/**
 * Start the storefront in the browser: the Inertia app on #lynx (hydrated when the server rendered it), the stores
 * every page needs, and the router hooks for the FPC key, cross-origin links, messages, page views and focus
 */
export function renderStorefront(): void {
    const pinia = createPinia()

    void createInertiaApp({
        id: 'lynx',
        // Top progress bar on Inertia visits; without includeCSS (default) the bar runs invisibly.
        progress: { color: 'rgb(41 84 255)', showSpinner: false },

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

        setup({ el, App, props, plugin }) {
            // data-server-rendered marks markup the SSR renderer built: hydrate it; else render from scratch,
            // as createSSRApp on an empty mount point reports a mismatch.
            const create = el.hasAttribute('data-server-rendered') ? createSSRApp : createApp

            // Every zone's chunks start together: the content zone mounts inside the page, later than header and footer
            for (const zone of Object.values(props.initialPage.props.layout ?? {})) preloadTree(zone ?? [])

            create({ render: () => h(App, props) })
                .use(plugin)
                .use(pinia)
                .mount(el)

            // Customer data: login flag from the shared props, sections from the IndexedDB cache, then refresh stale
            // ones. load() waits for hydrate(), or it would ask the server for every section on every page load.
            const shared = props.initialPage.props as SharedProps
            const customerData = useCustomerDataStore(pinia)
            customerData.setAuth(shared.auth)
            void customerData.hydrate().then(() => customerData.load())
            // Mints the form_key cookie when the visitor has none, so the first POST already carries one.
            useFormKeyStore(pinia).ensure()
            // Flash messages: the 'navigate' handler below, fired on the initial load too.
        },
    })

    // _lynx params give HTML, Inertia JSON and partial requests separate FPC entries. They never reach the address
    // bar: InertiaService strips them from the response url. GET only: a POST is never cached.
    router.on('before', event => {
        const { url, only, method } = event.detail.visit
        // Another origin (another site, mailto:, tel:) is the browser's to follow, so Link works for any href;
        // a link that must reload a page of this store stays a plain <a>.
        if (url.origin !== window.location.origin) {
            event.preventDefault()
            window.location.assign(url.href)
            return
        }
        if (method !== 'get') return
        // Drop any the href already carries: layered navigation copies the whole current query string into its URLs.
        url.searchParams.delete('_lynx')
        url.searchParams.delete('_lynx_only')
        url.searchParams.set('_lynx', btoa(url.pathname + url.search + url.hash))
        if (only && only.length > 0) {
            url.searchParams.set('_lynx_only', [...only].sort((a, b) => a.localeCompare(b)).join(','))
        }
    })

    router.on('success', event => {
        // Every Inertia response carries the fresh shared props.
        const props = event.detail.page.props as SharedProps
        useCustomerDataStore(pinia).setAuth(props.auth)
    })

    router.on('networkError', () => {
        useMessagesStore(pinia).addServerMessage('error', config<Record<string, string>>('labels', {}).genericError)
    })

    // Not a page (error, maintenance): a message, not Inertia's dialog. A page with an error status (404) renders as is
    router.on('httpException', event => {
        if (event.detail.response.headers['x-inertia']) return
        event.preventDefault()
        useMessagesStore(pinia).addServerMessage('error', config<Record<string, string>>('labels', {}).genericError)
    })

    router.on('finish', () => {
        // The server bumps section_data_ids after mutating actions (sections.xml): refetch only what changed.
        void useCustomerDataStore(pinia).load()

        // FlushFormKey drops the cookie on login and logout: mint a replacement before the next POST.
        // On 'finish', not 'navigate', so XHR-only visits are covered too.
        useFormKeyStore(pinia).ensure()

        // A visit back to the same URL is a replace, which fires no 'navigate': a POST redirected here, a reload
        useMessagesStore(pinia).sync()
    })

    // A tab idle longer than web/cookie/cookie_lifetime comes back with the cookie expired: re-check on the way in.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            useFormKeyStore(pinia).ensure()
        }
    })

    // Pathname of the page on screen, to tell a new page from a query change
    let lastPath = ''

    router.on('navigate', event => {
        // Surface whatever the server attached to this navigation; shown ones stay until closed.
        useMessagesStore(pinia).sync()
        // On 'navigate', not 'success': it fires first, and the page view below must carry this page's title.
        const { title, bodyClass } = event.detail.page.props as SharedProps
        if (title) document.title = title
        // The page-type class of #html-body; a full load already has the right one, an Inertia visit does not.
        if (bodyClass) (document.getElementById('html-body') || document.body).className = bodyClass
        // The page view every page reports, for whichever tracker node the design carries.
        useAnalyticsStore(pinia).track('page_view', { page_location: window.location.href, page_title: document.title })
        // A new page, not the first load or a query change on the same one (filters, sort, paging): keyboard and
        // screen-reader users start at its content instead of the link that led here.
        const path = new URL(event.detail.page.url, window.location.href).pathname
        if (event.detail.type !== 'initial' && path !== lastPath) {
            requestAnimationFrame(() => document.getElementById('page-content')?.focus({ preventScroll: true }))
        }
        lastPath = path
    })
}
