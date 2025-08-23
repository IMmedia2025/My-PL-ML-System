import { NextRequest, NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'

// POST /api/keys - Generate new API key
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, rateLimit, masterKey } = body

    // Simple master key validation (you should use a proper admin auth system)
    const expectedMasterKey = process.env.MASTER_API_KEY || 'master_key_123'
    if (masterKey !== expectedMasterKey) {
      return NextResponse.json(
        { success: false, error: 'Invalid master key' },
        { status: 403 }
      )
    }

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Name is required and must be a string' },
        { status: 400 }
      )
    }

    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()

    const apiKey = await db.createApiKey({
      name,
      description: description || '',
      rateLimit: rateLimit || 1000
    })

    return NextResponse.json({
      success: true,
      message: 'API key created successfully',
      data: {
        apiKey,
        name,
        description,
        rateLimit: rateLimit || 1000,
        created_at: new Date().toISOString()
      },
      usage: {
        example_headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        example_curl: `curl -H "x-api-key: ${apiKey}" https://your-domain.com/api/predict/latest`
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error creating API key:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to create API key',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// GET /api/keys - List all API keys (admin only)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const masterKey = searchParams.get('master_key')

    // Simple master key validation
    const expectedMasterKey = process.env.MASTER_API_KEY || 'master_key_123'
    if (masterKey !== expectedMasterKey) {
      return NextResponse.json(
        { success: false, error: 'Invalid master key' },
        { status: 403 }
      )
    }

    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()

    const apiKeys = await db.getAllApiKeys()

    // Don't expose full API keys in the response
    const sanitizedKeys = apiKeys.map(key => ({
      id: key.id,
      name: key.name,
      description: key.description,
      api_key_preview: key.api_key.substring(0, 12) + '...',
      is_active: key.is_active,
      rate_limit: key.rate_limit,
      total_requests: key.total_requests || 0,
      last_used_at: key.last_used_at,
      last_request: key.last_request,
      created_at: key.created_at,
      expires_at: key.expires_at
    }))

    return NextResponse.json({
      success: true,
      data: sanitizedKeys,
      total: sanitizedKeys.length,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error listing API keys:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to list API keys',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
