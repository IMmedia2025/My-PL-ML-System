import { NextRequest, NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import { withAuth } from '@/lib/middleware/api-auth'

async function syncHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  try {
    console.log(`Data sync requested by API key: ${auth.apiKey.name}`)
    
    const fetcher = new RealFPLDataFetcher()
    const result = await fetcher.fetchAllData()
    
    return NextResponse.json({
      success: result.success,
      message: result.success ? 'FPL data synchronized successfully' : 'Data sync completed with errors',
      data: {
        teams: result.data.bootstrap?.teams?.length || 0,
        players: result.data.bootstrap?.players?.length || 0,
        fixtures: result.data.fixtures?.length || 0,
        currentGameweek: result.data.currentGameweek || 'Unknown'
      },
      errors: result.errors,
      api_key: auth.apiKey.name,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Data sync error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { 
        success: false,
        error: 'Data synchronization failed', 
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

async function syncStatusHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  try {
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    // Get sync status from database
    const recentPredictions = await db.getLatestPredictions(1)
    const lastSync = recentPredictions.length > 0 ? recentPredictions[0].created_at : null
    
    return NextResponse.json({
      success: true,
      syncStatus: {
        lastSyncTime: lastSync,
        nextScheduledSync: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        autoSyncEnabled: true,
        systemReady: true
      },
      api_key: auth.apiKey.name,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to get sync status', 
        details: errorMessage 
      },
      { status: 500 }
    )
  }
}

export const POST = withAuth(syncHandler)
export const GET = withAuth(syncStatusHandler)
