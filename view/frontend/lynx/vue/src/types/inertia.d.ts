/**
 * The types every node component and store shares, declared global so a component uses them without importing
 */
declare global {
    /** One node of a layout, as LayoutResolver hands it to the page. */
    interface LayoutItem {
        id?: string
        name?: string
        component: string
        label?: string
        /** The name the admin gave the node in the editor; the preview badge shows it over the label. */
        custom_name?: string
        props: Record<string, unknown>
        visible?: boolean
        slots?: Record<string, LayoutItem[]>
        /** Preview only: the labels of the slots the component declares, so an empty one can be drawn as a placeholder. */
        slot_labels?: Record<string, string>
        /** Preview only: its component is no longer registered (module disabled or removed), so a placeholder stands in. */
        unavailable?: boolean
    }
}

declare module '@inertiajs/core' {
    interface PageProps {
        // Both levels are optional: a page needs no layout at all
        layout?: Record<string, LayoutItem[] | undefined>
        /** Set by the PageBuilder preview: DynamicNode then marks nodes with data-lynx-id / data-lynx-label. */
        preview?: boolean
        /** Set by PreviewBridge while "Show all outlines" is on: DynamicNode then draws empty slots as placeholders. */
        preview_outlines?: boolean
    }
}

// A module, so `declare global` and the Inertia augmentation above apply as such.
export {}
