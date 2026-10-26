/// <reference types="vite/client" />

declare module 'virtual:lynx-pages' {
    import type { DefineComponent } from 'vue'
    const pages: Record<string, () => Promise<{ default: DefineComponent }>>
    export default pages
}

declare module 'virtual:lynx-components' {
    import type { DefineComponent } from 'vue'
    const components: Record<string, () => Promise<{ default: DefineComponent }>>
    export default components
}

// Module-namespaced imports ('OOCS_LynxTheme/Components/LayoutArea.vue'
