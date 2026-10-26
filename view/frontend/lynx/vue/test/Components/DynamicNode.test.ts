import { hydrate, mountNode } from '@oocs/module-lynx-theme/test'
import DynamicNode from 'OOCS_LynxTheme/Components/DynamicNode.vue'
import { describe, expect, it, vi } from 'vitest'

const HEADING = 'OOCS_LynxThemeComponent/Components/Heading'
const GROUP = 'OOCS_LynxThemeComponent/Components/Group'

const heading = (id: string, text: string, extra: Partial<LayoutItem> = {}): LayoutItem => ({
    id,
    name: 'default_heading',
    component: HEADING,
    label: 'Heading',
    props: { text, level: 'h2', text_align: 'left', color: '' },
    ...extra,
})

const group = (extra: Partial<LayoutItem> = {}): LayoutItem => ({
    id: 'g1',
    name: 'default_group',
    component: GROUP,
    label: 'Group',
    props: {
        layout: 'constrained',
        width: 'site',
        padding_y: 'md',
        padding_x: 'default',
        gap: 'md',
        min_height: 0,
        content_position: 'top',
        color: '',
        background: '',
        gradient: 'none',
        background_image: '',
        background_size: 'cover',
        background_position: 'center',
        overlay: 0,
        border: 'none',
        rounded: 'none',
        tag: 'section',
        anchor: '',
    },
    ...extra,
})

describe('DynamicNode', () => {
    it('renders the registered component with the node props', async () => {
        const wrapper = mountNode(DynamicNode, { props: { item: heading('h1', 'Welcome') } })

        await vi.waitFor(() => expect(wrapper.find('h2').text()).toBe('Welcome'))
    })

    it('renders nothing for a hidden node', () => {
        const wrapper = mountNode(DynamicNode, { props: { item: heading('h1', 'Welcome', { visible: false }) } })

        expect(wrapper.html()).toBe('')
    })

    it('renders nothing for an unregistered component', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const wrapper = mountNode(DynamicNode, {
            props: { item: heading('x1', 'Gone', { component: 'Vendor_Missing/Components/Gone' }) },
        })

        expect(wrapper.html()).toBe('')
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Vendor_Missing/Components/Gone'))
    })

    it('shows an unavailable node as a placeholder only in the preview', () => {
        const item = heading('u1', 'Gone', { unavailable: true, custom_name: 'Hero title' })

        const preview = mountNode(DynamicNode, { props: { item }, page: { preview: true } })
        const placeholder = preview.find('[data-lynx-id="u1"]')
        expect(placeholder.text()).toBe('Hero title · Component not available')
        expect(placeholder.attributes('data-lynx-label')).toBe('Hero title')

        expect(mountNode(DynamicNode, { props: { item } }).html()).toBe('')
    })

    it('renders only the visible children of a slot', async () => {
        const item = group({
            slots: { default: [heading('h1', 'Shown'), heading('h2', 'Hidden', { visible: false })] },
        })
        const wrapper = mountNode(DynamicNode, { props: { item } })

        await vi.waitFor(() => expect(wrapper.find('section h2').exists()).toBe(true))
        expect(wrapper.findAll('h2').map(h => h.text())).toEqual(['Shown'])
    })

    it('shows empty slots as placeholders with the preview outlines on', async () => {
        const item = group({ slot_labels: { default: 'Content' } })

        const outlined = mountNode(DynamicNode, { props: { item }, page: { preview: true, preview_outlines: true } })
        await vi.waitFor(() => expect(outlined.find('[data-lynx-slot="default"]').exists()).toBe(true))
        const slot = outlined.find('[data-lynx-slot="default"]')
        expect(slot.text()).toBe('Content · Empty slot')
        expect(slot.attributes('data-lynx-slot-of')).toBe('g1')

        const plain = mountNode(DynamicNode, { props: { item }, page: { preview: true } })
        await vi.waitFor(() => expect(plain.find('section').exists()).toBe(true))
        expect(plain.find('[data-lynx-slot]').exists()).toBe(false)
    })

    it('passes a wide or full align on as data-align', async () => {
        const aligned = (align: string) => heading('h1', 'Text', { props: { ...heading('', 'Text').props, align } })

        const full = mountNode(DynamicNode, { props: { item: aligned('full') } })
        await vi.waitFor(() => expect(full.find('h2').exists()).toBe(true))
        expect(full.find('h2').attributes('data-align')).toBe('full')

        const none = mountNode(DynamicNode, { props: { item: aligned('none') } })
        await vi.waitFor(() => expect(none.find('h2').exists()).toBe(true))
        expect(none.find('h2').attributes('data-align')).toBeUndefined()
        expect(none.find('h2').attributes('align')).toBeUndefined()
    })

    it('marks the node for the preview bridge only in the preview', async () => {
        const item = heading('h1', 'Welcome', { custom_name: 'Hero title' })

        const preview = mountNode(DynamicNode, { props: { item }, page: { preview: true } })
        await vi.waitFor(() => expect(preview.find('h2').exists()).toBe(true))
        expect(preview.find('h2').attributes('data-lynx-id')).toBe('h1')
        expect(preview.find('h2').attributes('data-lynx-label')).toBe('Hero title')

        const storefront = mountNode(DynamicNode, { props: { item } })
        await vi.waitFor(() => expect(storefront.find('h2').exists()).toBe(true))
        expect(storefront.find('[data-lynx-id]').exists()).toBe(false)
    })

    it('merges the deferred props sent under the node name', async () => {
        const wrapper = mountNode(DynamicNode, {
            props: { item: heading('h1', 'Placeholder') },
            page: { default_heading: { text: 'From the server' } },
        })

        await vi.waitFor(() => expect(wrapper.find('h2').text()).toBe('From the server'))
    })

    it('server-renders and hydrates the same markup', async () => {
        const item = group({ slots: { default: [heading('h1', 'Welcome')] } })
        const { html, warnings } = await hydrate(DynamicNode, { props: { item } })

        expect(html).toContain('Welcome')
        expect(warnings).toEqual([])
    })
})
