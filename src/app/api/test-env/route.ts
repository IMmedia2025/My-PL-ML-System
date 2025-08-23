import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    success: true,
    env_check: {
      master_key_exists: !!process.env.MASTER_API_KEY,
      master_key_preview: process.env.MASTER_API_KEY?.substring(0, 8) + '...',
      node_env: process.env.NODE_ENV,
      database_path: process.env.DATABASE_PATH
    },
    timestamp: new Date().toISOString()
  })
}
