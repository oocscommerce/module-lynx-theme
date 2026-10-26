<script setup lang="ts">
// Typing only: the build replaces <Container name="…" /> with the blocks other modules declare for it (@block)
defineProps<{ name: string; context?: unknown; parent?: object }>()
</script>
