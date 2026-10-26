import { expandExtensions } from '@oocs/module-lynx-theme'
import { describe, expect, it } from 'vitest'

const containers = {
    'cart.item.after': {
        blocks: [
            { name: 'note', template: 'B/Components/Note' },
            { name: 'gift', template: 'B/Components/Gift' },
        ],
    },
}
const options = (kind: 'vue' | 'ts') => ({
    kind,
    containers,
    blockId: (template: string) => `/abs/${template}.copy`,
    eventId: (name: string) => `virtual:lynx-event:${name}`,
})

describe('expandExtensions', () => {
    it('leaves a file that uses neither alone', () => {
        expect(expandExtensions('<template><p /></template>', options('vue'))).toBeNull()
    })

    it('puts the blocks in place of a Vue container, imported in <script setup>', () => {
        const out = expandExtensions(
            `<script setup lang="ts">
import Container from 'OOCS_LynxTheme/Components/Container.vue'
</script>
<template><Container name="cart.item.after" :context="item" :parent="props" /><Container name="nobody" /></template>`,
            options('vue')
        )!

        expect(out).not.toContain('Container')
        expect(out).toContain(`import LynxBlock0 from "/abs/B/Components/Note.copy"`)
        expect(out).toContain(`import LynxBlock1 from "/abs/B/Components/Gift.copy"`)
        expect(out).toContain(
            '<template><LynxBlock0 :context="item" :parent="props" /><LynxBlock1 :context="item" :parent="props" /></template>'
        )
    })

    it('calls the event module in place of dispatch', () => {
        const out = expandExtensions(
            `import { dispatch } from 'OOCS_LynxTheme/utils/dispatch'
await dispatch('cart_qty_before', data)`,
            options('ts')
        )!

        expect(out).toBe(`import LynxEvent0 from "virtual:lynx-event:cart_qty_before"\nawait LynxEvent0(data)`)
    })

    it('refuses a name it cannot read at build', () => {
        expect(() =>
            expandExtensions(
                `import { dispatch } from 'OOCS_LynxTheme/utils/dispatch'\ndispatch(name, data)`,
                options('ts')
            )
        ).toThrow('dispatch() needs its event name written out')
        expect(() =>
            expandExtensions(
                `<script setup>\nimport Container from 'OOCS_LynxTheme/Components/Container.vue'\n</script>\n<Container :name="n" />`,
                options('vue')
            )
        ).toThrow('<Container> needs its name written out')
    })
})
