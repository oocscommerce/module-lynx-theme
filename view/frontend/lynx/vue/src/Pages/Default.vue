<script setup lang="ts">
import LayoutArea from 'OOCS_LynxTheme/Components/LayoutArea.vue'
import { resolveComponent } from 'OOCS_LynxTheme/componentRegistry'
import { config } from 'OOCS_LynxTheme/utils/storeConfig'

defineProps<{
    layout?: {
        header?: LayoutItem[]
        content?: LayoutItem[]
        footer?: LayoutItem[]
    }
    // Preview only: the draft's theme settings as CSS
    theme?: string
}>()

// Components every page mounts beside its layout tree
const pageComponents = config<string[]>('pageComponents', [])
    .map(path => ({ path, component: resolveComponent(path) }))
    .filter(entry => entry.component !== null)
</script>

<template>
    <LayoutArea area="content" />
    <component v-for="entry in pageComponents" :key="entry.path" :is="entry.component" />
</template>
