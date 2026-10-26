import { config } from 'OOCS_LynxTheme/utils/storeConfig'

/** Shape of Framework\Locale\Format::getPriceFormat(). */
type PriceFormat = {
    pattern?: string
    precision?: number
    requiredPrecision?: number
    decimalSymbol?: string
    groupSymbol?: string
    groupLength?: number
    integerRequired?: number | boolean
}

/**
 * Currency formatting for amounts the web API returns as plain numbers
 *
 * @param amount     Number to format.
 * @param isShowSign true forces a leading +/-, false drops the sign, undefined keeps a minus only
 */
export function formatPrice(amount: number | string, isShowSign?: boolean): string {
    const format = config<PriceFormat>('priceFormat', {})

    const precision = numberOr(format.requiredPrecision, 2)
    const integerRequired = numberOr(format.integerRequired, 1)
    const decimalSymbol = format.decimalSymbol ?? '.'
    const groupSymbol = format.groupSymbol ?? ','
    const groupLength = numberOr(format.groupLength, 3)

    const value = Number(amount) || 0
    let sign = ''
    if (isShowSign !== false) {
        sign = value < 0 ? '-' : isShowSign ? '+' : ''
    }

    const rawPattern = format.pattern || '%s'
    const pattern = rawPattern.includes('{sign}') ? rawPattern.replace('{sign}', sign) : sign + rawPattern

    // Round through the exponent form, as core does: toFixed() alone turns 1.005 into 1.00 on some engines
    const rounded = round(Math.abs(value), precision)

    // Integer part, zero-padded to the minimum width the format asks for.
    let integer = String(parseInt(String(rounded), 10))
    if (integer.length < integerRequired) {
        integer = '0'.repeat(integerRequired - integer.length) + integer
    }

    // Group the digits: the first partial group stays as-is, the rest are cut into fixed-length groups
    const head = integer.length > groupLength ? integer.length % groupLength : 0
    const groups = head ? [integer.slice(0, head)] : []
    for (let i = head; i < integer.length; i += groupLength) groups.push(integer.slice(i, i + groupLength))
    const grouped = groups.join(groupSymbol)

    const fraction = precision
        ? decimalSymbol +
          round(Math.abs(rounded - Number(integer)), precision)
              .toFixed(precision)
              .slice(2)
        : ''

    return pattern.replace('%s', grouped + fraction).trim()
}

function numberOr(value: number | boolean | undefined, fallback: number): number {
    const parsed = Math.abs(Number(value))
    return isNaN(parsed) ? fallback : parsed
}

function round(value: number, precision: number): number {
    return Number(Math.round(Number(`${value}e+${precision}`)) + `e-${precision}`)
}
