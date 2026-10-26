import { defineStore } from 'pinia'

/**
 * The header's panels, which are separate components: one open at a time, so opening one closes the others
 */
export const useHeaderStore = defineStore('header', {
    state: () => ({
        open: null as 'menu' | 'search' | 'account' | 'cart' | null,
        /** Search shown under the header: the header is lifted over the search's backdrop */
        searchBelow: false,
    }),
})
