import { mountNode } from '@oocs/module-lynx-theme/test'
import { preloadTree, resolveComponent } from 'OOCS_LynxTheme/componentRegistry'
import { describe, expect, it, vi } from 'vitest'

const HEADING = 'OOCS_LynxThemeComponent/Components/Heading'

describe('componentRegistry', () => {
    it('resolves an unknown path to null, with a warning', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        expect(resolveComponent('Vendor_Missing/Components/Gone')).toBeNull()
        expect(warn).toHaveBeenCalledWith('[Lynx] component not found: "Vendor_Missing/Components/Gone"')
    })

    it('hands out one component per path', () => {
        expect(resolveComponent(HEADING)).not.toBeNull()
        expect(resolveComponent(HEADING)).toBe(resolveComponent(HEADING))
    })

    it('loads the component behind the path', async () => {
        const wrapper = mountNode(resolveComponent(HEADING)!, {
            props: { text: 'Loaded', level: 'h3', text_align: 'left', color: '' },
        })

        await vi.waitFor(() => expect(wrapper.find('h3').text()).toBe('Loaded'))
    })

    it('preloads a tree, skipping hidden and unknown nodes', () => {
        expect(() =>
            preloadTree([
                {
                    component: 'OOCS_LynxThemeComponent/Components/Group',
                    props: {},
                    slots: { default: [{ component: 'Vendor_Missing/Components/Gone', props: {}, visible: false }] },
                },
                { component: 'Vendor_Missing/Components/Other', props: {} },
            ])
        ).not.toThrow()
    })
})
