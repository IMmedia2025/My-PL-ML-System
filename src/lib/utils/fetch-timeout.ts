/**
 * Enhanced fetch function with timeout support
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns Promise<Response>
 */
export async function fetchWithTimeout(
  url: string | URL | Request,
  options: RequestInit = {},
  timeoutMs: number = 10000
): Promise<Response> {
  // Use AbortSignal.timeout if available (modern browsers/Node.js)
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs)
    })
  }

  // Fallback for older environments
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

/**
 * TypeScript interface extending RequestInit with timeout property
 * for better developer experience
 */
export interface RequestInitWithTimeout extends RequestInit {
  timeout?: number
}

/**
 * Alternative fetch function that accepts timeout in options
 * @param url - The URL to fetch
 * @param options - Extended options with timeout property
 * @returns Promise<Response>
 */
export async function fetchTimeout(
  url: string | URL | Request,
  options: RequestInitWithTimeout = {}
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options
  return fetchWithTimeout(url, fetchOptions, timeout)
}
