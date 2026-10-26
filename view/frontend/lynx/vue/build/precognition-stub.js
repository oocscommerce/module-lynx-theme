// Stands in for laravel-precognition: Inertia configures its client on load, Lynx has no Laravel to validate against.
const client = {
    withSerializer: () => client,
    withXsrfCookieName: () => client,
    withXsrfHeaderName: () => client,
}

export { client }

export const resolveName = name => (typeof name === 'string' ? name : (name?.target?.name ?? ''))

export const toSimpleValidationErrors = errors =>
    Object.fromEntries(Object.entries(errors).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))

export function createValidator() {
    throw new Error('Precognition validation is not available in Lynx')
}
