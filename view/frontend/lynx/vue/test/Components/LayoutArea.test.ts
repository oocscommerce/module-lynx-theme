import { hydrate, mountNode } from '@oocs/module-lynx-theme/test'
import LayoutArea from 'OOCS_LynxTheme/Components/LayoutArea.vue'
import { describe, expect, it, vi } from 'vitest'

const heading = (id: string, text: string, extra: Partial<LayoutItem> = {}): LayoutItem => ({
    id,
    component: 'OOCS_LynxThemeComponent/Components/Heading',
    label: 'Heading',
    props: { text, level: 'h2', text_align: 'left', color: '' },
    ...extra,
})

const layout = { content: [heading('h1', 'First'), heading('h2', 'Hidden', { visible: false }), heading('h3', 'Last')] }

describe('LayoutArea', () => {
    // First, as the first zone mounted decides whether the first load steps
    it('mounts the nodes one per frame on a first load without SSR', async () => {
        const wrapper = mountNode(LayoutArea, { props: { area: 'content' }, page: { layout }, attachTo: document.body })
        const counts = [wrapper.findAll('h2').length]
        new MutationObserver(() => counts.push(wrapper.findAll('h2').length)).observe(document.body, {
            childList: true,
            subtree: true,
        })

        await vi.waitFor(() => expect(wrapper.findAll('h2')).toHaveLength(2))
        expect(counts[0]).toBe(0)
        expect(counts).toContain(1)
        expect(wrapper.findAll('h2').map(h => h.text())).toEqual(['First', 'Last'])
    })

    it('renders the visible nodes of its zone in order', async () => {
        const wrapper = mountNode(LayoutArea, { props: { area: 'content' }, page: { layout } })

        await vi.waitFor(() => expect(wrapper.findAll('h2')).toHaveLength(2))
        expect(wrapper.findAll('h2').map(h => h.text())).toEqual(['First', 'Last'])
    })

    it('renders nothing for a zone sent empty', () => {
        const wrapper = mountNode(LayoutArea, { props: { area: 'sidebar' }, page: { layout: { sidebar: [] } } })

        expect(wrapper.text()).toBe('')
    })

    it('keeps the last nodes of a zone a later response leaves out', async () => {
        mountNode(LayoutArea, {
            props: { area: 'footer' },
            page: { layout: { footer: [heading('f1', 'Kept')] } },
        }).unmount()

        const wrapper = mountNode(LayoutArea, { props: { area: 'footer' }, page: { layout: {} } })

        await vi.waitFor(() => expect(wrapper.find('h2').text()).toBe('Kept'))
    })

    it('server-renders and hydrates the same markup', async () => {
        const { html, warnings } = await hydrate(LayoutArea, { props: { area: 'content' }, page: { layout } })

        expect(html).toContain('First')
        expect(html).not.toContain('Hidden')
        expect(warnings).toEqual([])
    })
})
