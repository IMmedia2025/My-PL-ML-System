// src/lib/middleware/api-auth.ts
import { NextRequest, NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'

export interface AuthenticatedRequest extends NextRequest {
  apiKey?: any
}

export async function authenticateApiKey(request: NextRequest): Promise<{
  authenticated: boolean,
  apiKey?: any,
  error?: string
}> {
  const apiKeyHeader = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '')
  
  if (!apiKeyHeader) {
    return { authenticated: false, error: 'API key is required' }
  }

  try {
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    const apiKey = await db.validateApiKey(apiKeyHeader)
    
    if (!apiKey) {
      return { authenticated: false, error: 'Invalid or expired API key' }
    }

    return { authenticated: true, apiKey }
  } catch (error) {
    console.error('API key validation error:', error)
    return { authenticated: false, error: 'Internal server error' }
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
    const ipAddress = request.headers.get('x-forwarded-for') || 
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

export function createAuthenticationError(message: string = 'Unauthorized') {
  return NextResponse.json(
    {
      success: false,
      error: 'Authentication failed',
      message,
      timestamp: new Date().toISOString()
    },
    { status: 401 }
  )
}
