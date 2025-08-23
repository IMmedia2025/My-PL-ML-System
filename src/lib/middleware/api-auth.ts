import { NextRequest, NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'

export interface AuthenticatedRequest extends NextRequest {
  apiKey?: any
}

export async function authenticateApiKey(request: NextRequest): Promise<{
  authenticated: boolean,
  apiKey?: any,
  error?: string,
  statusCode?: number
}> {
  const apiKeyHeader = request.headers.get('x-api-key') || 
                      request.headers.get('authorization')?.replace('Bearer ', '')
  
  if (!apiKeyHeader) {
    return { 
      authenticated: false, 
      error: 'API key is required. Include x-api-key header with your API key.',
      statusCode: 401
    }
  }

  // Basic format validation
  if (!apiKeyHeader.startsWith('fpl_')) {
    return { 
      authenticated: false, 
      error: 'Invalid API key format. API keys must start with fpl_',
      statusCode: 401
    }
  }

  try {
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    const apiKey = await db.validateApiKey(apiKeyHeader)
    
    if (!apiKey) {
      return { 
        authenticated: false, 
        error: 'Invalid or expired API key. Please check your API key or contact admin.',
        statusCode: 401
      }
    }

    if (!apiKey.is_active) {
      return { 
        authenticated: false, 
        error: 'API key is disabled. Please contact admin.',
        statusCode: 403
      }
    }

    return { authenticated: true, apiKey }
  } catch (error) {
    console.error('API key validation error:', error)
    return { 
      authenticated: false, 
      error: 'Authentication service temporarily unavailable. Please try again later.',
      statusCode: 503
    }
  }
}

export async function logApiRequest(
  apiKey: any,
  endpoint: string,
  method: string,
  statusCode: number,
  startTime: number,
  request: NextRequest
) {
  try {
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    const responseTime = Date.now() - startTime
    const userAgent = request.headers.get('user-agent') || ''
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     request.headers.get('x-real-ip') || 
                     'unknown'

    await db.logApiUsage({
      apiKeyId: apiKey.id,
      endpoint,
      method,
      statusCode,
      responseTimeMs: responseTime,
      userAgent,
      ipAddress
    })
  } catch (error) {
    console.error('Error logging API usage:', error)
  }
}

export function createAuthenticationError(
  message: string = 'Unauthorized', 
  statusCode: number = 401,
  details?: string
) {
  const helpInfo = {
    required_header: 'x-api-key',
    api_key_format: 'fpl_xxxxxxxxxxxxxxxxxx',
    get_api_key: 'Contact admin or visit /admin to generate an API key',
    example_curl: 'curl -H "x-api-key: your_key_here" https://your-domain.com/api/predict/latest',
    example_javascript: `fetch('/api/predict/latest', {
      headers: { 'x-api-key': 'your_key_here' }
    })`
  }

  return NextResponse.json(
    {
      success: false,
      error: 'Authentication failed',
      message,
      ...(details && { details }),
      help: helpInfo,
      timestamp: new Date().toISOString(),
      status_code: statusCode
    },
    { status: statusCode }
  )
}

// Rate limiting check
export async function checkRateLimit(apiKey: any, request: NextRequest): Promise<{
  allowed: boolean,
  error?: string
}> {
  try {
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    // Get usage in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recentUsage = await db.getApiUsageSince(apiKey.id, oneHourAgo)
    
    if (recentUsage >= apiKey.rate_limit) {
      return {
        allowed: false,
        error: `Rate limit exceeded. Maximum ${apiKey.rate_limit} requests per hour allowed.`
      }
    }
    
    return { allowed: true }
  } catch (error) {
    console.error('Rate limit check error:', error)
    // Allow request if rate limiting check fails
    return { allowed: true }
  }
}

// Middleware wrapper for protected routes
export function withAuth(handler: Function) {
  return async function(request: NextRequest, context: any) {
    const startTime = Date.now()
    let statusCode = 200
    let apiKey: any = null

    try {
      // Authenticate API key
      const auth = await authenticateApiKey(request)
      
      if (!auth.authenticated) {
        statusCode = auth.statusCode || 401
        return createAuthenticationError(auth.error, statusCode)
      }

      apiKey = auth.apiKey

      // Check rate limit
      const rateLimit = await checkRateLimit(apiKey, request)
      if (!rateLimit.allowed) {
        statusCode = 429
        return NextResponse.json(
          {
            success: false,
            error: 'Rate limit exceeded',
            message: rateLimit.error,
            rate_limit: {
              limit: apiKey.rate_limit,
              window: '1 hour',
              reset_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
            },
            timestamp: new Date().toISOString()
          },
          { status: 429 }
        )
      }

      // Call the actual handler
      const response = await handler(request, context, { apiKey })
      
      // Extract status code from response
      if (response instanceof NextResponse) {
        statusCode = response.status
      }

      return response

    } catch (error) {
      console.error('Request handler error:', error)
      statusCode = 500
      return NextResponse.json(
        { 
          success: false,
          error: 'Internal server error', 
          message: 'An unexpected error occurred',
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      )
    } finally {
      // Log API usage if we have an API key
      if (apiKey) {
        const endpoint = new URL(request.url).pathname
        logApiRequest(
          apiKey,
          endpoint,
          request.method,
          statusCode,
          startTime,
          request
        ).catch(err => console.error('Failed to log API usage:', err))
      }
    }
  }
}
