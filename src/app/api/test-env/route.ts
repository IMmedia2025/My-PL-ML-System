import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/api-auth'

async function testEnvHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  return NextResponse.json({
    success: true,
    message: 'Environment test endpoint - API key authentication working!',
    env_check: {
      master_key_exists: !!process.env.MASTER_API_KEY,
      master_key_preview: process.env.MASTER_API_KEY?.substring(0, 8) + '...',
      node_env: process.env.NODE_ENV,
      database_path: process.env.DATABASE_PATH
    },
    authenticated_user: {
      api_key_name: auth.apiKey.name,
      api_key_id: auth.apiKey.id,
      rate_limit: auth.apiKey.rate_limit
    },
    timestamp: new Date().toISOString()
  })
}

export const GET = withAuth(testEnvHandler)
