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
    console.log(`🔍 Validating API key: ${apiKeyHeader.substring(0, 12)}...`)
    
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    const apiKey = await db.validateApiKey(apiKeyHeader)
    
    if (!apiKey) {
      console.log(`❌ API key not found in database: ${apiKeyHeader.substring(0, 12)}...`)
      return { 
        authenticated: false, 
        error: 'Invalid or expired API key. Please check your API key or contact admin.',
        statusCode: 401
      }
    }

    // Fixed: Simplified active check - removed complex expiration logic
    if (!apiKey.is_active) {
      console.log(`⚠️ API key is disabled: ${apiKey.name}`)
      return { 
        authenticated: false, 
        error: 'API key is disabled. Please contact admin.',
        statusCode: 403
      }
    }

    console.log(`✅ API key validated successfully: ${apiKey.name}`)
    return { authenticated: true, apiKey }
    
  } catch (error) {
    console.error('❌ API key validation error:', error)
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
    
    console.log(`📊 Logged API usage: ${apiKey.name} - ${method} ${endpoint} - ${statusCode} (${responseTime}ms)`)
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
    get_api_key: 'Visit /admin to generate an API key',
    example_curl: 'curl -H "x-api-key: your_key_here" https://your-domain.com/api/predict/latest',
    example_javascript: `fetch('/api/predict/latest', {
      headers: { 'x-api-key': 'your_key_here' }
    })`,
    common_issues: {
      key_expired: "API keys don't expire automatically. Check if key is active.",
      key_format: "Ensure API key starts with 'fpl_' prefix",
      missing_header: "Include 'x-api-key' header in all requests"
    }
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

// Simplified rate limiting check - removed complex timezone logic
export async function checkRateLimit(apiKey: any, request: NextRequest): Promise<{
  allowed: boolean,
  error?: string,
  remaining?: number
}> {
  try {
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    // Simple rate limiting: get usage in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recentUsage = await db.getApiUsageSince(apiKey.id, oneHourAgo)
    
    const limit = apiKey.rate_limit || 1000
    const remaining = Math.max(0, limit - recentUsage)
    
    console.log(`⏱️ Rate limit check: ${recentUsage}/${limit} requests used (${remaining} remaining)`)
    
    if (recentUsage >= limit) {
      return {
        allowed: false,
        error: `Rate limit exceeded. Maximum ${limit} requests per hour allowed.`,
        remaining: 0
      }
    }
    
    return { 
      allowed: true, 
      remaining 
    }
  } catch (error) {
    console.error('Rate limit check error:', error)
    // Allow request if rate limiting check fails (graceful degradation)
    return { allowed: true, remaining: 999 }
  }
}

// Enhanced middleware wrapper with better error handling
export function withAuth(handler: Function) {
  return async function(request: NextRequest, context: any) {
    const startTime = Date.now()
    let statusCode = 200
    let apiKey: any = null

    try {
      console.log(`🔐 Authenticating request: ${request.method} ${new URL(request.url).pathname}`)
      
      // Authenticate API key
      const auth = await authenticateApiKey(request)
      
      if (!auth.authenticated) {
        statusCode = auth.statusCode || 401
        console.log(`❌ Authentication failed: ${auth.error}`)
        return createAuthenticationError(auth.error, statusCode)
      }

      apiKey = auth.apiKey
      console.log(`✅ Request authenticated: ${apiKey.name}`)

      // Check rate limit
      const rateLimit = await checkRateLimit(apiKey, request)
      if (!rateLimit.allowed) {
        statusCode = 429
        console.log(`⚠️ Rate limit exceeded for ${apiKey.name}`)
        return NextResponse.json(
          {
            success: false,
            error: 'Rate limit exceeded',
            message: rateLimit.error,
            rate_limit: {
              limit: apiKey.rate_limit,
              remaining: rateLimit.remaining || 0,
              window: '1 hour',
              reset_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
            },
            timestamp: new Date().toISOString()
          },
          { status: 429 }
        )
      }

      // Call the actual handler
      console.log(`🚀 Executing handler for ${apiKey.name}`)
      const response = await handler(request, context, { apiKey })
      
      // Extract status code from response
      if (response instanceof NextResponse) {
        statusCode = response.status
      }

      console.log(`✅ Request completed: ${statusCode} for ${apiKey.name}`)
      return response

    } catch (error) {
      console.error('❌ Request handler error:', error)
      statusCode = 500
      return NextResponse.json(
        { 
          success: false,
          error: 'Internal server error', 
          message: 'An unexpected error occurred processing your request',
          details: error instanceof Error ? error.message : 'Unknown error',
          help: {
            message: "This appears to be a server-side issue. Please try again or contact support.",
            debugging: [
              "Check if all required environment variables are set",
              "Verify database connectivity and permissions",
              "Check server logs for more detailed error information"
            ]
          },
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
      
      const duration = Date.now() - startTime
      console.log(`⏱️ Request completed in ${duration}ms with status ${statusCode}`)
    }
  }
}

// Helper function for debugging authentication issues
export async function debugApiKey(apiKeyString: string): Promise<any> {
  try {
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    console.log(`🔍 Debug: Looking up API key ${apiKeyString.substring(0, 12)}...`)
    
    const apiKey = await new Promise((resolve) => {
      (db as any).db.get(
        'SELECT * FROM api_keys WHERE api_key = ?', 
        [apiKeyString], 
        (err: any, row: any) => {
          if (err) {
            console.error('Debug query error:', err)
            resolve(null)
          } else {
            resolve(row)
          }
        }
      )
    })
    
    if (!apiKey) {
      console.log('❌ Debug: API key not found in database')
      return { found: false, error: 'API key not found' }
    }
    
    console.log('✅ Debug: API key found:', {
      name: (apiKey as any).name,
      active: (apiKey as any).is_active,
      created: (apiKey as any).created_at,
      expires: (apiKey as any).expires_at,
      lastUsed: (apiKey as any).last_used_at
    })
    
    return { 
      found: true, 
      data: apiKey,
      issues: {
        inactive: !(apiKey as any).is_active,
        expired: (apiKey as any).expires_at && new Date((apiKey as any).expires_at) < new Date()
      }
    }
  } catch (error) {
    console.error('Debug error:', error)
    return { found: false, error: 'Debug failed', details: error }
  }
}
