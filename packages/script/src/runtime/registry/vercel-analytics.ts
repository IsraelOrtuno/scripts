import type { RegistryScriptInput } from '#nuxt-scripts/types'
import { useRegistryScript } from '../utils'
import { VercelAnalyticsOptions } from './schemas'

export { VercelAnalyticsOptions }

export type AllowedPropertyValues = string | number | boolean | null

export interface BeforeSendEvent {
  type: 'pageview' | 'event'
  url: string
}

export type BeforeSend = (event: BeforeSendEvent) => BeforeSendEvent | null

export type VercelAnalyticsInput = RegistryScriptInput<typeof VercelAnalyticsOptions, false, false> & {
  beforeSend?: BeforeSend
}

export interface VercelAnalyticsApi {
  va: (event: string, properties?: unknown) => void
  track: (name: string, properties?: Record<string, AllowedPropertyValues>) => void
  pageview: (options?: { route?: string | null, path?: string }) => void
}

declare global {
  interface Window {
    va?: (event: string, properties?: unknown) => void
    vaq?: [string, unknown?][]
  }
}

function parseProperties(
  properties: Record<string, unknown>,
  options: { strip?: boolean },
): Record<string, AllowedPropertyValues> {
  let props = properties
  const errorProperties: string[] = []
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'object' && value !== null) {
      if (options.strip) {
        const { [key]: _, ...rest } = props
        props = rest
      }
      else {
        errorProperties.push(key)
      }
    }
  }
  if (errorProperties.length > 0 && !options.strip) {
    throw new Error(
      `The following properties are not valid: ${errorProperties.join(', ')}. Only strings, numbers, booleans, and null are allowed.`,
    )
  }
  return props as Record<string, AllowedPropertyValues>
}

export function useScriptVercelAnalytics<T extends VercelAnalyticsApi>(_options?: VercelAnalyticsInput) {
  const beforeSend = _options?.beforeSend
  return useRegistryScript<T, typeof VercelAnalyticsOptions>('vercelAnalytics', (options) => {
    const scriptInput: { 'src': string, 'defer': boolean, 'data-sdkn': string, 'data-dsn'?: string, 'data-disable-auto-track'?: string, 'data-endpoint'?: string } = {
      'src': 'https://va.vercel-scripts.com/v1/script.js',
      'defer': true,
      'data-sdkn': '@nuxt/scripts',
    }

    if (options?.dsn)
      scriptInput['data-dsn'] = options.dsn
    if (options?.disableAutoTrack)
      scriptInput['data-disable-auto-track'] = '1'
    if (options?.endpoint)
      scriptInput['data-endpoint'] = options.endpoint

    return {
      scriptInput,
      schema: import.meta.dev ? VercelAnalyticsOptions : undefined,
      scriptOptions: {
        // Vercel Analytics collects via a relative `/_vercel/insights/*` endpoint
        // served by Vercel's edge. Outside Vercel (including `nuxt dev`) there is
        // no upstream to forward to, so loading would POST to the local origin
        // and fail. Default to manual in dev so the script only loads if the
        // user explicitly triggers it.
        trigger: import.meta.dev ? 'manual' : 'client',
        use: () => ({
          va: (...args: [string, unknown?]) => window.va?.(...args),
          track(name: string, properties?: Record<string, AllowedPropertyValues>) {
            if (!properties) {
              window.va?.('event', { name })
              return
            }
            try {
              const props = parseProperties(properties, { strip: !import.meta.dev })
              window.va?.('event', { name, data: props })
            }
            catch (err) {
              if (err instanceof Error && import.meta.dev)
                console.error(err)
            }
          },
          pageview(opts?: { route?: string | null, path?: string }) {
            window.va?.('pageview', opts)
          },
        }),
      },
      clientInit: import.meta.server
        ? undefined
        : () => {
            if (window.va)
              return
            window.va = function (...params: [string, unknown?]) {
              ;(window.vaq = window.vaq || []).push(params)
            }
            if (beforeSend) {
              window.va('beforeSend', beforeSend)
            }
          },
    }
  }, _options)
}
