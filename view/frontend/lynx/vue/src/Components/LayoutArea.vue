<script lang="ts">
import { ref, type Ref } from 'vue'
import { shouldThrottle, whenRevealed } from 'OOCS_LynxTheme/componentRegistry'

/**
 * The zones as last sent, outside the props Inertia replaces on every visit
 */
const kept: Record<string, LayoutItem[]> = {}

// First load without SSR: top-level nodes of every zone mount one per frame in page order, so render and layout
// run as short tasks instead of one long one. Decided by the first zone; later visits mount at once.
const areas: { shown: Ref<number>; total: () => number }[] = []
let stepping: boolean | undefined

/**
 * How many of a zone's nodes are mounted, raised by step() while the first load is stepping
 *
 * @param total
 */
function shownCount(total: () => number): Ref<number> {
    if (stepping === undefined) {
        stepping = shouldThrottle()
        if (stepping) void whenRevealed().then(step)
    }
    const shown = ref(stepping ? 0 : Infinity)
    if (stepping) areas.push({ shown, total })
    return shown
}

function step() {
    const area = areas.find(a => a.shown.value < a.total())
    if (!area) {
        for (const a of areas) a.shown.value = Infinity
        areas.length = 0
        stepping = false
        return
    }
    area.shown.value++
    // After this frame's layout and paint; rAF never fires in a hidden tab
    const next = () => setTimeout(step)
    if (document.hidden) next()
    else requestAnimationFrame(next)
}
</script>

<script setup lang="ts">
import { computed, inject, ssrContextKey, watch } from 'vue'
import { usePage } from '@inertiajs/vue3'
import DynamicNode from 'OOCS_LynxTheme/Components/DynamicNode.vue'
import { preloadTree } from 'OOCS_LynxTheme/componentRegistry'

const props = defineProps<{
    area: string
}>()

const items = computed(() => {
    const zone = usePage().props.layout?.[props.area]

    // Absent, not empty: this response says nothing about the zone, so what the page already shows stands
    if (zone === undefined) {
        return kept[props.area] ?? []
    }

    const visible = zone.filter(item => item.visible !== false)

    if (visible.length) {
        kept[props.area] = visible
    }

    return visible
})

// Every chunk of the zone starts now, before its nodes mount level by level
watch(items, preloadTree, { immediate: true })

// The server renders every node
const shown = inject(ssrContextKey, null) ? ref(Infinity) : shownCount(() => items.value.length)
const mounted = computed(() => items.value.slice(0, shown.value))
</script>

<template>
    <DynamicNode v-for="item in mounted" :key="item.id ?? item.component" :item="item" />
</template>
