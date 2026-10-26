<script setup lang="ts">
import { ref, watch } from 'vue'
import { usePage } from '@inertiajs/vue3'
import { config } from 'OOCS_LynxTheme/utils/storeConfig'
import LayoutArea from 'OOCS_LynxTheme/Components/LayoutArea.vue'
import Messages from 'OOCS_LynxTheme/Components/Messages.vue'

// Preview only: the draft's theme CSS
const page = usePage()
const theme = ref('')
watch(
    () => (page.props as { theme?: string }).theme,
    v => {
        if (v !== undefined) theme.value = v
    },
    { immediate: true }
)

const labels = config<Record<string, string>>('labels', {})
</script>

<template>
    <!-- v-html, not interpolation: the SSR renderer HTML-escapes text -->
    <component is="style" v-if="theme" id="lynx-theme" v-html="theme" />
    <a
        href="#page-content"
        class="not-focus:sr-only fixed top-4 start-4 z-[100] px-4 py-3 bg-base-100 text-base-content font-semibold rounded-box shadow-menu"
        >{{ labels.skipToContent }}</a
    >
    <header class="page-header">
        <LayoutArea area="header" />
    </header>
    <!-- tabindex -1: the skip link and a client-side visit move focus here -->
    <main id="page-content" tabindex="-1" class="page-main constrained outline-none">
        <slot />
    </main>
    <footer class="page-footer">
        <LayoutArea area="footer" />
    </footer>
    <!-- Backstage: components that render nothing -->
    <div hidden>
        <LayoutArea area="backstage" />
    </div>
    <Messages />
</template>
