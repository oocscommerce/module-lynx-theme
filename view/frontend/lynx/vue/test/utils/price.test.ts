import { formatPrice } from 'OOCS_LynxTheme/utils/price'
import { setStoreConfig } from 'OOCS_LynxTheme/utils/storeConfig'
import { describe, expect, it } from 'vitest'

const USD = {
    pattern: '$%s',
    precision: 2,
    requiredPrecision: 2,
    decimalSymbol: '.',
    groupSymbol: ',',
    groupLength: 3,
    integerRequired: false,
}

describe('formatPrice', () => {
    it('formats with the store price format', () => {
        setStoreConfig({ priceFormat: USD })

        expect(formatPrice(1234567.5)).toBe('$1,234,567.50')
        expect(formatPrice('19.9')).toBe('$19.90')
        expect(formatPrice(0.5)).toBe('$0.50')
    })

    it('keeps a minus, forces a sign or drops it', () => {
        setStoreConfig({ priceFormat: USD })

        expect(formatPrice(-5)).toBe('-$5.00')
        expect(formatPrice(5, true)).toBe('+$5.00')
        expect(formatPrice(-5, false)).toBe('$5.00')
    })

    it('puts the sign where the pattern says', () => {
        setStoreConfig({ priceFormat: { ...USD, pattern: '{sign}%s €', decimalSymbol: ',', groupSymbol: '.' } })

        expect(formatPrice(-1234.5)).toBe('-1.234,50 €')
    })

    it('rounds half up the way core does', () => {
        setStoreConfig({ priceFormat: USD })

        expect(formatPrice(1.005)).toBe('$1.01')
        expect(formatPrice(2.675)).toBe('$2.68')
    })

    it('drops the fraction at precision 0', () => {
        setStoreConfig({ priceFormat: { ...USD, pattern: '¥%s', requiredPrecision: 0 } })

        expect(formatPrice(1234.5)).toBe('¥1,235')
    })

    it('reads anything not a number as 0, and formats without a price format', () => {
        setStoreConfig({})

        expect(formatPrice('abc')).toBe('0.00')
        expect(formatPrice(1234.5)).toBe('1,234.50')
    })
})
