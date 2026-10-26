<script lang="ts">
import { defineComponent, h, getCurrentInstance, computed, type PropType } from 'vue'
import { usePage } from '@inertiajs/vue3'
import { resolveComponent } from 'OOCS_LynxTheme/componentRegistry'

export default defineComponent({
    name: 'DynamicNode',
    props: {
        item: { type: Object as PropType<LayoutItem>, required: true },
    },
    setup(props) {
        const instance = getCurrentInstance()!
        const page = usePage()

        const deferredData = computed(() =>
            props.item.name
                ? (((page.props as Record<string, unknown>)[props.item.name] as Record<string, unknown> | undefined) ??
                  null)
                : null
        )
        const mergedProps = computed(() =>
            deferredData.value ? { ...(props.item.props ?? {}), ...deferredData.value } : (props.item.props ?? {})
        )
        // Through computeds, not read in render: Inertia replaces page.props on every visit and deferred arrival,
        // and a node re-rendered while its chunk is still loading loses its server markup
        const preview = computed(() => !!page.props.preview)
        const outlines = computed(() => preview.value && !!page.props.preview_outlines)

        // `align` (none / wide / full) is a setting any block may declare in its settings
        const ALIGNS = ['wide', 'full']

        // Editor chrome, not a storefront style: neutral and inline, whatever the theme.
        const SLOT_PLACEHOLDER_STYLE =
            'box-sizing:border-box;min-height:48px;min-width:8rem;display:flex;align-items:center;justify-content:center;padding:8px 12px;border:1px dashed #a1a1aa;border-radius:6px;background:rgba(244,244,245,.7);color:#52525b;font:500 13px/1.3 ui-sans-serif,system-ui,sans-serif;cursor:pointer'

        return () => {
            if (props.item.visible === false) return null

            // Marked by LayoutResolver in the preview only; the storefront never receives such a node
            if (props.item.unavailable) {
                const label = props.item.custom_name || props.item.label || props.item.component
                return preview.value
                    ? h(
                          'div',
                          { style: SLOT_PLACEHOLDER_STYLE, 'data-lynx-id': props.item.id, 'data-lynx-label': label },
                          `${label} · Component not available`
                      )
                    : null
            }

            const comp = resolveComponent(props.item.component)
            if (!comp) return null

            const DynamicNode = instance.type

            const slots: Record<string, () => ReturnType<typeof h>[]> = {}
            for (const [name, children] of Object.entries(props.item.slots ?? {})) {
                const visible = children.filter(c => c.visible !== false)
                if (visible.length) {
                    slots[name] = () => visible.map(c => h(DynamicNode, { key: c.id ?? c.component, item: c }))
                }
            }

            // With the preview's outlines on, an empty slot still shows where it sits, so the admin can find it and fill it
            if (outlines.value) {
                for (const [name, label] of Object.entries(props.item.slot_labels ?? {})) {
                    if (!slots[name]) {
                        slots[name] = () => [
                            h(
                                'div',
                                {
                                    'data-lynx-slot': name,
                                    'data-lynx-slot-of': props.item.id,
                                    style: SLOT_PLACEHOLDER_STYLE,
                                },
                                `${label} · Empty slot`
                            ),
                        ]
                    }
                }
            }

            const { align, ...componentProps } = mergedProps.value as Record<string, unknown> & { align?: string }
            return h(
                comp,
                {
                    ...componentProps,
                    ...(typeof align === 'string' && ALIGNS.includes(align) ? { 'data-align': align } : {}),
                    // The markers PreviewBridge finds a node by, only where there is a bridge to find it
                    ...(preview.value
                        ? {
                              'data-lynx-id': props.item.id,
                              'data-lynx-label':
                                  props.item.custom_name || props.item.label || props.item.component.split('/').pop(),
                          }
                        : {}),
                },
                Object.keys(slots).length ? slots : undefined
            )
        }
    },
})
</script>
